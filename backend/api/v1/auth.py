"""AgentPit OAuth2 SSO 认证"""

import json
import urllib.parse
import logging

import httpx
from jose import jwt
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse

from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7


async def exchange_code_for_token(code: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            settings.agentpit_token_url,
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.agentpit_client_id,
                "client_secret": settings.agentpit_client_secret,
                "redirect_uri": settings.agentpit_redirect_uri,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            settings.agentpit_userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


def create_jwt_token(user_info: dict) -> str:
    payload = {
        "sub": user_info.get("sub") or user_info.get("id"),
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


@router.get("/auth/agentpit/sso")
async def sso_redirect(returnUrl: str = "/"):
    """SSO入口，重定向到AgentPit授权页"""
    if not settings.agentpit_client_id:
        raise HTTPException(status_code=500, detail="AgentPit OAuth 未配置")

    state = f"sso:{returnUrl}"
    params = {
        "client_id": settings.agentpit_client_id,
        "redirect_uri": settings.agentpit_redirect_uri,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
    }
    authorize_url = f"{settings.agentpit_authorize_url}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=authorize_url)


@router.get("/auth/agentpit/callback")
async def oauth_callback(code: str, state: str = None):
    """OAuth回调，区分SSO模式和弹窗模式"""
    try:
        token_data = await exchange_code_for_token(code)
        access_token = token_data["access_token"]
        user_info = await get_user_info(access_token)
    except httpx.HTTPStatusError as e:
        logger.error(f"AgentPit OAuth 失败: {e.response.text}")
        raise HTTPException(status_code=502, detail="AgentPit 认证服务异常")
    except Exception as e:
        logger.error(f"AgentPit OAuth 错误: {e}")
        raise HTTPException(status_code=500, detail="认证处理失败")

    jwt_token = create_jwt_token(user_info)
    user_json = json.dumps(user_info, ensure_ascii=False)
    encoded_user = urllib.parse.quote(user_json)

    if state and state.startswith("sso:"):
        return_url = state[4:]
        html = f"""<!DOCTYPE html><html><body><script>
        window.location.replace(
            '/auth/sso/callback?returnUrl={return_url}#token={jwt_token}&user={encoded_user}'
        );
        </script></body></html>"""
        return HTMLResponse(content=html)
    else:
        html = f"""<!DOCTYPE html><html><body><script>
        if (window.opener) {{
            window.opener.postMessage({{
                type: 'agentpit-oauth',
                token: '{jwt_token}',
                user: {user_json}
            }}, window.location.origin);
            window.close();
        }} else {{
            window.location.replace('/#token={jwt_token}&user={encoded_user}');
        }}
        </script></body></html>"""
        return HTMLResponse(content=html)
