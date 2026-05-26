"""
early_stopping.py

Purpose
-------
Production-grade Early Stopping utility for Pipeline Rakshak.

Features
--------
1. Patience-based stopping
2. Min-delta improvement threshold
3. Supports:
   - accuracy
   - loss
   - f1
   - precision
   - recall
4. Save state
5. Load state
6. Resume training support
7. Jetson compatible
8. CPU/GPU independent

Author
------
Pipeline Rakshak Retraining Engine
"""

from dataclasses import dataclass, asdict
from typing import Dict, Any


@dataclass
class EarlyStoppingState:
    """
    Serializable state used for checkpoint resume.
    """

    best_metric: float
    counter: int
    stopped: bool


class EarlyStopping:
    """
    Early stopping controller.

    Example
    -------
    early_stopping = EarlyStopping(
        patience=5,
        min_delta=0.001,
        mode="max"
    )

    for epoch in range(epochs):

        val_acc = validate(...)

        should_stop = early_stopping.step(val_acc)

        if should_stop:
            break
    """

    def __init__(
        self,
        patience: int = 5,
        min_delta: float = 0.001,
        mode: str = "max"
    ):
        """
        Parameters
        ----------
        patience : int
            Number of epochs to wait before stopping.

        min_delta : float
            Minimum improvement required.

        mode : str
            "max" for metrics like accuracy/f1
            "min" for metrics like loss
        """

        if mode not in ["max", "min"]:
            raise ValueError(
                "mode must be either 'max' or 'min'"
            )

        self.patience = patience
        self.min_delta = min_delta
        self.mode = mode

        self.counter = 0
        self.stopped = False

        if mode == "max":
            self.best_metric = float("-inf")
        else:
            self.best_metric = float("inf")

    def _is_improvement(self, current_metric: float) -> bool:
        """
        Check whether metric improved.
        """

        if self.mode == "max":
            return (
                current_metric >
                self.best_metric + self.min_delta
            )

        return (
            current_metric <
            self.best_metric - self.min_delta
        )

    def step(self, current_metric: float) -> bool:
        """
        Update stopping logic.

        Parameters
        ----------
        current_metric : float

        Returns
        -------
        bool
            True if training should stop.
        """

        if self._is_improvement(current_metric):

            self.best_metric = current_metric
            self.counter = 0

            return False

        self.counter += 1

        if self.counter >= self.patience:
            self.stopped = True
            return True

        return False

    def reset(self) -> None:
        """
        Reset state.
        """

        self.counter = 0
        self.stopped = False

        if self.mode == "max":
            self.best_metric = float("-inf")
        else:
            self.best_metric = float("inf")

    def state_dict(self) -> Dict[str, Any]:
        """
        Save state for checkpoint.
        """

        return asdict(
            EarlyStoppingState(
                best_metric=self.best_metric,
                counter=self.counter,
                stopped=self.stopped
            )
        )

    def load_state_dict(
        self,
        state: Dict[str, Any]
    ) -> None:
        """
        Restore state from checkpoint.
        """

        self.best_metric = state["best_metric"]
        self.counter = state["counter"]
        self.stopped = state["stopped"]

    def __repr__(self) -> str:
        return (
            f"EarlyStopping("
            f"patience={self.patience}, "
            f"min_delta={self.min_delta}, "
            f"mode='{self.mode}', "
            f"best_metric={self.best_metric:.6f}, "
            f"counter={self.counter})"
        )


if __name__ == "__main__":

    early_stop = EarlyStopping(
        patience=3,
        min_delta=0.001,
        mode="max"
    )

    scores = [
        0.80,
        0.82,
        0.821,
        0.821,
        0.821,
        0.821
    ]

    for epoch, score in enumerate(scores, start=1):

        stop = early_stop.step(score)

        print(
            f"Epoch {epoch} | "
            f"Score={score:.4f} | "
            f"Counter={early_stop.counter}"
        )

        if stop:
            print(
                f"\nEarly stopping triggered "
                f"at epoch {epoch}"
            )
            break