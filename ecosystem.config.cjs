module.exports = {
  apps: [
    {
      name: "sisera-api",
      script: "apps/api/dist/server.js",
      cwd: "/opt/sisera",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: "/opt/sisera/.env.production",
      env: {
        NODE_ENV: "production",
        API_PORT: "4000",
      },
      env_production: {
        NODE_ENV: "production",
        API_PORT: "4000",
      },
    },
    {
      name: "sisera-web",
      script: "apps/web/node_modules/next/dist/bin/next",
      args: "start apps/web -p 9000",
      cwd: "/opt/sisera",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      env_file: "/opt/sisera/.env.production",
      env: {
        NODE_ENV: "production",
        PORT: "9000",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "9000",
      },
    },
  ],
};
