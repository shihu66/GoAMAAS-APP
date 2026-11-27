import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import resolveTenantHandler from './api/resolve-tenant.ts';
import verifyPricingHandler from './api/verify-pricing.ts';
import publicOrderHandler from './api/public-order.ts';
import publicInquiryHandler from './api/public-inquiry.ts';
import customerPortalHandler from './api/customer-portal.ts';
import adminWebsiteActionHandler from './api/admin-website-action.ts';
import adminDiagnosticHandler from './api/admin-diagnostic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function detectGitBranchName(): string {
  try {
    const ref = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    })
      .toString()
      .trim()
      .toLowerCase();
    if (ref && ref !== 'head') return ref;

    const decorations = execSync('git log -1 --format=%D', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    })
      .toString()
      .toLowerCase();
    if (/\b(origin\/)?staging\b/.test(decorations)) return 'staging';
    if (/\b(origin\/)?main\b/.test(decorations)) return 'main';
  } catch {
    // Ignore when .git metadata is unavailable
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const envGitBranch = (process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '').trim().toLowerCase();
  const detectedGitBranch = envGitBranch || detectGitBranchName();
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const explicitEnv = (process.env.VITE_SUPABASE_ENV || '').trim().toLowerCase();
  const isVercelBuild = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);
  const hasStagingEnvFile = fs.existsSync(path.resolve(process.cwd(), '.env.staging'));

  const isMainOrProduction = vercelEnv === 'production' || detectedGitBranch === 'main';

  // Staging detection:
  // 1. Vite mode is explicitly 'staging' (e.g. npm run build:staging / npm run dev:staging / scripts/vercel-build.mjs)
  // 2. VITE_SUPABASE_ENV is set to 'staging'
  // 3. Git branch (via VERCEL_GIT_COMMIT_REF, GIT_BRANCH, or git metadata) is 'staging' (or starts with staging/stage)
  // 4. Vercel preview/non-production build where .env.staging is tracked on the staging branch
  const isStaging =
    !isMainOrProduction &&
    (mode === 'staging' ||
      explicitEnv === 'staging' ||
      detectedGitBranch === 'staging' ||
      detectedGitBranch.startsWith('staging') ||
      detectedGitBranch.startsWith('stage') ||
      (isVercelBuild && hasStagingEnvFile));

  const effectiveMode = isStaging ? 'staging' : mode;
  const env = loadEnv(effectiveMode, process.cwd(), '');

  // Separate environment file scan order:
  // If Staging: prioritize .env.staging.local and .env.staging
  // If Production/main: strictly avoid .env.staging to protect Production from bleed-through
  const envFilesToScan = isStaging
    ? ['.env.staging.local', '.env.staging', '.env.local', '.env']
    : ['.env.production.local', '.env.production', '.env.local', '.env'];

  let localUrl = '';
  let localKey = '';
  let localEnv = isStaging ? 'staging' : '';
  let localServiceRoleKey = '';

  for (const f of envFilesToScan) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
          const val = trimmed.substring('VITE_SUPABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
          if (val.startsWith('https://')) localUrl = val;
        }
        if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
          const val = trimmed.substring('VITE_SUPABASE_ANON_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val) localKey = val;
        }
        if (trimmed.startsWith('VITE_SUPABASE_ENV=')) {
          const val = trimmed.substring('VITE_SUPABASE_ENV='.length).trim().replace(/^["']|["']$/g, '');
          if (val) localEnv = val;
        }
        if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
          const val = trimmed.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val) localServiceRoleKey = val;
        }
      }
    }
    if (localUrl && localKey) break;
  }

  // Server-only environment hydration for /api/* handlers (NEVER injected into Vite define / client bundle)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && (env.SUPABASE_SERVICE_ROLE_KEY || localServiceRoleKey)) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || localServiceRoleKey).trim();
  }

  // Strictly resolve configured public client credentials:
  // In Staging mode, .env.staging values take precedence over any inherited non-staging process.env overrides
  // so Vercel shared/production env vars cannot hijack staging builds.
  const processUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const processKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const processPointsToStaging = processUrl.includes('umiheyukaddfaupsyooh');

  const rawUrl = isStaging
    ? (processPointsToStaging ? processUrl : '') || localUrl || env.VITE_SUPABASE_URL || ''
    : processUrl || env.VITE_SUPABASE_URL || localUrl || '';
  const supabaseUrl =
    rawUrl.trim().startsWith('https://') && rawUrl.trim() !== 'https://your-project.supabase.co'
      ? rawUrl.trim()
      : '';

  const rawKey = isStaging
    ? (processPointsToStaging && processKey ? processKey : '') || localKey || env.VITE_SUPABASE_ANON_KEY || ''
    : processKey || env.VITE_SUPABASE_ANON_KEY || localKey || '';
  const supabaseAnonKey =
    rawKey.trim() && !rawKey.trim().startsWith('sb_secret_')
      ? rawKey.trim()
      : '';

  const supabaseEnv = (
    isStaging
      ? 'staging'
      : (process.env.VITE_SUPABASE_ENV || env.VITE_SUPABASE_ENV || localEnv || '')
  ).trim();

  const resolveTenantApiPlugin = {
    name: 'goamaas-resolve-tenant-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/api/resolve-tenant') {
          try {
            await resolveTenantHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ found: false, error: 'Server error resolving tenant storefront.' }));
          }
          return;
        }
        if (pathname === '/api/verify-pricing') {
          try {
            await verifyPricingHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INTERNAL_PRICING_VERIFICATION_ERROR',
                error: 'Server error verifying active service pricing.',
              })
            );
          }
          return;
        }
        if (pathname === '/api/public-order') {
          try {
            await publicOrderHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INTERNAL_ORDER_ERROR',
                error: 'Server error processing public storefront order.',
              })
            );
          }
          return;
        }
        if (pathname === '/api/public-inquiry') {
          try {
            await publicInquiryHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INTERNAL_INQUIRY_ERROR',
                error: 'Server error processing public website inquiry.',
              })
            );
          }
          return;
        }
        if (pathname === '/api/customer-portal') {
          try {
            await customerPortalHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INTERNAL_PORTAL_ERROR',
                error: 'Server error handling customer portal request.',
              })
            );
          }
          return;
        }
        if (pathname === '/api/admin-website-action') {
          try {
            await adminWebsiteActionHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                success: false,
                code: 'INTERNAL_ADMIN_ACTION_ERROR',
                error: 'Server error handling administrative website action.',
              })
            );
          }
          return;
        }
        if (pathname === '/api/admin-diagnostic') {
          try {
            await adminDiagnosticHandler(req, res);
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INTERNAL_DIAGNOSTIC_ERROR',
                error: 'Server error handling admin diagnostic.',
              })
            );
          }
          return;
        }
        // Prevent dev server & pre-warmer from transforming or bundling Node-only configs, test scripts, SQL migrations, or raw API files
        if (
          pathname === '/vite.config.ts' ||
          pathname === '/tsconfig.json' ||
          pathname === '/package.json' ||
          pathname === '/vercel.json' ||
          pathname === '/metadata.json' ||
          pathname === '/bunfig.toml' ||
          pathname.startsWith('/.env') ||
          pathname.startsWith('/scripts/') ||
          pathname.startsWith('/supabase/') ||
          pathname.startsWith('/api/')
        ) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
          res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
        } else if (pathname === '/admin-sw.js') {
          res.setHeader('Service-Worker-Allowed', '/admin');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        } else if (pathname === '/admin-manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
        return next();
      });
    },
  };

  return {
    plugins: [resolveTenantApiPlugin, react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_SUPABASE_ENV': JSON.stringify(supabaseEnv),
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-router-dom',
        'lucide-react',
        'recharts',
        '@supabase/supabase-js',
      ],
      exclude: ['@electric-sql/pglite', 'vite', '@tailwindcss/vite', '@vitejs/plugin-react'],
    },
    build: {
      sourcemap: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: ['**/scripts/**', '**/supabase/**'],
            },
    },
    preview: {
      allowedHosts: true,
    },
  };
});
