# backend/app/api/endpoints/analytics.py

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import Dict, Any, List
from datetime import datetime, timedelta, timezone
import io
import base64
import logging

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from sklearn.metrics import (
    confusion_matrix as _sklearn_cm,
    classification_report as _sklearn_cr,
    roc_curve, roc_auc_score,
    precision_recall_curve, average_precision_score,
    accuracy_score, precision_score, recall_score, f1_score,
)

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, HRFlowable,
)

from backend.app import models, schemas
from backend.app.api import deps

router = APIRouter()
log = logging.getLogger(__name__)

MIN_VERIFIED_SAMPLES = 4  # minimum verified records needed for ML metrics

# ── ML helpers ────────────────────────────────────────────────────────────────

def _extract_verified_arrays(inspections):
    """
    From a list of verified Inspection ORM objects return:
      y_true  – list of int  (1=corrosion, 0=no_corrosion) – ground truth
      y_pred  – list of int  (1=corrosion, 0=no_corrosion) – model prediction
      y_score – list of float probability that sample is corrosion
    """
    y_true, y_pred, y_score = [], [], []
    for insp in inspections:
        gt = insp.corrected_class if insp.corrected_class else insp.prediction_class
        y_true.append(1 if gt == "corrosion" else 0)
        y_pred.append(1 if insp.prediction_class == "corrosion" else 0)
        score = insp.confidence if insp.prediction_class == "corrosion" else (1.0 - insp.confidence)
        y_score.append(float(score))
    return y_true, y_pred, y_score


def _has_both_classes(y_true: list) -> bool:
    return len(set(y_true)) >= 2


def _cm_values(y_true, y_pred):
    """Return TP, FN, FP, TN from binary arrays (positive=1=corrosion)."""
    cm = _sklearn_cm(y_true, y_pred, labels=[1, 0])
    TP, FN = int(cm[0, 0]), int(cm[0, 1])
    FP, TN = int(cm[1, 0]), int(cm[1, 1])
    return TP, FN, FP, TN


def _compute_metrics(TP, FN, FP, TN) -> dict:
    total = TP + TN + FP + FN
    accuracy    = (TP + TN) / total if total > 0 else 0.0
    precision_v = TP / (TP + FP)   if (TP + FP) > 0 else 0.0
    recall_v    = TP / (TP + FN)   if (TP + FN) > 0 else 0.0
    f1_v        = 2 * precision_v * recall_v / (precision_v + recall_v) \
                  if (precision_v + recall_v) > 0 else 0.0
    specificity = TN / (TN + FP)   if (TN + FP) > 0 else 0.0
    return {
        "accuracy":    round(accuracy,    4),
        "precision":   round(precision_v, 4),
        "recall":      round(recall_v,    4),
        "f1_score":    round(f1_v,        4),
        "specificity": round(specificity, 4),
        "sensitivity": round(recall_v,    4),
    }


def _fmt_report_row(row: dict) -> dict:
    return {
        "precision": round(row["precision"],  4),
        "recall":    round(row["recall"],     4),
        "f1":        round(row["f1-score"],   4),
        "support":   int(row["support"]),
    }


