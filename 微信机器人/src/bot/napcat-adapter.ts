import axios, { AxiosInstance } from 'axios';
import { loadConfig } from '../config';
import logger from '../config/logger';

/**
 * NapCat/OneBot v11 Compatibility Layer
 * Alternative to Wechaty when direct WeChat login is not possible
 */
export class NapCatAdapter {
  private client: AxiosInstance;
  private config = loadConfig();
  private botWxid: string;
  private connected: boolean = false;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NAPCAT_API_URL || 'http://localhost:3000',
      timeout: 10000,
    });
    this.botWxid = this.config.selfWxid || 'napcat-bot';
  }

  async start(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/status');
      this.connected = response.data.online || false;
      if (this.connected) {
        logger.info('NapCat adapter connected successfully');
        this.startMessageListener();
        return true;
      } else {
        logger.warn('NapCat is not online yet');
        return false;
      }
    } catch (error: any) {
      logger.error('NapCat connection failed: ' + error.message);
      return false;
    }
  }

  async stop(): Promise<void> {
    this.connected = false;
    logger.info('NapCat adapter stopped');
  }

  private async startMessageListener() {
    const pollInterval = setInterval(async () => {
      if (!this.connected) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const response = await this.client.post('/api/v1/get_msg', {
          message_seq: 0,
          count: 10,
        });
        const messages = response.data.messages || [];
        for (const msg of messages) {
          await this.handleMessage(msg);
        }
      } catch (error: any) {
        logger.error('NapCat poll error: ' + error.message);
      }
    }, 5000);
  }

  private async handleMessage(msg: any) {
    const senderId = msg.sender?.user_id?.toString() || 'unknown';
    const content = msg.raw_message || msg.message || '';
    const isGroup = msg.message_type === 'group';
    const groupId = isGroup ? msg.group_id?.toString() : '';

    const groupInfo = isGroup ? ' in group ' + groupId : '';
    logger.info('NapCat message from ' + senderId + groupInfo + ': ' + content);

    if (content.startsWith('/')) {
      logger.info('NapCat command: ' + content);
    }
  }

  async sendMessage(targetId: string, content: string): Promise<boolean> {
    try {
      await this.client.post('/api/v1/send_msg', {
        message_type: 'private',
        user_id: parseInt(targetId),
        message: content,
      });
      return true;
    } catch (error: any) {
      logger.error('NapCat send error: ' + error.message);
      return false;
    }
  }

  async sendGroupMessage(groupId: string, content: string): Promise<boolean> {
    try {
      await this.client.post('/api/v1/send_msg', {
        message_type: 'group',
        group_id: parseInt(groupId),
        message: content,
      });
      return true;
    } catch (error: any) {
      logger.error('NapCat group send error: ' + error.message);
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}