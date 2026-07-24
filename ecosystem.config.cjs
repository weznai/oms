// PM2 进程管理配置 - 运营管理平台
// 启动: pm2 start ecosystem.config.cjs
// 重启: pm2 restart oss-ops
// 停止: pm2 stop oss-ops
// 日志: pm2 logs oss-ops
module.exports = {
  apps: [
    {
      name: 'oss-ops',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '1G',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
