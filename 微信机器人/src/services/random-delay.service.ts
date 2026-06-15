import { loadConfig } from '../config';

export class RandomDelayService {
  private config = loadConfig();

  getRandomDelay(): number {
    const min = this.config.replyDelayMinMs;
    const max = this.config.replyDelayMaxMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async applyDelay(): Promise<void> {
    const delay = this.getRandomDelay();
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async applyTypingDelay(): Promise<void> {
    // Simulate typing time based on message length
    const baseDelay = this.getRandomDelay();
    return new Promise((resolve) => setTimeout(resolve, baseDelay));
  }
}
