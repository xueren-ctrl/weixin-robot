# Agnes AI 微信机器人系统

基于微信个人号的 AI 智能机器人系统，接入 Agnes AI 全模型 API，实现微信聊天自动回复。

## 功能特性

- 🤖 **AI 智能回复** - 支持文本、图片、视频生成
- 📱 **微信个人号登录** - 二维码登录，自动重连
- 💬 **群聊支持** - @机器人自动回复
- 🎨 **图片生成** - `/draw 描述` 生成图片
- 🎬 **视频生成** - `/video 描述` 生成视频
- ⚙️ **模型切换** - 支持 GPT/Claude/DeepSeek 多模型
- 🔒 **安全机制** - 白名单、频率限制、防封优化
- 📊 **管理后台** - Vue3 + Element Plus 实时管理
- 🐳 **Docker 部署** - 一键部署到 Ubuntu

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 20+ |
| 语言 | TypeScript |
| 微信框架 | Wechaty (puppet-wechat) |
| Web 框架 | Express |
| 数据库 | SQLite (better-sqlite3) |
| 日志 | Winston |
| 进程管理 | PM2 / Docker |
| 管理后台 | Vue3 + Element Plus |

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd 微信机器人

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 Agnes API Key

# 3. 启动服务
docker compose up -d

# 4. 查看日志
docker compose logs -f
```

### 方式二：Ubuntu 一键部署

```bash
# 下载项目后执行
sudo chmod +x deploy.sh
sudo ./deploy.sh
```

### 方式三：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env

# 3. 构建
npm run build

# 4. 启动
npm start
```

## 项目结构

```
├── src/
│   ├── bot/                  # 微信机器人核心
│   │   ├── wechat-bot.ts     # Wechaty 主逻辑
│   │   └── napcat-adapter.ts # NapCat/OneBot 兼容层
│   ├── services/             # 业务服务
│   │   ├── agness.service.ts # Agnes AI API 封装
│   │   ├── file.service.ts   # 文件服务
│   │   ├── message-queue.service.ts  # 消息队列
│   │   ├── random-delay.service.ts   # 随机延迟
│   │   ├── api.routes.ts     # API 路由
│   │   └── server.ts         # Express 服务器
│   ├── handlers/             # 消息处理器
│   │   └── message.handler.ts
│   ├── commands/             # 命令系统
│   │   └── index.ts
│   ├── config/               # 配置
│   │   ├── index.ts          # 配置加载
│   │   ├── logger.ts         # 日志配置
│   │   └── database.ts       # 数据库
│   ├── middlewares/          # 中间件
│   │   ├── auth.middleware.ts
│   │   └── rate-limit.middleware.ts
│   ├── utils/                # 工具函数
│   │   └── helpers.ts
│   └── index.ts              # 入口文件
├── dist/                     # 编译输出
├── data/                     # 数据库文件
├── logs/                     # 日志文件
├── temp/                     # 临时文件
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js       # PM2 配置
├── nginx.conf                # Nginx 配置
├── deploy.sh                 # Ubuntu 部署脚本
├── .env.example              # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md
```

## 微信登录流程

### 1. 首次启动

```bash
docker compose up -d
docker compose logs -f
```

终端会显示二维码图片链接，使用微信扫描即可登录。

### 2. 登录状态持久化

Wechaty 会自动保存登录状态到 `data/` 目录，下次启动无需重新扫码。

### 3. 自动重连

如果网络断开，机器人会自动尝试重连。

## 命令说明

### 基础命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/clear` | 清除当前对话上下文 |
| `/status` | 查看系统状态 |

### AI 功能

| 命令 | 说明 | 示例 |
|------|------|------|
| `/draw` | 生成图片 | `/draw 一个未来城市` |
| `/video` | 生成视频 | `/video 星空延时摄影` |

### 模型切换

| 命令 | 说明 |
|------|------|
| `/model` | 查看当前模型 |
| `/model gpt` | 切换到 GPT-4o |
| `/model claude` | 切换到 Claude Opus |
| `/model deepseek` | 切换到 DeepSeek V3 |

### 管理命令（仅管理员）

| 命令 | 说明 |
|------|------|
| `/restart` | 重启机器人 |

## 管理后台

