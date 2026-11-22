import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

type AdminWebsiteAction = 'suspend' | 'reactivate' | 'renew' | 'delete';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORIZED_ADMIN_EMAIL = 'official.amaas.dev@gmail.com';
const ALLOWED_ADMIN_EXACT_ORIGINS = new Set([
  'https://app.amaas.xyz',
  'https://amaas.xyz',
  'https://www.amaas.xyz',
]);

const ADMIN_ACTION_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

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

function isAllowedAdminOrigin(originRaw: string): boolean {
  const origin = String(originRaw || '').trim();
  if (!origin) return false;
  if (ALLOWED_ADMIN_EXACT_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const envAppUrl = String(process.env.APP_URL || '').trim();
    if (envAppUrl) {
      try {
        if (new URL(envAppUrl).origin === parsed.origin) return true;
      } catch {}
    }
    const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (!isProd && parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

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

async function checkAdminActionRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const bucketKey = `rl:admin-website-action:${ip}`;
  const maxReq = 30;
  const windowSec = 60;
  const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const upstashToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

  if (upstashUrl.startsWith('https://') && upstashToken) {
    try {
      const resp = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', bucketKey],
          ['EXPIRE', bucketKey, String(windowSec), 'NX'],
          ['TTL', bucketKey],
        ]),
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
  if (ADMIN_ACTION_RATE_BUCKETS.size >= 5000) {
    for (const [k, v] of ADMIN_ACTION_RATE_BUCKETS.entries()) {
      if (v.resetAt <= now) ADMIN_ACTION_RATE_BUCKETS.delete(k);
    }
    if (ADMIN_ACTION_RATE_BUCKETS.size >= 5000) {
      const oldestKey = ADMIN_ACTION_RATE_BUCKETS.keys().next().value;
      if (oldestKey) ADMIN_ACTION_RATE_BUCKETS.delete(oldestKey);
    }
  }
  const existing = ADMIN_ACTION_RATE_BUCKETS.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    ADMIN_ACTION_RATE_BUCKETS.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: windowSec };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= maxReq,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

type ReadBodyResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'unsupported_media_type' }
  | { kind: 'too_large' }
  | { kind: 'invalid_json' };

async function readJsonBody(req: RequestWithBody): Promise<ReadBodyResult> {
  const rawCt = String(req.headers['content-type'] || '').trim().toLowerCase();
  if (rawCt && !rawCt.includes('application/json') && !rawCt.includes('+json')) {
    return { kind: 'unsupported_media_type' };
  }
  const rawContentLen = Number(req.headers['content-length']);
  if (Number.isFinite(rawContentLen) && rawContentLen > 32768) {
    return { kind: 'too_large' };
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Array.isArray(req.body)) return { kind: 'invalid_json' };
    return { kind: 'ok', body: req.body as Record<string, unknown> };
  }
  if (typeof req.body === 'string') {
    if (req.body.length > 32768) return { kind: 'too_large' };
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { kind: 'ok', body: parsed as Record<string, unknown> }
        : { kind: 'invalid_json' };
    } catch {
      return { kind: 'invalid_json' };
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 32768) {
      return { kind: 'too_large' };
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return { kind: 'invalid_json' };
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { kind: 'ok', body: parsed as Record<string, unknown> }
      : { kind: 'invalid_json' };
  } catch {
    return { kind: 'invalid_json' };
  }
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolveSupabaseServerEnv(): {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
} | null {
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (
    !supabaseUrl.startsWith('https://') ||
    supabaseUrl === 'https://your-project.supabase.co' ||
    !serviceRoleKey ||
    serviceRoleKey.includes('your-')
  ) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey, anonKey };
}

interface SupabaseAuthUserPayload {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  factors?: Array<{ factor_type?: string; status?: string }>;
}

interface SubscribedWebsiteRow {
  id: string;
  user_id?: string | null;
  store_id?: string | null;
  business_name?: string | null;
  subdomain?: string | null;
  full_domain?: string | null;
  status?: string | null;
  deployment_status?: string | null;
  payment_status?: string | null;
  current_period_end?: string | null;
  grace_period_end?: string | null;
  config?: Record<string, unknown> | null;
}

const WEBSITE_ASSETS_BUCKET = 'website-assets';

