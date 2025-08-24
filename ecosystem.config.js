module.exports = {
  apps: [{
    name: 'bluesky-to-masto',
    script: './index.js',
    watch: false,
    autorestart: false,
    stop_exit_codes: [0],
    cron_restart: '*/5 * * * *' // кожні 5 хвилин
  }]
}