import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getAgnesConfig } from '../config';
import logger from '../config/logger';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  tokensUsed?: number;
}

class AgnesClient {
  private client: AxiosInstance;
  private config = getAgnesConfig();

  constructor() {
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: Bearer ,
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers.Authorization = Bearer ;
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error) => {
        const message = error.response?.data?.error?.message || error.message;
        logger.error(Agnes API Error: );
        return Promise.reject(error);
      },
    );
  }

  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
    maxRetries: number = this.config.retries,
  ): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.request<{
          choices?: Array<{ message?: { content?: string } }>;
          data?: Array<{ url?: string; b64_json?: string }>;
          error?: { message?: string; code?: number };
          status?: string;
          result?: any;
          usage?: any;
          [key: string]: any;
        }>(config);

        const body = response.data;

        // Check for API errors
        if (body.error) {
          return {
            success: false,
            error: body.error.message || 'Unknown API error',
            statusCode: response.status,
          };
        }

        return {
          success: true,
          data: body as T,
          statusCode: response.status,
          tokensUsed: body.usage?.total_tokens,
        };
      } catch (error: any) {
        lastError = error;

        if (error.response?.status >= 500 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(Agnes API retry / after ms);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    };
  }

  // Text Generation
  async generateText(
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ): Promise<ApiResponse<string>> {
    const modelName = model || this.config.textModel;

    const response = await this.requestWithRetry<{
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    }>({
      method: 'POST',
      url: '/chat/completions',
      data: {
        model: modelName,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      },
    });

    if (response.success && response.data?.choices?.[0]?.message?.content) {
      return {
        success: true,
        data: response.data.choices[0].message.content,
        tokensUsed: response.data.usage?.total_tokens,
      };
    }

    return {
      success: false,
      error: response.error || 'No response from text model',
    };
  }

  // Image Generation
  async generateImage(prompt: string, model?: string): Promise<ApiResponse<{ url: string }>> {
    const modelName = model || this.config.imageModel;

    const response = await this.requestWithRetry<{
      data: Array<{ url: string; b64_json?: string }>;
    }>({
      method: 'POST',
      url: '/images/generations',
      data: {
        model: modelName,
        prompt,
        size: '1024x1024',
        n: 1,
      },
    });

    if (response.success && response.data?.data?.[0]) {
      return {
        success: true,
        data: { url: response.data.data[0].url || '' },
      };
    }

    return {
      success: false,
      error: response.error || 'No response from image model',
    };
  }

  // Video Generation (async)
  async createVideoTask(prompt: string, model?: string): Promise<ApiResponse<{ taskId: string }>> {
    const modelName = model || this.config.videoModel;

    const response = await this.requestWithRetry<{
      id: string;
      status: string;
    }>({
      method: 'POST',
      url: '/videos/generations',
      data: {
        model: modelName,
        prompt,
        duration: 10,
      },
    });

    if (response.success && response.data?.id) {
      return {
        success: true,
        data: { taskId: response.data.id },
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to create video task',
    };
  }

  async getVideoStatus(taskId: string): Promise<ApiResponse<{ status: string; resultUrl?: string }>> {
    const response = await this.requestWithRetry<{
      id: string;
      status: string;
      result?: { url?: string };
    }>({
      method: 'GET',
      url: /videos/generations/,
    });

    if (response.success && response.data) {
      return {
        success: true,
        data: {
          status: response.data.status,
          resultUrl: response.data.result?.url,
        },
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to get video status',
    };
  }

  // Model info
  async listModels(): Promise<ApiResponse<Array<{ id: string; name: string }>>> {
    const response = await this.requestWithRetry<Array<{ id: string; name: string }>>({
      method: 'GET',
      url: '/models',
    });

    return {
      success: response.success,
      data: response.data,
      error: response.error,
    };
  }
}

export const agnesClient = new AgnesClient();
export default AgnesClient;
