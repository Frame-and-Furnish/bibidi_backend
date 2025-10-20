module.exports = {
  apps: [
    {
      name: 'bibidi-backend',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
      // Logging
      error_file: '/var/log/bibidi-backend/error.log',
      out_file: '/var/log/bibidi-backend/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process management
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 4000,
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Advanced features
      min_uptime: '10s',
      max_restarts: 10,
      
      // Environment file
      env_file: '.env',
    },
  ],
};