def _roc_image(y_true, y_score) -> tuple:
    """Returns (auc_float, base64_png_str)."""
    fpr, tpr, _ = roc_curve(y_true, y_score)
    auc = float(roc_auc_score(y_true, y_score))

    fig, ax = plt.subplots(figsize=(5.5, 4.5), facecolor="#1b263b")
    ax.set_facecolor("#1e293b")
    ax.plot(fpr, tpr, color="#3b82f6", linewidth=2.5, label=f"AUC = {auc:.3f}")
    ax.fill_between(fpr, tpr, alpha=0.12, color="#3b82f6")
    ax.plot([0, 1], [0, 1], "--", linewidth=1, color="#6b7280", label="Random")
    ax.set_xlabel("False Positive Rate", color="#94a3b8", fontsize=10)
    ax.set_ylabel("True Positive Rate", color="#94a3b8", fontsize=10)
    ax.set_title("ROC Curve", color="#f1f5f9", fontsize=12, fontweight="bold", pad=10)
    ax.tick_params(colors="#94a3b8")
    for spine in ax.spines.values():
        spine.set_color("#334155")
    ax.legend(loc="lower right", facecolor="#1e293b", edgecolor="#334155",
              labelcolor="#f1f5f9", fontsize=9)
    ax.set_xlim([-0.01, 1.01])
    ax.set_ylim([-0.01, 1.05])
    ax.grid(True, color="#334155", alpha=0.4, linestyle="--")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=110, facecolor="#1b263b")
    plt.close(fig)
    buf.seek(0)
    return auc, base64.b64encode(buf.read()).decode()


def _pr_image(y_true, y_score) -> tuple:
    """Returns (avg_precision_float, base64_png_str)."""
    prec_arr, rec_arr, _ = precision_recall_curve(y_true, y_score)
    ap = float(average_precision_score(y_true, y_score))
    baseline = sum(y_true) / len(y_true) if y_true else 0.5

    fig, ax = plt.subplots(figsize=(5.5, 4.5), facecolor="#1b263b")
    ax.set_facecolor("#1e293b")
    ax.plot(rec_arr, prec_arr, color="#f59e0b", linewidth=2.5, label=f"AP = {ap:.3f}")
    ax.fill_between(rec_arr, prec_arr, alpha=0.12, color="#f59e0b")
    ax.axhline(baseline, linestyle="--", linewidth=1, color="#6b7280",
               label=f"Baseline = {baseline:.2f}")
    ax.set_xlabel("Recall", color="#94a3b8", fontsize=10)
    ax.set_ylabel("Precision", color="#94a3b8", fontsize=10)
    ax.set_title("Precision-Recall Curve", color="#f1f5f9", fontsize=12,
                 fontweight="bold", pad=10)
    ax.tick_params(colors="#94a3b8")
    for spine in ax.spines.values():
        spine.set_color("#334155")
    ax.legend(loc="upper right", facecolor="#1e293b", edgecolor="#334155",
              labelcolor="#f1f5f9", fontsize=9)
    ax.set_xlim([-0.01, 1.01])
    ax.set_ylim([-0.01, 1.05])
    ax.grid(True, color="#334155", alpha=0.4, linestyle="--")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=110, facecolor="#1b263b")
    plt.close(fig)
    buf.seek(0)
    return ap, base64.b64encode(buf.read()).decode()


