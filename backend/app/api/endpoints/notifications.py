# backend/app/api/endpoints/notifications.py
"""
Notification endpoints — create, list, mark-read, and delete notifications.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app import models, schemas
from backend.app.api import deps

router = APIRouter()


@router.get("", response_model=List[schemas.NotificationOut])
def get_notifications(
    limit: int = 50,
    db: Session = Depends(deps.get_db_session),
):
    """Return the most recent notifications, newest first."""
    return (
        db.query(models.Notification)
        .order_by(models.Notification.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )


@router.post("", response_model=schemas.NotificationOut, status_code=201)
def create_notification(
    body: schemas.NotificationCreate,
    db: Session = Depends(deps.get_db_session),
):
    """Create a new notification record (called by the frontend interceptor)."""
    notif = models.Notification(
        type=body.type,
        title=body.title,
        message=body.message,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/read-all", response_model=dict)
def mark_all_read(db: Session = Depends(deps.get_db_session)):
    """Mark every unread notification as read."""
    db.query(models.Notification).filter(
        models.Notification.is_read == False  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_single_read(
    notification_id: int,
    db: Session = Depends(deps.get_db_session),
):
    """Mark a single notification as read."""
    notif = db.query(models.Notification).filter(
        models.Notification.id == notification_id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: int,
    db: Session = Depends(deps.get_db_session),
):
    """Permanently delete a notification."""
    notif = db.query(models.Notification).filter(
        models.Notification.id == notification_id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    db.delete(notif)
    db.commit()
