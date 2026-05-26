"""Centralized logging utilities for the backend application."""

import logging
from typing import Optional

from backend.app.config import settings

_LOGGING_CONFIGURED = False


def setup_logging(level: str = settings.LOG_LEVEL, log_format: Optional[str] = None) -> None:
    """
    Configure global logging behavior for the application.

    This function sets up a basic configuration for the root logger. It ensures
    that logging is configured only once during the application's lifecycle.

    Args:
        level: The logging level name (e.g., "INFO", "DEBUG").
        log_format: An optional logging format string. If not provided, a
                    default format is used.
    """
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    resolved_level = getattr(logging, level.upper(), logging.INFO)
    
    if not log_format:
        log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    logging.basicConfig(level=resolved_level, format=log_format)
    _LOGGING_CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """
    Retrieve a logger instance for a specific module.

    Args:
        name: The name for the logger, typically `__name__`.

    Returns:
        A configured Logger instance.
    """
    return logging.getLogger(name)