function extractWebsiteAssetPath(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  try {
    const parsed = new URL(trimmed);
    const markers = [
      `/storage/v1/object/public/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/sign/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/authenticated/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/${WEBSITE_ASSETS_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        const relRaw = parsed.pathname.slice(idx + marker.length);
        const decoded = decodeURIComponent(relRaw).replace(/^\/+/, '');
        if (!decoded || decoded.includes('..') || decoded.includes('\0')) return null;
        return decoded;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function collectConfigAssetPaths(config: unknown, targetSet: Set<string>) {
  if (!config || typeof config !== 'object') return;
  const cfg = config as Record<string, unknown>;
  const directKeys = ['logoUrl', 'heroImageUrl', 'bannerImageUrl'];
  for (const key of directKeys) {
    const p = extractWebsiteAssetPath(cfg[key]);
    if (p) targetSet.add(p);
  }
  const sections = Array.isArray(cfg.sections) ? cfg.sections : [];
  for (const sec of sections) {
    if (sec && typeof sec === 'object') {
      const p = extractWebsiteAssetPath((sec as Record<string, unknown>).imageUrl);
      if (p) targetSet.add(p);
    }
  }
  const items = Array.isArray(cfg.servicesOrProducts) ? cfg.servicesOrProducts : [];
  for (const it of items) {
    if (it && typeof it === 'object') {
      const p = extractWebsiteAssetPath((it as Record<string, unknown>).imageUrl);
      if (p) targetSet.add(p);
    }
  }
  if (cfg.draft && typeof cfg.draft === 'object') {
    collectConfigAssetPaths(cfg.draft, targetSet);
  }
}

function isSafeOwnedScopePath(candidate: string, ownerUserId: string, scopeId: string): boolean {
  if (!candidate || !UUID_REGEX.test(ownerUserId) || !UUID_REGEX.test(scopeId)) return false;
  if (candidate.includes('..') || candidate.includes('\0') || candidate.startsWith('/')) return false;
  const expectedPrefix = `${ownerUserId.toLowerCase()}/${scopeId.toLowerCase()}/`;
  return candidate.toLowerCase().startsWith(expectedPrefix);
}

async function listStorageObjectsRecursively(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  prefix: string,
  outPaths: Set<string>,
  depth = 0
): Promise<{ hadError: boolean }> {
  if (depth > 4 || outPaths.size >= 5000) return { hadError: false };
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  if (!cleanPrefix || cleanPrefix.includes('..') || cleanPrefix.includes('\0')) {
    return { hadError: false };
  }

  let hadError = false;
  try {
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/list/${WEBSITE_ASSETS_BUCKET}`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        prefix: cleanPrefix,
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!resp.ok) return { hadError: true };
    const entries = (await resp.json()) as Array<{ id?: string | null; name?: string | null }>;
    if (!Array.isArray(entries)) return { hadError: false };
    for (const entry of entries) {
      const name = String(entry?.name || '').trim();
      if (!name || name === '.' || name === '..' || name.includes('..') || name.includes('\0')) {
        continue;
      }
      const fullPath = `${cleanPrefix}/${name}`;
      if (entry.id === null || entry.id === undefined) {
        const subRes = await listStorageObjectsRecursively(
          supabaseUrl,
          serviceHeaders,
          fullPath,
          outPaths,
          depth + 1
        );
        if (subRes.hadError) hadError = true;
      } else {
        outPaths.add(fullPath);
      }
    }
  } catch {
    hadError = true;
  }
  return { hadError };
}

async function removeStorageObjectsBatch(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  paths: string[]
): Promise<{ deletedCount: number; warning?: string }> {
  if (paths.length === 0) return { deletedCount: 0 };
  let deletedCount = 0;
  let warning: string | undefined;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const resp = await fetch(`${supabaseUrl}/storage/v1/object/${WEBSITE_ASSETS_BUCKET}`, {
        method: 'DELETE',
        headers: serviceHeaders,
        body: JSON.stringify({ prefixes: chunk }),
      });
      if (resp.ok) {
        deletedCount += chunk.length;
      } else {
        warning = 'Some storage files could not be removed automatically after database deletion.';
      }
    } catch {
      warning = 'Storage service cleanup encountered a network error after database deletion.';
    }
  }
  return { deletedCount, ...(warning ? { warning } : {}) };
}