访问 `http://your-server-ip:3000` 打开管理后台。

默认账号：
- 用户名：`admin`
- 密码：`admin123`

功能：
- 📊 仪表盘 - 查看系统统计
- 💬 聊天记录 - 浏览所有对话历史
- 👥 用户管理 - 管理用户信息
- 📋 白名单 - 管理可用用户
- 🎬 视频任务 - 跟踪视频生成进度
- ⚙️ 系统信息 - 查看运行状态

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 无 |
| POST | `/api/auth/login` | 登录获取 Token | 无 |
| GET | `/api/stats` | 获取统计数据 | ✅ |
| GET | `/api/chats` | 获取聊天记录 | ✅ |
| GET | `/api/users` | 获取用户列表 | ✅ |
| GET | `/api/whitelist` | 获取白名单 | ✅ |
| POST | `/api/whitelist` | 添加白名单 | ✅ |
| DELETE | `/api/whitelist/:wxid` | 移除白名单 | ✅ |
| GET | `/api/videos` | 获取视频任务 | ✅ |
| GET | `/api/system` | 获取系统信息 | ✅ |

## 配置说明

### 环境变量 (.env)

```bash
# Agnes AI API
AGNES_BASE_URL=https://api.agnes.ai/v1
AGNES_API_KEY=your-api-key
AGNES_TEXT_MODEL=agnes-gpt-4o
AGNES_IMAGE_MODEL=agnes-image-dall-e-3
AGNES_VIDEO_MODEL=agnes-video-sora

# 微信机器人
BOT_PUPPET=wechat           # wechat | service | napcat
BOT_PUPPET_TOKEN=           # puppet service token
BOT_SELF_WXID=              # 机器人微信号
ADMIN_WXID=                 # 管理员微信号
WHITELIST_WXIDS=            # 白名单用户，逗号分隔

# 安全
JWT_SECRET=your-secret
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20

# 防封优化
REPLY_DELAY_MIN_MS=1500     # 最小延迟
REPLY_DELAY_MAX_MS=4500     # 最大延迟
MAX_MESSAGES_PER_HOUR=200

# 数据库
DB_PATH=./data/bot.db

# 服务器
PORT=3000
API_PORT=3001
```

## 防封优化

- ✅ 随机延迟回复（1.5-4.5秒可调）
- ✅ 模拟人工输入节奏
- ✅ 频率限制（每分钟最多20条）
- ✅ 每小时消息上限
- ✅ 白名单机制
- ✅ 日志脱敏

## 备选方案

如果 Wechaty puppet-wechat 不可用，可以切换到：

### 方案一：NapCat/OneBot

1. 安装 NapCat（需要 Linux + Docker）
2. 修改 `.env`：
   ```
   BOT_PUPPET=napcat
   NAPCAT_API_URL=http://localhost:3000
   ```

### 方案二：Puppet Service

使用第三方 Puppet 服务（如 PadLocal）：
```
BOT_PUPPET=service
BOT_PUPPET_TOKEN=your-token-here
```

## 运维

### Docker 命令

```bash
# 启动
docker compose up -d

# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 停止
docker compose down

# 更新
docker compose down && docker compose up -d --build
```

### PM2 命令

```bash
# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 重启
pm2 restart wechat-ai-bot

# 停止
pm2 stop wechat-ai-bot

# 开机自启
pm2 startup
pm2 save
```

### 日志管理

日志存放在 `logs/` 目录：
- `app.log` - 应用日志
- `error.log` - 错误日志
- `pm2-out.log` - PM2 输出
- `pm2-error.log` - PM2 错误

日志自动轮转，保留最近 5 个文件，每个最大 5MB。

## 常见问题

### Q: 扫码登录后立即掉线？
A: 检查网络稳定性，确保服务器可以访问微信服务器。

### Q: 图片/视频生成失败？
A: 检查 `.env` 中的 API Key 是否正确，确认 Agnes AI 账户有足够余额。

### Q: 如何添加新用户到白名单？
A: 通过管理后台 -> 白名单管理 -> 添加，或使用 `/api/whitelist` 接口。

### Q: 数据库文件在哪里？
A: 默认在 `data/bot.db`，Docker 部署时映射到容器内 `./data` 目录。

## 许可证

MIT