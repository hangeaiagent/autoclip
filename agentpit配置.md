# AutoClip 入驻 AgentPit 平台配置

> 本文档记录 AutoClip 接入 AgentPit 平台的 OAuth2 SSO 单点登录和 Token 消耗上报的完整实现方案。
> 参考：https://github.com/hangeaiagent/agentpit-Skills

---

## 一、OAuth2 凭证

| 项目 | 值 |
|------|------|
| Client ID | `cmnkg7unr002g60t97p225r1k` |
| Client Secret | `cmnkg7unr002h60t9cwckpfar` |
| 回调地址 | `https://autoclip.agentpit.io/api/auth/agentpit/callback` |
| 授权地址 | `https://agentpit.io/api/oauth/authorize` |
| Token 地址 | `https://agentpit.io/api/oauth/token` |
| 用户信息地址 | `https://agentpit.io/api/oauth/userinfo` |
| 计费 API | `https://www.agentpit.io/api/v1/partner/charge` |
| 登录按钮名称 | agentpit 授权登陆 |
| 子应用域名 | `autoclip.agentpit.io` |

### 环境变量（后端 .env 添加）

```
AGENTPIT_CLIENT_ID=cmnkg7unr002g60t97p225r1k
AGENTPIT_CLIENT_SECRET=cmnkg7unr002h60t9cwckpfar
AGENTPIT_REDIRECT_URI=https://autoclip.agentpit.io/api/auth/agentpit/callback
AGENTPIT_AUTHORIZE_URL=https://agentpit.io/api/oauth/authorize
AGENTPIT_TOKEN_URL=https://agentpit.io/api/oauth/token
AGENTPIT_USERINFO_URL=https://agentpit.io/api/oauth/userinfo
AGENTPIT_CHARGE_URL=https://www.agentpit.io/api/v1/partner/charge
SECRET_KEY=autoclip-jwt-secret-change-in-production
```

---

## 二、SSO 单点登录实现方案

> 参考 skills/agentpit-sso/SKILL.md

### 2.1 SSO 完整流程

```
用户从 app.agentpit.io 跳转到 autoclip.agentpit.io
  ↓
前端 AuthContext 初始化，检查本地 token
  ├── token 存在 → 正常使用
  └── 无 token → shouldAutoSso() 判断
      ├── 条件不满足 → 显示未登录页面 + "agentpit 授权登陆" 按钮
      └── 条件满足 → markSsoAttempted()
          ↓
重定向到 /api/auth/agentpit/sso?returnUrl=/当前路径
          ↓
后端 302 → AgentPit 授权页 (state=sso:/当前路径)
          ├── 用户已登录已授权 → 静默回调
          ├── 用户已登录未授权 → 授权确认页
          └── 用户未登录 → 登录页
          ↓
回调: /api/auth/agentpit/callback?code=xxx&state=sso:/path
          ↓
后端用 code 换 token，获取用户信息，生成 JWT
          ↓
返回 HTML，JS 重定向到 /auth/sso/callback#token=xxx&user=xxx
          ↓
前端 SsoCallbackPage 解析 hash，调用 auth.login()
          ↓
登录成功，跳转回原始页面
```

### 2.2 后端实现

#### 2.2.1 SSO 入口端点

**文件**: `backend/api/v1/auth.py`
**端点**: `GET /api/auth/agentpit/sso?returnUrl=/`

```python
@router.get("/auth/agentpit/sso")
async def sso_redirect(returnUrl: str = "/"):
    """SSO入口，重定向到AgentPit授权页"""
    state = f"sso:{returnUrl}"
    params = {
        "client_id": settings.AGENTPIT_CLIENT_ID,
        "redirect_uri": settings.AGENTPIT_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
    }
    authorize_url = f"{settings.AGENTPIT_AUTHORIZE_URL  # https://agentpit.io/api/oauth/authorize}?{urlencode(params)}"
    return RedirectResponse(url=authorize_url)
```

#### 2.2.2 OAuth 回调端点

**端点**: `GET /api/auth/agentpit/callback?code=xxx&state=xxx`

