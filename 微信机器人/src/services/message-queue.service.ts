import { RandomDelayService } from './random-delay.service';

export class MessageQueueService {
  private queue: Array<() => Promise<void>> = [];
  private processing: boolean = false;
  private delayService: RandomDelayService;

  constructor(delayService?: RandomDelayService) {
    this.delayService = delayService || new RandomDelayService();
  }

  async add(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          await this.delayService.applyDelay();
          await task();
          resolve();
        } catch (error: any) {
          reject(error);
        }
      };

      this.queue.push(wrappedTask);

      if (!this.processing) {
        this.processNext();
      }
    });
  }

  private async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.queue.shift()!;

    try {
      await task();
    } catch (error) {
      console.error('Message queue task error:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    this.processNext();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.processing = false;
  }
}

// Singleton instance
export const messageQueue = new MessageQueueService();