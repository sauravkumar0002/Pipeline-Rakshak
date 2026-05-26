"""
evaluator.py

Purpose
-------
Production evaluation engine for Pipeline Rakshak.

Features
--------
1. Accuracy
2. Precision
3. Recall
4. F1 Score
5. ROC Curve
6. ROC-AUC
7. Precision Recall Curve
8. Average Precision
9. Classification Report
10. Confusion Matrix
11. Metrics JSON
12. Metrics CSV
13. Prediction CSV
14. Jetson Compatible
15. Retraining Compatible

Author
------
Pipeline Rakshak
"""

import json
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
    roc_curve,
    auc,
    precision_recall_curve,
    average_precision_score,
    ConfusionMatrixDisplay
)


CLASS_NAMES = [
    "corrosion",
    "no_corrosion"
]


class Evaluator:

    def __init__(
        self,
        output_dir: str
    ):

        self.output_dir = Path(output_dir)

        self.output_dir.mkdir(
            parents=True,
            exist_ok=True
        )

    # =====================================================
    # MAIN EVALUATION
    # =====================================================

    def evaluate(
        self,
        labels,
        predictions,
        probabilities
    ):
        """
        Full evaluation.
        """

        accuracy = accuracy_score(
            labels,
            predictions
        )

        precision = precision_score(
            labels,
            predictions,
            average="macro",
            zero_division=0
        )

        recall = recall_score(
            labels,
            predictions,
            average="macro",
            zero_division=0
        )

        f1 = f1_score(
            labels,
            predictions,
            average="macro",
            zero_division=0
        )

        report = classification_report(
            labels,
            predictions,
            output_dict=True,
            zero_division=0
        )

        cm = confusion_matrix(
            labels,
            predictions
        )

        # Guard: ROC/PR metrics require both classes to be present in labels.
        # With small datasets (test=val), the eval set may be single-class.
        _n_unique_labels = len(set(labels))
        if _n_unique_labels < 2:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "ROC/PR metrics undefined: only %d unique class(es) in evaluation "
                "labels. Skipping curve computation (roc_auc=0, avg_precision=0). "
                "This is expected for very small datasets where test set = val set.",
                _n_unique_labels,
            )
            fpr, tpr, roc_auc = [0.0, 1.0], [0.0, 1.0], 0.0
            pr_precision = [1.0, 1.0]
            pr_recall    = [0.0, 1.0]
            average_precision = 0.0
        else:
            fpr, tpr, _ = roc_curve(
                labels,
                probabilities
            )

            roc_auc = auc(
                fpr,
                tpr
            )

            pr_precision, pr_recall, _ = (
                precision_recall_curve(
                    labels,
                    probabilities
                )
            )

            average_precision = (
                average_precision_score(
                    labels,
                    probabilities
                )
            )

        metrics = {

            "accuracy": float(accuracy),

            "precision": float(precision),

            "recall": float(recall),

            "f1": float(f1),

            "roc_auc": float(roc_auc),

            "average_precision":
                float(average_precision)
        }

        self._save_metrics(metrics)

        self._save_classification_report(
            report
        )

        self._save_predictions(
            labels,
            predictions,
            probabilities
        )

        self._save_confusion_matrix(
            cm
        )

        self._save_roc_curve(
            fpr,
            tpr,
            roc_auc
        )

        self._save_pr_curve(
            pr_precision,
            pr_recall,
            average_precision
        )

        return metrics

    # =====================================================
    # SAVE METRICS
    # =====================================================

    def _save_metrics(
        self,
        metrics
    ):

        json_path = (
            self.output_dir /
            "metrics_summary.json"
        )

        with open(
            json_path,
            "w"
        ) as f:

            json.dump(
                metrics,
                f,
                indent=4
            )

        pd.DataFrame(
            [metrics]
        ).to_csv(
            self.output_dir /
            "metrics_summary.csv",
            index=False
        )

    # =====================================================
    # SAVE REPORT
    # =====================================================

    def _save_classification_report(
        self,
        report
    ):

        report_path = (
            self.output_dir /
            "classification_report.json"
        )

        with open(
            report_path,
            "w"
        ) as f:

            json.dump(
                report,
                f,
                indent=4
            )

    # =====================================================
    # SAVE PREDICTIONS
    # =====================================================

    def _save_predictions(
        self,
        labels,
        predictions,
        probabilities
    ):

        df = pd.DataFrame({

            "actual": labels,

            "predicted": predictions,

            "probability":
                probabilities
        })

        df.to_csv(
            self.output_dir /
            "predictions.csv",
            index=False
        )

    # =====================================================
    # CONFUSION MATRIX
    # =====================================================

    def _save_confusion_matrix(
        self,
        cm
    ):

        fig, ax = plt.subplots(
            figsize=(7, 6)
        )

        disp = ConfusionMatrixDisplay(
            confusion_matrix=cm,
            display_labels=CLASS_NAMES
        )

        disp.plot(
            ax=ax,
            values_format="d"
        )

        plt.tight_layout()

        plt.savefig(
            self.output_dir /
            "confusion_matrix.png"
        )

        plt.close()

    # =====================================================
    # ROC CURVE
    # =====================================================

    def _save_roc_curve(
        self,
        fpr,
        tpr,
        roc_auc
    ):

        plt.figure(
            figsize=(7, 6)
        )

        plt.plot(
            fpr,
            tpr,
            label=f"AUC={roc_auc:.4f}"
        )

        plt.plot(
            [0, 1],
            [0, 1],
            linestyle="--"
        )

        plt.xlabel("False Positive Rate")
        plt.ylabel("True Positive Rate")
        plt.title("ROC Curve")

        plt.legend()

        plt.tight_layout()

        plt.savefig(
            self.output_dir /
            "roc_curve.png"
        )

        plt.close()

    # =====================================================
    # PR CURVE
    # =====================================================

    def _save_pr_curve(
        self,
        precision,
        recall,
        average_precision
    ):

        plt.figure(
            figsize=(7, 6)
        )

        plt.plot(
            recall,
            precision,
            label=f"AP={average_precision:.4f}"
        )

        plt.xlabel("Recall")
        plt.ylabel("Precision")

        plt.title(
            "Precision Recall Curve"
        )

        plt.legend()

        plt.tight_layout()

        plt.savefig(
            self.output_dir /
            "pr_curve.png"
        )

        plt.close()