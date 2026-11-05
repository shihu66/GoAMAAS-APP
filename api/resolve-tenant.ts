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
      res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      res.end(JSON.stringify({ found: false, error: 'Subdomain is invalid or reserved.' }));
      return;
    }

    // Resolve Supabase credentials strictly from environment variables (no hardcoded project URL fallback)
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    ).trim();
    const supabaseAnonKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ''
    ).trim();

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
      res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      res.end(JSON.stringify({ found: false, error: 'Service temporarily unavailable.' }));
      return;
    }

    // Call the hardened SECURITY DEFINER stored procedure (never query subscribed_websites directly as anon)
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/get_published_website_by_subdomain`;
    const rpcHeaders: Record<string, string> = {
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json',
    };
    if (!supabaseAnonKey.startsWith('sb_publishable_')) {
      rpcHeaders['Authorization'] = `Bearer ${supabaseAnonKey}`;
    }

    const rpcResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({ p_subdomain: subdomain }),
    });

    if (rpcResp.ok) {
      const rpcJson = (await rpcResp.json()) as any;
      if (rpcJson && rpcJson.found && rpcJson.site) {
        const site = rpcJson.site;
        const subStatus = String(site.subscriptionStatus || site.status || '');
        const payStatus = String(site.paymentStatus || site.payment_status || '');
        const depStatus = String(site.deploymentStatus || site.deployment_status || '');
        const periodEndRaw = site.currentPeriodEnd || site.current_period_end || '';
        const periodEndMs = periodEndRaw ? Date.parse(String(periodEndRaw)) : NaN;
        const nowMs = Date.now();

        // Enforce strict 30-day active subscription cutoff:
        // Reject grace_period, past_due, suspended, cancelled, draft, unpaid, non-live, or timestamp-expired sites.
        const isExpiredOrGrace =
          subStatus === 'grace_period' ||
          subStatus === 'past_due' ||
          (Number.isFinite(periodEndMs) && periodEndMs <= nowMs);

        if (
          isExpiredOrGrace ||
          subStatus !== 'active' ||
          (payStatus !== '' && payStatus !== 'paid') ||
          depStatus !== 'live'
        ) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
          res.end(
            JSON.stringify({
              found: false,
              expired: isExpiredOrGrace,
              subdomain,
              message: isExpiredOrGrace
                ? 'This website is currently unavailable because its 30-day subscription has expired.'
                : 'Website not found or is currently not published.',
            })
          );
          return;
        }

        // Hydrate public visual builder fields from top-level RPC payload or __storefrontMeta fallback
        const rawSocials =
          site.socialLinks && typeof site.socialLinks === 'object' && !Array.isArray(site.socialLinks)
            ? (site.socialLinks as Record<string, any>)
            : {};
        const meta =
          rawSocials.__storefrontMeta &&
          typeof rawSocials.__storefrontMeta === 'object' &&
          !Array.isArray(rawSocials.__storefrontMeta)
            ? (rawSocials.__storefrontMeta as Record<string, any>)
            : {};

        const cleanSocialLinks: Record<string, string> = {};
        for (const k of ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube']) {
          if (typeof rawSocials[k] === 'string' && rawSocials[k].trim()) {
            cleanSocialLinks[k] = rawSocials[k].trim();
          }
        }

        const pickText = (field: string): string | undefined => {
          if (typeof site[field] === 'string' && site[field].trim()) return site[field].trim();
          if (site[field] === '') return undefined;
          if (typeof meta[field] === 'string' && meta[field].trim()) return meta[field].trim();
          return undefined;
        };

        const hydratedSite = {
          ...site,
          heroImageUrl: pickText('heroImageUrl'),
          heroCtaText: pickText('heroCtaText'),
          heroCtaLink: pickText('heroCtaLink'),
          secondaryCtaText: pickText('secondaryCtaText'),
          secondaryCtaLink: pickText('secondaryCtaLink'),
          bannerImageUrl: pickText('bannerImageUrl'),
          bannerTitle: pickText('bannerTitle'),
          bannerSubtitle: pickText('bannerSubtitle'),
          bannerCtaText: pickText('bannerCtaText'),
          bannerCtaLink: pickText('bannerCtaLink'),
          customDomain: pickText('customDomain'),
          nicheLabel: pickText('nicheLabel') || site.templateName || 'Business Storefront',
          customLinks: Array.isArray(site.customLinks)
            ? site.customLinks
            : Array.isArray(meta.customLinks)
            ? meta.customLinks
            : [],
          sections: Array.isArray(site.sections)
            ? site.sections
            : Array.isArray(meta.sections)
            ? meta.sections
            : undefined,
          themeSettings:
            site.themeSettings && typeof site.themeSettings === 'object'
              ? site.themeSettings
              : meta.themeSettings && typeof meta.themeSettings === 'object'
              ? meta.themeSettings
              : undefined,
          servicesOrProducts: Array.isArray(site.servicesOrProducts)
            ? site.servicesOrProducts.filter((item: any) => item && item.isVisible !== false)
            : [],
          socialLinks: cleanSocialLinks,
        };

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
        res.end(JSON.stringify({ found: true, subdomain, site: hydratedSite }));
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      res.end(JSON.stringify({ found: false, subdomain, message: 'Website not found or is currently not published.' }));
      return;
    }

    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    res.end(JSON.stringify({ found: false, error: 'Unable to resolve storefront at this time.' }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    res.end(JSON.stringify({ found: false, error: 'Server error resolving tenant storefront.' }));
  }
}
