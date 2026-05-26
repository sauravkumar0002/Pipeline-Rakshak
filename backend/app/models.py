# backend/app/models.py

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    Text,
    func
)
from .database import Base

class Inspection(Base):
    """
    SQLAlchemy model for the 'inspections' table.
    Stores the results of each corrosion detection analysis.
    """
    __tablename__ = "inspections"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Core Inspection Data
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    image_path = Column(String, nullable=False, comment="Path to the stored image file.")
    prediction_class = Column(String, nullable=False, comment="Predicted class (e.g., 'corrosion', 'no_corrosion').")
    confidence = Column(Float, nullable=False, comment="Confidence score of the prediction (0.0 to 1.0).")

    # Analysis and Recommendation
    severity = Column(String, nullable=True, comment="Calculated severity level (e.g., 'Low', 'Medium', 'High').")
    recommendation = Column(String, nullable=True, comment="Actionable recommendation based on the analysis.")

    # Performance and Model Metrics
    model_used = Column(String, nullable=False, comment="Name of the ONNX model used for the prediction.")
    latency_ms = Column(Float, nullable=False, comment="Model inference latency in milliseconds.")
    fps = Column(Float, nullable=True, comment="Frames Per Second achieved during processing, if applicable.")

    # Verification and Retraining Flags
    is_verified = Column(Boolean, default=False, nullable=False, comment="Flag indicating if the prediction has been manually verified.")
    corrected_class = Column(String, nullable=True, comment="The corrected class label after manual verification.")
    is_flagged_for_retraining = Column(Boolean, default=False, nullable=False, comment="Flag to mark this inspection for model retraining.")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<Inspection(id={self.id}, class='{self.prediction_class}', confidence={self.confidence:.2f})>"


class RetrainingQueueItem(Base):
    """
    Represents a single verified inspection that has been queued for retraining.
    """
    __tablename__ = "retraining_queue"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, nullable=False, index=True)
    image_path = Column(String, nullable=False)
    verified_label = Column(String, nullable=False)
    model_name = Column(String, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<RetrainingQueueItem(id={self.id}, inspection_id={self.inspection_id}, label='{self.verified_label}')>"


class RetrainingJob(Base):
    """
    Represents a single retraining job with before/after metrics.
    """
    __tablename__ = "retraining_jobs"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, nullable=False)
    dataset_size = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="queued")   # queued, running, evaluating, exporting, completed, failed, cancelled
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    accuracy_before = Column(Float, nullable=True)
    accuracy_after = Column(Float, nullable=True)
    precision_after = Column(Float, nullable=True)
    recall_after = Column(Float, nullable=True)
    f1_after = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Pipeline Rakshak extended columns
    training_mode = Column(String, nullable=True, default="full_finetune")
    hyperparameters = Column(Text, nullable=True)          # JSON string
    progress_epoch = Column(Integer, nullable=True, default=0)
    total_epochs = Column(Integer, nullable=True)
    progress_pct = Column(Float, nullable=True, default=0.0)
    best_val_accuracy = Column(Float, nullable=True)
    checkpoint_path = Column(String, nullable=True)
    export_path = Column(String, nullable=True)
    evaluation_dir = Column(String, nullable=True)
    worker_pid = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<RetrainingJob(id={self.id}, model='{self.model_name}', status='{self.status}')>"


class ModelVersion(Base):
    """
    Tracks model version lineage and promotion state.
    """
    __tablename__ = "model_versions"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, nullable=False)
    model_name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accuracy = Column(Float, nullable=True)
    precision = Column(Float, nullable=True)
    recall = Column(Float, nullable=True)
    f1 = Column(Float, nullable=True)
    dataset_size = Column(Integer, nullable=True)
    job_id = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="candidate")  # active, candidate, archived
    notes = Column(Text, nullable=True)
    # Pipeline Rakshak extended columns
    file_path = Column(String, nullable=True)
    auc_roc = Column(Float, nullable=True)
    evaluation_dir = Column(String, nullable=True)
    training_mode = Column(String, nullable=True)

    def __repr__(self):
        return f"<ModelVersion(id={self.id}, version='{self.version}', status='{self.status}')>"


class TrainingEpochLog(Base):
    """
    Per-epoch training metrics — one row per epoch per job.
    """
    __tablename__ = "training_epoch_logs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False, index=True)
    epoch = Column(Integer, nullable=False)
    train_loss = Column(Float, nullable=True)
    val_loss = Column(Float, nullable=True)
    val_accuracy = Column(Float, nullable=True)
    val_f1 = Column(Float, nullable=True)
    learning_rate = Column(Float, nullable=True)
    duration_sec = Column(Float, nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<TrainingEpochLog(job_id={self.job_id}, epoch={self.epoch}, val_acc={self.val_accuracy})>"


class SystemSetting(Base):
    """
    Key-value store for all platform configuration settings.
    Keys are dot-separated namespaced strings, e.g. 'system.app_name'.
    Values are stored as JSON strings for type flexibility.
    """
    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True, index=True)
    value = Column(Text, nullable=False, default="")
    category = Column(String(32), nullable=False, default="system")
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by = Column(String(64), nullable=True)

    def __repr__(self):
        return f"<SystemSetting(key='{self.key}', value='{self.value}')>"


class User(Base):
    """
    Represents an authenticated platform user with role-based access control.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="viewer")  # admin, operator, viewer
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"


class Notification(Base):
    """
    In-app notification record for platform events.
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(32), nullable=False, default="info")   # inspection|corrosion|model|retraining|verification|settings
    title = Column(String(128), nullable=False)
    message = Column(String(512), nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Notification(id={self.id}, type='{self.type}', read={self.is_read})>"
