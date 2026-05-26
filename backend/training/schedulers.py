"""
schedulers.py

Purpose
-------
Learning Rate Scheduler Factory for Pipeline Rakshak.

Supports
--------
1. ReduceLROnPlateau
2. CosineAnnealingLR
3. StepLR
4. CosineAnnealingWarmRestarts
5. No Scheduler

Features
--------
- Dynamic scheduler selection
- UI configurable
- Retraining compatible
- Jetson compatible
- Resume training compatible

Author
------
Pipeline Rakshak
"""

from typing import Optional

from torch.optim import Optimizer
from torch.optim.lr_scheduler import (
    ReduceLROnPlateau,
    CosineAnnealingLR,
    CosineAnnealingWarmRestarts,
    StepLR
)


SUPPORTED_SCHEDULERS = [
    "none",
    "plateau",
    "cosine",
    "warm_restart",
    "step"
]


def create_scheduler(
    optimizer: Optimizer,
    scheduler_name: str = "plateau",
    total_epochs: int = 30,
    step_size: int = 10,
    gamma: float = 0.1,
    patience: int = 3,
    factor: float = 0.5,
    min_lr: float = 1e-7
):
    """
    Create scheduler dynamically.

    Parameters
    ----------
    optimizer : Optimizer

    scheduler_name : str

    total_epochs : int

    step_size : int

    gamma : float

    patience : int

    factor : float

    min_lr : float

    Returns
    -------
    Scheduler or None
    """

    scheduler_name = scheduler_name.lower()

    if scheduler_name == "none":
        return None

    if scheduler_name == "plateau":

        return ReduceLROnPlateau(
            optimizer=optimizer,
            mode="max",
            factor=factor,
            patience=patience,
            min_lr=min_lr
        )

    if scheduler_name == "cosine":

        return CosineAnnealingLR(
            optimizer=optimizer,
            T_max=total_epochs,
            eta_min=min_lr
        )

    if scheduler_name == "warm_restart":

        return CosineAnnealingWarmRestarts(
            optimizer=optimizer,
            T_0=5,
            T_mult=2,
            eta_min=min_lr
        )

    if scheduler_name == "step":

        return StepLR(
            optimizer=optimizer,
            step_size=step_size,
            gamma=gamma
        )

    raise ValueError(
        f"Unsupported scheduler: "
        f"{scheduler_name}"
    )


def scheduler_step(
    scheduler,
    scheduler_name: str,
    monitored_metric: Optional[float] = None
):
    """
    Safe scheduler step.

    Handles:
    - Plateau scheduler
    - Standard schedulers

    Parameters
    ----------
    scheduler

    scheduler_name : str

    monitored_metric : float
    """

    if scheduler is None:
        return

    scheduler_name = scheduler_name.lower()

    if scheduler_name == "plateau":

        if monitored_metric is None:
            raise ValueError(
                "ReduceLROnPlateau "
                "requires monitored_metric"
            )

        scheduler.step(monitored_metric)

    else:

        scheduler.step()


def get_current_lr(
    optimizer: Optimizer
) -> float:
    """
    Get current learning rate.
    """

    return optimizer.param_groups[0]["lr"]


def scheduler_info(
    scheduler
):
    """
    Return scheduler information.
    """

    if scheduler is None:

        return {
            "name": "none"
        }

    return {
        "name": scheduler.__class__.__name__
    }


if __name__ == "__main__":

    print(
        "\nSupported Schedulers:"
    )

    for scheduler in SUPPORTED_SCHEDULERS:

        print(
            f" - {scheduler}"
        )