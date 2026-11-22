import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithQuery extends IncomingMessage {
  query?: Record<string, string>;
  url?: string;
}

const ALLOWED_EXACT_ORIGINS = new Set([
  'https://amaas.xyz',
  'https://www.amaas.xyz',
  'https://app.amaas.xyz',
]);

const CORS_RESERVED_SUBDOMAINS = new Set([
  'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
  'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
  'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
  'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
  'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
  'testing', 'webhook', 'webhooks', 'www',
]);

function isAllowedCorsOrigin(originRaw: string): boolean {
  const origin = String(originRaw || '').trim();
  if (!origin) return false;
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && host.endsWith('.amaas.xyz')) {
      const sub = host.slice(0, -'.amaas.xyz'.length);
      if (
        sub.length >= 3 &&
        sub.length <= 30 &&
        !sub.includes('.') &&
        !sub.startsWith('xn--') &&
        !CORS_RESERVED_SUBDOMAINS.has(sub) &&
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)
      ) {
        return true;
      }
    }
    const envAppUrl = String(process.env.APP_URL || '').trim();
    if (envAppUrl) {
      try {
        if (new URL(envAppUrl).origin === parsed.origin) return true;
      } catch {}
    }
    const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (!isProd && parsed.protocol === 'http:') {
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: IncomingMessage): string {
  const rawVercel = String(req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (rawVercel) return rawVercel.slice(0, 64);
  const rawCf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (rawCf) return rawCf.slice(0, 64);
  const rawReal = String(req.headers['x-real-ip'] || '').trim();
  if (rawReal) return rawReal.slice(0, 64);
  const rawFwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (rawFwd) return rawFwd.slice(0, 64);
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

async function checkRateLimit(scope: string, ip: string, maxReq: number, windowSec: number): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const bucketKey = `rl:${scope}:${ip}`;
  const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const upstashToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (upstashUrl.startsWith('https://') && upstashToken) {
    try {
      const resp = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', bucketKey], ['EXPIRE', bucketKey, String(windowSec), 'NX'], ['TTL', bucketKey]]),
      });
      if (resp.ok) {
        const resArr = (await resp.json()) as Array<{ result?: number }>;
        const count = Number(resArr?.[0]?.result || 0);
        const ttl = Math.max(1, Number(resArr?.[2]?.result || windowSec));
        if (count > 0) return { allowed: count <= maxReq, retryAfterSec: ttl };
      }
    } catch {}
  }

  const now = Date.now();
  const windowMs = windowSec * 1000;
  if (RATE_LIMIT_BUCKETS.size >= 5000) {
    for (const [k, v] of RATE_LIMIT_BUCKETS.entries()) {
      if (v.resetAt <= now) RATE_LIMIT_BUCKETS.delete(k);
    }
    if (RATE_LIMIT_BUCKETS.size >= 5000) {
      const oldestKey = RATE_LIMIT_BUCKETS.keys().next().value;
      if (oldestKey) RATE_LIMIT_BUCKETS.delete(oldestKey);
    }
  }
  const existing = RATE_LIMIT_BUCKETS.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    RATE_LIMIT_BUCKETS.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: windowSec };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= maxReq,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export default async function handler(req: RequestWithQuery, res: ServerResponse) {
  const originHeader = String(req.headers.origin || '').trim();
  const originAllowed = originHeader ? isAllowedCorsOrigin(originHeader) : false;
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin, Host, X-Forwarded-Host');

  if (req.method === 'OPTIONS') {
    if (originHeader && !originAllowed) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ found: false, code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin not allowed.' }));
      return;
    }
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

  const rl = await checkRateLimit('resolve-tenant', getClientIp(req), 120, 60);
  if (!rl.allowed) {
    res.statusCode = 429;
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    res.end(JSON.stringify({ found: false, code: 'RATE_LIMITED', error: 'Too many requests. Please slow down.' }));
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

        let hydratedSite: Record<string, any> = {
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

        // Optional read-only server enrichment using SUPABASE_SERVICE_ROLE_KEY (for 20261029 slim RPC + live stock)
        const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let serviceKeyValid = Boolean(serviceRoleKey);
        if (serviceKeyValid && !serviceRoleKey.startsWith('sb_secret_')) {
          try {
            const urlRefMatch = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
            const expectedRef = urlRefMatch ? urlRefMatch[1].toLowerCase() : '';
            const jwtParts = serviceRoleKey.split('.');
            if (jwtParts.length === 3) {
              const claims = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
              if (claims?.role && claims.role !== 'service_role') serviceKeyValid = false;
              if (claims?.ref && expectedRef && String(claims.ref).toLowerCase() !== expectedRef) {
                serviceKeyValid = false;
              }
            }
          } catch {
            serviceKeyValid = false;
          }
        }

        if (serviceKeyValid) {
          try {
            const adminHeaders: Record<string, string> = {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            };
            const selectCols = 'id,store_id,user_id,status,payment_status,deployment_status,current_period_end,config';
            let rowResp = await fetch(
              `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=eq.${encodeURIComponent(subdomain)}&select=${selectCols}&limit=1`,
              { method: 'GET', headers: adminHeaders }
            );
            let rows = rowResp.ok ? ((await rowResp.json()) as any[]) : null;
            if (rowResp.ok && Array.isArray(rows) && rows.length === 0) {
              rowResp = await fetch(
                `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=ilike.${encodeURIComponent(subdomain)}&select=${selectCols}&limit=1`,
                { method: 'GET', headers: adminHeaders }
              );
              rows = rowResp.ok ? ((await rowResp.json()) as any[]) : null;
            }
            if (rowResp.ok && Array.isArray(rows)) {
              const siteRow = rows[0] || null;
              if (siteRow) {
                const rowPeriodEnd = siteRow.current_period_end
                  ? Date.parse(String(siteRow.current_period_end))
                  : NaN;
                const rowExpired =
                  siteRow.status === 'grace_period' ||
                  siteRow.status === 'past_due' ||
                  (Number.isFinite(rowPeriodEnd) && rowPeriodEnd <= Date.now());
                if (
                  rowExpired ||
                  siteRow.status !== 'active' ||
                  siteRow.payment_status !== 'paid' ||
                  siteRow.deployment_status !== 'live'
                ) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
                  res.end(
                    JSON.stringify({
                      found: false,
                      expired: rowExpired,
                      subdomain,
                      message: rowExpired
                        ? 'This website is currently unavailable because its 30-day subscription has expired.'
                        : 'Website not found or is currently not published.',
                    })
                  );
                  return;
                }

                const resolvedWebsiteId = uuidRe.test(String(siteRow.id || '').trim())
                  ? String(siteRow.id).trim()
                  : hydratedSite.id;
                const siteOwnerUserId = String(siteRow.user_id || '').trim();
                const candidateStoreId = uuidRe.test(String(siteRow.store_id || '').trim())
                  ? String(siteRow.store_id).trim()
                  : String(hydratedSite.storeId || hydratedSite.store_id || '').trim();

                let resolvedStoreId = '';
                if (uuidRe.test(siteOwnerUserId)) {
                  if (uuidRe.test(candidateStoreId)) {
                    const verifyStoreResp = await fetch(
                      `${supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(candidateStoreId)}&select=id,owner_id&limit=1`,
                      { method: 'GET', headers: adminHeaders }
                    );
                    if (verifyStoreResp.ok) {
                      const matchedStores = (await verifyStoreResp.json()) as any[];
                      const matched = Array.isArray(matchedStores) ? matchedStores[0] : null;
                      if (matched && uuidRe.test(String(matched.id || '').trim())) {
                        const matchedOwner = String(matched.owner_id || '').trim();
                        if (!uuidRe.test(matchedOwner) || matchedOwner === siteOwnerUserId) {
                          resolvedStoreId = String(matched.id).trim();
                        } else {
                          const memberResp = await fetch(
                            `${supabaseUrl}/rest/v1/store_members?store_id=eq.${encodeURIComponent(candidateStoreId)}&user_id=eq.${encodeURIComponent(siteOwnerUserId)}&status=eq.active&select=id&limit=1`,
                            { method: 'GET', headers: adminHeaders }
                          );
                          if (memberResp.ok) {
                            const members = (await memberResp.json()) as any[];
                            if (Array.isArray(members) && members.length > 0) {
                              resolvedStoreId = String(matched.id).trim();
                            }
                          }
                        }
                      }
                    }
                  } else {
                    const storeResp = await fetch(
                      `${supabaseUrl}/rest/v1/stores?owner_id=eq.${encodeURIComponent(siteOwnerUserId)}&order=created_at.asc&limit=2&select=id,owner_id`,
                      { method: 'GET', headers: adminHeaders }
                    );
                    if (storeResp.ok) {
                      const rawStores = (await storeResp.json()) as any[];
                      const eligibleStores = (Array.isArray(rawStores) ? rawStores : []).filter((s) => {
                        const sid = String(s?.id || '').trim();
                        const oid = String(s?.owner_id || '').trim();
                        return uuidRe.test(sid) && (!uuidRe.test(oid) || oid === siteOwnerUserId);
                      });
                      if (eligibleStores.length === 1) {
                        resolvedStoreId = String(eligibleStores[0].id).trim();
                      } else if (eligibleStores.length === 0) {
                        const memberStoresResp = await fetch(
                          `${supabaseUrl}/rest/v1/store_members?user_id=eq.${encodeURIComponent(siteOwnerUserId)}&status=eq.active&select=store_id&limit=2`,
                          { method: 'GET', headers: adminHeaders }
                        );
                        if (memberStoresResp.ok) {
                          const memberships = (await memberStoresResp.json()) as any[];
                          const uniqueMemberStores = Array.from(
                            new Set(
                              (Array.isArray(memberships) ? memberships : [])
                                .map((m) => String(m?.store_id || '').trim())
                                .filter((id) => uuidRe.test(id))
                            )
                          );
                          if (uniqueMemberStores.length === 1) {
                            resolvedStoreId = uniqueMemberStores[0];
                          }
                        }
                      }
                    }
                  }
                } else if (uuidRe.test(candidateStoreId)) {
                  resolvedStoreId = candidateStoreId;
                }

                const rowConfig =
                  siteRow.config && typeof siteRow.config === 'object'
                    ? (siteRow.config as Record<string, any>)
                    : {};
                const catalogMeta =
                  rowConfig.productCatalogMeta && typeof rowConfig.productCatalogMeta === 'object'
                    ? (rowConfig.productCatalogMeta as Record<string, any>)
                    : {};
                const configCatalog: any[] = Array.isArray(rowConfig.servicesOrProducts)
                  ? rowConfig.servicesOrProducts
                  : hydratedSite.servicesOrProducts;

                // Fetch strictly active public-safe columns from products table (never cost_price or drafts)
                let dbProdById = new Map<string, any>();
                if (uuidRe.test(resolvedStoreId)) {
                  let prodResp = await fetch(
                    `${supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(resolvedStoreId)}&status=eq.active&select=id,name,sku,category,price,stock,status,description,image_url,is_visible,sort_order`,
                    { method: 'GET', headers: adminHeaders }
                  );
                  if (!prodResp.ok) {
                    prodResp = await fetch(
                      `${supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(resolvedStoreId)}&status=eq.active&select=id,name,sku,category,price,stock,status,description`,
                      { method: 'GET', headers: adminHeaders }
                    );
                  }
                  if (prodResp.ok) {
                    const dbProds = (await prodResp.json()) as any[];
                    for (const p of dbProds || []) {
                      if (p?.id) dbProdById.set(String(p.id), p);
                    }
                  }
                }

                const enrichedItems = (configCatalog || [])
                  .filter((item: any) => {
                    if (!item || item.isVisible === false) return false;
                    const pid = String(item.productId || item.id || '').trim();
                    if (pid && catalogMeta[pid]?.isVisible === false) return false;
                    if (pid && dbProdById.size > 0 && uuidRe.test(pid)) {
                      const liveProd = dbProdById.get(pid);
                      if (!liveProd || liveProd.is_visible === false) return false;
                    }
                    return true;
                  })
                  .map((item: any) => {
                    const pid = String(item.productId || item.id || '').trim();
                    const liveProd = pid ? dbProdById.get(pid) : undefined;
                    const metaEntry = pid ? catalogMeta[pid] || {} : {};
                    const liveStock =
                      liveProd !== undefined
                        ? Math.max(0, Math.trunc(Number(liveProd.stock) || 0))
                        : typeof item.stock === 'number'
                        ? Math.max(0, Math.trunc(item.stock))
                        : undefined;
                    const basePrice =
                      liveProd !== undefined
                        ? Number(liveProd.price) || 0
                        : typeof item.priceNumeric === 'number'
                        ? item.priceNumeric
                        : undefined;
                    const discountPrice =
                      typeof item.discountPrice === 'number'
                        ? item.discountPrice
                        : typeof metaEntry.discountPrice === 'number'
                        ? metaEntry.discountPrice
                        : undefined;
                    const validDiscount =
                      typeof discountPrice === 'number' &&
                      basePrice !== undefined &&
                      discountPrice >= 0 &&
                      discountPrice < basePrice
                        ? discountPrice
                        : undefined;
                    const effectivePrice = validDiscount !== undefined ? validDiscount : basePrice;

                    return {
                      id: item.id,
                      productId: item.productId || liveProd?.id || item.id,
                      sku: item.sku || liveProd?.sku || undefined,
                      name: liveProd?.name || item.name,
                      price:
                        effectivePrice !== undefined
                          ? `৳${effectivePrice.toLocaleString()}`
                          : item.price,
                      priceNumeric: basePrice,
                      ...(validDiscount !== undefined
                        ? {
                            discountPrice: validDiscount,
                            originalPrice: `৳${basePrice!.toLocaleString()}`,
                          }
                        : {}),
                      description: liveProd?.description ?? item.description ?? '',
                      imageUrl: item.imageUrl || metaEntry.imageUrl || liveProd?.image_url || undefined,
                      category: liveProd?.category || item.category || undefined,
                      stock: liveStock,
                      inStock: liveStock !== undefined ? liveStock > 0 : item.inStock ?? true,
                      isVisible: true,
                      sortOrder:
                        typeof liveProd?.sort_order === 'number'
                          ? liveProd.sort_order
                          : (item.sortOrder ?? metaEntry.sortOrder),
                      isFeatured: Boolean(item.isFeatured ?? metaEntry.isFeatured),
                    };
                  })
                  .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

                const { store_id: _droppedStoreId, storeId: _droppedCamelStoreId, ...cleanHydrated } = hydratedSite;
                hydratedSite = {
                  ...cleanHydrated,
                  ...(uuidRe.test(resolvedWebsiteId) ? { id: resolvedWebsiteId } : {}),
                  ...(uuidRe.test(resolvedStoreId) ? { storeId: resolvedStoreId } : {}),
                  servicesOrProducts: enrichedItems,
                };
              }
            }
          } catch {
            // Fall back gracefully to RPC-hydrated response
          }
        }

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
