import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_REGEX = /^(?:\+?8801[3-9]\d{8}|01[3-9]\d{8}|\+?[1-9]\d{7,14})$/;

const RESERVED_SUBDOMAINS = new Set([
  'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
  'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
  'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
  'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
  'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
  'testing', 'webhook', 'webhooks', 'www',
]);

const ALLOWED_PAYMENT_METHODS = new Set([
  'Cash on Delivery (COD)',
  'bKash',
  'Nagad',
  'Bank Transfer',
]);

const DELIVERY_FEES: Record<string, { label: string; fee: number }> = {
  inside_dhaka: { label: 'Inside Dhaka', fee: 60 },
  'inside dhaka': { label: 'Inside Dhaka', fee: 60 },
  outside_dhaka: { label: 'Outside Dhaka', fee: 120 },
  'outside dhaka': { label: 'Outside Dhaka', fee: 120 },
  store_pickup: { label: 'Store Pickup', fee: 0 },
  'store pickup': { label: 'Store Pickup', fee: 0 },
};

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  const isOk = payload.ok === true || payload.success === true;
  const normalized: Record<string, unknown> = {
    ...payload,
    ok: isOk,
    success: isOk,
  };
  if (!isOk && normalized.error && !normalized.message) {
    normalized.message = normalized.error;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  res.end(JSON.stringify(normalized));
}

function isAllowedStorefrontOrigin(originRaw: string): boolean {
  const origin = String(originRaw || '').trim();
  if (!origin) return false;
  if (origin === 'https://amaas.xyz' || origin === 'https://www.amaas.xyz' || origin === 'https://app.amaas.xyz') {
    return true;
  }
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
        !RESERVED_SUBDOMAINS.has(sub) &&
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
    if (!isProd && parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const ORDER_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

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

async function checkOrderRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const bucketKey = `rl:public-order:${ip}`;
  const maxReq = 20;
  const windowSec = 60;
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
  if (ORDER_RATE_BUCKETS.size >= 5000) {
    for (const [k, v] of ORDER_RATE_BUCKETS.entries()) {
      if (v.resetAt <= now) ORDER_RATE_BUCKETS.delete(k);
    }
    if (ORDER_RATE_BUCKETS.size >= 5000) {
      const oldestKey = ORDER_RATE_BUCKETS.keys().next().value;
      if (oldestKey) ORDER_RATE_BUCKETS.delete(oldestKey);
    }
  }
  const existing = ORDER_RATE_BUCKETS.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    ORDER_RATE_BUCKETS.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: windowSec };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= maxReq,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

type ReadBodyResult =
  | { kind: 'ok'; body: Record<string, any> }
  | { kind: 'unsupported_media_type' }
  | { kind: 'too_large' }
  | { kind: 'invalid_json' };

async function readJsonBody(req: RequestWithBody): Promise<ReadBodyResult> {
  const rawCt = String(req.headers['content-type'] || '').trim().toLowerCase();
  if (rawCt && !rawCt.includes('application/json') && !rawCt.includes('+json')) {
    return { kind: 'unsupported_media_type' };
  }
  const rawContentLen = Number(req.headers['content-length']);
  if (Number.isFinite(rawContentLen) && rawContentLen > 65536) {
    return { kind: 'too_large' };
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Array.isArray(req.body)) return { kind: 'invalid_json' };
    return { kind: 'ok', body: req.body as Record<string, any> };
  }
  if (typeof req.body === 'string') {
    if (req.body.length > 65536) return { kind: 'too_large' };
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { kind: 'ok', body: parsed }
        : { kind: 'invalid_json' };
    } catch {
      return { kind: 'invalid_json' };
    }
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > 65536) {
        settled = true;
        try {
          req.destroy();
        } catch {}
        resolve({ kind: 'too_large' });
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!rawCt) {
        resolve({ kind: 'unsupported_media_type' });
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({ kind: 'ok', body: {} });
          return;
        }
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { kind: 'ok', body: parsed } : { kind: 'invalid_json' });
      } catch {
        resolve({ kind: 'invalid_json' });
      }
    });
    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve({ kind: 'invalid_json' });
    });
  });
}

