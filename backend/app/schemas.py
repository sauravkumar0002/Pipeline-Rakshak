# backend/app/schemas.py

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

# ==================================================
# Base and Shared Schemas
# ==================================================

class InspectionBase(BaseModel):
    """Base schema for inspection data, containing common fields."""
    model_config = ConfigDict(from_attributes=True)

    image_path: str = Field(..., description="Path to the image being inspected.")
    model_used: str = Field(..., description="The ONNX model used for this inspection.")


# ==================================================
# Schemas for API Operations
# ==================================================

class InspectionCreate(InspectionBase):
    """
    Schema for creating a new inspection.
    This is the expected input format for the prediction endpoint.
    """
    pass # Inherits all fields from InspectionBase


class InspectionResponse(InspectionBase):
    """
    Schema for returning an inspection result.
    This is the data sent back to the client after a successful analysis.
    """
    id: int
    timestamp: datetime
    prediction_class: str = Field(..., description="Predicted class: 'corrosion' or 'no_corrosion'.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Prediction confidence score.")
    severity: Optional[str] = Field(None, description="Calculated severity level.")
    recommendation: Optional[str] = Field(None, description="Actionable recommendation.")
    latency_ms: float = Field(..., description="Inference latency in milliseconds.")
    fps: Optional[float] = Field(None, description="Frames Per Second during processing.")
    is_verified: bool = False
    corrected_class: Optional[str] = None
    is_flagged_for_retraining: bool = False
    created_at: datetime
    updated_at: datetime


class PredictionResponse(BaseModel):
    """
    Schema for returning a prediction result from the ONNX inference endpoint.
    """
    model_config = ConfigDict(from_attributes=True)

    prediction_class: str = Field(..., description="Predicted class label.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Prediction confidence score.")
    severity: str = Field(..., description="Calculated severity level.")
    recommendation: str = Field(..., description="Actionable recommendation.")
    latency_ms: float = Field(..., description="Inference latency in milliseconds.")
    fps: float = Field(..., description="Frames per second derived from latency.")
    model_used: Optional[str] = Field(None, description="The ONNX model used for this prediction.")


class VerificationUpdate(BaseModel):
    """
    Schema for updating an inspection with manual verification data.
    Allows a human expert to correct or confirm a prediction.
    """
    is_verified: bool = Field(True, description="Set to true to mark as verified.")
    corrected_class: str = Field(..., description="The ground truth class provided by a human.")
    is_flagged_for_retraining: bool = Field(False, description="Flag this image for model retraining.")


class AnalyticsSummary(BaseModel):
    """
    Schema for providing a summary of analytics data.
    Useful for dashboard endpoints.
    """
    total_inspections: int
    corrosion_count: int
    no_corrosion_count: int
    average_confidence: float
    unverified_count: int
    verified_count: int
    flagged_count: int
    retraining_queue_count: int


class DashboardMetrics(BaseModel):
    """
    Schema for dashboard KPI metrics.
    """
    total_inspections: int
    corrosion_detected: int
    healthy_images: int
    average_confidence: float
    average_inference_time: float
    system_uptime: float


class ModelSelection(BaseModel):
    """
    Schema for selecting a specific model for an analysis task.
    """
    model_name: str = Field(..., description="The filename of the ONNX model to use (e.g., 'ResNet50_Augmented.onnx').")


# ==================================================
# Retraining Pipeline Schemas
# ==================================================

class DatasetSummary(BaseModel):
    """Summary of the verified dataset available for retraining."""
    total_verified_images: int
    corrosion_count: int
    non_corrosion_count: int
    dataset_balance: float  # corrosion / total, 0.0–1.0


