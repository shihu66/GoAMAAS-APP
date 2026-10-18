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

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
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
      if (cleanHost.endsWith('.amaas.xyz') && cleanHost !== 'app.amaas.xyz' && cleanHost !== 'amaas.xyz' && cleanHost !== 'www.amaas.xyz') {
        subdomain = cleanHost.replace('.amaas.xyz', '');
      } else if (cleanHost.endsWith('.localhost') && cleanHost !== 'localhost') {
        subdomain = cleanHost.replace('.localhost', '');
      }
    }

    subdomain = subdomain.trim().toLowerCase();

    // DNS label security validation
    if (!subdomain || subdomain === 'app' || subdomain === 'amaas' || subdomain === 'www' || !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(subdomain)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ found: false, error: 'Subdomain is invalid or reserved.' }));
      return;
    }

    // Resolve Supabase credentials
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseAnonKey) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ found: false, error: 'Service temporarily unavailable.' }));
      return;
    }

    // Call the hardened SECURITY DEFINER stored procedure
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

    // Fallback if stored procedure is not yet deployed
    const restUrl = `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=ilike.${encodeURIComponent(subdomain)}&deployment_status=eq.live&payment_status=eq.paid&status=in.(active,grace_period)&select=subdomain,business_name,niche,template_name,config,deployment_status,status`;
    const fallbackResp = await fetch(restUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (fallbackResp.ok) {
      const rows = (await fallbackResp.json()) as any[];
      if (rows && rows.length > 0) {
        const row = rows[0];
        const site = {
          subdomain: row.subdomain,
          fullDomainUrl: `${row.subdomain}.amaas.xyz`,
          businessName: row.business_name,
          niche: row.niche,
          nicheLabel: row.template_name || 'Business Storefront',
          templateId: row.config?.templateId || 'tpl-modern-business',
          templateName: row.template_name || 'Modern Executive',
          brandColor: row.config?.brandColor || '#2563EB',
          headline: row.config?.headline || 'Welcome to our official website',
          subheadline: row.config?.subheadline || 'Explore our catalog and connect with our team.',
          aboutText: row.config?.aboutText || '',
          phone: row.config?.phone || '',
          email: row.config?.email || '',
          address: row.config?.address || '',
          whatsappNumber: row.config?.whatsappNumber || row.config?.phone || '',
          servicesOrProducts: row.config?.servicesOrProducts || [],
          socialLinks: row.config?.socialLinks || {},
          deploymentStatus: row.deployment_status,
          status: row.status,
          sslStatus: 'active',
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        res.end(JSON.stringify({ found: true, subdomain, site }));
        return;
      }
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ found: false, subdomain, message: 'Website not found or is currently not published.' }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ found: false, error: 'Server error resolving tenant storefront.' }));
  }
}