def _build_research_data(db: Session) -> dict:
    """
    Core computation: gathers all verified inspections and computes
    confusion matrix, metrics, classification report and model comparison.
    Returns a dict that both the JSON endpoint and PDF generator can use.
    """
    verified = db.query(models.Inspection).filter(
        models.Inspection.is_verified == True
    ).all()

    if len(verified) < MIN_VERIFIED_SAMPLES:
        return {
            "has_data": False,
            "total_verified": len(verified),
            "message": (
                f"Not enough verified samples for evaluation. "
                f"Need at least {MIN_VERIFIED_SAMPLES}, "
                f"currently have {len(verified)}."
            ),
        }

    y_true, y_pred, y_score = _extract_verified_arrays(verified)

    if not _has_both_classes(y_true):
        return {
            "has_data": False,
            "total_verified": len(verified),
            "message": "Verified samples contain only one class. "
                       "Both corrosion and no_corrosion samples are required.",
        }

    TP, FN, FP, TN = _cm_values(y_true, y_pred)
    metrics = _compute_metrics(TP, FN, FP, TN)

    report_raw = _sklearn_cr(
        y_true, y_pred, labels=[1, 0],
        target_names=["corrosion", "no_corrosion"],
        output_dict=True, zero_division=0,
    )
    classification_report_data = {
        "corrosion":    _fmt_report_row(report_raw["corrosion"]),
        "no_corrosion": _fmt_report_row(report_raw["no_corrosion"]),
        "macro_avg":    _fmt_report_row(report_raw["macro avg"]),
        "weighted_avg": _fmt_report_row(report_raw["weighted avg"]),
    }

    # ── Model comparison ──────────────────────────────────────────────────────
    model_names = [
        row[0] for row in
        db.query(models.Inspection.model_used)
          .filter(models.Inspection.is_verified == True)
          .distinct().all()
        if row[0]
    ]
    model_comparison = []
    best_model, best_f1 = None, -1.0

    for model_name in model_names:
        model_inspections = (
            db.query(models.Inspection)
              .filter(
                  models.Inspection.is_verified == True,
                  models.Inspection.model_used == model_name,
              ).all()
        )
        if len(model_inspections) < 2:
            continue

        mt, mp, _ = _extract_verified_arrays(model_inspections)
        m_acc  = round(accuracy_score(mt, mp), 4)
        m_prec = round(precision_score(mt, mp, zero_division=0), 4)
        m_rec  = round(recall_score(mt, mp, zero_division=0), 4)
        m_f1   = round(f1_score(mt, mp, zero_division=0), 4)

        total_imgs = (
            db.query(models.Inspection)
              .filter(models.Inspection.model_used == model_name)
              .count()
        )
        avg_lat = (
            db.query(func.avg(models.Inspection.latency_ms))
              .filter(models.Inspection.model_used == model_name)
              .scalar()
        )
        model_comparison.append({
            "model_name":       model_name,
            "accuracy":         m_acc,
            "precision":        m_prec,
            "recall":           m_rec,
            "f1":               m_f1,
            "avg_latency_ms":   round(avg_lat or 0.0, 2),
            "images_processed": total_imgs,
            "verified_count":   len(model_inspections),
            "is_best":          False,
        })
        if m_f1 > best_f1:
            best_f1 = m_f1
            best_model = model_name

    for entry in model_comparison:
        entry["is_best"] = (entry["model_name"] == best_model)

    return {
        "has_data":              True,
        "total_verified":        len(verified),
        "y_true":                y_true,
        "y_score":               y_score,
        "confusion_matrix":      {"TP": TP, "TN": TN, "FP": FP, "FN": FN},
        "metrics":               metrics,
        "classification_report": classification_report_data,
        "model_comparison":      model_comparison,
    }



@router.get("/summary", response_model=schemas.AnalyticsSummary)
def get_analytics_summary(
    db: Session = Depends(deps.get_db_session)
):
    """
    Provides a high-level summary of all inspection data.
    - Total number of inspections.
    - Counts for 'corrosion' and 'no_corrosion' classes.
    - Average prediction confidence across all inspections.
    - Count of unverified inspections.
    - Count of verified inspections.
    - Count of inspections flagged for retraining.
    - Count of items in the retraining queue.
    """
    try:
        total_inspections = db.query(models.Inspection).count()
        corrosion_count = db.query(models.Inspection).filter(models.Inspection.prediction_class == "corrosion").count()
        no_corrosion_count = db.query(models.Inspection).filter(models.Inspection.prediction_class == "no_corrosion").count()
        avg_confidence_query = db.query(func.avg(models.Inspection.confidence)).scalar()
        average_confidence = avg_confidence_query if avg_confidence_query is not None else 0.0
        unverified_count = db.query(models.Inspection).filter(models.Inspection.is_verified == False).count()
        verified_count = db.query(models.Inspection).filter(models.Inspection.is_verified == True).count()
        flagged_count = db.query(models.Inspection).filter(models.Inspection.is_flagged_for_retraining == True).count()

        retraining_queue_count = db.query(models.RetrainingQueueItem).count()

        return schemas.AnalyticsSummary(
            total_inspections=total_inspections,
            corrosion_count=corrosion_count,
            no_corrosion_count=no_corrosion_count,
            average_confidence=average_confidence,
            unverified_count=unverified_count,
            verified_count=verified_count,
            flagged_count=flagged_count,
            retraining_queue_count=retraining_queue_count
        )
    except Exception as exc:
        log.error("Failed to compute analytics summary.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analytics summary failed: {exc}")


