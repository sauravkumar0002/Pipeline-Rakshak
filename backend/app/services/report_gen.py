# backend/app/services/report_gen.py

import pandas as pd
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from typing import List, Dict, Any
import os

from backend.app.config import settings

def generate_csv_report(inspections: List[Dict[str, Any]], filename: str) -> str:
    """
    Generates a CSV report from a list of inspection data.

    Args:
        inspections (List[Dict[str, Any]]): A list of inspection records (as dictionaries).
        filename (str): The desired filename for the report (e.g., 'report_2026-05-23.csv').

    Returns:
        str: The full path to the generated CSV file.
    """
    if not inspections:
        print("Warning: No inspection data provided for CSV report generation.")
        return ""

    # Ensure the report directory exists
    os.makedirs(settings.REPORT_DIRECTORY, exist_ok=True)
    
    # Create a DataFrame, handling potentially missing data
    df = pd.DataFrame(inspections)

    # Define the columns and their order for the report
    report_columns = [
        'id', 'timestamp', 'image_path', 'prediction_class', 'confidence',
        'severity', 'recommendation', 'model_used', 'latency_ms', 'is_verified',
        'corrected_class', 'is_flagged_for_retraining', 'created_at', 'updated_at'
    ]
    
    # Filter the DataFrame to include only the desired columns
    # This also gracefully handles cases where a column might be missing from the data
    df_report = df.reindex(columns=report_columns)

    # Fill NaN values with a placeholder for clarity in the report
    df_report.fillna('N/A', inplace=True)

    # Format float values for consistency
    if 'confidence' in df_report.columns:
        df_report['confidence'] = df_report['confidence'].apply(lambda x: f"{x:.4f}" if isinstance(x, (int, float)) else x)
    if 'latency_ms' in df_report.columns:
        df_report['latency_ms'] = df_report['latency_ms'].apply(lambda x: f"{x:.2f}" if isinstance(x, (int, float)) else x)

    # Construct the full file path
    file_path = os.path.join(settings.REPORT_DIRECTORY, filename)

    # Save the DataFrame to a CSV file
    df_report.to_csv(file_path, index=False)

    return file_path


def generate_pdf_report(inspections: List[Dict[str, Any]], filename: str) -> str:
    """
    Generates a PDF report from a list of inspection data using reportlab.

    Args:
        inspections (List[Dict[str, Any]]): A list of inspection records (as dictionaries).
        filename (str): The desired filename for the report (e.g., 'report_2026-05-23.pdf').

    Returns:
        str: The full path to the generated PDF file.
    """
    if not inspections:
        print("Warning: No inspection data provided for PDF report generation.")
        return ""

    # Ensure the report directory exists
    os.makedirs(settings.REPORT_DIRECTORY, exist_ok=True)
    file_path = os.path.join(settings.REPORT_DIRECTORY, filename)

    doc = SimpleDocTemplate(file_path, pagesize=landscape(letter))
    elements = []
    styles = getSampleStyleSheet()

    # Add a title
    title = Paragraph("Pipeline Rakshak — Inspection Report", styles['h1'])
    elements.append(title)

    # Prepare data for the table
    # Define headers in the desired order
    headers = [
        'ID', 'Timestamp', 'Image Path', 'Prediction', 'Confidence',
        'Severity', 'Recommendation', 'Model', 'Verified'
    ]
    
    # Map inspection keys to headers
    key_map = {
        'ID': 'id', 'Timestamp': 'timestamp', 'Image Path': 'image_path',
        'Prediction': 'prediction_class', 'Confidence': 'confidence',
        'Severity': 'severity', 'Recommendation': 'recommendation',
        'Model': 'model_used', 'Verified': 'is_verified'
    }

    data = [headers]
    for insp in inspections:
        row = []
        for header in headers:
            key = key_map[header]
            value = insp.get(key, 'N/A') # Gracefully handle missing keys
            
            # Format specific fields for readability
            if key == 'confidence' and isinstance(value, float):
                value = f"{value:.2%}"
            elif key == 'timestamp' and value != 'N/A':
                # Assuming timestamp is a datetime object or a string that can be parsed
                try:
                    value = pd.to_datetime(value).strftime('%Y-%m-%d %H:%M:%S')
                except:
                    pass # Keep original value if parsing fails
            
            row.append(str(value))
        data.append(row)

    # Create and style the table
    table = Table(data, repeatRows=1)
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ])
    table.setStyle(style)

    elements.append(table)
    doc.build(elements)

    return file_path
