import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
const gitRef = (process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '').trim().toLowerCase();

const isProductionBranch = vercelEnv === 'production' || gitRef === 'main';
const hasStagingEnvFile = fs.existsSync(path.resolve(process.cwd(), '.env.staging'));
const hasStagingConfigJson = fs.existsSync(path.resolve(process.cwd(), 'staging.config.json'));

const useStagingMode =
  !isProductionBranch &&
  (gitRef === 'staging' ||
    gitRef.startsWith('staging') ||
    gitRef.startsWith('stage') ||
    hasStagingEnvFile ||
    hasStagingConfigJson);

const viteBinJs = path.resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
const useDirectNodeVite = fs.existsSync(viteBinJs);

const args = useDirectNodeVite ? [viteBinJs, 'build'] : ['vite', 'build'];
if (useStagingMode) {
  args.push('--mode', 'staging');
}

console.log(
  `[vercel-build] Running: ${useDirectNodeVite ? 'node node_modules/vite/bin/vite.js' : 'npx vite'} ${args.slice(1).join(' ')} (VERCEL_ENV=${vercelEnv || 'unset'}, VERCEL_GIT_COMMIT_REF=${gitRef || 'unset'}, hasStagingEnvFile=${hasStagingEnvFile}, hasStagingConfigJson=${hasStagingConfigJson})`
);

const result = spawnSync(useDirectNodeVite ? process.execPath : 'npx', args, {
  stdio: 'inherit',
  shell: !useDirectNodeVite && process.platform === 'win32',
});

process.exit(result.status ?? 1);
