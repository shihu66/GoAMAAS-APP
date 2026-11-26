/**
 * ==============================================================================
 * TEMPORARY READ-ONLY DIAGNOSTIC ENDPOINT: /api/admin-diagnostic
 * ==============================================================================
 * Purpose:
 *   Validates whether `public.is_verified_platform_admin(uuid)` is installed
 *   and returns `true` for the verified platform administrator when invoked
 *   through PostgREST using the server-side `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Scope & Safeguards:
 *   - Staging verification ONLY (explicitly refuses Production project ref).
 *   - Read-only: Performs zero database writes, updates, or deletions.
 *   - Single-admin restricted: Allows ONLY `official.amaas.dev@gmail.com`.
 *   - Profile role verified: Requires `profiles.role === 'admin'` and non-empty email.
 *   - Minimal response: Returns ONLY `authenticated_user_id`, `project_ref`,
 *     and `admin_verified`.
 *   - Never exposes service-role keys, access tokens, or sensitive user data.
 *
 * REMOVAL INSTRUCTIONS (Run after Staging verification completes):
 *   1. Delete this file: `rm api/admin-diagnostic.ts`
 *   2. Remove the `adminDiagnosticHandler` import and `/api/admin-diagnostic`
 *      middleware route block in `vite.config.ts`.
 * ==============================================================================
 */

import type { IncomingMessage, ServerResponse } from 'http';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORIZED_ADMIN_EMAIL = 'official.amaas.dev@gmail.com';
const PRODUCTION_PROJECT_REF = 'rqmgnewipgqgmvzpbrfn';

const ALLOWED_EXACT_ORIGINS = new Set([
  'https://app.amaas.xyz',
  'https://amaas.xyz',
  'https://www.amaas.xyz',
]);

