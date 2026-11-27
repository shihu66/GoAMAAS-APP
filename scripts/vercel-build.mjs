import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
const gitRef = (process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '').trim().toLowerCase();

const isProductionBranch = vercelEnv === 'production' || gitRef === 'main';
const hasStagingEnvFile = fs.existsSync(path.resolve(process.cwd(), '.env.staging'));

const useStagingMode = !isProductionBranch && (gitRef === 'staging' || gitRef.startsWith('staging') || hasStagingEnvFile);

const args = ['vite', 'build'];
if (useStagingMode) {
  args.push('--mode', 'staging');
}

console.log(
  `[vercel-build] Running: npx ${args.join(' ')} (VERCEL_ENV=${vercelEnv || 'unset'}, VERCEL_GIT_COMMIT_REF=${gitRef || 'unset'}, hasStagingEnvFile=${hasStagingEnvFile})`
);

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
