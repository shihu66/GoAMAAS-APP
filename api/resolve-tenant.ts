import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithQuery extends IncomingMessage {
  query?: Record<string, string>;
  url?: string;
}

export default async function handler(req: RequestWithQuery, res: ServerResponse) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Host, X-Forwarded-Host');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ found: false, error: 'Method not allowed.' }));
    return;
  }

  try {
    const hostHeader = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
    const cleanHost = hostHeader.split(':')[0].toLowerCase();

    // Parse URL search params
    const requestUrl = req.url || '/';
    const parsedUrl = new URL(requestUrl, `http://${cleanHost}`);
    let subdomain = parsedUrl.searchParams.get('subdomain') || '';

    // If subdomain not explicitly in query, infer from hostname
    if (!subdomain) {
      if (cleanHost.endsWith('.amaas.xyz') && cleanHost !== 'amaas.xyz') {
        subdomain = cleanHost.slice(0, -'.amaas.xyz'.length);
      } else if (cleanHost.endsWith('.localhost') && cleanHost !== 'localhost') {
        subdomain = cleanHost.slice(0, -'.localhost'.length);
      }
    }

    subdomain = subdomain.trim().toLowerCase();

    const RESERVED_SUBDOMAINS = new Set([
      'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
      'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
      'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
      'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
      'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
      'testing', 'webhook', 'webhooks', 'www',
    ]);

    // Strict single-label DNS validation (3-30 chars, alphanumeric + internal hyphens, no punycode or reserved names)
    if (
      !subdomain ||
      subdomain.length < 3 ||
      subdomain.length > 30 ||
      subdomain.includes('.') ||
      subdomain.startsWith('xn--') ||
      RESERVED_SUBDOMAINS.has(subdomain) ||
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)
    ) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ found: false, error: 'Subdomain is invalid or reserved.' }));
      return;
    }

    // Resolve Supabase credentials strictly from environment variables (no hardcoded project URL fallback)
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

    let credentialsValid =
      Boolean(supabaseUrl) &&
      supabaseUrl.startsWith('https://') &&
      supabaseUrl !== 'https://your-project.supabase.co' &&
      Boolean(supabaseAnonKey) &&
      supabaseAnonKey !== 'your-anon-key-here' &&
      supabaseAnonKey !== 'your-anon-key' &&
      !supabaseAnonKey.startsWith('sb_secret_');

    if (credentialsValid) {
      try {
        const parsedHost = new URL(supabaseUrl).hostname;
        const hostMatch = parsedHost.match(/^([a-z0-9-]+)\.supabase\.co$/i);
        const urlRef = hostMatch ? hostMatch[1].toLowerCase() : '';
        const parts = supabaseAnonKey.split('.');
        if (parts.length === 3) {
          const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (claims?.role === 'service_role') {
            credentialsValid = false;
          } else if (typeof claims?.ref === 'string' && urlRef && claims.ref.trim().toLowerCase() !== urlRef) {
            credentialsValid = false;
          }
        }
      } catch {
        credentialsValid = false;
      }
    }

    if (!credentialsValid) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ found: false, error: 'Service temporarily unavailable.' }));
      return;
    }

    // Call the hardened SECURITY DEFINER stored procedure (never query subscribed_websites directly as anon)
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/get_published_website_by_subdomain`;
    const rpcResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_subdomain: subdomain }),
    });

    if (rpcResp.ok) {
      const rpcJson = (await rpcResp.json()) as any;
      if (rpcJson && rpcJson.found && rpcJson.site) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        res.end(JSON.stringify({ found: true, subdomain, site: rpcJson.site }));
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      res.end(JSON.stringify({ found: false, subdomain, message: 'Website not found or is currently not published.' }));
      return;
    }

    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ found: false, error: 'Unable to resolve storefront at this time.' }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ found: false, error: 'Server error resolving tenant storefront.' }));
  }
}
