import { loadConfig } from '../config';

export function maskPhoneNumber(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '****');
}

export function maskWxid(wxid: string): string {
  if (!wxid || wxid.length < 8) return wxid;
  return wxid.substring(0, 4) + '****' + wxid.substring(wxid.length - 4);
}

export function maskApikey(key: string): string {
  if (!key || key.length < 10) return key.substring(0, 4);
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getTimestamp(): string {
  return new Date().toISOString();
}

export function getHumanTimestamp(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString('zh-CN');
}