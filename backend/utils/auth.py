"""JWT认证工具：从请求中提取并验证当前用户"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError

from backend.core.config import settings

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"


def _extract_token(request: Request) -> Optional[str]:
    """从Authorization header中提取Bearer token"""
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return None


def _decode_token(token: str) -> dict:
    """解码JWT token，返回payload"""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


async def get_current_user(request: Request) -> Optional[dict]:
    """
    获取当前登录用户。
    返回 {"sub": ..., "email": ..., "name": ...} 或 None（未登录）。
    """
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = _decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return payload
    except JWTError:
        return None


async def require_current_user(request: Request) -> dict:
    """
    要求必须登录。未登录时返回401。
    """
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或token已过期")
    return user