function buildDeterministicOrderNumber(subdomain: string, attemptId: string): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const digest = createHash('sha256')
    .update(`${subdomain.toLowerCase()}:${attemptId.trim()}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  return `ORD-${yy}${mm}${dd}-${digest}`;
}

export default async function handler(req: RequestWithBody, res: ServerResponse) {
  const originHeader = String(req.headers.origin || '').trim();
  const originAllowed = originHeader ? isAllowedStorefrontOrigin(originHeader) : false;
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin, Host, X-Forwarded-Host');

  if (req.method === 'OPTIONS') {
    if (originHeader && !originAllowed) {
      sendJson(res, 403, { ok: false, code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin not allowed.' });
      return;
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    return;
  }

  const rl = await checkOrderRateLimit(getClientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    sendJson(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Too many order requests. Please wait before retrying.' });
    return;
  }

  try {
    const bodyResult = await readJsonBody(req);
    if (bodyResult.kind === 'unsupported_media_type') {
      sendJson(res, 415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Content-Type must be application/json.' });
      return;
    }
    if (bodyResult.kind === 'too_large') {
      sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Request payload too large.' });
      return;
    }
    if (bodyResult.kind === 'invalid_json') {
      sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid order request body.' });
      return;
    }
    const body = bodyResult.body;

    const subdomain = String(body.subdomain || '').trim().toLowerCase();
    if (
      !subdomain ||
      subdomain.length < 3 ||
      subdomain.length > 30 ||
      subdomain.includes('.') ||
      subdomain.startsWith('xn--') ||
      RESERVED_SUBDOMAINS.has(subdomain) ||
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)
    ) {
      sendJson(res, 400, { ok: false, code: 'INVALID_SUBDOMAIN', error: 'Invalid storefront subdomain.' });
      return;
    }

    const checkoutAttemptId = String(body.checkoutAttemptId || '').trim();
    if (checkoutAttemptId.length < 8 || checkoutAttemptId.length > 128) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_IDEMPOTENCY_KEY',
        error: 'Invalid checkout session token. Please refresh the page and try again.',
      });
      return;
    }

    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const customerName = String(body.customerName ?? customer.name ?? '')
      .trim()
      .slice(0, 120);
    const customerPhone = String(body.customerPhone ?? customer.phone ?? '')
      .replace(/[\s()-]+/g, '')
      .trim();
    const customerEmail = String(body.customerEmail ?? customer.email ?? '')
      .trim()
      .slice(0, 160);
    const streetAddress = String(body.shippingAddress ?? customer.address ?? '')
      .trim()
      .slice(0, 400);
    const city = String(body.city ?? customer.city ?? '')
      .trim()
      .slice(0, 80);
    const area = String(body.deliveryArea ?? customer.area ?? '')
      .trim()
      .slice(0, 120);
    const deliveryInstructions = String(
      body.deliveryInstructions ?? customer.deliveryInstructions ?? ''
    )
      .trim()
      .slice(0, 300);
    const orderNotes = String(body.orderNotes ?? customer.orderNotes ?? '')
      .trim()
      .slice(0, 400);

    if (customerName.length < 2) {
      sendJson(res, 400, { ok: false, code: 'INVALID_NAME', error: 'Please enter your full name.' });
      return;
    }
    if (!PHONE_REGEX.test(customerPhone)) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_PHONE',
        error: 'Please enter a valid mobile number (e.g., 017XXXXXXXX or +88017XXXXXXXX).',
      });
      return;
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      sendJson(res, 400, { ok: false, code: 'INVALID_EMAIL', error: 'Please enter a valid email address.' });
      return;
    }
    if (streetAddress.length < 5) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_ADDRESS',
        error: 'Please enter your complete delivery address.',
      });
      return;
    }
    if (city.length < 2) {
      sendJson(res, 400, { ok: false, code: 'INVALID_CITY', error: 'Please enter your district or city.' });
      return;
    }

    const deliveryMethodKey = String(body.deliveryMethod || 'Inside Dhaka')
      .trim()
      .toLowerCase();
    const deliverySpec = DELIVERY_FEES[deliveryMethodKey] || DELIVERY_FEES.inside_dhaka;

    const paymentMethodRaw = String(body.paymentMethod || 'Cash on Delivery (COD)').trim();
    const paymentMethod = ALLOWED_PAYMENT_METHODS.has(paymentMethodRaw)
      ? paymentMethodRaw
      : 'Cash on Delivery (COD)';

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0 || rawItems.length > 50) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_ITEMS',
        error: 'Please select between 1 and 50 items to place an order.',
      });
      return;
    }

    // Consolidate quantities per productId and validate UUIDs
    const requestedQtyByProductId = new Map<string, number>();
    for (const rawItem of rawItems) {
      const pid = String(rawItem?.productId || '').trim();
      const qty = Number(rawItem?.quantity);
      if (!UUID_REGEX.test(pid)) {
        sendJson(res, 400, {
          ok: false,
          code: 'UNPUBLISHED_PRODUCT_ID',
          error: 'One or more selected items are not synced with store inventory yet. Please contact the store directly.',
        });
        return;
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_QUANTITY',
          error: 'Each ordered product must have a valid whole-number quantity.',
        });
        return;
      }
      requestedQtyByProductId.set(pid, (requestedQtyByProductId.get(pid) || 0) + qty);
    }

    // Resolve Supabase URL, Anon Key, and Server-Only Service Role Key
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');

    const supabaseAnonKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl.startsWith('https://') || !supabaseAnonKey) {
      sendJson(res, 503, {
        ok: false,
        code: 'SUPABASE_ENV_MISSING',
        error: 'Storefront backend is temporarily unavailable.',
      });
      return;
    }

    // Validate project reference consistency across URL and keys
    let expectedUrlRef = '';
    try {
      const hostMatch = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      expectedUrlRef = hostMatch ? hostMatch[1].toLowerCase() : '';
    } catch {
      sendJson(res, 503, { ok: false, code: 'INVALID_SUPABASE_URL', error: 'Invalid backend configuration.' });
      return;
    }

    // Step 1: Verify target website is genuinely published, paid, active, and unexpired via audited RPC
    const anonHeaders: Record<string, string> = {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    };
    if (!supabaseAnonKey.startsWith('sb_publishable_')) {
      anonHeaders.Authorization = `Bearer ${supabaseAnonKey}`;
    }

    const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_published_website_by_subdomain`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({ p_subdomain: subdomain }),
    });

    if (!rpcResp.ok) {
      sendJson(res, 502, {
        ok: false,
        code: 'RESOLVER_FAILED',
        error: 'Could not verify published storefront status.',
      });
      return;
    }

    const rpcJson = (await rpcResp.json()) as any;
    if (!rpcJson || !rpcJson.found || !rpcJson.site) {
      sendJson(res, 404, {
        ok: false,
        code: 'STOREFRONT_NOT_LIVE',
        error: 'This website is not currently active or published.',
      });
      return;
    }

    const site = rpcJson.site;
    const subStatus = String(site.subscriptionStatus || site.status || '');
    const payStatus = String(site.paymentStatus || site.payment_status || '');
    const depStatus = String(site.deploymentStatus || site.deployment_status || '');
    const periodEndMs = site.currentPeriodEnd ? Date.parse(String(site.currentPeriodEnd)) : NaN;
    const isExpired =
      subStatus === 'grace_period' ||
      subStatus === 'past_due' ||
      (Number.isFinite(periodEndMs) && periodEndMs <= Date.now());

    if (
      isExpired ||
      subStatus !== 'active' ||
      (payStatus !== '' && payStatus !== 'paid') ||
      depStatus !== 'live'
    ) {
      sendJson(res, 403, {
        ok: false,
        code: 'STOREFRONT_INACTIVE',
        error: 'Orders cannot be placed because this storefront subscription is currently inactive.',
      });
      return;
    }

    // Step 2: Require server-only SUPABASE_SERVICE_ROLE_KEY for RLS-protected resolution, order, & stock persistence
    if (!serviceRoleKey) {
      sendJson(res, 503, {
        ok: false,
        code: 'SERVER_SERVICE_ROLE_KEY_REQUIRED',
        error:
          'Online order persistence requires SUPABASE_SERVICE_ROLE_KEY to be configured in the server environment (Vercel Environment Variables) because database Row-Level Security restricts direct public writes to orders and inventory.',
      });
      return;
    }

    // Validate service_role JWT if in 3-part JWT format
    if (!serviceRoleKey.startsWith('sb_secret_')) {
      try {
        const jwtParts = serviceRoleKey.split('.');
        if (jwtParts.length === 3) {
          const claims = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
          if (claims?.role && claims.role !== 'service_role') {
            sendJson(res, 503, {
              ok: false,
              code: 'INVALID_SERVER_KEY_ROLE',
              error: 'Server order key does not carry service_role privileges.',
            });
            return;
          }
          if (claims?.ref && expectedUrlRef && String(claims.ref).toLowerCase() !== expectedUrlRef) {
            sendJson(res, 503, {
              ok: false,
              code: 'SERVER_KEY_PROJECT_MISMATCH',
              error: 'Server order key project reference does not match configured Supabase URL.',
            });
            return;
          }
        }
      } catch {
        sendJson(res, 503, {
          ok: false,
          code: 'MALFORMED_SERVER_KEY',
          error: 'Server order key configuration is invalid.',
        });
        return;
      }
    }

    const adminHeaders: Record<string, string> = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    // Optional authenticated customer verification (NEVER trust customerAuthUserId from request body)
    let verifiedCustomerAuthUserId = '';
    let verifiedCustomerEmail = '';
    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const bearerToken = authHeader.slice(7).trim();
      if (bearerToken.length > 20) {
        try {
          const authUserResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
            method: 'GET',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${bearerToken}`,
            },
          });
          if (authUserResp.ok) {
            const authUserJson = (await authUserResp.json()) as { id?: string; email?: string };
            if (authUserJson?.id && UUID_REGEX.test(String(authUserJson.id).trim())) {
              verifiedCustomerAuthUserId = String(authUserJson.id).trim();
            }
            if (typeof authUserJson?.email === 'string' && authUserJson.email.trim()) {
              verifiedCustomerEmail = authUserJson.email.trim().toLowerCase();
            }
          }
        } catch {
          // Proceed as guest if token validation network fails
        }
      }
    }

    // Resolve authoritative websiteId, storeId, and verify strict owner/store linkage via service_role
    let storeId = String(site.storeId || site.store_id || '').trim();
    let websiteId = String(site.id || '').trim();
    let authoritativeSiteConfig: Record<string, any> | null = null;
    let resolvedStoreRow: Record<string, any> | null = null;

    const siteSelectCols =
      'id,store_id,user_id,business_name,subdomain,full_domain,status,payment_status,deployment_status,current_period_end,config';
    let siteLookupResp = await fetch(
      `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=eq.${encodeURIComponent(subdomain)}&select=${siteSelectCols}&limit=1`,
      { method: 'GET', headers: adminHeaders }
    );
    if (!siteLookupResp.ok) {
      sendJson(res, 502, {
        ok: false,
        code: 'WEBSITE_LOOKUP_FAILED',
        error: 'Unable to verify storefront website linkage right now. Please try again.',
      });
      return;
    }

    let siteRows = (await siteLookupResp.json()) as any[];
    if (Array.isArray(siteRows) && siteRows.length === 0) {
      siteLookupResp = await fetch(
        `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=ilike.${encodeURIComponent(subdomain)}&select=${siteSelectCols}&limit=1`,
        { method: 'GET', headers: adminHeaders }
      );
      if (!siteLookupResp.ok) {
        sendJson(res, 502, {
          ok: false,
          code: 'WEBSITE_LOOKUP_FAILED',
          error: 'Unable to verify storefront website linkage right now. Please try again.',
        });
        return;
      }
      siteRows = (await siteLookupResp.json()) as any[];
    }

    const siteRow = Array.isArray(siteRows) ? siteRows[0] : null;
    if (siteRow) {
      if (siteRow.status !== undefined) {
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
          sendJson(res, 403, {
            ok: false,
            code: 'STOREFRONT_INACTIVE',
            error: 'Orders cannot be placed because this storefront subscription is currently inactive.',
          });
          return;
        }
      }

      if (UUID_REGEX.test(String(siteRow.id || '').trim())) {
        websiteId = String(siteRow.id).trim();
      }

      if (siteRow.config && typeof siteRow.config === 'object') {
        authoritativeSiteConfig = siteRow.config as Record<string, any>;
      }

      const siteOwnerUserId = String(siteRow.user_id || '').trim();
      if (UUID_REGEX.test(siteOwnerUserId)) {
        const rowStoreId = String(siteRow.store_id || '').trim();
        const candidateStoreId = UUID_REGEX.test(rowStoreId) ? rowStoreId : storeId;
        storeId = '';

        if (UUID_REGEX.test(candidateStoreId)) {
          const verifyStoreResp = await fetch(
            `${supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(candidateStoreId)}&select=id,owner_id,name,phone,address,logo_url&limit=1`,
            { method: 'GET', headers: adminHeaders }
          );
          if (!verifyStoreResp.ok) {
            sendJson(res, 502, {
              ok: false,
              code: 'STORE_LOOKUP_FAILED',
              error: 'Unable to verify linked merchant store right now. Please try again.',
            });
            return;
          }
          const matchedStores = (await verifyStoreResp.json()) as any[];
          const matched = Array.isArray(matchedStores) ? matchedStores[0] : null;
          if (!matched || !UUID_REGEX.test(String(matched.id || '').trim())) {
            sendJson(res, 422, {
              ok: false,
              code: 'STORE_NOT_LINKED',
              error: 'This website is not linked to an active merchant inventory store yet.',
            });
            return;
          }

          const matchedOwnerId = String(matched.owner_id || '').trim();
          if (UUID_REGEX.test(matchedOwnerId) && matchedOwnerId !== siteOwnerUserId) {
            const memberResp = await fetch(
              `${supabaseUrl}/rest/v1/store_members?store_id=eq.${encodeURIComponent(candidateStoreId)}&user_id=eq.${encodeURIComponent(siteOwnerUserId)}&status=eq.active&select=id&limit=1`,
              { method: 'GET', headers: adminHeaders }
            );
            if (!memberResp.ok) {
              sendJson(res, 502, {
                ok: false,
                code: 'STORE_LOOKUP_FAILED',
                error: 'Unable to verify store membership right now. Please try again.',
              });
              return;
            }
            const members = (await memberResp.json()) as any[];
            if (!Array.isArray(members) || members.length === 0) {
              sendJson(res, 403, {
                ok: false,
                code: 'STORE_OWNERSHIP_MISMATCH',
                error: 'Store linkage does not belong to this website merchant account.',
              });
              return;
            }
          }

          storeId = String(matched.id).trim();
          resolvedStoreRow = matched;
        } else {
          const ownerStoreResp = await fetch(
            `${supabaseUrl}/rest/v1/stores?owner_id=eq.${encodeURIComponent(siteOwnerUserId)}&order=created_at.asc&limit=2&select=id,owner_id,name,phone,address,logo_url`,
            { method: 'GET', headers: adminHeaders }
          );
          if (!ownerStoreResp.ok) {
            sendJson(res, 502, {
              ok: false,
              code: 'STORE_LOOKUP_FAILED',
              error: 'Unable to verify merchant store linkage right now. Please try again.',
            });
            return;
          }
          const rawStores = (await ownerStoreResp.json()) as any[];
          const eligibleStores = (Array.isArray(rawStores) ? rawStores : []).filter((s) => {
            const sid = String(s?.id || '').trim();
            const oid = String(s?.owner_id || '').trim();
            return UUID_REGEX.test(sid) && (!UUID_REGEX.test(oid) || oid === siteOwnerUserId);
          });

          if (eligibleStores.length === 1) {
            resolvedStoreRow = eligibleStores[0];
            storeId = String(eligibleStores[0].id).trim();
          } else if (eligibleStores.length > 1) {
            sendJson(res, 422, {
              ok: false,
              code: 'STORE_LINK_AMBIGUOUS',
              error: 'This website cannot accept orders yet because the merchant has multiple stores without a specific store link.',
            });
            return;
          } else {
            const memberStoresResp = await fetch(
              `${supabaseUrl}/rest/v1/store_members?user_id=eq.${encodeURIComponent(siteOwnerUserId)}&status=eq.active&select=store_id&limit=2`,
              { method: 'GET', headers: adminHeaders }
            );
            if (!memberStoresResp.ok) {
              sendJson(res, 502, {
                ok: false,
                code: 'STORE_LOOKUP_FAILED',
                error: 'Unable to verify store membership right now. Please try again.',
              });
              return;
            }
            const memberships = (await memberStoresResp.json()) as any[];
            const uniqueMemberStores = Array.from(
              new Set(
                (Array.isArray(memberships) ? memberships : [])
                  .map((m) => String(m?.store_id || '').trim())
                  .filter((id) => UUID_REGEX.test(id))
              )
            );
            if (uniqueMemberStores.length === 1) {
              storeId = uniqueMemberStores[0];
            } else if (uniqueMemberStores.length > 1) {
              sendJson(res, 422, {
                ok: false,
                code: 'STORE_LINK_AMBIGUOUS',
                error: 'This website cannot accept orders yet because the merchant belongs to multiple stores without a specific store link.',
              });
              return;
            }
          }
        }
      }
    }

    if (!UUID_REGEX.test(storeId) || !UUID_REGEX.test(websiteId)) {
      sendJson(res, 422, {
        ok: false,
        code: 'STORE_NOT_LINKED',
        error: 'This website is not linked to an active merchant inventory store yet.',
      });
      return;
    }

    const incomingWebsiteId = String(body.websiteId || '').trim();
    if (
      incomingWebsiteId &&
      incomingWebsiteId !== `site-${subdomain}` &&
      incomingWebsiteId !== websiteId
    ) {
      sendJson(res, 403, {
        ok: false,
        code: 'TENANT_MISMATCH',
        error: 'Storefront identity mismatch.',
      });
      return;
    }

    // Step 3: Idempotency check — prevent duplicate orders on double click or network retry
    const orderNumber = buildDeterministicOrderNumber(subdomain, checkoutAttemptId);
    const existingOrderResp = await fetch(
      `${supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&order_number=eq.${encodeURIComponent(orderNumber)}&select=*`,
      { method: 'GET', headers: adminHeaders }
    );
    if (existingOrderResp.ok) {
      const existingRows = (await existingOrderResp.json()) as any[];
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const row = existingRows[0];
        const firstMeta =
          Array.isArray(row.items) && row.items[0]?.orderMeta && typeof row.items[0].orderMeta === 'object'
            ? row.items[0].orderMeta
            : {};
        sendJson(res, 200, {
          ok: true,
          duplicatePrevented: true,
          order: {
            id: row.id,
            orderNumber: row.order_number,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            customerEmail: row.customer_email || '',
            shippingAddress: row.address,
            city: row.city,
            deliveryArea: firstMeta.deliveryArea || undefined,
            deliveryMethod: firstMeta.deliveryMethod || deliverySpec.label,
            deliveryInstructions: firstMeta.deliveryInstructions || undefined,
            notes: firstMeta.orderNotes || undefined,
            subtotal: Number(row.subtotal) || 0,
            deliveryFee: Number(row.delivery_charge) || 0,
            discount: Number(firstMeta.discountTotal) || 0,
            total: Number(row.total) || 0,
            status: row.status || 'pending',
            statusHistory: Array.isArray(firstMeta.statusHistory) ? firstMeta.statusHistory : undefined,
            paymentStatus: row.payment_status || 'pending',
            paymentMethod: row.payment_method || paymentMethod,
            source: row.source || `Website (${subdomain}.amaas.xyz)`,
            websiteId,
            websiteSubdomain: subdomain,
            customerAuthUserId: firstMeta.customerAuthUserId || undefined,
            merchantBrandingSnapshot: firstMeta.merchantBrandingSnapshot || undefined,
            items: Array.isArray(row.items) ? row.items : [],
            createdAt: row.created_at,
          },
        });
        return;
      }
    }

    // Step 4: Verify every requested product is published on THIS website and belongs to THIS store
    const configCatalog = Array.isArray(authoritativeSiteConfig?.servicesOrProducts)
      ? authoritativeSiteConfig.servicesOrProducts
      : null;
    const rawCatalogSource =
      configCatalog && configCatalog.length > 0
        ? configCatalog
        : Array.isArray(site.servicesOrProducts)
        ? site.servicesOrProducts
        : [];
    const catalogMeta =
      authoritativeSiteConfig?.productCatalogMeta &&
      typeof authoritativeSiteConfig.productCatalogMeta === 'object'
        ? (authoritativeSiteConfig.productCatalogMeta as Record<string, any>)
        : {};
    const publishedCatalog: any[] = rawCatalogSource.filter((it: any) => {
      if (!it || it.isVisible === false) return false;
      const pid = String(it.productId || it.id || '').trim();
      if (pid && catalogMeta[pid]?.isVisible === false) return false;
      return true;
    });
    const publishedByProductId = new Map<string, any>();
    for (const pubItem of publishedCatalog) {
      const pid = String(pubItem.productId || pubItem.id || '').trim();
      if (UUID_REGEX.test(pid)) {
        const metaEntry = catalogMeta[pid] || {};
        publishedByProductId.set(pid, {
          ...pubItem,
          ...(metaEntry.imageUrl && !pubItem.imageUrl ? { imageUrl: metaEntry.imageUrl } : {}),
          ...(typeof metaEntry.discountPrice === 'number' && pubItem.discountPrice === undefined
            ? { discountPrice: metaEntry.discountPrice }
            : {}),
        });
      }
    }

    for (const pid of requestedQtyByProductId.keys()) {
      if (!publishedByProductId.has(pid)) {
        sendJson(res, 400, {
          ok: false,
          code: 'PRODUCT_NOT_PUBLISHED',
          error: 'One or more items in your bag are no longer published on this website. Please refresh and review your bag.',
        });
        return;
      }
    }

    const idListParam = Array.from(requestedQtyByProductId.keys()).join(',');
    const prodResp = await fetch(
      `${supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(storeId)}&id=in.(${idListParam})&select=*`,
      { method: 'GET', headers: adminHeaders }
    );
    if (!prodResp.ok) {
      sendJson(res, 502, {
        ok: false,
        code: 'PRODUCT_VERIFY_FAILED',
        error: 'Unable to verify live inventory for selected products.',
      });
      return;
    }

    const dbProducts = (await prodResp.json()) as any[];
    const dbProdById = new Map<string, any>();
    for (const p of dbProducts || []) {
      if (p && p.id) dbProdById.set(String(p.id), p);
    }

    let subtotal = 0;
    const verifiedLines: Array<{
      productId: string;
      name: string;
      sku: string;
      unitPrice: number;
      originalPrice: number;
      quantity: number;
      currentStock: number;
      currentSalesCount: number;
      imageUrl?: string;
      category?: string;
    }> = [];

    for (const [pid, qty] of requestedQtyByProductId.entries()) {
      const dbProd = dbProdById.get(pid);
      const pubItem = publishedByProductId.get(pid);
      if (!dbProd || String(dbProd.store_id) !== storeId || dbProd.status !== 'active') {
        sendJson(res, 409, {
          ok: false,
          code: 'PRODUCT_UNAVAILABLE',
          productId: pid,
          error: `"${pubItem?.name || 'Selected item'}" is currently unavailable.`,
        });
        return;
      }

      const currentStock = Math.max(0, Math.trunc(Number(dbProd.stock) || 0));
      if (currentStock < qty) {
        sendJson(res, 409, {
          ok: false,
          code: 'INSUFFICIENT_STOCK',
          productId: pid,
          availableStock: currentStock,
          error:
            currentStock === 0
              ? `"${dbProd.name}" is currently out of stock.`
              : `Only ${currentStock} unit(s) of "${dbProd.name}" remain in stock.`,
        });
        return;
      }

      const basePrice = Math.max(0, Number(dbProd.price) || 0);
      const publishedDiscount =
        pubItem && typeof pubItem.discountPrice === 'number' && Number.isFinite(pubItem.discountPrice)
          ? Number(pubItem.discountPrice)
          : 0;
      const authoritativeUnitPrice =
        publishedDiscount > 0 && publishedDiscount < basePrice ? publishedDiscount : basePrice;

      subtotal += authoritativeUnitPrice * qty;
      verifiedLines.push({
        productId: pid,
        name: String(dbProd.name || pubItem?.name || 'Product'),
        sku: String(dbProd.sku || pubItem?.sku || ''),
        unitPrice: authoritativeUnitPrice,
        originalPrice: basePrice,
        quantity: qty,
        currentStock,
        currentSalesCount: Math.max(0, Math.trunc(Number(dbProd.sales_count) || 0)),
        imageUrl: typeof pubItem?.imageUrl === 'string' && pubItem.imageUrl ? pubItem.imageUrl : undefined,
        category: String(dbProd.category || pubItem?.category || ''),
      });
    }

    const deliveryCharge = deliverySpec.fee;
    const grandTotal = subtotal + deliveryCharge;

    // Step 5: Guarded stock decrement (stock >= qty) with automatic rollback on contention
    const decrementedLines: Array<{
      productId: string;
      previousStock: number;
      previousSalesCount: number;
      newStock: number;
      quantity: number;
      name: string;
    }> = [];

    const rollbackDecrements = async () => {
      for (const dec of decrementedLines) {
        try {
          await fetch(
            `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(dec.productId)}&store_id=eq.${encodeURIComponent(storeId)}`,
            {
              method: 'PATCH',
              headers: adminHeaders,
              body: JSON.stringify({
                stock: dec.previousStock,
                sales_count: dec.previousSalesCount,
              }),
            }
          );
        } catch {
          // Best-effort compensation
        }
      }
    };

    for (const line of verifiedLines) {
      const nextStock = line.currentStock - line.quantity;
      const nextSalesCount = line.currentSalesCount + line.quantity;
      const patchResp = await fetch(
        `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(line.productId)}&store_id=eq.${encodeURIComponent(storeId)}&stock=gte.${line.quantity}`,
        {
          method: 'PATCH',
          headers: { ...adminHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            stock: nextStock,
            sales_count: nextSalesCount,
          }),
        }
      );

      if (!patchResp.ok) {
        await rollbackDecrements();
        sendJson(res, 502, {
          ok: false,
          code: 'INVENTORY_UPDATE_FAILED',
          error: 'Could not reserve product inventory. Please try again.',
        });
        return;
      }

      const updatedRows = (await patchResp.json()) as any[];
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        await rollbackDecrements();
        sendJson(res, 409, {
          ok: false,
          code: 'INSUFFICIENT_STOCK',
          productId: line.productId,
          error: `"${line.name}" just sold out or has insufficient remaining stock.`,
        });
        return;
      }

      decrementedLines.push({
        productId: line.productId,
        previousStock: line.currentStock,
        previousSalesCount: line.currentSalesCount,
        newStock: nextStock,
        quantity: line.quantity,
        name: line.name,
      });
    }

    // Step 6: Persist immutable order snapshot into public.orders
    const addressSegments = [
      streetAddress,
      area ? `Area: ${area}` : '',
      `Delivery: ${deliverySpec.label}`,
      deliveryInstructions ? `Instructions: ${deliveryInstructions}` : '',
      orderNotes ? `Note: ${orderNotes}` : '',
    ].filter(Boolean);

    const formattedShippingAddress = addressSegments.join(' | ');
    const orderPlacedAtIso = new Date().toISOString();

    const discountTotal = verifiedLines.reduce(
      (sum, line) => sum + Math.max(0, line.originalPrice - line.unitPrice) * line.quantity,
      0
    );

    const cfg = authoritativeSiteConfig || {};
    const cfgTheme = cfg.themeSettings && typeof cfg.themeSettings === 'object' ? cfg.themeSettings : {};
    const cfgLoc = cfgTheme.location && typeof cfgTheme.location === 'object' ? cfgTheme.location : {};
    const customDomain = String(cfg.customDomain || site.customDomain || '').trim().toLowerCase();
    const merchantBrandingSnapshot = {
      businessName:
        String(
          cfg.businessName ||
            siteRow?.business_name ||
            site.businessName ||
            resolvedStoreRow?.name ||
            ''
        ).trim() || `${subdomain.toUpperCase()} Store`,
      logoUrl: String(cfg.logoUrl || site.logoUrl || resolvedStoreRow?.logo_url || '').trim() || undefined,
      brandColor:
        String(cfgTheme.primaryColor || cfg.brandColor || site.brandColor || '#2563EB').trim() ||
        '#2563EB',
      phone: String(cfg.phone || site.phone || resolvedStoreRow?.phone || '').trim() || undefined,
      email: String(cfg.email || site.email || '').trim() || undefined,
      address:
        String(cfgLoc.address || cfg.address || site.address || resolvedStoreRow?.address || '').trim() ||
        undefined,
      websiteUrl: customDomain ? `https://${customDomain}` : `https://${subdomain}.amaas.xyz`,
      subdomain,
    };

    const initialStatusHistory = [{ status: 'pending', at: orderPlacedAtIso }];

    const orderItemsSnapshot = verifiedLines.map((line, index) => ({
      productId: line.productId,
      name: line.name,
      sku: line.sku,
      price: line.unitPrice,
      ...(line.originalPrice > line.unitPrice ? { originalPrice: line.originalPrice } : {}),
      quantity: line.quantity,
      ...(line.imageUrl ? { imageUrl: line.imageUrl } : {}),
      ...(line.category ? { category: line.category } : {}),
      ...(index === 0
        ? {
            orderMeta: {
              orderSource: 'public_website',
              websiteId,
              subdomain,
              websiteSubdomain: subdomain,
              deliveryArea: area || undefined,
              deliveryMethod: deliverySpec.label,
              deliveryInstructions: deliveryInstructions || undefined,
              orderNotes: orderNotes || undefined,
              ...(verifiedCustomerAuthUserId ? { customerAuthUserId: verifiedCustomerAuthUserId } : {}),
              ...(verifiedCustomerEmail ? { customerVerifiedEmail: verifiedCustomerEmail } : {}),
              ...(discountTotal > 0 ? { discountTotal } : {}),
              statusHistory: initialStatusHistory,
              merchantBrandingSnapshot,
            },
          }
        : {}),
    }));

    const effectiveCustomerEmail = customerEmail || verifiedCustomerEmail || '';

    const orderInsertResp = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeId,
        order_number: orderNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: effectiveCustomerEmail || null,
        address: formattedShippingAddress,
        city,
        subtotal,
        delivery_charge: deliveryCharge,
        total: grandTotal,
        status: 'pending',
        payment_status: 'pending',
        payment_method: paymentMethod,
        source: `Website (${subdomain}.amaas.xyz)`,
        items: orderItemsSnapshot,
      }),
    });

    if (!orderInsertResp.ok) {
      await rollbackDecrements();
      sendJson(res, 502, {
        ok: false,
        code: 'ORDER_INSERT_FAILED',
        error: 'Unable to save your order at this moment. Your bag has been preserved — please try again.',
      });
      return;
    }

    const insertedOrders = (await orderInsertResp.json()) as any[];
    const savedOrder = Array.isArray(insertedOrders) ? insertedOrders[0] : null;
    if (!savedOrder || !savedOrder.id) {
      await rollbackDecrements();
      sendJson(res, 502, {
        ok: false,
        code: 'ORDER_CONFIRMATION_MISSING',
        error: 'Order save could not be confirmed by the server.',
      });
      return;
    }

    // Step 7: Record inventory movement logs, upsert store customer directory, and sync website catalog stock
    try {
      const movementPayloads = decrementedLines.map((dec) => ({
        store_id: storeId,
        product_id: dec.productId,
        product_name: dec.name,
        type: 'sale',
        quantity_change: -dec.quantity,
        new_stock: dec.newStock,
        reason: `Website Order #${orderNumber} (${subdomain}.amaas.xyz)`,
      }));
      await fetch(`${supabaseUrl}/rest/v1/inventory_movements`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(movementPayloads),
      });
    } catch {
      // Non-fatal audit log
    }

    try {
      const digitsOnly = customerPhone.replace(/^\+/, '');
      const phoneVariants = new Set<string>([customerPhone]);
      if (/^8801[3-9]\d{8}$/.test(digitsOnly)) {
        phoneVariants.add(`0${digitsOnly.slice(3)}`);
        phoneVariants.add(digitsOnly);
        phoneVariants.add(`+${digitsOnly}`);
      } else if (/^01[3-9]\d{8}$/.test(digitsOnly)) {
        phoneVariants.add(digitsOnly);
        phoneVariants.add(`88${digitsOnly}`);
        phoneVariants.add(`+88${digitsOnly}`);
      }
      const phoneOrClause = Array.from(phoneVariants)
        .map((p) => `phone.eq.${encodeURIComponent(p)}`)
        .join(',');

      const custLookupResp = await fetch(
        `${supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(storeId)}&or=(${phoneOrClause})&limit=1&select=*`,
        { method: 'GET', headers: adminHeaders }
      );
      const existingCustomers = custLookupResp.ok ? ((await custLookupResp.json()) as any[]) : [];
      let existingCust =
        Array.isArray(existingCustomers) && existingCustomers.length > 0
          ? existingCustomers[0]
          : null;

      if (!existingCust && verifiedCustomerEmail) {
        const emailLookupResp = await fetch(
          `${supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(storeId)}&email=ilike.${encodeURIComponent(verifiedCustomerEmail)}&order=created_at.asc&limit=1&select=*`,
          { method: 'GET', headers: adminHeaders }
        );
        const existingByEmail = emailLookupResp.ok
          ? ((await emailLookupResp.json()) as any[])
          : [];
        if (Array.isArray(existingByEmail) && existingByEmail.length > 0) {
          existingCust = existingByEmail[0];
        }
      }

      if (existingCust) {
        const existingPhone = String(existingCust.phone || '').trim();
        const shouldReplacePhone =
          !existingPhone || existingPhone.toLowerCase() === 'not provided';
        await fetch(
          `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(existingCust.id)}&store_id=eq.${encodeURIComponent(storeId)}`,
          {
            method: 'PATCH',
            headers: adminHeaders,
            body: JSON.stringify({
              name: customerName,
              ...(shouldReplacePhone ? { phone: customerPhone } : {}),
              ...(effectiveCustomerEmail ? { email: effectiveCustomerEmail } : {}),
              address: streetAddress,
              city,
              orders_count: (Number(existingCust.orders_count) || 0) + 1,
              total_spent: (Number(existingCust.total_spent) || 0) + grandTotal,
            }),
          }
        );
      } else {
        await fetch(`${supabaseUrl}/rest/v1/customers`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            store_id: storeId,
            name: customerName,
            phone: customerPhone,
            email: effectiveCustomerEmail || null,
            address: streetAddress,
            city,
            orders_count: 1,
            total_spent: grandTotal,
            notes: `Acquired via ${subdomain}.amaas.xyz`,
          }),
        });
      }
    } catch {
      // Non-fatal customer directory sync
    }

    try {
      const siteRowResp = await fetch(
        `${supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(websiteId)}&select=config`,
        { method: 'GET', headers: adminHeaders }
      );
      if (siteRowResp.ok) {
        const siteRows = (await siteRowResp.json()) as any[];
        const currentConfig = siteRows?.[0]?.config;
        if (currentConfig && typeof currentConfig === 'object' && Array.isArray(currentConfig.servicesOrProducts)) {
          const newStockByPid = new Map<string, number>();
          for (const dec of decrementedLines) {
            newStockByPid.set(dec.productId, dec.newStock);
          }
          const updatedCatalog = currentConfig.servicesOrProducts.map((item: any) => {
            const pid = String(item?.productId || item?.id || '').trim();
            if (newStockByPid.has(pid)) {
              const ns = newStockByPid.get(pid)!;
              return {
                ...item,
                stock: ns,
                inStock: ns > 0,
              };
            }
            return item;
          });
          await fetch(
            `${supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(websiteId)}`,
            {
              method: 'PATCH',
              headers: adminHeaders,
              body: JSON.stringify({
                config: {
                  ...currentConfig,
                  servicesOrProducts: updatedCatalog,
                },
              }),
            }
          );
        }
      }
    } catch {
      // Non-fatal storefront stock snapshot sync
    }

    sendJson(res, 201, {
      ok: true,
      order: {
        id: savedOrder.id,
        orderNumber: savedOrder.order_number,
        customerName: savedOrder.customer_name,
        customerPhone: savedOrder.customer_phone,
        customerEmail: savedOrder.customer_email || '',
        shippingAddress: savedOrder.address,
        city: savedOrder.city,
        deliveryArea: area || undefined,
        deliveryMethod: deliverySpec.label,
        deliveryInstructions: deliveryInstructions || undefined,
        notes: orderNotes || undefined,
        subtotal,
        deliveryFee: deliveryCharge,
        discount: discountTotal,
        total: grandTotal,
        status: savedOrder.status || 'pending',
        statusHistory: initialStatusHistory,
        paymentStatus: savedOrder.payment_status || 'pending',
        paymentMethod: savedOrder.payment_method || paymentMethod,
        source: savedOrder.source || `Website (${subdomain}.amaas.xyz)`,
        websiteId,
        websiteSubdomain: subdomain,
        customerAuthUserId: verifiedCustomerAuthUserId || undefined,
        merchantBrandingSnapshot,
        items: orderItemsSnapshot,
        createdAt: savedOrder.created_at || orderPlacedAtIso,
      },
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: 'INTERNAL_ORDER_ERROR',
      error: 'An unexpected server error occurred while processing your order.',
    });
  }
}