@router.get("/dashboard", response_model=schemas.DashboardMetrics)
def get_dashboard_metrics(
    db: Session = Depends(deps.get_db_session)
):
    """
    Returns KPI metrics for the dashboard.
    Values are computed directly from the inspections table.
    """
    try:
        total_inspections = db.query(models.Inspection).count()
        corrosion_detected = db.query(models.Inspection).filter(
            models.Inspection.prediction_class == "corrosion"
        ).count()
        healthy_images = db.query(models.Inspection).filter(
            models.Inspection.prediction_class == "no_corrosion"
        ).count()

        avg_confidence_query = db.query(func.avg(models.Inspection.confidence)).scalar()
        average_confidence = avg_confidence_query if avg_confidence_query is not None else 0.0

        avg_latency_ms = db.query(func.avg(models.Inspection.latency_ms)).scalar()
        average_inference_time = round((avg_latency_ms or 0.0) / 1000.0, 2)

        earliest_timestamp = db.query(func.min(models.Inspection.timestamp)).scalar()
        system_uptime = 0.0
        if earliest_timestamp is not None:
            active_days = db.query(func.date(models.Inspection.timestamp)).distinct().count()
            total_days = max(1, (datetime.now(timezone.utc).date() - earliest_timestamp.date()).days + 1)
            system_uptime = round((active_days / total_days) * 100.0, 2)

        return schemas.DashboardMetrics(
            total_inspections=total_inspections,
            corrosion_detected=corrosion_detected,
            healthy_images=healthy_images,
            average_confidence=average_confidence,
            average_inference_time=average_inference_time,
            system_uptime=system_uptime
        )
    except Exception as exc:
        log.error("Failed to compute dashboard metrics.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dashboard metrics failed: {exc}")

@router.get("/performance", response_model=Dict[str, Any])
def get_model_performance(
    db: Session = Depends(deps.get_db_session)
):
    """
    Calculates and returns performance metrics for each model used.
    Metrics include: average latency, images processed, and accuracy (if verified).
    """
    try:
        performance_data = {}
        # Group inspections by model used
        models_used = db.query(models.Inspection.model_used).distinct().all()

        for (model_name,) in models_used:
            if not model_name:
                continue

            # Calculate average latency for the model
            avg_latency = db.query(func.avg(models.Inspection.latency_ms)).filter(models.Inspection.model_used == model_name).scalar()

            # Count total images processed by the model
            total_images = db.query(models.Inspection).filter(models.Inspection.model_used == model_name).count()

            # Calculate accuracy based on verified inspections
            verified_inspections = db.query(models.Inspection).filter(
                models.Inspection.model_used == model_name,
                models.Inspection.is_verified == True
            ).all()

            correct_predictions = 0
            if verified_inspections:
                for insp in verified_inspections:
                    if insp.prediction_class == insp.corrected_class:
                        correct_predictions += 1

                accuracy = (correct_predictions / len(verified_inspections)) * 100 if verified_inspections else 0.0
            else:
                accuracy = None  # Not enough data to calculate accuracy

            performance_data[model_name] = {
                "average_latency_ms": round(avg_latency, 2) if avg_latency else 0,
                "images_processed": total_images,
                "verified_inspections_count": len(verified_inspections),
                "accuracy_percent": round(accuracy, 2) if accuracy is not None else "N/A"
            }

        return performance_data
    except Exception as exc:
        log.error("Failed to compute model performance analytics.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model performance analytics failed: {exc}")

