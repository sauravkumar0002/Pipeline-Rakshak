"""
checkpoint.py

Purpose
-------
Checkpoint management for Pipeline Rakshak.

Features
--------
1. Save epoch checkpoints
2. Save best model
3. Save final model
4. Resume interrupted training
5. Save optimizer state
6. Save scheduler state
7. Save AMP scaler state
8. Save early stopping state
9. Job-based checkpoint folders

Author
------
Pipeline Rakshak
"""

from pathlib import Path
from typing import Optional, Dict, Any

import torch


class CheckpointManager:
    """
    Handles all checkpoint operations.
    """

    def __init__(self, checkpoint_dir: str):

        self.checkpoint_dir = Path(checkpoint_dir)

        self.checkpoint_dir.mkdir(
            parents=True,
            exist_ok=True
        )

    # =====================================================
    # INTERNAL PATH HELPERS
    # =====================================================

    def epoch_checkpoint_path(
        self,
        epoch: int
    ) -> Path:

        return self.checkpoint_dir / (
            f"epoch_{epoch:03d}.pt"
        )

    @property
    def best_checkpoint_path(self) -> Path:

        return self.checkpoint_dir / "best.pt"

    @property
    def final_checkpoint_path(self) -> Path:

        return self.checkpoint_dir / "final.pt"

    # =====================================================
    # SAVE CHECKPOINT
    # =====================================================

    def save_checkpoint(
        self,
        epoch: int,
        model,
        optimizer=None,
        scheduler=None,
        scaler=None,
        early_stopping=None,
        metrics: Optional[Dict[str, Any]] = None,
        checkpoint_type: str = "epoch"
    ) -> str:
        """
        Save checkpoint.

        checkpoint_type:
        ----------------
        epoch
        best
        final
        """

        checkpoint = {
            "epoch": epoch,
            "model_state_dict":
                model.state_dict()
        }

        if optimizer is not None:
            checkpoint[
                "optimizer_state_dict"
            ] = optimizer.state_dict()

        if scheduler is not None:
            checkpoint[
                "scheduler_state_dict"
            ] = scheduler.state_dict()

        if scaler is not None:
            checkpoint[
                "scaler_state_dict"
            ] = scaler.state_dict()

        if early_stopping is not None:
            checkpoint[
                "early_stopping_state"
            ] = early_stopping.state_dict()

        if metrics is not None:
            checkpoint["metrics"] = metrics

        if checkpoint_type == "best":

            save_path = self.best_checkpoint_path

        elif checkpoint_type == "final":

            save_path = self.final_checkpoint_path

        else:

            save_path = self.epoch_checkpoint_path(
                epoch
            )

        torch.save(
            checkpoint,
            save_path
        )

        return str(save_path)

    # =====================================================
    # LOAD CHECKPOINT
    # =====================================================

    def load_checkpoint(
        self,
        checkpoint_path: str,
        model,
        optimizer=None,
        scheduler=None,
        scaler=None,
        early_stopping=None,
        device: str = "cpu"
    ) -> Dict[str, Any]:
        """
        Restore training state.
        """

        checkpoint = torch.load(
            checkpoint_path,
            map_location=device
        )

        model.load_state_dict(
            checkpoint["model_state_dict"]
        )

        if (
            optimizer is not None and
            "optimizer_state_dict" in checkpoint
        ):
            optimizer.load_state_dict(
                checkpoint["optimizer_state_dict"]
            )

        if (
            scheduler is not None and
            "scheduler_state_dict" in checkpoint
        ):
            scheduler.load_state_dict(
                checkpoint["scheduler_state_dict"]
            )

        if (
            scaler is not None and
            "scaler_state_dict" in checkpoint
        ):
            scaler.load_state_dict(
                checkpoint["scaler_state_dict"]
            )

        if (
            early_stopping is not None and
            "early_stopping_state" in checkpoint
        ):
            early_stopping.load_state_dict(
                checkpoint[
                    "early_stopping_state"
                ]
            )

        return checkpoint

    # =====================================================
    # LOAD BEST
    # =====================================================

    def load_best(
        self,
        model,
        device: str = "cpu"
    ):
        """
        Load best checkpoint only.
        """

        checkpoint = torch.load(
            self.best_checkpoint_path,
            map_location=device
        )

        model.load_state_dict(
            checkpoint["model_state_dict"]
        )

        return checkpoint

    # =====================================================
    # LOAD FINAL
    # =====================================================

    def load_final(
        self,
        model,
        device: str = "cpu"
    ):
        """
        Load final checkpoint only.
        """

        checkpoint = torch.load(
            self.final_checkpoint_path,
            map_location=device
        )

        model.load_state_dict(
            checkpoint["model_state_dict"]
        )

        return checkpoint

    # =====================================================
    # EXISTS
    # =====================================================

    def best_exists(self) -> bool:

        return self.best_checkpoint_path.exists()

    def final_exists(self) -> bool:

        return self.final_checkpoint_path.exists()

    # =====================================================
    # LAST EPOCH CHECKPOINT
    # =====================================================

    def get_latest_epoch_checkpoint(self):

        checkpoints = sorted(
            self.checkpoint_dir.glob(
                "epoch_*.pt"
            )
        )

        if not checkpoints:
            return None

        return str(checkpoints[-1])


# =========================================================
# TEST
# =========================================================

if __name__ == "__main__":

    manager = CheckpointManager(
        "backend/models/checkpoints/test"
    )

    print(
        "Checkpoint directory:",
        manager.checkpoint_dir
    )

    print(
        "Best checkpoint:",
        manager.best_checkpoint_path
    )

    print(
        "Final checkpoint:",
        manager.final_checkpoint_path
    )