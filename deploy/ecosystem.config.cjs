/**
 * pm2 process file for the Vakeel Bhai API.
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 *
 * ONE instance on purpose: the background jobs (auto-confirm, checkout expiry) run inside the
 * API process, and the live updates (Socket.IO) keep rooms in memory. Scaling out needs a
 * Socket.IO adapter (Redis) and a single job runner first.
 */
module.exports = {
  apps: [
    {
      name: 'vakeelbhai-api',
      cwd: __dirname + '/../backend',
      script: 'src/server.js',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      kill_timeout: 12000,
      restart_delay: 3000,
      time: true,
      out_file: '/var/log/vakeelbhai/api.out.log',
      error_file: '/var/log/vakeelbhai/api.err.log',
      env: { NODE_ENV: 'production' },
    },
  ],
}
