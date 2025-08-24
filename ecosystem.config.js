// ecosystem.config.js
export default {
  apps: [{
    name: 'bluesky-to-masto',
    script: './index.js',
    cron_restart: '*/5 * * * *',
    stop_exit_codes: [0],
    autorestart: false
  }]
};