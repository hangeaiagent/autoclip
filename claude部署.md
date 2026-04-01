# AutoClip 服务器部署指南

> 供 Claude Code 在后续对话中参考，用于将本地代码更新部署到生产服务器。

## 服务器信息

| 项目 | 值 |
|------|------|
| IP | 34.143.156.90 |
| 域名 | https://autoclip.agentpit.io |
| 用户 | a1 |
| SSH 密钥 | ~/.ssh/id_rsa_google_longterm |
| 代码路径 | /opt/autoclip |
| 操作系统 | Debian 12 (bookworm) x86_64 |
| Python | 3.11.2 (venv: /opt/autoclip/venv) |
| Node.js | v18.20.4 |
| 数据库 | SQLite (data/autoclip.db) |
| Redis | localhost:6379 |

## SSH 连接

```bash
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90
```

## 服务架构

```
Nginx (80/443) ─┬─ / ──────→ Vite dev server (127.0.0.1:3000) ── 前端
                ├─ /api/ ──→ Uvicorn (127.0.0.1:8000) ────────── 后端API
                ├─ /ws/ ───→ Uvicorn (127.0.0.1:8000) ────────── WebSocket
                └─ /docs ──→ Uvicorn (127.0.0.1:8000) ────────── API文档
```

- SSL: Let's Encrypt 证书，certbot 自动续期
- 进程管理: 直接后台运行（非 pm2/systemd）
- Celery Worker: 2 并发，连接本地 Redis

## 快速部署（更新代码）

### 方式一：完整更新（前端+后端）

在本地 Windows Git Bash 中执行：

```bash
# 1. 打包代码（排除不需要的文件）
cd C:/Users/72409/Desktop/auto/autoclip
tar czf /tmp/autoclip-deploy.tar.gz \
  --exclude=node_modules --exclude=.git --exclude=.env \
  --exclude=data --exclude=logs --exclude=uploads \
  --exclude=venv --exclude=__pycache__ --exclude=.DS_Store \
  --exclude=.claude --exclude=.cursor --exclude=.trae \
  --exclude='frontend/dist' \
  .

# 2. 上传到服务器
scp -i ~/.ssh/id_rsa_google_longterm /tmp/autoclip-deploy.tar.gz a1@34.143.156.90:/tmp/

# 3. SSH到服务器解压并重启服务
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90 << 'EOF'
cd /opt/autoclip

# 解压覆盖代码（保留 .env、data、venv 等）
tar xzf /tmp/autoclip-deploy.tar.gz
rm /tmp/autoclip-deploy.tar.gz

# 安装/更新后端依赖
source venv/bin/activate
pip install -r requirements.txt

# 安装/更新前端依赖并构建（如果前端有改动）
cd frontend
npm ci
cd ..

# 重启服务（见下方"重启服务"章节）
EOF
```

### 方式二：仅更新后端

```bash
tar czf /tmp/autoclip-backend.tar.gz --exclude=__pycache__ backend/
scp -i ~/.ssh/id_rsa_google_longterm /tmp/autoclip-backend.tar.gz a1@34.143.156.90:/tmp/
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90 << 'EOF'
cd /opt/autoclip
tar xzf /tmp/autoclip-backend.tar.gz
rm /tmp/autoclip-backend.tar.gz
# 重启后端
kill $(cat backend.pid 2>/dev/null) 2>/dev/null
kill $(cat celery.pid 2>/dev/null) 2>/dev/null
source venv/bin/activate
export PYTHONPATH=/opt/autoclip
nohup python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
echo $! > backend.pid
nohup celery -A backend.core.celery_app worker --loglevel=info --concurrency=2 > celery.log 2>&1 &
echo $! > celery.pid
EOF
```

### 方式三：仅更新前端

```bash
tar czf /tmp/autoclip-frontend.tar.gz --exclude=node_modules --exclude=dist frontend/
scp -i ~/.ssh/id_rsa_google_longterm /tmp/autoclip-frontend.tar.gz a1@34.143.156.90:/tmp/
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90 << 'EOF'
cd /opt/autoclip
tar xzf /tmp/autoclip-frontend.tar.gz
rm /tmp/autoclip-frontend.tar.gz
cd frontend && npm ci
# 重启前端dev server
kill $(cat ../frontend.pid 2>/dev/null) 2>/dev/null
nohup npx vite --host 0.0.0.0 --port 3000 > ../frontend.log 2>&1 &
echo $! > ../frontend.pid
EOF
```

## 重启服务

```bash
ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90 << 'EOF'
cd /opt/autoclip

# 停止所有服务
kill $(cat backend.pid 2>/dev/null) 2>/dev/null
kill $(cat celery.pid 2>/dev/null) 2>/dev/null
kill $(cat frontend.pid 2>/dev/null) 2>/dev/null
sleep 2

# 启动后端
source venv/bin/activate
export PYTHONPATH=/opt/autoclip
nohup python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
echo $! > backend.pid

# 启动Celery
nohup celery -A backend.core.celery_app worker --loglevel=info --concurrency=2 > celery.log 2>&1 &
echo $! > celery.pid

# 启动前端
cd frontend
nohup npx vite --host 0.0.0.0 --port 3000 > ../frontend.log 2>&1 &
echo $! > ../frontend.pid
cd ..

sleep 3
echo "=== 健康检查 ==="
curl -sf http://127.0.0.1:8000/api/v1/health/ && echo " OK" || echo " FAIL"
curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ && echo " 前端OK" || echo " 前端FAIL"
EOF
```

## 常用运维命令

```bash
SSH="ssh -i ~/.ssh/id_rsa_google_longterm a1@34.143.156.90"

# 查看服务状态
$SSH "ps aux | grep -E 'uvicorn|celery|vite' | grep -v grep"

# 查看后端日志
$SSH "tail -50 /opt/autoclip/backend.log"

# 查看Celery日志
$SSH "tail -50 /opt/autoclip/celery.log"

# 查看前端日志
$SSH "tail -50 /opt/autoclip/frontend.log"

# 查看Nginx日志
$SSH "sudo tail -50 /var/log/nginx/access.log"
$SSH "sudo tail -50 /var/log/nginx/error.log"

# 重载Nginx配置（修改Nginx配置后）
$SSH "sudo nginx -t && sudo systemctl reload nginx"

# 健康检查
$SSH "curl -sf http://127.0.0.1:8000/api/v1/health/"
```

## 注意事项

1. **不要覆盖 `.env`** — 服务器上的 .env 包含生产配置（API 密钥等），tar 打包时已排除
2. **不要覆盖 `data/`** — 包含 SQLite 数据库和项目数据
3. **不要覆盖 `venv/`** — 服务器上已安装依赖的虚拟环境
4. **前端 API 地址** — 必须使用相对路径 `/api/v1`，不能硬编码 `http://localhost:8000`
5. **换行符** — Windows 传输的 `.sh` 文件需确保 LF 换行（tar 打包通常无问题）
6. **SSL 证书** — certbot 自动续期，证书路径 `/etc/letsencrypt/live/autoclip.agentpit.io/`
7. **sshd 不监听 443** — 已将 sshd 的 Port 443 注释掉，让给 Nginx 使用，勿恢复
