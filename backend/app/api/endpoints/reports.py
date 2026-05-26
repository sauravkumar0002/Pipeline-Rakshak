# backend/app/api/endpoints/reports.py

import io
import os
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    HRFlowable,
)

from backend.app import models
from backend.app.api import deps
from backend.app.config import settings
from backend.app.services.storage import storage_service

router = APIRouter()
log = logging.getLogger(__name__)


def _build_single_inspection_pdf(inspection: models.Inspection) -> bytes:
    """
    Builds a professional single-inspection PDF using ReportLab.
    Returns raw PDF bytes.
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#1e40af"),
        spaceAfter=4,
        alignment=1,  # centre
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#6b7280"),
        spaceAfter=2,
        alignment=1,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#1e3a5f"),
        spaceBefore=10,
        spaceAfter=4,
    )
    field_label_style = ParagraphStyle(
        "FieldLabel",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#374151"),
        fontName="Helvetica-Bold",
    )
    field_value_style = ParagraphStyle(
        "FieldValue",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#111827"),
    )
    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#9ca3af"),
        alignment=1,
    )

    elements = []

    # ── Header ──────────────────────────────────────────────────
    elements.append(Paragraph("PIPELINE RAKSHAK — INSPECTION REPORT", title_style))
    elements.append(Paragraph("AI Corrosion Detection & Monitoring Platform", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1e40af")))
    elements.append(Spacer(1, 0.4 * cm))

    # ── Inspection image ────────────────────────────────────────
    image_path = inspection.image_path or ""
    image_included = False

    # _tmp_image_path holds any temp file that must be cleaned up AFTER doc.build().
    _tmp_image_path = None

    if image_path:
        abs_image_path = None

        if image_path.startswith(("http://", "https://")):
            # Remote URL (e.g. Supabase Storage) — download to a temp file.
            # NOTE: cleanup happens after doc.build() so ReportLab can read it.
            import urllib.request
            import tempfile
            try:
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as _tmp:
                    _tmp_image_path = _tmp.name
                urllib.request.urlretrieve(image_path, _tmp_image_path)
                abs_image_path = _tmp_image_path
            except Exception as dl_err:
                log.warning(
                    "Could not download remote image for inspection %s: %s",
                    inspection.id,
                    dl_err,
                )
        else:
            # Local filesystem path.
            abs_image_path = image_path if os.path.isabs(image_path) else os.path.join(os.getcwd(), image_path)
            if not os.path.isfile(abs_image_path):
                abs_image_path = None

        if abs_image_path:
            try:
                rl_img = RLImage(abs_image_path, width=10 * cm, height=7.5 * cm, kind="proportional")
                elements.append(rl_img)
                elements.append(Spacer(1, 0.3 * cm))
                image_included = True
                log.debug("Image included in PDF for inspection %s", inspection.id)
            except Exception as img_err:
                log.warning(
                    "Could not embed image for inspection %s: %s",
                    inspection.id,
                    img_err,
                )

    if not image_included:
        elements.append(
            Paragraph(
                "[ No image available for this inspection ]",
                ParagraphStyle(
                    "NoImage",
                    parent=styles["Normal"],
                    fontSize=10,
                    textColor=colors.HexColor("#9ca3af"),
                    alignment=1,
                ),
            )
        )
        elements.append(Spacer(1, 0.3 * cm))

    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
    elements.append(Spacer(1, 0.3 * cm))

    # ── Inspection details table ─────────────────────────────────
    elements.append(Paragraph("Inspection Details", section_style))

    confidence_pct = (
        f"{inspection.confidence * 100:.2f}%"
        if inspection.confidence is not None
        else "N/A"
    )
    prediction_label = (
        "Corrosion Detected"
        if inspection.prediction_class == "corrosion"
        else "No Corrosion"
        if inspection.prediction_class == "no_corrosion"
        else (inspection.prediction_class or "N/A")
    )
    verified_label = "Yes" if inspection.is_verified else "No (Pending)"
    timestamp_str = (
        inspection.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        if inspection.timestamp
        else "N/A"
    )
    latency_str = (
        f"{inspection.latency_ms:.2f} ms" if inspection.latency_ms is not None else "N/A"
    )
    fps_str = f"{inspection.fps:.2f}" if inspection.fps is not None else "N/A"

    detail_rows = [
        ("Inspection ID", str(inspection.id)),
        ("Timestamp", timestamp_str),
        ("Prediction", prediction_label),
        ("Confidence", confidence_pct),
        ("Severity", inspection.severity or "None"),
        ("Model Used", inspection.model_used or "N/A"),
        ("Recommendation", inspection.recommendation or "N/A"),
        ("Verification Status", verified_label),
        ("Corrected Class", inspection.corrected_class or "—"),
        ("Flagged for Retraining", "Yes" if inspection.is_flagged_for_retraining else "No"),
        ("Inference Latency", latency_str),
        ("FPS", fps_str),
    ]

    table_data = [
        [
            Paragraph(label, field_label_style),
            Paragraph(value, field_value_style),
        ]
        for label, value in detail_rows
    ]

    detail_table = Table(table_data, colWidths=[5 * cm, 11.7 * cm])
    detail_table.setStyle(
        TableStyle(
            [
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(detail_table)
    elements.append(Spacer(1, 0.5 * cm))

    # ── Footer ───────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
    elements.append(Spacer(1, 0.2 * cm))
    from datetime import timezone as _tz
    from zoneinfo import ZoneInfo
    _ist = ZoneInfo("Asia/Kolkata")
    generated_at = datetime.now(_ist).strftime("%d/%m/%Y %I:%M:%S %p IST")
    elements.append(
        Paragraph(
            f"Generated by Pipeline Rakshak &nbsp;|&nbsp; {generated_at}",
            footer_style,
        )
    )

    doc.build(elements)

    # Clean up any downloaded temp image now that the PDF is built.
    if _tmp_image_path and os.path.exists(_tmp_image_path):
        try:
            os.unlink(_tmp_image_path)
        except Exception:
            pass

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


@router.get(
    "/{inspection_id}/pdf",
    tags=["Reports"],
    summary="Download a single-inspection PDF report",
    responses={
        200: {"content": {"application/pdf": {}}, "description": "PDF report"},
        404: {"description": "Inspection not found"},
    },
)
def download_inspection_pdf(
    inspection_id: int,
    db: Session = Depends(deps.get_db_session),
):
    """
    Generate and download a professional PDF report for a single inspection.

    The PDF includes:
    - Inspection image (if available on disk)
    - All inspection fields: prediction, confidence, severity, model,
      recommendation, verification status, timestamps
    - A footer indicating the generation timestamp
    """
    log.info("PDF report requested for inspection_id=%s", inspection_id)

    inspection = db.query(models.Inspection).filter(
        models.Inspection.id == inspection_id
    ).first()

    if inspection is None:
        log.warning("Inspection %s not found for PDF generation", inspection_id)
        raise HTTPException(status_code=404, detail=f"Inspection #{inspection_id} not found.")

    try:
        pdf_bytes = _build_single_inspection_pdf(inspection)
    except Exception as exc:
        log.error(
            "PDF generation failed for inspection %s: %s",
            inspection_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="PDF generation failed. Please try again.",
        )

    filename = f"corrosion_inspection_{inspection_id}.pdf"
    log.info("PDF generated (%d bytes) for inspection %s", len(pdf_bytes), inspection_id)

    # Persist to model-artifacts bucket (best-effort; does not block streaming).
    try:
        storage_service.upload(
            "model-artifacts",
            f"reports/{filename}",
            pdf_bytes,
            "application/pdf",
        )
    except Exception as _upload_err:
        log.warning("Could not upload PDF to storage: %s", _upload_err)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
