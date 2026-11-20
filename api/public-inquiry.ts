import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_REGEX = /^(?:\+?8801[3-9]\d{8}|01[3-9]\d{8}|\+?[1-9]\d{7,14})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESERVED_SUBDOMAINS = new Set([
  'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
  'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
  'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
  'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
  'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
  'testing', 'webhook', 'webhooks', 'www',
]);

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

const INQUIRY_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

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

async function checkInquiryRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const bucketKey = `rl:public-inquiry:${ip}`;
  const maxReq = 15;
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
  if (INQUIRY_RATE_BUCKETS.size >= 5000) {
    for (const [k, v] of INQUIRY_RATE_BUCKETS.entries()) {
      if (v.resetAt <= now) INQUIRY_RATE_BUCKETS.delete(k);
    }
    if (INQUIRY_RATE_BUCKETS.size >= 5000) {
      const oldestKey = INQUIRY_RATE_BUCKETS.keys().next().value;
      if (oldestKey) INQUIRY_RATE_BUCKETS.delete(oldestKey);
    }
  }
  const existing = INQUIRY_RATE_BUCKETS.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    INQUIRY_RATE_BUCKETS.set(bucketKey, { count: 1, resetAt: now + windowMs });
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

function buildDeterministicInquiryNumber(subdomain: string, attemptId: string): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const digest = createHash('sha256')
    .update(`${subdomain.toLowerCase()}:${attemptId.trim()}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  return `INQ-${yy}${mm}${dd}-${digest}`;
}

export default async function handler(req: RequestWithBody, res: ServerResponse) {
  const originHeader = String(req.headers.origin || '').trim();
  const originAllowed = originHeader ? isAllowedStorefrontOrigin(originHeader) : false;
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  const rl = await checkInquiryRateLimit(getClientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    sendJson(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Too many inquiries sent. Please wait before trying again.' });
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
      sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid inquiry request body.' });
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

    const inquiryAttemptId = String(body.inquiryAttemptId || '').trim();
    if (inquiryAttemptId.length < 8 || inquiryAttemptId.length > 128) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_IDEMPOTENCY_KEY',
        error: 'Invalid inquiry submission token. Please refresh the page and try again.',
      });
      return;
    }

    const customerName = String(body.customerName || '').trim().slice(0, 120);
    const customerPhoneRaw = String(body.customerPhone || '')
      .replace(/[\s()-]+/g, '')
      .trim();
    const customerEmail = String(body.customerEmail || '').trim().slice(0, 160);
    const productName = String(body.productName || '').trim().slice(0, 160);
    const productIdRaw = String(body.productId || '').trim();
    const productId = UUID_REGEX.test(productIdRaw) ? productIdRaw : undefined;
    const rawSubject = String(body.subject || '').trim().slice(0, 160);
    const messageText = String(body.message || '').trim().slice(0, 2000);

    if (customerName.length < 2) {
      sendJson(res, 400, { ok: false, code: 'INVALID_NAME', error: 'Please enter your name.' });
      return;
    }
    if (!customerPhoneRaw && !customerEmail) {
      sendJson(res, 400, {
        ok: false,
        code: 'MISSING_CONTACT',
        error: 'Please enter your phone number or email address so the store can reply to you.',
      });
      return;
    }
    if (customerPhoneRaw && !PHONE_REGEX.test(customerPhoneRaw)) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_PHONE',
        error: 'Please enter a valid mobile number (e.g., 017XXXXXXXX or +88017XXXXXXXX).',
      });
      return;
    }
    if (customerEmail && !EMAIL_REGEX.test(customerEmail)) {
      sendJson(res, 400, { ok: false, code: 'INVALID_EMAIL', error: 'Please enter a valid email address.' });
      return;
    }
    if (messageText.length < 3) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_MESSAGE',
        error: 'Please enter your message or question (at least 3 characters).',
      });
      return;
    }

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

    let expectedUrlRef = '';
    try {
      const hostMatch = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      expectedUrlRef = hostMatch ? hostMatch[1].toLowerCase() : '';
    } catch {
      sendJson(res, 503, { ok: false, code: 'INVALID_SUPABASE_URL', error: 'Invalid backend configuration.' });
      return;
    }

    // Step 1: Verify published, paid, active, unexpired storefront via audited SECURITY DEFINER RPC
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
        error: 'Inquiries cannot be sent because this website subscription is currently inactive.',
      });
      return;
    }

    if (!serviceRoleKey) {
      sendJson(res, 503, {
        ok: false,
        code: 'SERVER_SERVICE_ROLE_KEY_REQUIRED',
        error:
          'Public inquiry persistence requires SUPABASE_SERVICE_ROLE_KEY to be configured in the server environment.',
      });
      return;
    }

    if (!serviceRoleKey.startsWith('sb_secret_')) {
      try {
        const jwtParts = serviceRoleKey.split('.');
        if (jwtParts.length === 3) {
          const claims = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
          if (claims?.role && claims.role !== 'service_role') {
            sendJson(res, 503, {
              ok: false,
              code: 'INVALID_SERVER_KEY_ROLE',
              error: 'Server inquiry key does not carry service_role privileges.',
            });
            return;
          }
          if (claims?.ref && expectedUrlRef && String(claims.ref).toLowerCase() !== expectedUrlRef) {
            sendJson(res, 503, {
              ok: false,
              code: 'SERVER_KEY_PROJECT_MISMATCH',
              error: 'Server inquiry key project reference does not match configured Supabase URL.',
            });
            return;
          }
        }
      } catch {
        sendJson(res, 503, {
          ok: false,
          code: 'MALFORMED_SERVER_KEY',
          error: 'Server inquiry key configuration is invalid.',
        });
        return;
      }
    }

    const adminHeaders: Record<string, string> = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    // Step 2: Authoritatively resolve website, merchant user_id, and linked store_id
    const siteSelectCols =
      'id,store_id,user_id,business_name,status,payment_status,deployment_status,current_period_end';
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
    if (!siteRow || !UUID_REGEX.test(String(siteRow.id || '').trim())) {
      sendJson(res, 404, {
        ok: false,
        code: 'STOREFRONT_NOT_LIVE',
        error: 'This website is not currently active or published.',
      });
      return;
    }

    const rowPeriodEnd = siteRow.current_period_end ? Date.parse(String(siteRow.current_period_end)) : NaN;
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
        error: 'Inquiries cannot be sent because this storefront subscription is currently inactive.',
      });
      return;
    }

    const websiteId = String(siteRow.id).trim();
    const siteOwnerUserId = String(siteRow.user_id || '').trim();
    if (!UUID_REGEX.test(siteOwnerUserId)) {
      sendJson(res, 422, {
        ok: false,
        code: 'STOREFRONT_OWNER_MISSING',
        error: 'This website is not linked to an active merchant account yet.',
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

    // Strict store resolution (never trust client-supplied storeId)
    let storeId = '';
    const rowStoreId = String(siteRow.store_id || '').trim();
    if (UUID_REGEX.test(rowStoreId)) {
      const verifyStoreResp = await fetch(
        `${supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(rowStoreId)}&select=id,owner_id&limit=1`,
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
          `${supabaseUrl}/rest/v1/store_members?store_id=eq.${encodeURIComponent(rowStoreId)}&user_id=eq.${encodeURIComponent(siteOwnerUserId)}&status=eq.active&select=id&limit=1`,
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
    } else {
      const ownerStoreResp = await fetch(
        `${supabaseUrl}/rest/v1/stores?owner_id=eq.${encodeURIComponent(siteOwnerUserId)}&order=created_at.asc&limit=2&select=id,owner_id`,
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
        storeId = String(eligibleStores[0].id).trim();
      } else if (eligibleStores.length > 1) {
        sendJson(res, 422, {
          ok: false,
          code: 'STORE_LINK_AMBIGUOUS',
          error: 'This website cannot route inquiries yet because the merchant has multiple stores without a specific store link.',
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
            error: 'This website cannot route inquiries yet because the merchant belongs to multiple stores without a specific store link.',
          });
          return;
        } else {
          sendJson(res, 422, {
            ok: false,
            code: 'STORE_NOT_LINKED',
            error: 'This website is not linked to an active merchant inventory store yet.',
          });
          return;
        }
      }
    }

    // Step 3: Idempotency check on public.support_tickets
    const ticketNumber = buildDeterministicInquiryNumber(subdomain, inquiryAttemptId);
    const cleanSubject =
      rawSubject ||
      (productName
        ? `Product Inquiry: ${productName}`
        : `Website Inquiry from ${customerName}`);

    const existingResp = await fetch(
      `${supabaseUrl}/rest/v1/support_tickets?user_id=eq.${encodeURIComponent(siteOwnerUserId)}&ticket_number=eq.${encodeURIComponent(ticketNumber)}&select=id,ticket_number,subject,status,created_at&limit=1`,
      { method: 'GET', headers: adminHeaders }
    );
    if (existingResp.ok) {
      const existingRows = (await existingResp.json()) as any[];
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const row = existingRows[0];
        sendJson(res, 200, {
          ok: true,
          duplicatePrevented: true,
          inquiry: {
            id: row.id,
            ticketNumber: row.ticket_number,
            subject: row.subject,
            status: row.status || 'open',
            websiteId,
            storeId,
            subdomain,
            createdAt: row.created_at,
          },
        });
        return;
      }
    }

    // Step 4: Persist customer inquiry into public.support_tickets for merchant Inbox & Support
    const nowIso = new Date().toISOString();
    const initialMessage = {
      id: `msg-inq-${Date.now()}`,
      sender: customerName,
      text: messageText,
      timestamp: nowIso,
      isStaff: false,
      inquiryMeta: {
        source: 'public_website_inquiry',
        websiteId,
        storeId,
        subdomain,
        customerName,
        ...(customerPhoneRaw ? { customerPhone: customerPhoneRaw } : {}),
        ...(customerEmail ? { customerEmail } : {}),
        ...(productName ? { productName } : {}),
        ...(productId ? { productId } : {}),
        inquirySubject: cleanSubject,
      },
    };

    const insertResp = await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: siteOwnerUserId,
        ticket_number: ticketNumber,
        subject: cleanSubject,
        category: 'Website Service',
        priority: 'medium',
        status: 'open',
        messages: [initialMessage],
      }),
    });

    if (!insertResp.ok) {
      sendJson(res, 502, {
        ok: false,
        code: 'INQUIRY_INSERT_FAILED',
        error: 'Unable to send your message right now. Please try again in a moment.',
      });
      return;
    }

    const insertedRows = (await insertResp.json()) as any[];
    const savedRow = Array.isArray(insertedRows) ? insertedRows[0] : null;
    if (!savedRow || !savedRow.id) {
      sendJson(res, 502, {
        ok: false,
        code: 'INQUIRY_CONFIRMATION_MISSING',
        error: 'Your message could not be confirmed by the server.',
      });
      return;
    }

    // Step 5: Non-fatal CRM lead sync in public.customers when phone number is provided
    if (UUID_REGEX.test(storeId) && customerPhoneRaw) {
      try {
        const digitsOnly = customerPhoneRaw.replace(/^\+/, '');
        const phoneVariants = new Set<string>([customerPhoneRaw]);
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
          `${supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(storeId)}&or=(${phoneOrClause})&limit=1&select=id`,
          { method: 'GET', headers: adminHeaders }
        );
        const existingCustomers = custLookupResp.ok ? ((await custLookupResp.json()) as any[]) : [];
        if (!Array.isArray(existingCustomers) || existingCustomers.length === 0) {
          await fetch(`${supabaseUrl}/rest/v1/customers`, {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify({
              store_id: storeId,
              name: customerName,
              phone: customerPhoneRaw,
              email: customerEmail || null,
              address: '',
              city: '',
              orders_count: 0,
              total_spent: 0,
              notes: `Website inquiry (${subdomain}.amaas.xyz): ${cleanSubject}`,
            }),
          });
        }
      } catch {
        // Non-fatal CRM lead creation
      }
    }

    sendJson(res, 201, {
      ok: true,
      inquiry: {
        id: savedRow.id,
        ticketNumber: savedRow.ticket_number || ticketNumber,
        subject: savedRow.subject || cleanSubject,
        status: savedRow.status || 'open',
        websiteId,
        storeId,
        subdomain,
        createdAt: savedRow.created_at || nowIso,
      },
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: 'INTERNAL_INQUIRY_ERROR',
      error: 'An unexpected server error occurred while sending your message.',
    });
  }
}