const DIAGNOSTIC_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.end(JSON.stringify(payload));
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

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowSec = 60;
  const maxReq = 20;
  if (DIAGNOSTIC_RATE_BUCKETS.size >= 2000) {
    for (const [k, v] of DIAGNOSTIC_RATE_BUCKETS.entries()) {
      if (v.resetAt <= now) DIAGNOSTIC_RATE_BUCKETS.delete(k);
    }
  }
  const existing = DIAGNOSTIC_RATE_BUCKETS.get(ip);
  if (!existing || existing.resetAt <= now) {
    DIAGNOSTIC_RATE_BUCKETS.set(ip, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, retryAfterSec: windowSec };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= maxReq,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function isAllowedDiagnosticOrigin(originRaw: string, req: IncomingMessage): boolean {
  const origin = String(originRaw || '').trim();
  if (!origin) return false;
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true;

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();

    const envAppUrl = String(process.env.APP_URL || '').trim();
    if (envAppUrl) {
      try {
        if (new URL(envAppUrl).origin === parsed.origin) return true;
      } catch {}
    }

    const vercelUrl = String(process.env.VERCEL_URL || '').trim();
    if (vercelUrl) {
      const normalizedVercelHost = vercelUrl.replace(/^https?:\/\//i, '').toLowerCase();
      if (parsed.protocol === 'https:' && parsed.host.toLowerCase() === normalizedVercelHost) {
        return true;
      }
    }

    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();
    if (reqHost && parsed.host.toLowerCase() === reqHost) {
      return true;
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

function extractSupabaseProjectRef(url: string): string {
  try {
    const parsed = new URL(String(url || '').trim());
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

type ResolvedSupabaseEnv =
  | {
      ok: true;
      supabaseUrl: string;
      serviceRoleKey: string;
      anonKey: string;
      projectRef: string;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
    };

function resolveStagingSupabaseEnv(): ResolvedSupabaseEnv {
  const candidates = [
    String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    String(process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, ''),
  ].filter((val) => val.startsWith('https://') && val !== 'https://your-project.supabase.co');

  const uniqueRefs = new Set(candidates.map((c) => extractSupabaseProjectRef(c)).filter(Boolean));
  if (uniqueRefs.size > 1) {
    return {
      ok: false,
      statusCode: 503,
      error: 'Configured Supabase URLs point to conflicting projects.',
    };
  }

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
    serviceRoleKey.includes('your-') ||
    !anonKey ||
    anonKey.includes('your-')
  ) {
    return {
      ok: false,
      statusCode: 503,
      error: 'Server-side Supabase credentials and valid anon key are required.',
    };
  }

  const projectRef = extractSupabaseProjectRef(supabaseUrl);
  if (!projectRef || projectRef === PRODUCTION_PROJECT_REF) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Diagnostic endpoint is restricted to Staging only and cannot target Production.',
    };
  }

  const serviceClaims = decodeJwtClaims(serviceRoleKey);
  if (serviceClaims) {
    const keyRole = typeof serviceClaims.role === 'string' ? serviceClaims.role.trim() : '';
    if (keyRole && keyRole !== 'service_role') {
      return {
        ok: false,
        statusCode: 503,
        error: 'Server credential configuration error.',
      };
    }
    const keyRef = typeof serviceClaims.ref === 'string' ? serviceClaims.ref.trim().toLowerCase() : '';
    if (keyRef && keyRef !== projectRef) {
      return {
        ok: false,
        statusCode: 503,
        error: 'Configured service credential project does not match Supabase URL.',
      };
    }
  }

  return {
    ok: true,
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    projectRef,
  };
}

export default async function adminDiagnosticHandler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const originHeader = String(req.headers.origin || '').trim();
  const originAllowed = originHeader ? isAllowedDiagnosticOrigin(originHeader, req) : false;

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    if (originHeader && !originAllowed) {
      sendJson(res, 403, { error: 'Origin not allowed.' });
      return;
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (originHeader && !originAllowed) {
    sendJson(res, 403, { error: 'Origin not allowed.' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed. Expected GET or POST.' });
    return;
  }

  const rl = checkRateLimit(getClientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    sendJson(res, 429, { error: 'Too many diagnostic requests. Please retry shortly.' });
    return;
  }

  const envRes = resolveStagingSupabaseEnv();
  if (!envRes.ok) {
    sendJson(res, envRes.statusCode, { error: envRes.error });
    return;
  }
  const env = envRes;

  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    sendJson(res, 401, { error: 'Authentication token is required.' });
    return;
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken || accessToken.length > 8192) {
    sendJson(res, 401, { error: 'Invalid authentication token.' });
    return;
  }

  try {
    // 1. Authenticate the caller using Supabase Auth access token and valid anon key
    const authResp = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!authResp.ok) {
      sendJson(res, 401, { error: 'Session is invalid or expired.' });
      return;
    }

    const authUser = (await authResp.json()) as {
      id?: string;
      email?: string;
      email_confirmed_at?: string;
      confirmed_at?: string;
      user_metadata?: { email_verified?: boolean };
    };

    const callerId = String(authUser?.id || '').trim();
    const callerEmail = String(authUser?.email || '').trim().toLowerCase();
    const isEmailVerified = Boolean(
      authUser?.email_confirmed_at ||
        authUser?.confirmed_at ||
        authUser?.user_metadata?.email_verified === true
    );

    if (!UUID_REGEX.test(callerId) || !callerEmail || !isEmailVerified) {
      sendJson(res, 403, { error: 'Access denied.' });
      return;
    }

    // 2. Allow only official.amaas.dev@gmail.com
    if (callerEmail !== AUTHORIZED_ADMIN_EMAIL) {
      sendJson(res, 403, { error: 'Access denied.' });
      return;
    }

    const serviceHeaders = {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
      'Accept-Profile': 'public',
    };

    // 3. Verify the caller's profile role is 'admin' and email matches exactly (rejecting null/empty)
    const profileResp = await fetch(
      `${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=id,email,role&limit=1`,
      { method: 'GET', headers: serviceHeaders }
    );

    if (!profileResp.ok) {
      sendJson(res, 502, { error: 'Unable to verify administrator profile.' });
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
      !profileEmail ||
      profileEmail !== AUTHORIZED_ADMIN_EMAIL
    ) {
      sendJson(res, 403, { error: 'Access denied.' });
      return;
    }

    // 4. Invoke public.is_verified_platform_admin(uuid) via PostgREST using service_role
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let rpcResp: Response;
    try {
      rpcResp = await fetch(`${env.supabaseUrl}/rest/v1/rpc/is_verified_platform_admin`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({ p_user_id: callerId }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeoutId);
      sendJson(res, 502, { error: 'Failed to verify admin status via database RPC.' });
      return;
    }
    clearTimeout(timeoutId);

    if (!rpcResp.ok) {
      sendJson(res, 502, { error: 'Failed to verify admin status via database RPC.' });
      return;
    }

    let rpcResult: unknown;
    try {
      rpcResult = await rpcResp.json();
    } catch {
      sendJson(res, 502, { error: 'Invalid response from admin verification RPC.' });
      return;
    }

    if (rpcResult !== true && rpcResult !== false) {
      sendJson(res, 502, { error: 'Unexpected response from admin verification RPC.' });
      return;
    }

    const adminVerified = rpcResult === true;

    // 5. Return ONLY authenticated user ID, configured Supabase project ref, and admin_verified
    sendJson(res, 200, {
      authenticated_user_id: callerId,
      project_ref: env.projectRef,
      admin_verified: adminVerified,
    });
  } catch {
    sendJson(res, 500, { error: 'Diagnostic request failed.' });
  }
}
