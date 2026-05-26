"""
trainer.py

Purpose
-------
Core training and validation engine for
Pipeline Rakshak Retraining System.

Features
--------
1. Mixed Precision Training (AMP)
2. Gradient Clipping
3. Accuracy
4. Precision
5. Recall
6. F1 Score
7. Probability Collection
8. Scheduler Support
9. Early Stopping Support
10. Jetson Compatible

Author
------
Pipeline Rakshak
"""

from typing import Dict

import torch

from tqdm import tqdm

from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score
)


# ==========================================================
# METRIC HELPERS
# ==========================================================

def compute_metrics(
    labels,
    predictions
):
    """
    Compute validation metrics.
    """

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

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1
    }


# ==========================================================
# TRAIN EPOCH
# ==========================================================

def train_one_epoch(
    model,
    dataloader,
    criterion,
    optimizer,
    scaler,
    device,
    gradient_clip=1.0
):
    """
    Train single epoch.
    """

    model.train()

    running_loss = 0.0

    total = 0
    correct = 0

    progress_bar = tqdm(
        dataloader,
        desc="Training",
        leave=False
    )

    for images, labels in progress_bar:

        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad(
            set_to_none=True
        )

        with torch.cuda.amp.autocast(
            enabled=torch.cuda.is_available()
        ):

            outputs = model(images)

            loss = criterion(
                outputs,
                labels
            )

        scaler.scale(
            loss
        ).backward()

        scaler.unscale_(optimizer)

        torch.nn.utils.clip_grad_norm_(
            model.parameters(),
            gradient_clip
        )

        scaler.step(
            optimizer
        )

        scaler.update()

        batch_size = labels.size(0)

        running_loss += (
            loss.item() * batch_size
        )

        predictions = outputs.argmax(
            dim=1
        )

        correct += (
            predictions == labels
        ).sum().item()

        total += batch_size

        progress_bar.set_postfix(
            loss=f"{loss.item():.4f}",
            acc=f"{100*correct/max(total,1):.2f}%"
        )

    epoch_loss = (
        running_loss / max(total, 1)
    )

    epoch_accuracy = (
        100.0 * correct / max(total, 1)
    )

    return {
        "loss": epoch_loss,
        "accuracy": epoch_accuracy
    }


# ==========================================================
# VALIDATION EPOCH
# ==========================================================

def validate_one_epoch(
    model,
    dataloader,
    criterion,
    device
):
    """
    Validation loop.
    """

    model.eval()

    running_loss = 0.0

    total = 0
    correct = 0

    all_labels = []
    all_predictions = []
    all_probabilities = []

    with torch.inference_mode():

        progress_bar = tqdm(
            dataloader,
            desc="Validation",
            leave=False
        )

        for images, labels in progress_bar:

            images = images.to(device)
            labels = labels.to(device)

            outputs = model(images)

            loss = criterion(
                outputs,
                labels
            )

            probabilities = (
                torch.softmax(
                    outputs,
                    dim=1
                )
            )

            predictions = outputs.argmax(
                dim=1
            )

            batch_size = labels.size(0)

            running_loss += (
                loss.item() * batch_size
            )

            correct += (
                predictions == labels
            ).sum().item()

            total += batch_size

            all_labels.extend(
                labels.cpu().numpy()
            )

            all_predictions.extend(
                predictions.cpu().numpy()
            )

            all_probabilities.extend(
                probabilities[:, 1]
                .cpu()
                .numpy()
            )

    metrics = compute_metrics(
        all_labels,
        all_predictions
    )

    validation_loss = (
        running_loss / max(total, 1)
    )

    validation_accuracy = (
        100.0 * correct / max(total, 1)
    )

    return {
        "loss": validation_loss,
        "accuracy": validation_accuracy,
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1": metrics["f1"],
        "labels": all_labels,
        "predictions": all_predictions,
        "probabilities": all_probabilities
    }