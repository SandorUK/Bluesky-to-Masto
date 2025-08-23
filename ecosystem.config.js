module.exports = {
  apps: [{
    name: 'bluesky-to-masto',
    script: './index.js',
    watch: false,
    cron_restart: '*/5 * * * *' // кожні 5 хвилин
  }]
}