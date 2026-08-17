"""验证并测试通知 Webhook，同时拦截明显的内网访问目标。"""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from ..settings_schemas import WebhookTestRequest


def _validate_public_https_url(url: str) -> None:
    """校验 Webhook 必须是公网 HTTPS 地址，防止 SSRF 攻击。"""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=422, detail="Webhook must use a public HTTPS URL")
    # 发送请求前解析全部地址，任一结果指向非公网网段都拒绝访问。
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise HTTPException(status_code=422, detail="Webhook host cannot be resolved") from error
    if not addresses or any(
        not ipaddress.ip_address(address[4][0]).is_global for address in addresses
    ):
        raise HTTPException(status_code=422, detail="Webhook host must resolve to a public address")


def test_connection(payload: WebhookTestRequest) -> dict:
    """向 Webhook 发送一条测试消息，验证通道可用性。"""
    _validate_public_https_url(payload.webhookUrl)
    message = "测试平台 Webhook 连接测试"
    # 飞书与企微/钉钉的文本消息结构不同，在边界处统一适配。
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