class QueueItemResponse(BaseModel):
    """A single item in the retraining queue."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    inspection_id: int
    image_path: str
    verified_label: str
    model_name: str
    added_at: datetime


class QueueBuildRequest(BaseModel):
    """Request body for building/populating the retraining queue."""
    model_name: Optional[str] = Field(None, description="Filter to inspections of a specific model. None = all models.")


class StartRetrainingRequest(BaseModel):
    """Request body for launching a retraining job."""
    model_name: str = Field(..., description="Model name to retrain.")
    notes: Optional[str] = Field(None, description="Optional notes about this training run.")
    # Training mode
    training_mode: str = Field("full_finetune", description="classifier_only | partial_finetune | full_finetune")
    # Hyperparameters
    epochs: int = Field(30, ge=1, le=200)
    batch_size: int = Field(8, ge=1, le=128)
    learning_rate: float = Field(1e-4, gt=0, le=1.0)
    weight_decay: float = Field(1e-4, ge=0, le=1.0)
    patience: int = Field(7, ge=1, le=50)
    scheduler: str = Field("plateau", description="plateau | cosine | cosine_warm | step | none")


class RetrainingJobResponse(BaseModel):
    """Response shape for a retraining job record."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    model_name: str
    dataset_size: int
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    accuracy_before: Optional[float]
    accuracy_after: Optional[float]
    precision_after: Optional[float]
    recall_after: Optional[float]
    f1_after: Optional[float]
    notes: Optional[str]
    created_at: datetime
    # Pipeline Rakshak extended fields
    training_mode: Optional[str]
    progress_epoch: Optional[int]
    total_epochs: Optional[int]
    progress_pct: Optional[float]
    best_val_accuracy: Optional[float]
    checkpoint_path: Optional[str]
    export_path: Optional[str]
    evaluation_dir: Optional[str]
    error_message: Optional[str]


class ModelVersionResponse(BaseModel):
    """Response shape for a model version record."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: str
    model_name: str
    created_at: datetime
    accuracy: Optional[float]
    precision: Optional[float]
    recall: Optional[float]
    f1: Optional[float]
    dataset_size: Optional[int]
    job_id: Optional[int]
    status: str
    notes: Optional[str]
    # Pipeline Rakshak extended fields
    file_path: Optional[str]
    auc_roc: Optional[float]
    evaluation_dir: Optional[str]
    training_mode: Optional[str]


class EpochLogResponse(BaseModel):
    """One row of per-epoch training metrics."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    epoch: int
    train_loss: Optional[float]
    val_loss: Optional[float]
    val_accuracy: Optional[float]
    val_f1: Optional[float]
    learning_rate: Optional[float]
    duration_sec: Optional[float]
    timestamp: Optional[datetime]


class PromoteModelRequest(BaseModel):
    """Request body for promoting a candidate model version to active."""
    notes: Optional[str] = Field(None, description="Optional promotion notes.")


class ArtifactInfo(BaseModel):
    """Metadata about a single training evaluation artifact."""
    name: str
    size_bytes: int
    url: str
    kind: str  # "image" | "json" | "csv"


class TrainingArtifactsResponse(BaseModel):
    """All available evaluation artifacts for a training job."""
    job_id: int
    evaluation_dir: Optional[str]
    artifacts: List[ArtifactInfo]


class DatasetValidationResponse(BaseModel):
    """Pre-training dataset integrity check report."""
    total: int
    valid: int
    corrupted: int
    duplicates: int
    class_counts: dict
    warnings: List[str]
    errors: List[str]
    ready: bool  # True if errors is empty


# ==================================================
# Auth Schemas
# ==================================================

class LoginRequest(BaseModel):
    """Request body for user login."""
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """JWT access token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Seconds until token expires.")
    user: "UserResponse"


class UserResponse(BaseModel):
    """Public user profile returned by the API."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UserCreate(BaseModel):
    """Admin-only: create a new user."""
    username: str = Field(..., min_length=3, max_length=64)
    email: Optional[str] = Field(None, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field("viewer", pattern="^(admin|operator|viewer)$")


class UserUpdate(BaseModel):
    """Update an existing user's role or active state."""
    role: Optional[str] = Field(None, pattern="^(admin|operator|viewer)$")
    is_active: Optional[bool] = None
    email: Optional[str] = None


TokenResponse.model_rebuild()


# ==================================================
# Notification Schemas
# ==================================================

class NotificationCreate(BaseModel):
    """Payload to create a new notification (called by the frontend interceptor)."""
    type: str = Field("info", max_length=32)
    title: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=512)


