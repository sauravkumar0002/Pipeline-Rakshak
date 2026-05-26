# backend/app/services/auth.py
"""
Authentication service: password hashing, JWT creation/validation,
and user seeding.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.app.models import User

# ---------------------------------------------------------------------------
# Configuration — read from env vars with sensible defaults for development.
# In production, set JWT_SECRET_KEY to a long random string.
# ---------------------------------------------------------------------------
JWT_SECRET_KEY: str = os.environ.get(
    "JWT_SECRET_KEY",
    "CHANGE_ME_in_production_use_a_long_random_secret_32chars_minimum",
)
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480")  # 8 hours
)

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(
    subject: str,
    role: str,
    user_id: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT with user identity and role claims."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": subject,
        "role": role,
        "uid": user_id,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT.  Raises JWTError on any failure.
    Returns the decoded payload dict.
    """
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Return the User if credentials are valid, else None."""
    user = get_user_by_username(db, username)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ---------------------------------------------------------------------------
# Default-admin seeding (called once at startup)
# ---------------------------------------------------------------------------

def seed_default_admin(db: Session) -> None:
    """
    Ensure a default admin account exists.  Safe to call multiple times —
    exits silently if the admin already exists.
    """
    existing = get_user_by_username(db, "admin")
    if existing:
        return
    admin = User(
        username="admin",
        email="admin@corrosion.local",
        password_hash=hash_password("admin123"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    print("Default admin user created (username=admin, password=admin123).")