@router.get("/severity-distribution", response_model=Dict[str, int])
def get_severity_distribution(
    db: Session = Depends(deps.get_db_session)
):
    """
    Returns the distribution of severity levels ('Low', 'Medium', 'High')
    for all inspections classified as 'corrosion'.
    """
    try:
        severity_counts = db.query(
            models.Inspection.severity,
            func.count(models.Inspection.id)
        ).filter(
            models.Inspection.prediction_class == "corrosion"
        ).group_by(
            models.Inspection.severity
        ).all()

        # Initialize with all possible severity levels to ensure they are in the response
        distribution = {"Minimal": 0, "Low": 0, "Medium": 0, "High": 0}
        for severity, count in severity_counts:
            if severity in distribution:
                distribution[severity] = count

        return distribution
    except Exception as exc:
        log.error("Failed to compute severity distribution analytics.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Severity distribution analytics failed: {exc}")


@router.get("/trends", response_model=List[Dict[str, Any]])
def get_inspection_trends(
    db: Session = Depends(deps.get_db_session),
    days: int = 30
):
    """
    Returns daily inspection counts for the past N days.
    Used to render inspection trend charts on the analytics dashboard.
    """
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))

        results = db.query(
            func.date(models.Inspection.timestamp).label("date"),
            func.count(models.Inspection.id).label("total"),
            func.sum(
                case((models.Inspection.prediction_class == "corrosion", 1), else_=0)
            ).label("corrosion"),
            func.sum(
                case((models.Inspection.prediction_class == "no_corrosion", 1), else_=0)
            ).label("no_corrosion"),
        ).filter(
            models.Inspection.timestamp >= cutoff
        ).group_by(
            func.date(models.Inspection.timestamp)
        ).order_by(
            func.date(models.Inspection.timestamp)
        ).all()

        return [
            {
                "date": str(row.date),
                "total": int(row.total),
                "corrosion": int(row.corrosion or 0),
                "no_corrosion": int(row.no_corrosion or 0),
            }
            for row in results
        ]
    except Exception as exc:
        log.error("Failed to compute inspection trends.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Trends analytics failed: {exc}")


# ── Research Analytics endpoints ──────────────────────────────────────────────

@router.get("/research", response_model=Dict[str, Any])
def get_research_analytics(db: Session = Depends(deps.get_db_session)):
    """
    Returns confusion matrix values, classification metrics,
    per-class classification report, and per-model comparison table.
    All derived from verified inspections only.
    """
    try:
        data = _build_research_data(db)
        if not data["has_data"]:
            # Return the insufficient-data sentinel — not a 4xx error
            return {
                "has_data":       False,
                "total_verified": data["total_verified"],
                "message":        data["message"],
            }
        # Remove raw arrays before returning (not needed in JSON response)
        data.pop("y_true", None)
        data.pop("y_score", None)
        return data
    except Exception as exc:
        log.error("Research analytics failed.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Research analytics failed: {exc}")


@router.get("/roc-curve", response_model=Dict[str, Any])
def get_roc_curve(db: Session = Depends(deps.get_db_session)):
    """
    Returns the AUC score and a base64-encoded PNG image of the ROC curve.
    """
    try:
        verified = db.query(models.Inspection).filter(
            models.Inspection.is_verified == True
        ).all()
        if len(verified) < MIN_VERIFIED_SAMPLES:
            return {
                "has_data": False,
                "message": (
                    f"Not enough verified samples. "
                    f"Need at least {MIN_VERIFIED_SAMPLES}, "
                    f"have {len(verified)}."
                ),
            }
        y_true, _, y_score = _extract_verified_arrays(verified)
        if not _has_both_classes(y_true):
            return {"has_data": False, "message": "Both classes required for ROC curve."}

        auc, img_b64 = _roc_image(y_true, y_score)
        return {"has_data": True, "auc": round(auc, 4), "image_base64": img_b64}
    except Exception as exc:
        log.error("ROC curve generation failed.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ROC curve failed: {exc}")