class NotificationOut(BaseModel):
    """Public notification record returned by the API."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime




class SystemSettingsResponse(BaseModel):
    """Section 1 – general application settings."""
    app_name: str
    company_name: str
    system_version: str
    default_theme: str
    timezone: str


class SystemSettingsUpdate(BaseModel):
    app_name: Optional[str] = Field(None, min_length=1, max_length=128)
    company_name: Optional[str] = Field(None, max_length=128)
    default_theme: Optional[str] = Field(None, pattern="^(dark|light)$")
    timezone: Optional[str] = Field(None, max_length=64)


class ModelSettingsResponse(BaseModel):
    """Section 2 – model / inference settings."""
    current_model: str
    confidence_threshold: float


class ModelSettingsUpdate(BaseModel):
    confidence_threshold: float = Field(..., ge=0.0, le=1.0)


class DetectionSettingsResponse(BaseModel):
    """Section 3 – detection feature flags."""
    enable_severity_analysis: bool
    enable_recommendations: bool
    enable_human_verification: bool
    enable_retraining_queue: bool
    enable_analytics_collection: bool


class DetectionSettingsUpdate(BaseModel):
    enable_severity_analysis: Optional[bool] = None
    enable_recommendations: Optional[bool] = None
    enable_human_verification: Optional[bool] = None
    enable_retraining_queue: Optional[bool] = None
    enable_analytics_collection: Optional[bool] = None


class SecuritySettingsResponse(BaseModel):
    """Section 4 – security / auth settings."""
    jwt_expiration_minutes: int
    session_timeout_minutes: int
    login_rate_limit: int
    password_min_length: int


class SecuritySettingsUpdate(BaseModel):
    jwt_expiration_minutes: Optional[int] = Field(None, ge=5, le=10080)
    session_timeout_minutes: Optional[int] = Field(None, ge=1, le=1440)
    login_rate_limit: Optional[int] = Field(None, ge=1, le=100)
    password_min_length: Optional[int] = Field(None, ge=4, le=128)


class SystemInfoResponse(BaseModel):
    """Section 6 – read-only system information."""
    backend_version: str
    frontend_version: str
    python_version: str
    database_status: str
    api_status: str
    current_active_model: str
    available_models_count: int
    total_users: int
    total_inspections: int


# ==================================================
# Live Detection Schemas
# ==================================================

class LiveDetectionFrameRequest(BaseModel):
    """
    Payload for POST /api/v1/live-detection/frame.
    Carries a single webcam frame as a base64-encoded image string.
    """
    image_data: str = Field(
        ...,
        description="Base64-encoded JPEG/PNG frame. Plain base64 or a data-URL "
                    "(data:image/jpeg;base64,...) are both accepted.",
    )
    save: bool = Field(
        False,
        description="When true the frame is persisted as a standard Inspection "
                    "record so it appears in History, Verification, Analytics, "
                    "and the Retraining pipeline.",
    )
    save_corrosion_only: bool = Field(
        False,
        description="When true, automatically save the frame only when the predicted "
                    "class is corrosion. Has no effect when save=true (which always saves).",
    )


class LiveDetectionResult(BaseModel):
    """Response returned by POST /api/v1/live-detection/frame."""
    prediction_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: str
    recommendation: str
    latency_ms: float
    model_used: str
    inspection_id: Optional[int] = Field(
        None, description="ID of the saved Inspection record, if save=true."
    )
    saved: bool = False


class LiveDetectionStatus(BaseModel):
    """Response returned by GET /api/v1/live-detection/status."""
    active_model: Optional[str]
    model_loaded: bool
