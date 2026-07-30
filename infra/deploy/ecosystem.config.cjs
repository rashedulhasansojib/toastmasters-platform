// pm2 process definitions for the production server.
//
//   pm2 startOrReload infra/deploy/ecosystem.config.cjs --update-env
//
// There are NO secrets here. Every process inherits the environment of the
// shell that ran pm2, and `infra/deploy/deploy.sh` sources the repo-root `.env`
// before reloading — so the server's `.env` stays the single source of truth
// and `--update-env` is what makes an env change take effect.
//
// Run from the repo root (deploy.sh does). Paths below are absolute, resolved
// from this file, so pm2's own cwd doesn't matter.
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

// Optional knobs, read from the server's `.env` (not app config — these are not
// in the packages/config Zod schema). Defaults suit a single small VPS.
const apiInstances = Number(process.env.API_INSTANCES ?? 1);
const dashboardPort = process.env.DASHBOARD_PORT ?? '3000';

const common = {
  autorestart: true,
  // NestJS calls enableShutdownHooks(); give it room to drain in-flight work
  // and close the Prisma/Redis connections before pm2 SIGKILLs.
  kill_timeout: 10_000,
  max_restarts: 10,
  restart_delay: 2_000,
  env: {
    NODE_ENV: 'production',
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'tm-api',
      cwd: path.join(root, 'apps', 'api'),
      script: path.join(root, 'apps', 'api', 'dist', 'main.js'),
      // Cluster mode only when there is more than one instance — with 2+ a
      // `pm2 reload` rolls them one at a time, so the API never goes down
      // mid-deploy. Set API_INSTANCES=2 in the server's .env once the box has
      // the memory for it.
      exec_mode: apiInstances > 1 ? 'cluster' : 'fork',
      instances: apiInstances,
      max_memory_restart: '512M',
    },
    {
      ...common,
      name: 'tm-worker',
      cwd: path.join(root, 'apps', 'worker'),
      script: path.join(root, 'apps', 'worker', 'dist', 'main.js'),
      // Single instance, deliberately: BullMQ repeatable/scheduled jobs (the
      // 1-July rollover, snapshots, digests) should have exactly one scheduler.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '384M',
    },
    {
      ...common,
      name: 'tm-dashboard',
      cwd: path.join(root, 'apps', 'dashboard'),
      // `next start` via its own bin — pm2 runs it under node directly rather
      // than through pnpm, so signals reach the real process.
      script: path.join(root, 'apps', 'dashboard', 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: `start --port ${dashboardPort}`,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
    },
  ],
};
