module.exports = {
  apps: [
    {
      name: 'wechat-ai-bot',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      cron_restart: '0 4 * * *',
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};