export default async function handler(req: RequestWithBody, res: ServerResponse) {
  const originHeader = String(req.headers.origin || '').trim();
  const originAllowed = originHeader ? isAllowedAdminOrigin(originHeader) : false;
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    if (originHeader && !originAllowed) {
      sendJson(res, 403, { code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin not allowed.' });
      return;
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (originHeader && !originAllowed) {
    sendJson(res, 403, { code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin not allowed.' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    return;
  }

  const rl = await checkAdminActionRateLimit(getClientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    sendJson(res, 429, {
      code: 'RATE_LIMITED',
      error: 'Too many administrative requests. Please wait and try again.',
    });
    return;
  }

  const env = resolveSupabaseServerEnv();
  if (!env) {
    sendJson(res, 503, {
      code: 'ADMIN_API_NOT_CONFIGURED',
      error: 'Server-side administrative service credentials are not configured.',
    });
    return;
  }

  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    sendJson(res, 401, {
      code: 'UNAUTHORIZED',
      error: 'Authentication token is required.',
    });
    return;
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken || accessToken.length > 8192) {
    sendJson(res, 401, {
      code: 'UNAUTHORIZED',
      error: 'Invalid authentication token.',
    });
    return;
  }

  const bodyRes = await readJsonBody(req);
  if (bodyRes.kind === 'unsupported_media_type') {
    sendJson(res, 415, { code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Content-Type must be application/json.' });
    return;
  }
  if (bodyRes.kind === 'too_large') {
    sendJson(res, 413, { code: 'PAYLOAD_TOO_LARGE', error: 'Request payload is too large.' });
    return;
  }
  if (bodyRes.kind === 'invalid_json') {
    sendJson(res, 400, { code: 'INVALID_JSON', error: 'Invalid JSON request payload.' });
    return;
  }

  const rawBody = bodyRes.body;
  const action = String(rawBody.action || '').trim().toLowerCase() as AdminWebsiteAction;
  const websiteId = String(rawBody.websiteId || '').trim();
  const reason = String(rawBody.reason || '').trim().slice(0, 600);
  const confirmSubdomain = String(rawBody.confirmSubdomain || '').trim().toLowerCase();
  const explicitConfirmed = rawBody.explicitConfirmed === true;

  if (!['suspend', 'reactivate', 'renew', 'delete'].includes(action)) {
    sendJson(res, 400, {
      code: 'INVALID_ACTION',
      error: 'Unsupported action. Expected suspend, reactivate, renew, or delete.',
    });
    return;
  }

  if (!UUID_REGEX.test(websiteId)) {
    sendJson(res, 400, {
      code: 'INVALID_WEBSITE_ID',
      error: 'A valid website UUID is required.',
    });
    return;
  }

  if ((action === 'suspend' || action === 'reactivate' || action === 'renew') && !reason) {
    sendJson(res, 400, {
      code: 'REASON_REQUIRED',
      error: 'An explicit administrative reason is required for this lifecycle action.',
    });
    return;
  }

  if (action === 'delete' && (!explicitConfirmed || !confirmSubdomain)) {
    sendJson(res, 400, {
      code: 'DELETE_CONFIRMATION_REQUIRED',
      error: 'Permanent deletion requires subdomain verification and explicit final confirmation.',
    });
    return;
  }

  try {
    // 1. Validate caller JWT directly with Supabase Auth
    const authResp = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: env.anonKey || env.serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!authResp.ok) {
      sendJson(res, 401, {
        code: 'INVALID_SESSION',
        error: 'Administrator session is invalid or expired. Please sign in again.',
      });
      return;
    }

    const authUser = (await authResp.json()) as SupabaseAuthUserPayload;
    const callerId = String(authUser?.id || '').trim();
    const callerEmail = String(authUser?.email || '').trim().toLowerCase();
    const isEmailVerified = Boolean(
      authUser?.email_confirmed_at ||
        authUser?.confirmed_at ||
        authUser?.user_metadata?.email_verified === true
    );

    if (!UUID_REGEX.test(callerId) || !callerEmail || !isEmailVerified) {
      sendJson(res, 403, {
        code: 'FORBIDDEN_ADMIN_REQUIRED',
        error: 'Access denied. Verified administrator privileges are required.',
      });
      return;
    }

    if (callerEmail !== AUTHORIZED_ADMIN_EMAIL) {
      sendJson(res, 403, {
        code: 'FORBIDDEN_ADMIN_REQUIRED',
        error: 'Access denied. Only authorized platform administrators may perform this action.',
      });
      return;
    }

    // 2. Enforce AAL2 MFA when verified TOTP factor is enrolled
    const hasVerifiedTotp = Array.isArray(authUser?.factors)
      ? authUser.factors.some((f) => f?.factor_type === 'totp' && f?.status === 'verified')
      : false;
    if (hasVerifiedTotp) {
      const jwtClaims = decodeJwtClaims(accessToken);
      if (jwtClaims?.aal !== 'aal2') {
        sendJson(res, 403, {
          code: 'MFA_REQUIRED',
          error: 'Multi-factor authenticator verification (AAL2) is required.',
        });
        return;
      }
    }

    const serviceHeaders = {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    // 3. Authoritative server-side profile role check
    const profileResp = await fetch(
      `${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=id,email,role&limit=1`,
      { method: 'GET', headers: serviceHeaders }
    );
    if (!profileResp.ok) {
      sendJson(res, 502, {
        code: 'ADMIN_ROLE_CHECK_FAILED',
        error: 'Unable to verify administrator role against database.',
      });
      return;
    }
    const profileRows = (await profileResp.json()) as Array<{
      id?: string;
      email?: string | null;
      role?: string | null;
    }>;
    const callerProfile = profileRows?.[0];
    const profileEmail = String(callerProfile?.email || '').trim().toLowerCase();
    if (
      !callerProfile ||
      callerProfile.role !== 'admin' ||
      (profileEmail && profileEmail !== AUTHORIZED_ADMIN_EMAIL)
    ) {
      sendJson(res, 403, {
        code: 'FORBIDDEN_ADMIN_REQUIRED',
        error: 'Access denied. Administrator role is required.',
      });
      return;
    }

    // 4. Fetch exact target subscribed_websites record
    const siteResp = await fetch(
      `${env.supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(
        websiteId
      )}&select=id,user_id,store_id,business_name,subdomain,full_domain,status,deployment_status,payment_status,current_period_end,grace_period_end,config&limit=1`,
      { method: 'GET', headers: serviceHeaders }
    );
    if (!siteResp.ok) {
      sendJson(res, 502, {
        code: 'WEBSITE_LOOKUP_FAILED',
        error: 'Unable to look up target website record.',
      });
      return;
    }
    const siteRows = (await siteResp.json()) as SubscribedWebsiteRow[];
    const site = siteRows?.[0];
    if (!site) {
      sendJson(res, 404, {
        code: 'NOT_FOUND',
        error: 'Website record not found or already deleted.',
      });
      return;
    }

    const nowIso = new Date().toISOString();

    if (action === 'suspend') {
      const patchResp = await fetch(
        `${env.supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(websiteId)}`,
        {
          method: 'PATCH',
          headers: { ...serviceHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'suspended',
            deployment_status: 'suspended',
            updated_at: nowIso,
          }),
        }
      );

      if (!patchResp.ok) {
        sendJson(res, 502, {
          code: 'SUSPEND_FAILED',
          error: 'Database failed to suspend website.',
        });
        return;
      }

      const auditResp = await fetch(`${env.supabaseUrl}/rest/v1/website_lifecycle_audit_logs`, {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          website_id: websiteId,
          admin_id: callerId,
          action: 'suspend',
          reason,
          verified_payment_request_id: null,
          previous_status: site.status || null,
          new_status: 'suspended',
          previous_deployment_status: site.deployment_status || null,
          new_deployment_status: 'suspended',
          payment_status_snapshot: site.payment_status || null,
          previous_period_end: site.current_period_end || null,
          new_period_end: site.current_period_end || null,
        }),
      });
      let auditLogId: string | undefined;
      if (auditResp.ok) {
        const auditRows = (await auditResp.json()) as Array<{ id?: string }>;
        auditLogId = auditRows?.[0]?.id;
      }

      sendJson(res, 200, {
        ok: true,
        success: true,
        code: 'SUSPENDED',
        message: 'Website suspended and taken offline.',
        websiteId,
        status: 'suspended',
        deploymentStatus: 'suspended',
        auditLogId,
      });
      return;
    }

    if (action === 'reactivate' || action === 'renew') {
      if (site.status === 'cancelled') {
        sendJson(res, 409, {
          code: 'SUBSCRIPTION_CANCELLED',
          error: 'Cannot reactivate or renew a cancelled website subscription.',
        });
        return;
      }

      // Verify approved payment exists for this website
      const paymentCheckResp = await fetch(
        `${env.supabaseUrl}/rest/v1/payment_requests?status=eq.approved&user_id=eq.${encodeURIComponent(
          site.user_id || ''
        )}&service_type=in.(website_subscription,website_package)&select=id,service_id,reviewed_at,updated_at,created_at&order=created_at.desc`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (!paymentCheckResp.ok) {
        sendJson(res, 502, {
          code: 'PAYMENT_VERIFICATION_LOOKUP_FAILED',
          error: 'Unable to verify approved subscription payment.',
        });
        return;
      }
      const paymentRows = (await paymentCheckResp.json()) as Array<{
        id: string;
        service_id?: string | null;
      }>;
      const verifiedPayment = paymentRows.find(
        (pr) => (pr.service_id || '').trim().toLowerCase() === websiteId.toLowerCase()
      );
      if (site.payment_status !== 'paid' || !verifiedPayment) {
        sendJson(res, 400, {
          code: 'PAYMENT_REQUIRED',
          error:
            'Cannot activate or renew website without a verified approved payment request. Approve a payment submission first.',
        });
        return;
      }

      const nowMs = Date.now();
      const currentPeriodMs = site.current_period_end ? Date.parse(site.current_period_end) : NaN;
      const currentGraceMs = site.grace_period_end ? Date.parse(site.grace_period_end) : NaN;

      let nextPeriodEndIso: string;
      let nextGraceEndIso: string;
      let nextDeploymentStatus = site.deployment_status || 'live';

      if (action === 'reactivate') {
        nextPeriodEndIso =
          Number.isFinite(currentPeriodMs) && currentPeriodMs >= nowMs
            ? site.current_period_end!
            : new Date(nowMs + 30 * 86400 * 1000).toISOString();
        nextGraceEndIso =
          Number.isFinite(currentGraceMs) && currentGraceMs >= nowMs
            ? site.grace_period_end!
            : new Date(nowMs + 35 * 86400 * 1000).toISOString();
        nextDeploymentStatus = 'live';
      } else {
        const baseMs =
          Number.isFinite(currentPeriodMs) && currentPeriodMs > nowMs ? currentPeriodMs : nowMs;
        nextPeriodEndIso = new Date(baseMs + 30 * 86400 * 1000).toISOString();
        nextGraceEndIso = new Date(baseMs + 35 * 86400 * 1000).toISOString();
      }

      const patchPayload: Record<string, unknown> = {
        status: 'active',
        current_period_end: nextPeriodEndIso,
        grace_period_end: nextGraceEndIso,
        updated_at: nowIso,
      };
      if (action === 'reactivate') {
        patchPayload.deployment_status = 'live';
      }

      const patchResp = await fetch(
        `${env.supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(
          websiteId
        )}&payment_status=eq.paid`,
        {
          method: 'PATCH',
          headers: { ...serviceHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(patchPayload),
        }
      );

      if (!patchResp.ok) {
        sendJson(res, 502, {
          code: 'LIFECYCLE_UPDATE_FAILED',
          error: `Database failed to ${action} website.`,
        });
        return;
      }

      const auditResp = await fetch(`${env.supabaseUrl}/rest/v1/website_lifecycle_audit_logs`, {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          website_id: websiteId,
          admin_id: callerId,
          action,
          reason,
          verified_payment_request_id: verifiedPayment.id,
          previous_status: site.status || null,
          new_status: 'active',
          previous_deployment_status: site.deployment_status || null,
          new_deployment_status: nextDeploymentStatus,
          payment_status_snapshot: site.payment_status || null,
          previous_period_end: site.current_period_end || null,
          new_period_end: nextPeriodEndIso,
        }),
      });
      let auditLogId: string | undefined;
      if (auditResp.ok) {
        const auditRows = (await auditResp.json()) as Array<{ id?: string }>;
        auditLogId = auditRows?.[0]?.id;
      }

      sendJson(res, 200, {
        ok: true,
        success: true,
        code: action === 'reactivate' ? 'REACTIVATED' : 'RENEWED',
        message:
          action === 'reactivate'
            ? 'Website reactivated and live.'
            : 'Website subscription renewed for 30 days.',
        websiteId,
        status: 'active',
        deploymentStatus: nextDeploymentStatus,
        currentPeriodEnd: nextPeriodEndIso,
        gracePeriodEnd: nextGraceEndIso,
        auditLogId,
      });
      return;
    }

    // action === 'delete'
    const actualSubdomain = String(site.subdomain || '').trim().toLowerCase();
    const actualFullDomain = String(site.full_domain || `${actualSubdomain}.amaas.xyz`)
      .trim()
      .toLowerCase();

    if (
      !actualSubdomain ||
      (confirmSubdomain !== actualSubdomain && confirmSubdomain !== actualFullDomain)
    ) {
      sendJson(res, 409, {
        code: 'SUBDOMAIN_CONFIRMATION_MISMATCH',
        error: 'Confirmation subdomain does not match the selected website.',
      });
      return;
    }

    // Pre-RPC metadata read (strictly non-destructive, zero store guessing):
    // Keep website-scoped paths strictly separated from store/product paths so post-RPC
    // cleanup only acts on the authoritative committed rpcResult outcome.
    const rawSiteConfigAssetPaths = new Set<string>();
    const preRpcWebsiteScopedPaths = new Set<string>();
    const preRpcStoreProductPaths = new Map<string, Set<string>>();
    const protectedAssetPaths = new Set<string>();
    const ownerUserId = String(site.user_id || '').trim();
    const targetStoreId = String(site.store_id || '').trim();

    collectConfigAssetPaths(site.config, rawSiteConfigAssetPaths);
    for (const p of rawSiteConfigAssetPaths) {
      if (isSafeOwnedScopePath(p, ownerUserId, websiteId)) {
        preRpcWebsiteScopedPaths.add(p);
      }
    }

    // Collect protected asset references from ANY surviving sibling websites (both same-owner AND cross-user shared store_id)
    const siblingMap = new Map<
      string,
      { id: string; user_id?: string | null; store_id?: string | null; config?: unknown }
    >();

    if (UUID_REGEX.test(ownerUserId)) {
      const ownerSiblingsResp = await fetch(
        `${env.supabaseUrl}/rest/v1/subscribed_websites?user_id=eq.${encodeURIComponent(
          ownerUserId
        )}&select=id,user_id,store_id,config`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (ownerSiblingsResp.ok) {
        const rows = (await ownerSiblingsResp.json()) as Array<{
          id: string;
          user_id?: string | null;
          store_id?: string | null;
          config?: unknown;
        }>;
        for (const r of Array.isArray(rows) ? rows : []) {
          if (r?.id && r.id !== websiteId) siblingMap.set(r.id, r);
        }
      }
    }

    if (UUID_REGEX.test(targetStoreId)) {
      const storeSiblingsResp = await fetch(
        `${env.supabaseUrl}/rest/v1/subscribed_websites?store_id=eq.${encodeURIComponent(
          targetStoreId
        )}&select=id,user_id,store_id,config`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (storeSiblingsResp.ok) {
        const rows = (await storeSiblingsResp.json()) as Array<{
          id: string;
          user_id?: string | null;
          store_id?: string | null;
          config?: unknown;
        }>;
        for (const r of Array.isArray(rows) ? rows : []) {
          if (r?.id && r.id !== websiteId) siblingMap.set(r.id, r);
        }
      }
    }

    const otherSites = Array.from(siblingMap.values());
    for (const other of otherSites) {
      collectConfigAssetPaths(other.config, protectedAssetPaths);
    }

    // Snapshot product image URLs BEFORE DB cascade deletes them (only used if rpcResult confirms
    // deletedStoreId === targetStoreId AND isSharedStore === false). Never guess a store when store_id is null.
    const deletedProdIds = new Set<string>();
    if (UUID_REGEX.test(targetStoreId) && UUID_REGEX.test(ownerUserId)) {
      const targetProdsResp = await fetch(
        `${env.supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(
          targetStoreId
        )}&select=id,image_url`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (targetProdsResp.ok) {
        const targetProds = (await targetProdsResp.json()) as Array<{
          id: string;
          image_url?: string | null;
        }>;
        const storeSet = new Set<string>();
        for (const prod of Array.isArray(targetProds) ? targetProds : []) {
          if (prod?.id) deletedProdIds.add(prod.id);
          const imgPath = extractWebsiteAssetPath(prod?.image_url);
          if (imgPath && isSafeOwnedScopePath(imgPath, ownerUserId, targetStoreId)) {
            storeSet.add(imgPath);
          }
        }
        preRpcStoreProductPaths.set(targetStoreId.toLowerCase(), storeSet);
      }
    }

    // Protect any asset paths still referenced by products in other surviving stores
    const otherStoreIds = Array.from(
      new Set(
        otherSites
          .map((s) => String(s.store_id || '').trim())
          .filter((sid) => UUID_REGEX.test(sid) && sid.toLowerCase() !== targetStoreId.toLowerCase())
      )
    );
    if (otherStoreIds.length > 0) {
      const otherProdsResp = await fetch(
        `${env.supabaseUrl}/rest/v1/products?store_id=in.(${otherStoreIds.join(',')})&select=id,image_url`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (otherProdsResp.ok) {
        const otherProds = (await otherProdsResp.json()) as Array<{
          id: string;
          image_url?: string | null;
        }>;
        for (const op of Array.isArray(otherProds) ? otherProds : []) {
          if (!deletedProdIds.has(op.id)) {
            const p = extractWebsiteAssetPath(op.image_url);
            if (p) protectedAssetPaths.add(p);
          }
        }
      }
    }

    const deleteReason =
      reason || 'Permanent admin deletion of website and exclusively associated store data';

    // Execute SINGLE ATOMIC PostgreSQL transaction via RPC.
    // Never silently fall back to non-atomic partial deletes if RPC is absent.
    const rpcResp = await fetch(
      `${env.supabaseUrl}/rest/v1/rpc/admin_permanently_delete_website`,
      {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          p_website_id: websiteId,
          p_admin_id: callerId,
          p_confirm_subdomain: confirmSubdomain,
          p_reason: deleteReason,
        }),
      }
    );

    if (!rpcResp.ok) {
      const errBody = (await rpcResp.json().catch(() => null)) as
        | { code?: string; message?: string; hint?: string }
        | null;
      const errCode = String(errBody?.code || '');
      const errMsg = String(errBody?.message || '');
      if (
        rpcResp.status === 404 ||
        errCode === 'PGRST202' ||
        errMsg.toLowerCase().includes('could not find the function') ||
        errMsg.toLowerCase().includes('admin_permanently_delete_website')
      ) {
        sendJson(res, 501, {
          code: 'ATOMIC_DELETE_RPC_REQUIRED',
          error:
            'Transactional permanent deletion RPC (public.admin_permanently_delete_website) is not yet installed in Supabase. No records were deleted.',
        });
        return;
      }

      sendJson(res, 502, {
        code: 'ATOMIC_DELETE_FAILED',
        error: 'Atomic database deletion failed and was completely rolled back. No records were deleted.',
      });
      return;
    }

    const rpcResult = (await rpcResp.json().catch(() => null)) as {
      success?: unknown;
      code?: unknown;
      message?: unknown;
      deletedWebsiteId?: unknown;
      deletedStoreId?: unknown;
      isSharedStore?: unknown;
      deletedCounts?: Record<string, number>;
      auditLogId?: unknown;
    } | null;

    if (
      !rpcResult ||
      typeof rpcResult !== 'object' ||
      Array.isArray(rpcResult) ||
      rpcResult.success !== true
    ) {
      const code =
        rpcResult && typeof rpcResult === 'object' && !Array.isArray(rpcResult) && typeof rpcResult.code === 'string'
          ? rpcResult.code
          : 'ATOMIC_DELETE_REJECTED';
      const status =
        code === 'NOT_FOUND'
          ? 404
          : code === 'SUBDOMAIN_CONFIRMATION_MISMATCH' ||
            code === 'CONCURRENT_MODIFICATION_RETRY' ||
            code === 'AMBIGUOUS_NULL_STORE_PRODUCTS'
          ? 409
          : code === 'FORBIDDEN_ADMIN_REQUIRED'
          ? 403
          : 400;
      const errMsg =
        rpcResult && typeof rpcResult === 'object' && !Array.isArray(rpcResult) && typeof rpcResult.message === 'string'
          ? rpcResult.message
          : 'Permanent deletion rejected by transactional database policy.';
      sendJson(res, status, {
        code,
        error: errMsg,
      });
      return;
    }

    // Post-commit authoritative RPC response validation before touching ANY Storage object:
    // (C) If rpcResult is malformed, missing fields, or inconsistent (e.g. invalid deletedStoreId
    //     or isSharedStore === true alongside non-null deletedStoreId), skip Storage cleanup completely.
    const rpcDeletedWebsiteId =
      typeof rpcResult.deletedWebsiteId === 'string' ? rpcResult.deletedWebsiteId.trim() : '';
    const hasValidWebsiteMatch =
      UUID_REGEX.test(rpcDeletedWebsiteId) &&
      rpcDeletedWebsiteId.toLowerCase() === websiteId.toLowerCase();
    const hasValidIsSharedFlag = typeof rpcResult.isSharedStore === 'boolean';
    const rawDeletedStoreId = rpcResult.deletedStoreId;
    const hasValidDeletedStoreId =
      rawDeletedStoreId === null ||
      (typeof rawDeletedStoreId === 'string' && UUID_REGEX.test(rawDeletedStoreId.trim()));
    const normalizedDeletedStoreId =
      typeof rawDeletedStoreId === 'string' ? rawDeletedStoreId.trim() : null;
    const hasInconsistentSharedState =
      rpcResult.isSharedStore === true && normalizedDeletedStoreId !== null;
    const hasMismatchedDeletedStoreId =
      normalizedDeletedStoreId !== null &&
      (!UUID_REGEX.test(targetStoreId) ||
        normalizedDeletedStoreId.toLowerCase() !== targetStoreId.toLowerCase());
    const hasValidOwnerUid = UUID_REGEX.test(ownerUserId);

    let storageCleanup: { deletedCount: number; warning?: string } = { deletedCount: 0 };
    let storageCleanupSkipped = false;

    if (
      !hasValidWebsiteMatch ||
      !hasValidIsSharedFlag ||
      !hasValidDeletedStoreId ||
      hasInconsistentSharedState ||
      hasMismatchedDeletedStoreId ||
      !hasValidOwnerUid
    ) {
      storageCleanupSkipped = true;
      storageCleanup = {
        deletedCount: 0,
        warning:
          'Database deletion committed, but Storage cleanup was skipped because the deletion response metadata was malformed or ambiguous.',
      };
    } else {
      const cleanupPaths = new Set<string>();
      let listHadError = false;

      // Website-scoped assets: ALWAYS strictly scoped to <ownerUserId>/<websiteId>/*
      for (const p of preRpcWebsiteScopedPaths) {
        if (isSafeOwnedScopePath(p, ownerUserId, websiteId)) {
          cleanupPaths.add(p);
        }
      }
      const listedSitePaths = new Set<string>();
      const siteListRes = await listStorageObjectsRecursively(
        env.supabaseUrl,
        serviceHeaders,
        `${ownerUserId}/${websiteId}`,
        listedSitePaths
      );
      if (siteListRes.hadError) listHadError = true;
      for (const p of listedSitePaths) {
        if (isSafeOwnedScopePath(p, ownerUserId, websiteId)) {
          cleanupPaths.add(p);
        }
      }

      // (A) Exclusively deleted store: ONLY when rpcResult.isSharedStore === false AND deletedStoreId is a valid UUID
      if (rpcResult.isSharedStore === false && normalizedDeletedStoreId !== null) {
        const preStorePaths = preRpcStoreProductPaths.get(normalizedDeletedStoreId.toLowerCase());
        if (preStorePaths) {
          for (const p of preStorePaths) {
            if (isSafeOwnedScopePath(p, ownerUserId, normalizedDeletedStoreId)) {
              cleanupPaths.add(p);
            }
          }
        }
        const listedStorePaths = new Set<string>();
        const storeListRes = await listStorageObjectsRecursively(
          env.supabaseUrl,
          serviceHeaders,
          `${ownerUserId}/${normalizedDeletedStoreId}`,
          listedStorePaths
        );
        if (storeListRes.hadError) listHadError = true;
        for (const p of listedStorePaths) {
          if (isSafeOwnedScopePath(p, ownerUserId, normalizedDeletedStoreId)) {
            cleanupPaths.add(p);
          }
        }
      }
      // (B) When deletedStoreId === null or isSharedStore === true, NEVER touch store/product paths.

      const finalExclusiveAssetPaths = Array.from(cleanupPaths).filter(
        (p) => !protectedAssetPaths.has(p)
      );

      storageCleanup = await removeStorageObjectsBatch(
        env.supabaseUrl,
        serviceHeaders,
        finalExclusiveAssetPaths
      );
      if (listHadError && !storageCleanup.warning) {
        storageCleanup.warning =
          'Some storage folders could not be listed cleanly during post-deletion cleanup.';
      }
    }

    sendJson(res, 200, {
      ok: true,
      success: true,
      code: 'DELETED',
      message:
        typeof rpcResult.message === 'string' && rpcResult.message
          ? rpcResult.message
          : 'Website and all exclusively associated store, product, inventory, customer, and order records were permanently deleted.',
      websiteId,
      deletedWebsiteId: hasValidWebsiteMatch ? rpcDeletedWebsiteId : websiteId,
      deletedStoreId: hasValidDeletedStoreId ? normalizedDeletedStoreId : null,
      isSharedStore: typeof rpcResult.isSharedStore === 'boolean' ? rpcResult.isSharedStore : false,
      deletedCounts: rpcResult.deletedCounts || {},
      deletedStorageObjects: storageCleanup.deletedCount,
      ...(storageCleanupSkipped ? { storageCleanupSkipped: true } : {}),
      ...(storageCleanup.warning ? { storageCleanupWarning: storageCleanup.warning } : {}),
      auditLogId: typeof rpcResult.auditLogId === 'string' ? rpcResult.auditLogId : undefined,
      subdomain: actualSubdomain,
      businessName: site.business_name || actualSubdomain,
      retainedRecords: {
        paymentRequests: true,
        lifecycleAuditLogs: true,
        globalAuthUsersProtected: true,
      },
    });
  } catch {
    sendJson(res, 500, {
      code: 'INTERNAL_ADMIN_ACTION_ERROR',
      error: 'Unexpected server error while processing administrative website action.',
    });
  }
}
