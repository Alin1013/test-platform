import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from ..settings_schemas import WebhookTestRequest


def _validate_public_https_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=422, detail="Webhook must use a public HTTPS URL")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise HTTPException(status_code=422, detail="Webhook host cannot be resolved") from error
    if not addresses or any(
        not ipaddress.ip_address(address[4][0]).is_global for address in addresses
    ):
        raise HTTPException(status_code=422, detail="Webhook host must resolve to a public address")


def test_connection(payload: WebhookTestRequest) -> dict:
    _validate_public_https_url(payload.webhookUrl)
    message = "测试平台 Webhook 连接测试"
    body = (
        {"msg_type": "text", "content": {"text": message}}
        if payload.channel == "feishu"
        else {"msgtype": "text", "text": {"content": message}}
    )
    try:
        response = httpx.post(
            payload.webhookUrl,
            json=body,
            timeout=5,
            follow_redirects=False,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Webhook connection failed") from error
    return {"success": True, "message": "Webhook 连接成功"}
