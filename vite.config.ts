import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  let localUrl = '';
  let localKey = '';
  for (const f of ['.env.local', '.env']) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
          const val = trimmed.substring('VITE_SUPABASE_URL='.length).trim();
          if (val.startsWith('https://')) localUrl = val;
        }
        if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
          const val = trimmed.substring('VITE_SUPABASE_ANON_KEY='.length).trim();
          if (val) localKey = val;
        }
      }
    }
    if (localUrl && localKey) break;
  }

  // Only resolve publishable public client credentials
  const supabaseUrl = (localUrl && localUrl.startsWith('https://'))
    ? localUrl
    : (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL.startsWith('https://')
      ? env.VITE_SUPABASE_URL
      : 'https://rqmgnewipgqgmvzpbrfn.supabase.co');

  const supabaseAnonKey = (localKey && !localKey.startsWith('sb_secret_'))
    ? localKey
    : (env.VITE_SUPABASE_ANON_KEY && !env.VITE_SUPABASE_ANON_KEY.startsWith('sb_secret_')
      ? env.VITE_SUPABASE_ANON_KEY
      : (process.env.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY.startsWith('sb_secret_')
        ? process.env.VITE_SUPABASE_ANON_KEY
        : ''));

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
