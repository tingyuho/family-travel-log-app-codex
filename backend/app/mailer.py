from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME).strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() != "false"


def is_mailer_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM_EMAIL)


def send_password_reset_email(to_email: str, user_id: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Family Travel Log password reset code"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "We received a request to reset your Family Travel Log password.",
                f"User ID: {user_id}",
                "",
                f"Your verification code is: {code}",
                "",
                "This code expires soon. If you did not request this, you can ignore this email.",
            ]
        )
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        if SMTP_USERNAME:
            smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)
