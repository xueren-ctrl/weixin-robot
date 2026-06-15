import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../config';

export interface TempFileResult {
  success: boolean;
  filePath?: string;
  url?: string;
  error?: string;
}

class FileService {
  private config = loadConfig();
  private tempDir: string;

  constructor() {
    this.tempDir = this.config.tempDir;
    this.ensureTempDir();
    this.startCleanupScheduler();
  }

  private ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private startCleanupScheduler() {
    // Clean up temp files every hour
    setInterval(() => {
      this.cleanupTempFiles();
    }, 3600000);
  }

  async saveBuffer(buffer: Buffer, prefix: string = 'msg'): Promise<TempFileResult> {
    this.ensureTempDir();
    const ext = prefix === 'img' ? '.png' : prefix === 'vid' ? '.mp4' : '.tmp';
    const filename = ${prefix}_;
    const filepath = path.join(this.tempDir, filename);

    try {
      await fs.promises.writeFile(filepath, buffer);
      logger.info(Temp file saved:  (KB));
      return { success: true, filePath: filepath };
    } catch (error: any) {
      logger.error(Failed to save temp file: );
      return { success: false, error: error.message };
    }
  }

  async downloadToFile(url: string, prefix: string = 'download'): Promise<TempFileResult> {
    this.ensureTempDir();
    const ext = this.getFileExtension(url);
    const filename = ${prefix}_;
    const filepath = path.join(this.tempDir, filename);

    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      await fs.promises.writeFile(filepath, response.data);
      logger.info(File downloaded:  (KB));
      return { success: true, filePath: filepath };
    } catch (error: any) {
      logger.error(Failed to download file: );
      return { success: false, error: error.message };
    }
  }

  readFile(filePath: string): Buffer | null {
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(Temp file deleted: );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      const ttlMs = this.config.tempFileTtlHours * 3600000;
      let cleaned = 0;

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);

        if (now - stats.mtimeMs > ttlMs) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(Cleaned up  expired temp files);
      }
    } catch (error: any) {
      logger.error(Temp file cleanup error: );
    }
  }

  private getFileExtension(url: string): string {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'bmp'];
    return validExts.includes(ext) ? . : '.tmp';
  }
}

export const fileService = new FileService();
export default FileService;
