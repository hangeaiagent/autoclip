#!/bin/bash
# AutoClip 部署脚本
# 服务器: agentpit.io (34.133.47.117)
# 域名: autoclip.agentpit.io

set -euo pipefail

# ============ 配置 ============
SERVER_IP="34.133.47.117"
SERVER_USER="support"
SSH_KEY="$HOME/.ssh/id_rsa_google_longterm"
REMOTE_DIR="/mnt/disk-119/autoclip"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH_CMD="ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"

echo "=============================="
echo " AutoClip 部署"
echo " 目标: autoclip.agentpit.io"
echo "=============================="

# ============ 步骤1: 同步代码 ============
echo ""
echo "[1/5] 同步代码到服务器..."
rsync -avz --delete \
  --exclude=node_modules --exclude=.git --exclude=.env \
  --exclude=data --exclude=logs --exclude=uploads \
  --exclude=venv --exclude=__pycache__ --exclude=.DS_Store \
  --exclude=.claude --exclude=.cursor --exclude=.trae \
  "$LOCAL_DIR/" \
  -e "ssh -i $SSH_KEY" \
  "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/"
echo "[1/5] 代码同步完成"

# ============ 步骤2: 构建前端 ============
echo ""
echo "[2/5] 在服务器上构建前端..."
$SSH_CMD << 'ENDSSH'
cd /mnt/disk-119/autoclip/frontend

# 安装Node.js (如果没有)
if ! command -v node &> /dev/null; then
    echo "安装Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

npm ci --production=false
npm run build
echo "前端构建完成: $(ls -la dist/index.html)"
ENDSSH
echo "[2/5] 前端构建完成"

# ============ 步骤3: 配置.env ============
echo ""
echo "[3/5] 检查服务器.env配置..."
$SSH_CMD << ENDSSH
cd $REMOTE_DIR
if [ ! -f .env ]; then
    cp env.example .env
    echo "已创建.env文件，请编辑填入API密钥:"
    echo "  ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"
    echo "  nano $REMOTE_DIR/.env"
    echo "  # 必填: API_DASHSCOPE_API_KEY=your_key"
fi
echo ".env文件存在"
ENDSSH
echo "[3/5] 环境配置检查完成"

# ============ 步骤4: 启动Docker服务 ============
echo ""
echo "[4/5] 启动Docker服务..."
$SSH_CMD << 'ENDSSH'
cd /mnt/disk-119/autoclip

# 确保数据目录存在
mkdir -p data logs uploads

# 停止旧容器(如果有)
cd deploy
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

# 构建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 等待健康检查通过
echo "等待服务启动..."
sleep 15

# 检查状态
docker compose -f docker-compose.prod.yml ps
echo ""
curl -sf http://localhost:8000/api/v1/health/ && echo "后端API健康检查通过" || echo "警告: 后端API未响应"
ENDSSH
echo "[4/5] Docker服务启动完成"

# ============ 步骤5: 配置Nginx + SSL ============
echo ""
echo "[5/5] 配置Nginx和SSL..."
$SSH_CMD << 'ENDSSH'
NGINX_CONF="/etc/nginx/sites-available/autoclip.agentpit.io"
NGINX_LINK="/etc/nginx/sites-enabled/autoclip.agentpit.io"

# 复制Nginx配置(先用无SSL版本,certbot会自动添加)
sudo tee "$NGINX_CONF" > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name autoclip.agentpit.io;

    root /mnt/disk-119/autoclip/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        client_max_body_size 500M;
    }

    location /docs {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /redoc {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

# 启用站点
sudo ln -sf "$NGINX_CONF" "$NGINX_LINK"

# 测试Nginx配置
sudo nginx -t

# 重载Nginx
sudo systemctl reload nginx
echo "Nginx配置完成"

# 申请SSL证书
if [ ! -d "/etc/letsencrypt/live/autoclip.agentpit.io" ]; then
    echo "申请SSL证书..."
    sudo certbot --nginx -d autoclip.agentpit.io --non-interactive --agree-tos --email admin@agentpit.io
    echo "SSL证书申请完成"
else
    echo "SSL证书已存在"
fi
ENDSSH
echo "[5/5] Nginx和SSL配置完成"

echo ""
echo "=============================="
echo " 部署完成!"
echo " 访问: https://autoclip.agentpit.io/"
echo " API:  https://autoclip.agentpit.io/api/v1/health/"
echo " 文档: https://autoclip.agentpit.io/docs"
echo "=============================="
