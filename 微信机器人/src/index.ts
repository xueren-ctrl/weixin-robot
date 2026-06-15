import { WechatBot } from './bot/wechat-bot';
import { createApp } from './services/server';
import { loadConfig } from './config';
import logger from './config/logger';

const config = loadConfig();

async function main() {
  logger.info('===========================================');
  logger.info('  Agnes AI WeChat Bot v1.0.0');
  logger.info('===========================================');
  logger.info(Starting on port  (web) /  (api));
  logger.info(Puppet: );
  logger.info(Text Model: );
  logger.info(Image Model: );
  logger.info(Video Model: );
  logger.info('===========================================\n');

  // Create and start web server
  const app = createApp();

  const webServer = app.listen(config.port, () => {
    logger.info(Web server running on http://localhost:);
    logger.info(API available at http://localhost:/api);
  });

  // Create and start bot
  const bot = new WechatBot();

  const gracefulShutdown = async (signal: string) => {
    logger.info(\n received. Shutting down gracefully...);

    try {
      await bot.stop();
      logger.info('Bot stopped');
    } catch (error) {
      logger.error(Error stopping bot: );
    }

    webServer.close(() => {
      logger.info('Web server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Start bot after server is ready
  try {
    await bot.start();
  } catch (error: any) {
    logger.error(Failed to start bot: );
    logger.info('Attempting to start web server anyway...');
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});