@router.get("/pr-curve", response_model=Dict[str, Any])
def get_pr_curve(db: Session = Depends(deps.get_db_session)):
    """
    Returns the Average Precision score and a base64-encoded PNG of the
    Precision-Recall curve.
    """
    try:
        verified = db.query(models.Inspection).filter(
            models.Inspection.is_verified == True
        ).all()
        if len(verified) < MIN_VERIFIED_SAMPLES:
            return {
                "has_data": False,
                "message": (
                    f"Not enough verified samples. "
                    f"Need at least {MIN_VERIFIED_SAMPLES}, "
                    f"have {len(verified)}."
                ),
            }
        y_true, _, y_score = _extract_verified_arrays(verified)
        if not _has_both_classes(y_true):
            return {"has_data": False, "message": "Both classes required for PR curve."}

        ap, img_b64 = _pr_image(y_true, y_score)
        return {"has_data": True, "average_precision": round(ap, 4), "image_base64": img_b64}
    except Exception as exc:
        log.error("PR curve generation failed.", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PR curve failed: {exc}")


@router.get("/research-report/pdf")
def download_research_report(db: Session = Depends(deps.get_db_session)):
    """
    Generates and streams a comprehensive Research Analytics PDF report.
    Includes confusion matrix, metrics, ROC/PR curves, classification report,
    and model comparison table.
    """
    try:
        data = _build_research_data(db)
        if not data["has_data"]:
            raise HTTPException(
                status_code=400,
                detail=data.get("message", "Insufficient verified data for report."),
            )

        y_true  = data["y_true"]
        y_score = data["y_score"]

        # Generate curve images
        auc, roc_b64  = _roc_image(y_true, y_score)
        ap,  pr_b64   = _pr_image(y_true, y_score)

        cm_vals    = data["confusion_matrix"]
        metrics    = data["metrics"]
        cr         = data["classification_report"]
        model_cmp  = data["model_comparison"]
        total_v    = data["total_verified"]
        total_all  = db.query(models.Inspection).count()
        from zoneinfo import ZoneInfo as _ZI
        generated_at = datetime.now(_ZI("Asia/Kolkata")).strftime("%d/%m/%Y %I:%M:%S %p IST")

        # ── Build PDF ─────────────────────────────────────────────────────────
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            rightMargin=1.8*cm, leftMargin=1.8*cm,
            topMargin=1.8*cm, bottomMargin=1.8*cm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "Title", parent=styles["Title"],
            fontSize=16, textColor=colors.HexColor("#1e40af"),
            spaceAfter=4,
        )
        h2_style = ParagraphStyle(
            "H2", parent=styles["Heading2"],
            fontSize=12, textColor=colors.HexColor("#1e40af"),
            spaceBefore=14, spaceAfter=4,
        )
        body_style = ParagraphStyle(
            "Body", parent=styles["Normal"],
            fontSize=9, textColor=colors.HexColor("#1e293b"),
            spaceAfter=2,
        )
        muted_style = ParagraphStyle(
            "Muted", parent=styles["Normal"],
            fontSize=8, textColor=colors.HexColor("#64748b"),
        )

        HDR  = colors.HexColor("#1e40af")
        HDR2 = colors.HexColor("#dbeafe")
        BEST = colors.HexColor("#d1fae5")
        BEST_TXT = colors.HexColor("#065f46")
        GRID = colors.HexColor("#cbd5e1")

        def _tbl_style(header_rows=1, best_row=None):
            base = [
                ("BACKGROUND",  (0, 0), (-1, header_rows - 1), HDR),
                ("TEXTCOLOR",   (0, 0), (-1, header_rows - 1), colors.white),
                ("FONTNAME",    (0, 0), (-1, header_rows - 1), "Helvetica-Bold"),
                ("FONTSIZE",    (0, 0), (-1, -1), 8.5),
                ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
                ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, header_rows), (-1, -1),
                 [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID",        (0, 0), (-1, -1), 0.5, GRID),
                ("TOPPADDING",  (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
            if best_row is not None:
                base += [
                    ("BACKGROUND", (0, best_row), (-1, best_row), BEST),
                    ("TEXTCOLOR",  (0, best_row), (-1, best_row), BEST_TXT),
                    ("FONTNAME",   (0, best_row), (-1, best_row), "Helvetica-Bold"),
                ]
            return TableStyle(base)

        story = []

        # ── Title ─────────────────────────────────────────────────────────────
        story.append(Paragraph("Pipeline Rakshak", title_style))
        story.append(Paragraph("Research Analytics Report", h2_style))
        story.append(HRFlowable(width="100%", thickness=1, color=HDR, spaceAfter=6))
        story.append(Paragraph(
            f"Generated: {generated_at} &nbsp;|&nbsp; "
            f"Total inspections: {total_all} &nbsp;|&nbsp; "
            f"Verified samples: {total_v}",
            muted_style,
        ))
        story.append(Spacer(1, 12))

        # ── Confusion Matrix ──────────────────────────────────────────────────
        story.append(Paragraph("Confusion Matrix", h2_style))
        TP, TN = cm_vals["TP"], cm_vals["TN"]
        FP, FN = cm_vals["FP"], cm_vals["FN"]
        cm_data = [
            ["", "Predicted: Corrosion", "Predicted: No Corrosion"],
            ["Actual: Corrosion",    f"TP = {TP}",  f"FN = {FN}"],
            ["Actual: No Corrosion", f"FP = {FP}",  f"TN = {TN}"],
        ]
        cm_tbl = Table(cm_data, colWidths=[5*cm, 5*cm, 5*cm])
        cm_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), HDR),
            ("BACKGROUND",    (0, 0), (0, -1), HDR),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("TEXTCOLOR",     (0, 0), (0, -1), colors.white),
            ("FONTNAME",      (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND",    (1, 1), (1, 1), colors.HexColor("#dbeafe")),  # TP
            ("BACKGROUND",    (2, 2), (2, 2), colors.HexColor("#dcfce7")),  # TN
            ("BACKGROUND",    (2, 1), (2, 1), colors.HexColor("#fef9c3")),  # FN
            ("BACKGROUND",    (1, 2), (1, 2), colors.HexColor("#fee2e2")),  # FP
            ("GRID",          (0, 0), (-1, -1), 0.5, GRID),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(cm_tbl)
        story.append(Spacer(1, 10))

        # ── Classification Metrics ────────────────────────────────────────────
        story.append(Paragraph("Classification Metrics", h2_style))
        m = metrics
        metric_data = [
            ["Accuracy", "Precision", "Recall", "F1 Score", "Specificity", "Sensitivity"],
            [
                f"{m['accuracy']:.4f}",
                f"{m['precision']:.4f}",
                f"{m['recall']:.4f}",
                f"{m['f1_score']:.4f}",
                f"{m['specificity']:.4f}",
                f"{m['sensitivity']:.4f}",
            ],
        ]
        m_tbl = Table(metric_data, colWidths=[2.65*cm]*6)
        m_tbl.setStyle(_tbl_style())
        story.append(m_tbl)
        story.append(Spacer(1, 10))

        # ── ROC and PR Curve images (side by side) ────────────────────────────
        story.append(Paragraph("ROC Curve &amp; Precision-Recall Curve", h2_style))

        roc_img_buf = io.BytesIO(base64.b64decode(roc_b64))
        pr_img_buf  = io.BytesIO(base64.b64decode(pr_b64))
        roc_rl = RLImage(roc_img_buf, width=8*cm, height=6.5*cm)
        pr_rl  = RLImage(pr_img_buf,  width=8*cm, height=6.5*cm)

        curves_data = [[roc_rl, pr_rl]]
        curves_captions = [
            [
                Paragraph(f"ROC Curve (AUC = {auc:.4f})", muted_style),
                Paragraph(f"PR Curve (AP = {ap:.4f})", muted_style),
            ]
        ]
        img_tbl = Table(curves_data, colWidths=[8.5*cm, 8.5*cm])
        img_tbl.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        cap_tbl = Table(curves_captions, colWidths=[8.5*cm, 8.5*cm])
        cap_tbl.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(img_tbl)
        story.append(cap_tbl)
        story.append(Spacer(1, 10))

        # ── Classification Report ─────────────────────────────────────────────
        story.append(Paragraph("Classification Report", h2_style))
        cr_data = [
            ["Class", "Precision", "Recall", "F1 Score", "Support"],
            ["Corrosion",
             f"{cr['corrosion']['precision']:.4f}",
             f"{cr['corrosion']['recall']:.4f}",
             f"{cr['corrosion']['f1']:.4f}",
             str(cr['corrosion']['support'])],
            ["No Corrosion",
             f"{cr['no_corrosion']['precision']:.4f}",
             f"{cr['no_corrosion']['recall']:.4f}",
             f"{cr['no_corrosion']['f1']:.4f}",
             str(cr['no_corrosion']['support'])],
            ["Macro Avg",
             f"{cr['macro_avg']['precision']:.4f}",
             f"{cr['macro_avg']['recall']:.4f}",
             f"{cr['macro_avg']['f1']:.4f}",
             str(cr['macro_avg']['support'])],
            ["Weighted Avg",
             f"{cr['weighted_avg']['precision']:.4f}",
             f"{cr['weighted_avg']['recall']:.4f}",
             f"{cr['weighted_avg']['f1']:.4f}",
             str(cr['weighted_avg']['support'])],
        ]
        cr_col_w = [4.5*cm, 3*cm, 3*cm, 3*cm, 2.5*cm]
        cr_tbl = Table(cr_data, colWidths=cr_col_w)
        cr_style = _tbl_style()
        cr_style.add("BACKGROUND", (0, 3), (-1, 4), colors.HexColor("#f1f5f9"))
        cr_style.add("FONTNAME",   (0, 3), (-1, 4), "Helvetica-BoldOblique")
        cr_tbl.setStyle(cr_style)
        story.append(cr_tbl)
        story.append(Spacer(1, 10))

        # ── Model Comparison ──────────────────────────────────────────────────
        if model_cmp:
            story.append(Paragraph("Model Comparison", h2_style))
            mc_headers = ["Model", "Accuracy", "Precision", "Recall",
                          "F1", "Avg Latency (ms)", "Images", "Best?"]
            mc_data = [mc_headers]
            best_row_idx = None
            for i, row in enumerate(model_cmp):
                mc_data.append([
                    row["model_name"],
                    f"{row['accuracy']:.4f}",
                    f"{row['precision']:.4f}",
                    f"{row['recall']:.4f}",
                    f"{row['f1']:.4f}",
                    f"{row['avg_latency_ms']:.1f}",
                    str(row["images_processed"]),
                    "★ Best" if row["is_best"] else "",
                ])
                if row["is_best"]:
                    best_row_idx = i + 1  # +1 for header row

            mc_col_w = [4*cm, 2.1*cm, 2.1*cm, 2.1*cm, 1.8*cm, 2.5*cm, 1.8*cm, 1.8*cm]
            mc_tbl = Table(mc_data, colWidths=mc_col_w)
            mc_tbl.setStyle(_tbl_style(best_row=best_row_idx))
            story.append(mc_tbl)
            story.append(Spacer(1, 10))

        # ── Footer ────────────────────────────────────────────────────────────
        story.append(Spacer(1, 16))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRID))
        story.append(Paragraph(
            f"Pipeline Rakshak — Research Analytics Report — {generated_at}",
            muted_style,
        ))

        doc.build(story)
        buf.seek(0)
        filename = f"research_analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.error("Research analytics PDF generation failed.", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {exc}",
        )