```python
@router.get("/auth/agentpit/callback")
async def oauth_callback(code: str, state: str = None):
    """OAuth回调，区分SSO模式和弹窗模式"""
    # 1. 用 code 换 access_token
    token_data = await exchange_code_for_token(code)
    access_token = token_data["access_token"]

    # 2. 获取用户信息
    user_info = await get_user_info(access_token)

    # 3. 创建或更新本地用户，生成 JWT
    jwt_token = create_jwt_token(user_info)
    user_json = json.dumps(user_info)
    encoded_user = urllib.parse.quote(user_json)

    # 4. 根据 state 区分模式
    if state and state.startswith("sso:"):
        # SSO模式：返回HTML重定向到前端回调页（token通过hash传递）
        return_url = state[4:]
        html = f"""<!DOCTYPE html><html><body><script>
        window.location.replace(
            '/auth/sso/callback?returnUrl={return_url}#token={jwt_token}&user={encoded_user}'
        );
        </script></body></html>"""
        return HTMLResponse(content=html)
    else:
        # 弹窗模式：postMessage
        html = f"""<!DOCTYPE html><html><body><script>
        window.opener.postMessage({{
            type: 'agentpit-oauth',
            token: '{jwt_token}',
            user: {user_json}
        }}, window.location.origin);
        window.close();
        </script></body></html>"""
        return HTMLResponse(content=html)
```

#### 2.2.3 辅助函数

```python
import httpx
import jwt
from datetime import datetime, timedelta

async def exchange_code_for_token(code: str) -> dict:
    """用授权码换取access_token"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            settings.AGENTPIT_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.AGENTPIT_REDIRECT_URI,
                "client_id": settings.AGENTPIT_CLIENT_ID,
                "client_secret": settings.AGENTPIT_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        return resp.json()

async def get_user_info(access_token: str) -> dict:
    """获取AgentPit用户信息"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            settings.AGENTPIT_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()

def create_jwt_token(user_info: dict) -> str:
    """生成本地JWT"""
    payload = {
        "sub": user_info.get("id"),
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
```

### 2.3 前端实现

#### 2.3.1 SSO 工具函数

**文件**: `frontend/src/utils/ssoUtils.ts`

```typescript
export function shouldAutoSso(): boolean {
  const token = localStorage.getItem('token')
  if (token) return false

  const ssoAttempted = sessionStorage.getItem('sso_attempted')
  if (ssoAttempted) return false

  const referrer = document.referrer
  return referrer.includes('agentpit.io')
}

export function markSsoAttempted(): void {
  sessionStorage.setItem('sso_attempted', 'true')
}

export function triggerSsoRedirect(returnUrl: string = window.location.pathname): void {
  markSsoAttempted()
  window.location.href = `/api/auth/agentpit/sso?returnUrl=${encodeURIComponent(returnUrl)}`
}
```

#### 2.3.2 SSO 回调页面

**文件**: `frontend/src/pages/SsoCallbackPage.tsx`

```tsx
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SsoCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const token = params.get('token')
    const userStr = params.get('user')
    const returnUrl = searchParams.get('returnUrl') || '/'

    // 立即清除URL中的敏感信息
    window.history.replaceState(null, '', window.location.pathname)

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr))
        login(token, user)
        navigate(returnUrl, { replace: true })
      } catch {
        navigate('/login?sso_error=parse_failed', { replace: true })
      }
    } else {
      navigate('/login?sso_error=missing_token', { replace: true })
    }
  }, [])

  return <div style={{ textAlign: 'center', marginTop: '20vh' }}>正在登录...</div>
}
```

#### 2.3.3 AuthContext 集成

**文件**: `frontend/src/context/AuthContext.tsx`

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { shouldAutoSso, triggerSsoRedirect } from '../utils/ssoUtils'

