#!/bin/bash
set -e

echo "============================================"
echo "  Agnes AI WeChat Bot - Ubuntu 部署脚本"
echo "  版本: 1.0.0"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check root privileges
if [ "$EUID" -ne 0 ]; then
    log_error "请使用 sudo 运行此脚本"
    exit 1
fi

# Update system packages
log_info "更新系统包..."
apt-get update -y
apt-get upgrade -y

# Install Docker
log_info "安装 Docker..."
if ! command -v docker &> /dev/null; then
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    log_info "Docker 安装完成"
else
    log_info "Docker 已安装"
fi

# Install Node.js 20
log_info "安装 Node.js 20..."
if ! command -v node &> /dev/null || node -v | grep -q -v "v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log_info "Node.js 安装完成"
else
    log_info "Node.js 已安装"
fi

# Install PM2
log_info "安装 PM2..."
npm install -g pm2
log_info "PM2 安装完成"

# Setup project directory
PROJECT_DIR="/opt/wechat-bot"
log_info "项目目录: $PROJECT_DIR"

if [ ! -d "$PROJECT_DIR" ]; then
    mkdir -p "$PROJECT_DIR"
    log_info "创建项目目录"
fi

# Copy project files (if not already present)
if [ -d "$(pwd)/src" ] && [ "$(pwd)" != "$PROJECT_DIR" ]; then
    log_info "复制项目文件到 $PROJECT_DIR..."
    cp -r . "$PROJECT_DIR/"
fi

cd "$PROJECT_DIR"

# Install dependencies
log_info "安装项目依赖..."
npm install --production

# Build project
log_info "构建项目..."
npx tsc

# Configure environment
if [ ! -f ".env" ]; then
    log_warn ".env 文件不存在，从 .env.example 复制"
    cp .env.example .env
    log_warn "请编辑 $PROJECT_DIR/.env 文件配置 API Key 和其他参数"
fi

# Create data directories
mkdir -p data logs temp

# Start with Docker Compose
log_info "启动服务 (Docker Compose)..."
docker compose up -d

# Show status
log_info "服务状态:"
docker compose ps

log_info ""
log_info "============================================"
log_info "  部署完成!"
log_info "============================================"
log_info ""
log_info "管理后台: http://你的服务器IP:3000"
log_info "API 地址: http://你的服务器IP:3000/api"
log_info "健康检查: http://你的服务器IP:3000/health"
log_info ""
log_info "默认登录账号: admin / admin123"
log_info ""
log_info "常用命令:"
log_info "  docker compose logs -f    # 查看日志"
log_info "  docker compose restart    # 重启服务"
log_info "  docker compose down       # 停止服务"
log_info "  pm2 logs                  # PM2 日志"
log_info "  pm2 restart wechat-ai-bot # PM2 重启"
log_info ""

# Setup firewall if ufw is available
if command -v ufw &> /dev/null; then
    log_info "配置防火墙..."
    ufw allow 3000/tcp 2>/dev/null || true
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
fi

# Setup systemd service for auto-restart
log_info "配置开机自启..."
cat > /etc/systemd/system/wechat-bot.service <<EOF
[Unit]
Description=Agnes AI WeChat Bot
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wechat-bot.service
systemctl start wechat-bot.service

log_info "开机自启配置完成"
log_info ""
log_info "完成!"