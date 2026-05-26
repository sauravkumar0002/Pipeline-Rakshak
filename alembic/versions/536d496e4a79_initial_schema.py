"""initial_schema

Revision ID: 536d496e4a79
Revises: 
Create Date: 2026-05-26 13:45:07.914872

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '536d496e4a79'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all Pipeline Rakshak tables (idempotent — safe to run multiple times)."""
    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=64), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False, server_default='viewer'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True, if_not_exists=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True, if_not_exists=True)

    # ── inspections ───────────────────────────────────────────────────────────
    op.create_table(
        'inspections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('image_path', sa.String(), nullable=False),
        sa.Column('prediction_class', sa.String(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('recommendation', sa.String(), nullable=True),
        sa.Column('model_used', sa.String(), nullable=False),
        sa.Column('latency_ms', sa.Float(), nullable=False),
        sa.Column('fps', sa.Float(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('corrected_class', sa.String(), nullable=True),
        sa.Column('is_flagged_for_retraining', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_inspections_id'), 'inspections', ['id'], unique=False, if_not_exists=True)

    # ── retraining_queue ──────────────────────────────────────────────────────
    op.create_table(
        'retraining_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('inspection_id', sa.Integer(), nullable=False),
        sa.Column('image_path', sa.String(), nullable=False),
        sa.Column('verified_label', sa.String(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_retraining_queue_id'), 'retraining_queue', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_retraining_queue_inspection_id'), 'retraining_queue', ['inspection_id'], unique=False, if_not_exists=True)

    # ── retraining_jobs ───────────────────────────────────────────────────────
    op.create_table(
        'retraining_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('dataset_size', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('status', sa.String(), nullable=False, server_default='queued'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('accuracy_before', sa.Float(), nullable=True),
        sa.Column('accuracy_after', sa.Float(), nullable=True),
        sa.Column('precision_after', sa.Float(), nullable=True),
        sa.Column('recall_after', sa.Float(), nullable=True),
        sa.Column('f1_after', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('training_mode', sa.String(), nullable=True),
        sa.Column('hyperparameters', sa.Text(), nullable=True),
        sa.Column('progress_epoch', sa.Integer(), nullable=True, server_default=sa.text('0')),
        sa.Column('total_epochs', sa.Integer(), nullable=True),
        sa.Column('progress_pct', sa.Float(), nullable=True, server_default=sa.text('0.0')),
        sa.Column('best_val_accuracy', sa.Float(), nullable=True),
        sa.Column('checkpoint_path', sa.String(), nullable=True),
        sa.Column('export_path', sa.String(), nullable=True),
        sa.Column('evaluation_dir', sa.String(), nullable=True),
        sa.Column('worker_pid', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_retraining_jobs_id'), 'retraining_jobs', ['id'], unique=False, if_not_exists=True)

    # ── model_versions ────────────────────────────────────────────────────────
    op.create_table(
        'model_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('version', sa.String(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('accuracy', sa.Float(), nullable=True),
        sa.Column('precision', sa.Float(), nullable=True),
        sa.Column('recall', sa.Float(), nullable=True),
        sa.Column('f1', sa.Float(), nullable=True),
        sa.Column('dataset_size', sa.Integer(), nullable=True),
        sa.Column('job_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='candidate'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('file_path', sa.String(), nullable=True),
        sa.Column('auc_roc', sa.Float(), nullable=True),
        sa.Column('evaluation_dir', sa.String(), nullable=True),
        sa.Column('training_mode', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_model_versions_id'), 'model_versions', ['id'], unique=False, if_not_exists=True)

    # ── training_epoch_logs ───────────────────────────────────────────────────
    op.create_table(
        'training_epoch_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('epoch', sa.Integer(), nullable=False),
        sa.Column('train_loss', sa.Float(), nullable=True),
        sa.Column('val_loss', sa.Float(), nullable=True),
        sa.Column('val_accuracy', sa.Float(), nullable=True),
        sa.Column('val_f1', sa.Float(), nullable=True),
        sa.Column('learning_rate', sa.Float(), nullable=True),
        sa.Column('duration_sec', sa.Float(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_training_epoch_logs_id'), 'training_epoch_logs', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_training_epoch_logs_job_id'), 'training_epoch_logs', ['job_id'], unique=False, if_not_exists=True)

    # ── system_settings ───────────────────────────────────────────────────────
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(length=128), nullable=False),
        sa.Column('value', sa.Text(), nullable=False, server_default=''),
        sa.Column('category', sa.String(length=32), nullable=False, server_default='system'),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by', sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint('key'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=False, if_not_exists=True)

    # ── notifications ─────────────────────────────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False, server_default='info'),
        sa.Column('title', sa.String(length=128), nullable=False),
        sa.Column('message', sa.String(length=512), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False, if_not_exists=True)


def downgrade() -> None:
    """Drop all Pipeline Rakshak tables."""
    op.drop_table('notifications')
    op.drop_table('system_settings')
    op.drop_table('training_epoch_logs')
    op.drop_table('model_versions')
    op.drop_table('retraining_jobs')
    op.drop_table('retraining_queue')
    op.drop_table('inspections')
    op.drop_table('users')
