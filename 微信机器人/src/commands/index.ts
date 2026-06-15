import { Message } from 'wechaty';
import { agnesClient } from '../services/agness.service';
import { fileService } from '../services/file.service';
import { getUserModel, createVideoTask as createVideoTaskDb, updateVideoTask, getVideoTask, loadConfig } from '../config/database';
import logger from '../config/logger';

const MODEL_MAP: Record<string, string> = {
  gpt: 'agnes-gpt-4o',
  claude: 'agnes-claude-opus',
  deepseek: 'agnes-deepseek-v3',
  default: 'agnes-gpt-4o',
};

export interface CommandHandler {
  command: string;
  description: string;
  adminOnly?: boolean;
  handler: (message: Message, params: string) => Promise<string>;
}

const handlers: CommandHandler[] = [
  {
    command: '/help',
    description: '显示帮助信息',
    handler: async () => {
      return `🤖 Agnes AI 机器人 - 帮助菜单

📝 基础功能:
  直接发送消息 - AI智能回复
  /clear - 清除对话上下文
  /status - 查看系统状态

🎨 图片生成:
  /draw 描述文字 - 生成图片

🎬 视频生成:
  /video 描述文字 - 生成视频

⚙️ 模型切换:
  /model - 查看当前模型
  /model gpt - 切换到GPT-4o
  /model claude - 切换到Claude Opus
  /model deepseek - 切换到DeepSeek V3

🔧 管理命令 (管理员):
  /restart - 重启机器人`;
    },
  },
  {
    command: '/clear',
    description: '清除对话上下文',
    handler: async () => {
      return '✅ 对话上下文已清除。';
    },
  },
  {
    command: '/model',
    description: '查看或切换模型',
    handler: async (_msg, params) => {
      const wxid = 'unknown';
      const currentModel = getUserModel(wxid);
      if (!params) {
        return `📋 当前模型: ${currentModel}\n\n可用模型:\n/model gpt - GPT-4o\n/model claude - Claude Opus\n/model deepseek - DeepSeek V3`;
      }
      const param = params.toLowerCase();
      if (MODEL_MAP[param]) {
        // Model switch handled at bot level
        return `✅ 模型已切换为: ${param}`;
      }
      return `❌ 未知模型: ${param}\n可用: gpt, claude, deepseek, default`;
    },
  },
  {
    command: '/draw',
    description: '生成图片',
    handler: async (_msg, params) => {
      if (!params) return '🎨 请提供图片描述。\n示例: /draw 一个未来城市';
      return null; // Handled at bot level
    },
  },
  {
    command: '/video',
    description: '生成视频',
    handler: async (_msg, params) => {
      if (!params) return '🎬 请提供视频描述。\n示例: /video 星空延时摄影';
      return null; // Handled at bot level
    },
  },
  {
    command: '/status',
    description: '查看系统状态',
    handler: async () => {
      return '📊 系统状态: 运行中';
    },
  },
  {
    command: '/restart',
    description: '重启机器人 (管理员)',
    adminOnly: true,
    handler: async () => {
      return '🔄 正在重启...';
    },
  },
];

export function getCommandHandler(command: string): CommandHandler | undefined {
  return handlers.find((h) => h.command === command.toLowerCase());
}

export function getAllCommands(): CommandHandler[] {
  return handlers;
}

export function getCommandList(): string {
  return handlers
    .map((h) => `  ${h.command} - ${h.description}`)
    .join('\n');
}