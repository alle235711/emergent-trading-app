"""
email_sender.py — Gmail SMTP alert delivery.
"""

from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_alert_email(ticker: str, model: str, metric: str, value: float, threshold: float) -> bool:
    sender = os.getenv("ALERT_EMAIL_FROM")
    recipient = os.getenv("ALERT_EMAIL_TO")
    password = os.getenv("ALERT_EMAIL_PASSWORD")

    if not all([sender, recipient, password]):
        print("[ALERT] SMTP not configured — skipping email, creating journal entry only")
        return False

    subject = f"⚡ [{ticker}] — {model} alert: {metric} = {round(value, 3)}"

    html_body = f"""
    <h2>⚡ Quant Desk Alert</h2>
    <table>
      <tr><td><b>Ticker</b></td><td>{ticker}</td></tr>
      <tr><td><b>Modello</b></td><td>{model}</td></tr>
      <tr><td><b>Metrica</b></td><td>{metric}</td></tr>
      <tr><td><b>Valore attuale</b></td><td>{round(value, 3)} (soglia: {threshold})</td></tr>
    </table>
    <p><i>Questo è un alert automatico. Non è un consiglio di trading.<br>
    Verifica manualmente prima di agire.</i></p>
    <p><a href="http://localhost:3000/convergence?ticker={ticker}">
    → Apri Quant Desk</a></p>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.sendmail(sender, recipient, msg.as_string())
        print(f"[ALERT] Email sent: {subject}")
        return True
    except Exception as e:
        print(f"[ALERT] Email failed: {e}")
        return False


def send_test_email() -> bool:
    return send_alert_email("TEST", "system", "connectivity", 1.0, 0.0)
