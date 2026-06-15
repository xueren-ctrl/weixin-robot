import { Message, Room, Contact } from 'wechaty';
import { agnesClient } from '../services/agness.service';
import { fileService } from '../services/file.service';
import { messageQueue } from '../services/message-queue.service';
import { RandomDelayService } from '../services/random-delay.service';
import {
  addContextMessage,
  getContextMessages,
  getUserModel,
  saveChatMessage,
  loadConfig,
} from '../config/database';
import logger from '../config/logger';

const delayService = new RandomDelayService();
const MODEL_MAP: Record<string, string> = {
  gpt: 'agnes-gpt-4o',
  claude: 'agnes-claude-opus',
  deepseek: 'agnes-deepseek-v3',
  default: 'agnes-gpt-4o',
};

export async function handleAiReply(
  message: Message,
  text: string,
  wxid: string,
  roomId: string,
): Promise<string | null> {
  const model = getUserModel(wxid);
  const agnesModel = MODEL_MAP[model] || MODEL_MAP.default;

  const config = loadConfig();
  const context = getContextMessages(wxid, roomId, config.maxContextRounds);

  const messages: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: '你是一个有用的AI助手。使用简洁的语言回答用户的问题。如果用户发送中文，请用中文回答。',
    },
    ...context.map((c: any) => ({ role: c.role, content: c.content })),
    { role: 'user', content: text },
  ];

  addContextMessage(wxid, roomId, 'user', text);

  const response = await agnesClient.generateText(messages, agnesModel);

  if (response.success && response.data) {
    addContextMessage(wxid, roomId, 'assistant', response.data);
    saveChatMessage(wxid, '', text, 'text', roomId);
    return response.data;
  } else {
    addContextMessage(wxid, roomId, 'assistant', `[AI Error] ${response.error}`);
    return null;
  }
}

export async function sendReply(message: Message, text: string): Promise<void> {
  await messageQueue.add(async () => {
    await delayService.applyDelay();
    await message.say(text);
    logger.info(`Reply sent: ${text.substring(0, 50)}...`);
  });
}

export async function handleGroupMessage(message: Message): Promise<void> {
  const room = message.room();
  if (!room) return;

  const text = message.text();
  const talker = message.talker();
  const wxid = talker.id;

  // Check if bot is mentioned
  const botContact = await message.bot.Contact.find({ id: message.bot.currentUser.payload.id });
  const botName = botContact?.name() || botContact?.alias() || '机器人';

  let atBot = false;
  if (room && text.includes('@' + botName)) {
    atBot = true;
  }

  // In groups, only reply when @bot or in whitelist
  if (!atBot) {
    return;
  }

  const cleanText = text.replace(new RegExp('@' + botName + '\\s*', 'g'), '').trim();
  if (!cleanText) return;

  const roomId = room.id;

  const reply = await handleAiReply(message, cleanText, wxid, roomId);
  if (reply) {
    const prefix = `@${talker.name()} `;
    await sendReply(message, prefix + reply);
  }
}

export async function handlePrivateMessage(message: Message): Promise<void> {
  const text = message.text();
  const wxid = message.talker().id;

  const reply = await handleAiReply(message, text, wxid, '');
  if (reply) {
    await sendReply(message, reply);
  }
}