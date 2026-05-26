# backend/app/api/deps.py

from backend.app.database import get_db

# This file is for creating reusable dependencies.
# For now, we are just re-exporting get_db for cleaner imports in the endpoint files.
# In a larger application, you could add dependencies for authentication, etc.

def get_db_session():
    """
    Yields a database session.
    This is a simple wrapper around the main get_db dependency.
    """
    yield from get_db()