interface User {
  id: string
  email: string
  name: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      setIsLoading(false)
    } else if (shouldAutoSso()) {
      triggerSsoRedirect()
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

#### 2.3.4 路由注册

**文件**: `frontend/src/App.tsx` 中添加路由

```tsx
import SsoCallbackPage from './pages/SsoCallbackPage'

// 在路由配置中添加：
<Route path="/auth/sso/callback" element={<SsoCallbackPage />} />
```

#### 2.3.5 登录按钮

```tsx
function AgentpitLoginButton() {
  const handleLogin = () => {
    const width = 500, height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    window.open(
      '/api/auth/agentpit/sso?returnUrl=/',
      'agentpit-login',
      `width=${width},height=${height},left=${left},top=${top}`
    )
  }

  return <button onClick={handleLogin}>agentpit 授权登陆</button>
}
```

### 2.4 防循环机制

| 机制 | 说明 |
|------|------|
| `sessionStorage.sso_attempted` | 每个浏览器会话最多触发一次自动 SSO |
| `document.referrer` 检查 | 仅从 agentpit.io 跳转时触发 |
| `localStorage.token` 检查 | 已有 token 不触发 |
| `window.history.replaceState` | 回调后立即清除 URL 中的 token |

### 2.5 安全要点

- Token 通过 URL hash（`#`）传递，不会发送到服务器，不会出现在 Nginx 日志中
- 回调页读取 hash 后立即清除
- state 参数防 CSRF 攻击
- 全链路 HTTPS

---

## 三、Token 消耗上报实现方案

> 参考 skills/agentpit-tokens/SKILL.md

### 3.1 数据模型

AutoClip 使用 SQLAlchemy（非 Prisma），对应模型：

**文件**: `backend/models/token_usage.py`

```python
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON
from datetime import datetime
from .base import Base
import uuid

class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id = Column(String, nullable=False, index=True)
    app_id = Column(String, nullable=True)
    user_id = Column(String, nullable=False, index=True)
    tokens_total = Column(Integer, nullable=False)
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    model_name = Column(String, nullable=True)
    request_id = Column(String, nullable=True)
    extra_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 3.2 API 端点

**文件**: `backend/api/v1/tokens.py`
**端点**: `POST /api/v1/tokens/report`
**认证**: ApiKey Bearer Token

```python
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, validator
from datetime import datetime
from backend.core.database import get_db

router = APIRouter(prefix="/tokens", tags=["tokens"])

class TokenReportRequest(BaseModel):
    agent_id: str
    app_id: str | None = None
    tokens_total: int
    tokens_input: int | None = None
    tokens_output: int | None = None
    started_at: datetime
    ended_at: datetime
    model_name: str | None = None
    request_id: str | None = None
    extra_data: dict | None = None

    @validator("ended_at")
    def end_after_start(cls, v, values):
        if "started_at" in values and v < values["started_at"]:
            raise ValueError("ended_at must be after started_at")
        return v

    @validator("tokens_total")
    def positive_tokens(cls, v):
        if v < 0:
            raise ValueError("tokens_total must be non-negative")
        return v

@router.post("/report")
async def report_token_usage(
    body: TokenReportRequest,
    authorization: str = Header(...),
    db=Depends(get_db),
):
    """上报Token消耗数据到AgentPit平台"""
    # 1. 验证 Bearer Token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    api_key = authorization[7:]

    # 2. 验证 API Key 并获取用户（需对接AgentPit API Key验证）
    user = await validate_api_key(api_key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # 3. 验证 agent 归属
    # agent_valid = await verify_agent_ownership(body.agent_id, user["id"])
    # if not agent_valid:
    #     raise HTTPException(status_code=403, detail="Agent does not belong to user")

    # 4. 持久化记录
    usage = TokenUsage(
        agent_id=body.agent_id,
        app_id=body.app_id,
        user_id=user["id"],
        tokens_total=body.tokens_total,
        tokens_input=body.tokens_input,
        tokens_output=body.tokens_output,
        started_at=body.started_at,
        ended_at=body.ended_at,
        model_name=body.model_name,
        request_id=body.request_id,
        extra_data=body.extra_data,
    )
    db.add(usage)
    db.commit()

    return {"success": True, "data": {"id": usage.id, "tokens_total": usage.tokens_total}}
```

### 3.3 上报请求示例

```bash
curl -X POST https://autoclip.agentpit.io/api/v1/tokens/report \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent_xxx",
    "tokens_total": 1500,
    "tokens_input": 1000,
    "tokens_output": 500,
    "started_at": "2026-04-01T10:00:00Z",
    "ended_at": "2026-04-01T10:00:05Z",
    "model_name": "qwen-max"
  }'
```

---

## 四、Nginx 配置补充

服务器 Nginx 已有的配置已覆盖 `/api/` 代理，SSO 和 Token 端点无需额外 Nginx 配置：

- `GET /api/auth/agentpit/sso` → 后端 8000
- `GET /api/auth/agentpit/callback` → 后端 8000
- `POST /api/v1/tokens/report` → 后端 8000

前端 SSO 回调页 `/auth/sso/callback` 由前端 SPA 路由处理，Nginx 的 `try_files` / proxy 到 3000 已覆盖。

---

## 五、实现检查清单

### 后端

- [ ] `.env` 添加 AgentPit OAuth 环境变量
- [ ] `backend/api/v1/auth.py` — SSO 入口 + OAuth 回调端点
- [ ] `backend/api/v1/tokens.py` — Token 上报端点
- [ ] `backend/models/token_usage.py` — TokenUsage 模型
- [ ] `backend/main.py` — 注册 auth 和 tokens 路由
- [ ] 安装依赖: `pip install PyJWT httpx`

### 前端

- [ ] `frontend/src/utils/ssoUtils.ts` — SSO 工具函数
- [ ] `frontend/src/pages/SsoCallbackPage.tsx` — SSO 回调页面
- [ ] `frontend/src/context/AuthContext.tsx` — 认证上下文
- [ ] `frontend/src/App.tsx` — 添加 `/auth/sso/callback` 路由
- [ ] 登录页面添加 "agentpit 授权登陆" 按钮

### 部署

- [ ] 服务器 `.env` 添加 AgentPit 相关环境变量
- [ ] 重启后端服务使新端点生效
- [ ] 在 AgentPit 平台注册回调地址: `https://autoclip.agentpit.io/api/auth/agentpit/callback`

---

## 六、应用市场入驻

> 参考 agentpit 平台 `app/api/v1/marketplace/register/route.ts`

### 6.1 入驻方式

AutoClip 作为 **Web 应用**入驻（integrationType: `WEB`），用户通过浏览器访问使用。

### 6.2 注册到应用市场

需要先获取 AgentPit 开发者账号的 Skill Token：

```bash
# 登录获取 sk_token
curl -X POST https://www.agentpit.io/api/auth/skill-login \
  -H "Content-Type: application/json" \
  -d '{"email": "开发者邮箱", "password": "密码"}'
# 返回: { "sessionToken": "sk_...", ... }
```

然后提交应用注册：

```bash
curl -X POST https://www.agentpit.io/api/v1/marketplace/register \
  -H "Authorization: Bearer sk_你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "gameType": "autoclip",
    "displayName": "AutoClip - AI视频切片",
    "description": "AI驱动的视频切片系统，自动下载视频、AI分析内容、提取精彩片段、生成切片合集",
    "integrationType": "WEB",
    "webUrl": "https://autoclip.agentpit.io",
    "protocol": "HTTP",
    "minPlayers": 1,
    "maxPlayers": 1,
    "pricingModel": "FREE",
    "currency": "CNY",
    "icon": "🎬",
    "tags": ["AI", "视频", "剪辑", "工具"],
    "longDescription": "AutoClip 是一个 AI 驱动的视频切片系统。支持从 YouTube/Bilibili 下载视频，使用 AI（Qwen/DashScope）分析内容，自动提取精彩片段，生成切片合集。前后端分离架构，后端 FastAPI + Celery，前端 React + TypeScript。"
  }'
```

### 6.3 注册参数说明

| 字段 | 值 | 说明 |
|------|------|------|
| gameType | `autoclip` | 唯一标识，小写字母+数字+连字符 |
| displayName | `AutoClip - AI视频切片` | 显示名称 |
| description | 一句话介绍 | 10-500字符 |
| integrationType | `WEB` | 仅 Web 应用 |
| webUrl | `https://autoclip.agentpit.io` | 应用入口 |
| pricingModel | `FREE` | 免费（可改为 `PER_CALL` 按次计费） |
| icon | `🎬` | 应用图标 |
| tags | `["AI", "视频", "剪辑", "工具"]` | 标签，最多10个 |

### 6.4 计费集成（可选）

如需按次计费，在用户使用 AI 处理视频时调用 AgentPit 计费 API：

```python
async def charge_user(access_token: str, amount: float, description: str, order_id: str):
    """从用户AgentPit余额扣费"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            settings.AGENTPIT_CHARGE_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "amount": amount,
                "description": description,
                "referenceId": order_id,
            },
        )
        if resp.status_code == 402:
            raise Exception("用户余额不足")
        resp.raise_for_status()
        return resp.json()  # {"success": true, "charged": 0.50, "balanceAfter": "9.50"}
```

### 6.5 用户访问流程

```
用户在 agentpit.io 应用市场 → 点击「打开应用」
  ↓
跳转到 https://autoclip.agentpit.io
  ↓
自动 SSO 静默登录（已在 agentpit.io 登录的用户）
  ↓
直接使用 AutoClip 功能
  ↓
（可选）AI处理时调用计费API扣费
```

### 6.6 入驻检查清单

- [ ] AgentPit 开发者账号已注册
- [ ] OAuth 应用已创建（Client ID/Secret 已获取）— **已完成**
- [ ] 回调地址已配置: `https://autoclip.agentpit.io/api/auth/agentpit/callback` — **已完成**
- [ ] SSO 单点登录后端+前端已实现
- [ ] 调用注册 API 提交到应用市场
- [ ] 等待平台审核通过上架

### 6.7 管理已注册应用

```bash
# 查看我的应用
curl https://www.agentpit.io/api/v1/marketplace/my-games \
  -H "Authorization: Bearer sk_你的token"

# 更新应用信息
curl -X PATCH https://www.agentpit.io/api/v1/marketplace/games/{id} \
  -H "Authorization: Bearer sk_你的token" \
  -H "Content-Type: application/json" \
  -d '{"description": "新的描述"}'
```

### 6.8 OAuth 管理界面

在 https://develop.agentpit.io/settings/applications 可以：
- 查看/复制 Client ID 和 Client Secret
- 重新生成 Client Secret
- 编辑 Callback URLs
- 查看 Token 用量统计
