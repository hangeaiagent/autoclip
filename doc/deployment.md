# AutoClip 部署文档

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP | 34.143.156.90 |
| 域名 | autoclip.agentpit.io |
| 操作系统 | Debian 12 (bookworm) x86_64 |
| 登录方式 | `ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90` |
| 代码路径 | `/opt/autoclip` |
| GitHub 仓库 | https://github.com/hangeaiagent/autoclip.git |
| 分支 | main |

## 访问地址

| 服务 | URL |
|------|-----|
| 前端界面 | http://autoclip.agentpit.io/ |
| 后端 API | http://autoclip.agentpit.io/api/v1/health/ |
| API 文档 | http://autoclip.agentpit.io/docs |

## 部署架构

```
用户 -> Nginx (80) -> 前端 Vite (3000) / 后端 Uvicorn (8000)
                            |
                      Redis (6379) <-- Celery Worker
                            |
                      SQLite (data/autoclip.db)
```

### 服务组件

| 组件 | 端口 | 说明 |
|------|------|------|
| Nginx | 80 | 反向代理，域名入口 |
| Vite Dev Server | 3000 | React 前端 |
| Uvicorn | 8000 | FastAPI 后端 |
| Celery Worker | - | 异步任务处理 |
| Redis | 6379 | 消息队列 & 缓存 |
| SQLite | - | 数据库 (data/autoclip.db) |

## 服务管理

```bash
# SSH 登录
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90

# 启动服务
cd /opt/autoclip && sudo bash quick_start.sh

# 停止服务
cd /opt/autoclip && sudo bash stop_autoclip.sh

# 查看状态
cd /opt/autoclip && sudo bash status_autoclip.sh

# 完整启动（含环境检查）
cd /opt/autoclip && sudo bash start_autoclip.sh
```

## 日志查看

```bash
# 后端日志
tail -f /opt/autoclip/logs/backend.log

# 前端日志
tail -f /opt/autoclip/logs/frontend.log

# Celery 日志
tail -f /opt/autoclip/logs/celery.log
```

## 更新部署

```bash
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90

cd /opt/autoclip
sudo bash stop_autoclip.sh
sudo git pull origin main
sudo bash quick_start.sh
```

## 环境依赖

### 已安装的系统软件

- Python 3.11.2 (虚拟环境: /opt/autoclip/venv)
- Node.js v18.20.4 / npm 9.2.0
- Redis 7.x
- Nginx 1.22.1
- FFmpeg 5.1.8
- Docker 29.3.1 (已安装但未使用 Docker 部署方式)

### Python 依赖 (venv)

主要包: fastapi, uvicorn, sqlalchemy, celery, redis, pydantic, yt-dlp, aiohttp 等，完整列表见 `requirements.txt`

### 前端依赖

React + Vite + TypeScript，依赖通过 `npm install` 安装在 `frontend/node_modules`

## Nginx 配置

配置文件: `/etc/nginx/sites-available/autoclip`

路由规则:
- `/` -> Vite 前端 (127.0.0.1:3000)，支持 WebSocket (HMR)
- `/api/` -> 后端 API (127.0.0.1:8000)
- `/ws/` -> WebSocket (127.0.0.1:8000)
- `/docs`, `/openapi.json` -> API 文档 (127.0.0.1:8000)
- 上传文件大小限制: 500MB

## 关键配置文件

| 文件 | 路径 | 说明 |
|------|------|------|
| 环境变量 | `/opt/autoclip/.env` | 数据库、Redis、API Key 等配置 |
| Vite 配置 | `/opt/autoclip/frontend/vite.config.ts` | 前端配置，含 allowedHosts |
| Nginx 配置 | `/etc/nginx/sites-available/autoclip` | 反向代理配置 |

## 注意事项

1. `.env` 中 `LOG_FORMAT` 的值需要用双引号包裹，否则 `source .env` 时 bash 会因括号报错
2. Vite 配置中需要设置 `allowedHosts: ["autoclip.agentpit.io"]`，否则通过域名访问会返回 403
3. 当前使用开发模式 (vite dev server)，生产环境建议构建静态文件并用 Nginx 直接服务
4. 密码登录方式 (root / 4oNTpWhi6K2dT62zpg) 不稳定，推荐使用 SSH 密钥方式
