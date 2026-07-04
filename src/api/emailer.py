"""Minimal SMTP email sender for transactional mail (password-reset codes).

Configured entirely from environment variables (set in .env, consumed by
docker-compose's env_file):

    EMAIL_HOST      e.g. smtp.gmail.com
    EMAIL_PORT      587 (STARTTLS, default) or 465 (SSL)
    EMAIL_USERNAME  SMTP login (for Gmail: the full address)
    EMAIL_PASSWORD  SMTP password (for Gmail: an App Password, not the account password)
    EMAIL_FROM      From header; defaults to EMAIL_USERNAME

When unconfigured, send_email() logs and returns False instead of raising, so
callers (e.g. forgot-password) degrade gracefully in dev environments.
Uses stdlib smtplib in a thread so async callers never block the event loop.
"""
import asyncio
import os
import smtplib
from email.message import EmailMessage


def _cfg(name: str) -> str | None:
    v = os.environ.get(name)
    return v.strip() if v else None


def is_configured() -> bool:
    return bool(_cfg("EMAIL_HOST") and _cfg("EMAIL_USERNAME") and _cfg("EMAIL_PASSWORD"))


def _send_sync(to: str, subject: str, body: str) -> None:
    host = _cfg("EMAIL_HOST")
    port = int(_cfg("EMAIL_PORT") or "587")
    username = _cfg("EMAIL_USERNAME")
    password = _cfg("EMAIL_PASSWORD")
    sender = _cfg("EMAIL_FROM") or username

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as s:
            s.login(username, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(username, password)
            s.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plaintext email. Returns True on success, False when
    unconfigured or on SMTP failure (both are logged, never raised)."""
    if not is_configured():
        print(f"[emailer] EMAIL_* env not configured — would have sent to {to}: {subject}")
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, body)
        return True
    except Exception as e:
        print(f"[emailer] send to {to} failed: {type(e).__name__}: {e}")
        return False
