/**
 * PM2 — Landing WCA (Hostinger VPS)
 *
 * Uso no servidor (na pasta do projeto, após npm ci ou npm install):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Se a porta 3017 já estiver ocupada: pm2 stop <nome-do-app-antigo>
 * ou altere PORT no env abaixo e no nginx.
 */
module.exports = {
  apps: [
    {
      name: "wca-landing",
      cwd: __dirname,
      script: "node_modules/serve/build/main.js",
      args: ["-l", "tcp://0.0.0.0:3017", "--no-clipboard", "."],
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PORT: "3017",
      },
    },
  ],
};
