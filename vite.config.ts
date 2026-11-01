import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import resolveTenantHandler from './api/resolve-tenant.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  let localUrl = '';
  let localKey = '';
  let localEnv = '';
  for (const f of ['.env.local', '.env']) {
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
      }
    }
    if (localUrl && localKey) break;
  }

  // Strictly resolve configured public client credentials (process.env > Vite mode env > local .env fallback)
  const rawUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || localUrl || '';
  const supabaseUrl =
    rawUrl.trim().startsWith('https://') && rawUrl.trim() !== 'https://your-project.supabase.co'
      ? rawUrl.trim()
      : '';

  const rawKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || localKey || '';
  const supabaseAnonKey =
    rawKey.trim() && !rawKey.trim().startsWith('sb_secret_')
      ? rawKey.trim()
      : '';

  const supabaseEnv = (process.env.VITE_SUPABASE_ENV || env.VITE_SUPABASE_ENV || localEnv || '').trim();

  const resolveTenantApiPlugin = {
    name: 'goamaas-resolve-tenant-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
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
