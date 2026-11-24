import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

type AdminWebsiteAction = 'suspend' | 'reactivate' | 'renew' | 'delete' | 'retry_storage_cleanup';

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
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return null;

  const normalizeRel = (relRaw: string): string | null => {
    let decoded = relRaw;
    try {
      decoded = decodeURIComponent(relRaw);
    } catch {
      decoded = relRaw.replace(/%20/g, ' ').replace(/%2[fF]/g, '/');
    }
    const clean = decoded.replace(/^\/+/, '').trim();
    if (!clean || clean.includes('..') || clean.includes('\\') || clean.includes('\0')) return null;
    return clean;
  };

  if (lower.startsWith(`${WEBSITE_ASSETS_BUCKET}/`)) {
    return normalizeRel(trimmed.slice(WEBSITE_ASSETS_BUCKET.length + 1).replace(/[?#].*$/, ''));
  }

  try {
    const parsed = new URL(trimmed);
    const markers = [
      `/storage/v1/object/public/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/sign/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/authenticated/${WEBSITE_ASSETS_BUCKET}/`,
      `/storage/v1/object/${WEBSITE_ASSETS_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.toLowerCase().indexOf(marker);
      if (idx !== -1) {
        return normalizeRel(parsed.pathname.slice(idx + marker.length));
      }
    }
    return null;
  } catch {
    const match = trimmed.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?website-assets\/([^?#]+)/i
    );
    if (match?.[1]) {
      return normalizeRel(match[1]);
    }
    return null;
  }
}

function isSupabaseStorageUrlOrPath(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const lower = rawUrl.trim().toLowerCase();
  if (!lower || lower.startsWith('data:') || lower.startsWith('blob:')) return false;
  return lower.includes('/storage/v1/object/') || lower.startsWith(`${WEBSITE_ASSETS_BUCKET}/`);
}

function collectJsonbAssetPaths(
  node: unknown,
  targetSet: Set<string>,
  uncertainSet?: Set<string>,
  depth = 0,
  budget = { visited: 0 }
) {
  if (node === null || node === undefined || depth > 12 || budget.visited > 10000) return;
  budget.visited += 1;

  if (typeof node === 'string') {
    const p = extractWebsiteAssetPath(node);
    if (p) {
      targetSet.add(p);
    } else if (uncertainSet && isSupabaseStorageUrlOrPath(node)) {
      uncertainSet.add(node.trim());
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonbAssetPaths(item, targetSet, uncertainSet, depth + 1, budget);
      if (budget.visited > 10000) break;
    }
    return;
  }

  if (typeof node === 'object') {
    for (const val of Object.values(node as Record<string, unknown>)) {
      collectJsonbAssetPaths(val, targetSet, uncertainSet, depth + 1, budget);
      if (budget.visited > 10000) break;
    }
  }
}

function isSafeOwnedScopePath(candidate: string, ownerUserId: string, scopeId: string): boolean {
  if (!candidate || !UUID_REGEX.test(ownerUserId) || !UUID_REGEX.test(scopeId)) return false;
  if (
    candidate.includes('..') ||
    candidate.includes('\\') ||
    candidate.includes('\0') ||
    candidate.startsWith('/')
  ) {
    return false;
  }
  const expectedPrefix = `${ownerUserId.toLowerCase()}/${scopeId.toLowerCase()}/`;
  return candidate.toLowerCase().startsWith(expectedPrefix);
}

async function fetchJsonAllowingMissingColumn(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; missingColumn: boolean; rows: Array<Record<string, unknown>> }> {
  try {
    const resp = await fetch(url, { method: 'GET', headers });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      return {
        ok: true,
        missingColumn: false,
        rows: Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [],
      };
    }
    const errBody = (await resp.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    const errCode = String(errBody?.code || '');
    const errMsg = String(errBody?.message || '').toLowerCase();
    if (resp.status === 400 && (errCode === '42703' || errMsg.includes('does not exist'))) {
      return { ok: true, missingColumn: true, rows: [] };
    }
    return { ok: false, missingColumn: false, rows: [] };
  } catch {
    return { ok: false, missingColumn: false, rows: [] };
  }
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
  let offset = 0;
  const pageLimit = 1000;
  try {
    while (outPaths.size < 5000) {
      const resp = await fetch(`${supabaseUrl}/storage/v1/object/list/${WEBSITE_ASSETS_BUCKET}`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          prefix: cleanPrefix,
          limit: pageLimit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      });
      if (!resp.ok) return { hadError: true };
      const entries = (await resp.json()) as Array<{ id?: string | null; name?: string | null }>;
      if (!Array.isArray(entries) || entries.length === 0) break;
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
      if (entries.length < pageLimit) break;
      offset += entries.length;
    }
  } catch {
    hadError = true;
  }
  return { hadError };
}

async function verifyStoragePathsGloballyViaRpc(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  params: {
    adminId: string;
    candidatePaths: string[];
    excludeWebsiteId: string;
    verificationToken?: string | null;
  }
): Promise<{
  verified: boolean;
  verificationToken: string | null;
  safeToDeletePaths: string[];
  referencedPaths: string[];
  abortedPaths: string[];
}> {
  const fallbackToken =
    typeof params.verificationToken === 'string' && UUID_REGEX.test(params.verificationToken.trim())
      ? params.verificationToken.trim()
      : null;

  if (params.candidatePaths.length === 0) {
    return {
      verified: true,
      verificationToken: fallbackToken,
      safeToDeletePaths: [],
      referencedPaths: [],
      abortedPaths: [],
    };
  }
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/admin_verify_storage_paths_for_deletion`,
      {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          p_admin_id: params.adminId,
          p_candidate_paths: params.candidatePaths,
          p_exclude_website_id: params.excludeWebsiteId,
          ...(fallbackToken ? { p_verification_token: fallbackToken } : {}),
        }),
      }
    );
    if (!resp.ok) {
      return {
        verified: false,
        verificationToken: fallbackToken,
        safeToDeletePaths: [],
        referencedPaths: [],
        abortedPaths: [],
      };
    }
    const payload = (await resp.json().catch(() => null)) as {
      success?: boolean;
      verificationToken?: unknown;
      safeToDeletePaths?: unknown;
      referencedPaths?: unknown;
      abortedPaths?: unknown;
    } | null;
    if (!payload || payload.success !== true) {
      return {
        verified: false,
        verificationToken: fallbackToken,
        safeToDeletePaths: [],
        referencedPaths: [],
        abortedPaths: [],
      };
    }
    const nextToken =
      typeof payload.verificationToken === 'string' &&
      UUID_REGEX.test(payload.verificationToken.trim())
        ? payload.verificationToken.trim()
        : fallbackToken;
    const referenced = Array.isArray(payload.referencedPaths)
      ? payload.referencedPaths.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];
    const aborted = Array.isArray(payload.abortedPaths)
      ? payload.abortedPaths.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];
    const blockedLower = new Set<string>();
    for (const p of referenced) blockedLower.add(p.trim().toLowerCase());
    for (const p of aborted) blockedLower.add(p.trim().toLowerCase());

    const safeList = Array.isArray(payload.safeToDeletePaths)
      ? payload.safeToDeletePaths.filter(
          (p): p is string =>
            typeof p === 'string' && p.length > 0 && !blockedLower.has(p.trim().toLowerCase())
        )
      : [];
    return {
      verified: true,
      verificationToken: nextToken,
      safeToDeletePaths: safeList,
      referencedPaths: referenced,
      abortedPaths: aborted,
    };
  } catch {
    return {
      verified: false,
      verificationToken: fallbackToken,
      safeToDeletePaths: [],
      referencedPaths: [],
      abortedPaths: [],
    };
  }
}

async function removeStorageObjectsBatch(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  paths: string[],
  opts?: {
    excludePathsLower?: Set<string>;
    preDeleteVerify?: (batchPaths: string[]) => Promise<{
      verified: boolean;
      safeToDeletePaths: string[];
      referencedPaths: string[];
      abortedPaths: string[];
    }>;
  }
): Promise<{
  deletedCount: number;
  deletedPaths: string[];
  failedPaths: string[];
  abortedPaths: string[];
  unverifiedPaths: string[];
  skippedAlreadyDeletedCount: number;
  warning?: string;
}> {
  const dedupedPaths: string[] = [];
  const seenCandidateLower = new Set<string>();
  let skippedAlreadyDeletedCount = 0;

  for (const rawPath of paths) {
    const clean = String(rawPath || '').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (opts?.excludePathsLower?.has(lower)) {
      skippedAlreadyDeletedCount += 1;
      continue;
    }
    if (seenCandidateLower.has(lower)) continue;
    seenCandidateLower.add(lower);
    dedupedPaths.push(clean);
  }

  if (dedupedPaths.length === 0) {
    return {
      deletedCount: 0,
      deletedPaths: [],
      failedPaths: [],
      abortedPaths: [],
      unverifiedPaths: [],
      skippedAlreadyDeletedCount,
    };
  }

  let deletedCount = 0;
  const deletedPaths: string[] = [];
  const seenDeletedLower = new Set<string>();
  const failedPaths: string[] = [];
  const abortedPaths: string[] = [];
  const abortedLower = new Set<string>();
  const unverifiedPaths: string[] = [];
  let warning: string | undefined;

  const recordAborted = (p: string) => {
    const clean = p.trim();
    const lower = clean.toLowerCase();
    if (!clean || abortedLower.has(lower)) return;
    abortedLower.add(lower);
    abortedPaths.push(clean);
  };

  for (let i = 0; i < dedupedPaths.length; i += 100) {
    const chunk = dedupedPaths.slice(i, i + 100);
    let safeChunk = chunk;

    if (opts?.preDeleteVerify) {
      const confirmRes = await opts.preDeleteVerify(chunk);
      if (!confirmRes.verified) {
        unverifiedPaths.push(...chunk);
        warning =
          'Pre-deletion global Storage reference confirmation failed; unverified objects were preserved for manual review.';
        continue;
      }
      for (const rp of confirmRes.referencedPaths) recordAborted(rp);
      for (const ap of confirmRes.abortedPaths) recordAborted(ap);

      const safeLowerSet = new Set(
        confirmRes.safeToDeletePaths.map((p) => p.trim().toLowerCase())
      );
      safeChunk = chunk.filter((p) => {
        const lower = p.trim().toLowerCase();
        return safeLowerSet.has(lower) && !abortedLower.has(lower) && !seenDeletedLower.has(lower);
      });
    }

    if (safeChunk.length === 0) continue;

    try {
      const resp = await fetch(`${supabaseUrl}/storage/v1/object/${WEBSITE_ASSETS_BUCKET}`, {
        method: 'DELETE',
        headers: serviceHeaders,
        body: JSON.stringify({ prefixes: safeChunk }),
      });
      if (resp.ok) {
        const respJson = await resp.json().catch(() => null);
        let batchDeleted: string[] = [];
        if (Array.isArray(respJson)) {
          const safeMap = new Map<string, string>();
          for (const sp of safeChunk) safeMap.set(sp.trim().toLowerCase(), sp);
          for (const item of respJson) {
            const rawName =
              item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
                ? String((item as { name: string }).name).trim()
                : typeof item === 'string'
                ? item.trim()
                : '';
            if (!rawName) continue;
            const matched = safeMap.get(rawName.toLowerCase());
            if (matched) batchDeleted.push(matched);
          }
        } else {
          batchDeleted = safeChunk;
        }

        for (const dp of batchDeleted) {
          const lower = dp.trim().toLowerCase();
          if (seenDeletedLower.has(lower)) continue;
          seenDeletedLower.add(lower);
          deletedPaths.push(dp);
          deletedCount += 1;
        }
      } else {
        failedPaths.push(...safeChunk);
        warning = 'Some storage files could not be removed automatically after database deletion.';
      }
    } catch {
      failedPaths.push(...safeChunk);
      warning = 'Storage service cleanup encountered a network error after database deletion.';
    }
  }

  return {
    deletedCount,
    deletedPaths,
    failedPaths,
    abortedPaths,
    unverifiedPaths,
    skippedAlreadyDeletedCount,
    ...(warning ? { warning } : {}),
  };
}

async function collectProtectedAssetPathsForOwner(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  ownerUserId: string,
  excludeWebsiteId: string,
  excludedProductIds: Set<string>,
  excludeStoreId: string,
  preservedStoreId = ''
): Promise<{ protectedPaths: Set<string>; hadError: boolean }> {
  const protectedPaths = new Set<string>();
  let hadError = false;
  if (!UUID_REGEX.test(ownerUserId)) {
    return { protectedPaths, hadError: true };
  }

  try {
    const ownerSiblingsResp = await fetch(
      `${supabaseUrl}/rest/v1/subscribed_websites?user_id=eq.${encodeURIComponent(
        ownerUserId
      )}&select=id,user_id,store_id,config`,
      { method: 'GET', headers: serviceHeaders }
    );
    if (!ownerSiblingsResp.ok) {
      return { protectedPaths, hadError: true };
    }
    const rows = (await ownerSiblingsResp.json()) as Array<{
      id: string;
      user_id?: string | null;
      store_id?: string | null;
      config?: unknown;
    }>;
    const siblingMap = new Map<
      string,
      { id: string; user_id?: string | null; store_id?: string | null; config?: unknown }
    >();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r?.id && r.id.toLowerCase() !== excludeWebsiteId.toLowerCase()) {
        siblingMap.set(r.id.toLowerCase(), r);
      }
    }

    if (UUID_REGEX.test(preservedStoreId)) {
      const storeSiblingsResp = await fetch(
        `${supabaseUrl}/rest/v1/subscribed_websites?store_id=eq.${encodeURIComponent(
          preservedStoreId
        )}&select=id,user_id,store_id,config`,
        { method: 'GET', headers: serviceHeaders }
      );
      if (!storeSiblingsResp.ok) {
        hadError = true;
      } else {
        const sRows = (await storeSiblingsResp.json()) as Array<{
          id: string;
          user_id?: string | null;
          store_id?: string | null;
          config?: unknown;
        }>;
        for (const r of Array.isArray(sRows) ? sRows : []) {
          if (r?.id && r.id.toLowerCase() !== excludeWebsiteId.toLowerCase()) {
            siblingMap.set(r.id.toLowerCase(), r);
          }
        }
      }
    }

    const otherSites = Array.from(siblingMap.values());
    for (const other of otherSites) {
      collectJsonbAssetPaths(other.config, protectedPaths);
    }

    const survivingStoreIds = new Set<string>();
    for (const s of otherSites) {
      const sid = String(s.store_id || '').trim();
      if (
        UUID_REGEX.test(sid) &&
        (!excludeStoreId || sid.toLowerCase() !== excludeStoreId.toLowerCase())
      ) {
        survivingStoreIds.add(sid);
      }
    }
    if (
      UUID_REGEX.test(preservedStoreId) &&
      (!excludeStoreId || preservedStoreId.toLowerCase() !== excludeStoreId.toLowerCase())
    ) {
      survivingStoreIds.add(preservedStoreId);
    }

    const storeIdList = Array.from(survivingStoreIds);
    if (storeIdList.length > 0) {
      const inClause = storeIdList.join(',');
      const [otherProdsResp, otherOrdersResp, storesLogoRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/products?store_id=in.(${inClause})&select=id,image_url`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/orders?store_id=in.(${inClause})&select=id,items`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetchJsonAllowingMissingColumn(
          `${supabaseUrl}/rest/v1/stores?id=in.(${inClause})&select=id,logo_url`,
          serviceHeaders
        ),
      ]);

      if (!otherProdsResp.ok) {
        hadError = true;
      } else {
        const otherProds = (await otherProdsResp.json()) as Array<{
          id: string;
          image_url?: string | null;
        }>;
        for (const op of Array.isArray(otherProds) ? otherProds : []) {
          if (!excludedProductIds.has(op.id.toLowerCase())) {
            const p = extractWebsiteAssetPath(op.image_url);
            if (p) protectedPaths.add(p);
          }
        }
      }

      if (!otherOrdersResp.ok) {
        hadError = true;
      } else {
        const otherOrders = (await otherOrdersResp.json()) as Array<{
          id?: string;
          items?: unknown;
        }>;
        for (const ord of Array.isArray(otherOrders) ? otherOrders : []) {
          collectJsonbAssetPaths(ord?.items, protectedPaths);
        }
      }

      if (!storesLogoRes.ok) {
        hadError = true;
      } else {
        for (const st of storesLogoRes.rows) {
          const p = extractWebsiteAssetPath(st?.logo_url);
          if (p) protectedPaths.add(p);
        }
      }
    }

    const ownerProfileRes = await fetchJsonAllowingMissingColumn(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(
        ownerUserId
      )}&select=id,avatar_url&limit=1`,
      serviceHeaders
    );
    if (!ownerProfileRes.ok) {
      hadError = true;
    } else if (ownerProfileRes.rows[0]) {
      const p = extractWebsiteAssetPath(ownerProfileRes.rows[0].avatar_url);
      if (p) protectedPaths.add(p);
    }
  } catch {
    hadError = true;
  }

  return { protectedPaths, hadError };
}

async function recordStorageCleanupResultBestEffort(
  supabaseUrl: string,
  serviceHeaders: Record<string, string>,
  params: {
    websiteId: string;
    adminId: string;
    status: 'pending' | 'partial_failed' | 'manual_review_required' | 'completed' | 'skipped';
    deletedCount: number;
    deletedPaths?: string[];
    verificationToken?: string | null;
    failedPaths: string[];
    manualReviewPaths?: string[];
    error?: string | null;
  }
): Promise<{
  recorded: boolean;
  lateConcurrentReferencePaths: string[];
  deletedObjectsCount?: number;
}> {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_record_website_storage_cleanup_result`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        p_website_id: params.websiteId,
        p_admin_id: params.adminId,
        p_status: params.status,
        p_deleted_count: params.deletedCount,
        p_failed_paths: params.failedPaths.slice(0, 500),
        p_error: params.error || null,
        p_manual_review_paths: params.manualReviewPaths
          ? params.manualReviewPaths.slice(0, 500)
          : null,
        p_deleted_paths: Array.isArray(params.deletedPaths)
          ? params.deletedPaths.slice(0, 1000)
          : [],
        p_verification_token:
          typeof params.verificationToken === 'string' &&
          UUID_REGEX.test(params.verificationToken.trim())
            ? params.verificationToken.trim()
            : null,
      }),
    });
    if (!resp.ok) {
      return { recorded: false, lateConcurrentReferencePaths: [] };
    }
    const payload = (await resp.json().catch(() => null)) as {
      lateConcurrentReferencePaths?: unknown;
      deletedObjectsCount?: unknown;
    } | null;
    const lateConcurrentReferencePaths = Array.isArray(payload?.lateConcurrentReferencePaths)
      ? payload.lateConcurrentReferencePaths.filter(
          (p): p is string => typeof p === 'string' && p.length > 0
        )
      : [];
    const deletedObjectsCount =
      typeof payload?.deletedObjectsCount === 'number'
        ? payload.deletedObjectsCount
        : undefined;
    return {
      recorded: true,
      lateConcurrentReferencePaths,
      ...(deletedObjectsCount !== undefined ? { deletedObjectsCount } : {}),
    };
  } catch {
    // Non-fatal if outbox helper RPC is not yet installed or unreachable
    return { recorded: false, lateConcurrentReferencePaths: [] };
  }
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

  if (!['suspend', 'reactivate', 'renew', 'delete', 'retry_storage_cleanup'].includes(action)) {
    sendJson(res, 400, {
      code: 'INVALID_ACTION',
      error: 'Unsupported action. Expected suspend, reactivate, renew, delete, or retry_storage_cleanup.',
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

    // 2. Enforce AAL2 TOTP MFA: unconditionally required for permanent deletion / storage cleanup;
    //    required for suspend/reactivate/renew whenever verified TOTP factor is enrolled.
    const hasVerifiedTotp = Array.isArray(authUser?.factors)
      ? authUser.factors.some((f) => f?.factor_type === 'totp' && f?.status === 'verified')
      : false;
    const jwtClaims = decodeJwtClaims(accessToken);
    const isAal2 = jwtClaims?.aal === 'aal2';
    if (action === 'delete' || action === 'retry_storage_cleanup') {
      if (!hasVerifiedTotp || !isAal2) {
        sendJson(res, 403, {
          code: 'MFA_REQUIRED',
          error:
            'Verified TOTP multi-factor authenticator verification (AAL2) is required for permanent deletion and storage cleanup actions.',
        });
        return;
      }
    } else if (hasVerifiedTotp && !isAal2) {
      sendJson(res, 403, {
        code: 'MFA_REQUIRED',
        error: 'Multi-factor authenticator verification (AAL2) is required.',
      });
      return;
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

    if (action === 'retry_storage_cleanup') {
      interface StorageCleanupJobRow {
        websiteId?: string;
        ownerUserId?: string;
        deletedStoreId?: string | null;
        preservedStoreId?: string | null;
        isSharedStore?: boolean;
        storePreserved?: boolean;
        cleanupStatus?: string;
        cleanupObjectPaths?: string[];
        preservedReferencePaths?: string[];
        manualReviewPaths?: string[];
        manualReviewRequired?: boolean;
        deletedProductIds?: string[];
        deletedObjectPaths?: string[];
        failedObjectPaths?: string[];
      }

      let targetJob: StorageCleanupJobRow | undefined;
      let jobLookupOk = false;

      const singleJobResp = await fetch(
        `${env.supabaseUrl}/rest/v1/rpc/admin_get_website_storage_cleanup_job`,
        {
          method: 'POST',
          headers: serviceHeaders,
          body: JSON.stringify({ p_admin_id: callerId, p_website_id: websiteId }),
        }
      );

      if (singleJobResp.ok) {
        const singlePayload = (await singleJobResp.json().catch(() => null)) as {
          success?: boolean;
          code?: string;
          job?: StorageCleanupJobRow;
        } | null;
        if (singlePayload?.success === true && singlePayload.job) {
          targetJob = singlePayload.job;
          jobLookupOk = true;
        } else if (singlePayload?.code === 'CLEANUP_JOB_NOT_FOUND') {
          jobLookupOk = true;
        }
      }

      if (!jobLookupOk) {
        const pendingResp = await fetch(
          `${env.supabaseUrl}/rest/v1/rpc/admin_get_pending_website_storage_cleanups`,
          {
            method: 'POST',
            headers: serviceHeaders,
            body: JSON.stringify({ p_admin_id: callerId, p_limit: 50 }),
          }
        );
        if (!pendingResp.ok) {
          sendJson(res, 502, {
            code: 'STORAGE_CLEANUP_RETRY_LOOKUP_FAILED',
            error: 'Unable to look up storage cleanup job status.',
          });
          return;
        }
        const pendingPayload = (await pendingResp.json().catch(() => null)) as {
          success?: boolean;
          jobs?: StorageCleanupJobRow[];
        } | null;
        targetJob = Array.isArray(pendingPayload?.jobs)
          ? pendingPayload.jobs.find(
              (j) => String(j?.websiteId || '').trim().toLowerCase() === websiteId.toLowerCase()
            )
          : undefined;
      }

      if (!targetJob) {
        sendJson(res, 404, {
          code: 'CLEANUP_JOB_NOT_FOUND',
          error: 'No storage cleanup job was found for this website ID.',
        });
        return;
      }

      const existingManualPaths = Array.isArray(targetJob.manualReviewPaths)
        ? targetJob.manualReviewPaths.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : [];
      const existingPreservedRefPaths = Array.isArray(targetJob.preservedReferencePaths)
        ? targetJob.preservedReferencePaths.filter(
            (p): p is string => typeof p === 'string' && p.length > 0
          )
        : [];

      // Idempotent duplicate cleanup guard: once cleanly completed with zero unresolved manual-review paths,
      // repeated retry calls perform zero Storage DELETEs and keep counts unchanged.
      if (
        targetJob.cleanupStatus === 'completed' &&
        targetJob.manualReviewRequired !== true &&
        existingManualPaths.length === 0
      ) {
        sendJson(res, 200, {
          ok: true,
          success: true,
          idempotent: true,
          code: 'STORAGE_CLEANUP_ALREADY_COMPLETED',
          message: 'Storage cleanup was already completed; no duplicate deletions performed.',
          websiteId,
          cleanupStatus: 'completed',
          deletedStorageObjects: 0,
          failedStoragePaths: [],
          manualReviewRequired: false,
          manualReviewAssetPaths: [],
          preservedReferencedAssetPaths: existingPreservedRefPaths,
        });
        return;
      }

      const jobOwnerId = String(targetJob.ownerUserId || '').trim();
      const jobDeletedStoreId =
        typeof targetJob.deletedStoreId === 'string' &&
        UUID_REGEX.test(targetJob.deletedStoreId.trim())
          ? targetJob.deletedStoreId.trim()
          : null;
      const jobPreservedStoreId =
        typeof targetJob.preservedStoreId === 'string' &&
        UUID_REGEX.test(targetJob.preservedStoreId.trim())
          ? targetJob.preservedStoreId.trim()
          : '';
      const jobIsSharedStore = targetJob.isSharedStore === true;
      const jobStorePreserved = targetJob.storePreserved === true || jobDeletedStoreId === null;

      if (
        !UUID_REGEX.test(jobOwnerId) ||
        (jobIsSharedStore && jobDeletedStoreId !== null) ||
        (targetJob.storePreserved === true && jobDeletedStoreId !== null)
      ) {
        sendJson(res, 409, {
          code: 'AMBIGUOUS_CLEANUP_SCOPE',
          error: 'Storage cleanup job metadata is invalid or ambiguous; refusing to delete objects.',
        });
        return;
      }

      const jobDeletedProdSet = new Set<string>(
        Array.isArray(targetJob.deletedProductIds)
          ? targetJob.deletedProductIds
              .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim()))
              .map((id) => id.trim().toLowerCase())
          : []
      );

      const protectionRes = await collectProtectedAssetPathsForOwner(
        env.supabaseUrl,
        serviceHeaders,
        jobOwnerId,
        websiteId,
        jobDeletedProdSet,
        jobDeletedStoreId || '',
        jobPreservedStoreId
      );

      const preservedRefSet = new Set<string>(existingPreservedRefPaths);
      for (const p of protectionRes.protectedPaths) {
        preservedRefSet.add(p);
      }
      const protectedLowerSet = new Set<string>(
        Array.from(preservedRefSet).map((p) => p.trim().toLowerCase())
      );

      const manualReviewSet = new Set<string>(existingManualPaths);
      const manualLowerSet = new Set<string>(
        existingManualPaths.map((p) => p.trim().toLowerCase())
      );
      const alreadyDeletedLower = new Set<string>(
        (Array.isArray(targetJob.deletedObjectPaths) ? targetJob.deletedObjectPaths : [])
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim().toLowerCase())
      );
      const retryPaths = new Set<string>();
      const candidateProductStorePaths = new Set<string>();

      const addCandidateOrManual = (p: string, allowPreservedStoreProdPrefix: boolean) => {
        const clean = p.trim();
        if (!clean) return;
        const lower = clean.toLowerCase();
        if (
          alreadyDeletedLower.has(lower) ||
          protectedLowerSet.has(lower) ||
          manualLowerSet.has(lower)
        ) {
          return;
        }
        const inSite = isSafeOwnedScopePath(clean, jobOwnerId, websiteId);
        const inDeletedStore =
          !jobIsSharedStore &&
          !jobStorePreserved &&
          jobDeletedStoreId !== null &&
          isSafeOwnedScopePath(clean, jobOwnerId, jobDeletedStoreId);
        const inPreservedStoreProducts =
          allowPreservedStoreProdPrefix &&
          jobPreservedStoreId !== '' &&
          isSafeOwnedScopePath(clean, jobOwnerId, jobPreservedStoreId) &&
          clean.toLowerCase().startsWith(`${jobOwnerId.toLowerCase()}/${jobPreservedStoreId.toLowerCase()}/products/`);
        if (inSite || inDeletedStore || inPreservedStoreProducts) {
          retryPaths.add(clean);
          if (inPreservedStoreProducts) candidateProductStorePaths.add(clean);
        } else {
          manualReviewSet.add(clean);
          manualLowerSet.add(lower);
        }
      };

      const explicitProductPaths = Array.isArray(targetJob.cleanupObjectPaths)
        ? targetJob.cleanupObjectPaths
        : [];
      for (const p of explicitProductPaths) {
        if (typeof p === 'string') {
          addCandidateOrManual(p, true);
        }
      }

      const explicitProductPathSet = new Set<string>(retryPaths);
      const failedHintPaths = Array.isArray(targetJob.failedObjectPaths)
        ? targetJob.failedObjectPaths
        : [];
      for (const p of failedHintPaths) {
        if (typeof p === 'string') {
          addCandidateOrManual(p, explicitProductPathSet.has(p));
        }
      }

      let listHadError = false;
      const listedSitePaths = new Set<string>();
      const siteListRes = await listStorageObjectsRecursively(
        env.supabaseUrl,
        serviceHeaders,
        `${jobOwnerId}/${websiteId}`,
        listedSitePaths
      );
      if (siteListRes.hadError) listHadError = true;
      for (const p of listedSitePaths) {
        addCandidateOrManual(p, false);
      }

      if (!jobIsSharedStore && !jobStorePreserved && jobDeletedStoreId !== null) {
        const listedStorePaths = new Set<string>();
        const storeListRes = await listStorageObjectsRecursively(
          env.supabaseUrl,
          serviceHeaders,
          `${jobOwnerId}/${jobDeletedStoreId}`,
          listedStorePaths
        );
        if (storeListRes.hadError) listHadError = true;
        for (const p of listedStorePaths) {
          addCandidateOrManual(p, false);
        }
      }

      if (protectionRes.hadError) {
        for (const p of retryPaths) {
          manualReviewSet.add(p);
        }
        const manualArr = Array.from(manualReviewSet);
        await recordStorageCleanupResultBestEffort(env.supabaseUrl, serviceHeaders, {
          websiteId,
          adminId: callerId,
          status: 'manual_review_required',
          deletedCount: 0,
          deletedPaths: [],
          failedPaths: [],
          manualReviewPaths: manualArr,
          error:
            'Failed to verify surviving sibling website/store/order references during cleanup retry; assets preserved for manual review.',
        });
        sendJson(res, 502, {
          code: 'STORAGE_PROTECTION_CHECK_FAILED',
          error:
            'Unable to verify surviving merchant and order assets before retrying storage cleanup; assets preserved for manual review.',
          manualReviewRequired: manualArr.length > 0,
          manualReviewAssetPaths: manualArr,
        });
        return;
      }

      const preVerifyCandidates = Array.from(retryPaths).filter(
        (p) =>
          !alreadyDeletedLower.has(p.trim().toLowerCase()) &&
          !protectedLowerSet.has(p.trim().toLowerCase()) &&
          !manualLowerSet.has(p.trim().toLowerCase())
      );

      let finalRetryPaths: string[] = [];
      let verificationFailed = false;
      let verificationToken: string | null = null;
      const concurrentConflicts: string[] = [];
      const addConcurrentConflict = (p: string) => {
        const clean = p.trim();
        if (!clean) return;
        preservedRefSet.add(clean);
        protectedLowerSet.add(clean.toLowerCase());
        if (!concurrentConflicts.some((x) => x.toLowerCase() === clean.toLowerCase())) {
          concurrentConflicts.push(clean);
        }
      };

      if (preVerifyCandidates.length > 0) {
        const globalVerifyRes = await verifyStoragePathsGloballyViaRpc(
          env.supabaseUrl,
          serviceHeaders,
          {
            adminId: callerId,
            candidatePaths: preVerifyCandidates,
            excludeWebsiteId: websiteId,
          }
        );
        if (!globalVerifyRes.verified) {
          verificationFailed = true;
          for (const p of preVerifyCandidates) {
            manualReviewSet.add(p);
          }
        } else {
          verificationToken = globalVerifyRes.verificationToken;
          for (const rp of globalVerifyRes.referencedPaths) {
            preservedRefSet.add(rp);
            protectedLowerSet.add(rp.trim().toLowerCase());
          }
          for (const ap of globalVerifyRes.abortedPaths) {
            addConcurrentConflict(ap);
          }
          finalRetryPaths = globalVerifyRes.safeToDeletePaths;
        }
      }

      const retryResult = verificationFailed
        ? {
            deletedCount: 0,
            deletedPaths: [] as string[],
            failedPaths: [] as string[],
            abortedPaths: [] as string[],
            unverifiedPaths: [] as string[],
            skippedAlreadyDeletedCount: 0,
            warning:
              'Global Storage reference verification failed; unverified objects were preserved and flagged for manual review.',
          }
        : await removeStorageObjectsBatch(env.supabaseUrl, serviceHeaders, finalRetryPaths, {
            excludePathsLower: alreadyDeletedLower,
            preDeleteVerify: (batchPaths) =>
              verifyStoragePathsGloballyViaRpc(env.supabaseUrl, serviceHeaders, {
                adminId: callerId,
                candidatePaths: batchPaths,
                excludeWebsiteId: websiteId,
                verificationToken,
              }),
          });

      for (const ap of retryResult.abortedPaths) {
        addConcurrentConflict(ap);
      }
      for (const up of retryResult.unverifiedPaths) {
        manualReviewSet.add(up);
      }

      const finalManualArr = Array.from(manualReviewSet);
      const finalManualRequired = finalManualArr.length > 0;

      const finalStatus: 'completed' | 'partial_failed' | 'manual_review_required' =
        retryResult.failedPaths.length > 0 || listHadError
          ? 'partial_failed'
          : finalManualRequired || verificationFailed || retryResult.unverifiedPaths.length > 0
          ? 'manual_review_required'
          : 'completed';
      const finalWarning =
        retryResult.warning ||
        (listHadError
          ? 'Some storage folders could not be listed cleanly during cleanup retry.'
          : finalManualRequired
          ? 'One or more storage objects could not be proven exclusive and were preserved for manual review.'
          : undefined);

      const recordRes = await recordStorageCleanupResultBestEffort(env.supabaseUrl, serviceHeaders, {
        websiteId,
        adminId: callerId,
        status: finalStatus,
        deletedCount: retryResult.deletedCount,
        deletedPaths: retryResult.deletedPaths,
        verificationToken,
        failedPaths: retryResult.failedPaths,
        manualReviewPaths: finalManualArr,
        error: finalWarning || null,
      });

      for (const lateRef of recordRes.lateConcurrentReferencePaths) {
        addConcurrentConflict(lateRef);
      }
      const finalPreservedArr = Array.from(preservedRefSet);

      const responseCode =
        finalStatus === 'completed'
          ? 'STORAGE_CLEANUP_COMPLETED'
          : finalStatus === 'manual_review_required'
          ? 'STORAGE_CLEANUP_MANUAL_REVIEW_REQUIRED'
          : 'STORAGE_CLEANUP_PARTIAL';

      sendJson(res, 200, {
        ok: true,
        success: true,
        idempotent: false,
        code: responseCode,
        message:
          finalStatus === 'completed'
            ? 'Pending storage cleanup completed successfully.'
            : finalStatus === 'manual_review_required'
            ? 'Verified exclusive storage objects were cleaned up; unverified objects were preserved for manual review.'
            : 'Storage cleanup retried, though some objects remain pending retry.',
        websiteId,
        cleanupStatus: finalStatus,
        deletedStorageObjects: retryResult.deletedCount,
        failedStoragePaths: retryResult.failedPaths,
        manualReviewRequired: finalManualRequired,
        manualReviewAssetPaths: finalManualArr,
        preservedReferencedAssetPaths: finalPreservedArr,
        ...(concurrentConflicts.length > 0 ? { concurrentReferenceConflicts: concurrentConflicts } : {}),
        ...(finalWarning ? { storageCleanupWarning: finalWarning } : {}),
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
    // Recursively walks live config, draft, sections, nested section items, and productCatalogMeta,
    // plus cross-table references (sibling websites, products, orders, store logos, user avatars).
    const rawSiteConfigAssetPaths = new Set<string>();
    const rawSiteUncertainRefs = new Set<string>();
    const preRpcWebsiteScopedPaths = new Set<string>();
    const preRpcWebsiteUncertainPaths = new Set<string>();
    const protectedAssetPaths = new Set<string>();
    const ownerUserId = String(site.user_id || '').trim();
    const targetStoreId = String(site.store_id || '').trim();

    collectJsonbAssetPaths(site.config, rawSiteConfigAssetPaths, rawSiteUncertainRefs);
    for (const rawRef of rawSiteUncertainRefs) {
      preRpcWebsiteUncertainPaths.add(rawRef);
    }
    for (const p of rawSiteConfigAssetPaths) {
      if (isSafeOwnedScopePath(p, ownerUserId, websiteId)) {
        preRpcWebsiteScopedPaths.add(p);
      } else {
        // Store, general, foreign, or unowned paths referenced inside config are NOT blindly deleted;
        // they stay protected if referenced elsewhere or go to manual review if unreferenced & unowned.
        preRpcWebsiteUncertainPaths.add(p);
      }
    }

    // Collect protected asset references from ANY surviving sibling websites (both same-owner AND cross-user shared store_id)
    let siblingLookupFailed = false;
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
      } else {
        siblingLookupFailed = true;
      }

      const ownerProfileRes = await fetchJsonAllowingMissingColumn(
        `${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(
          ownerUserId
        )}&select=id,avatar_url&limit=1`,
        serviceHeaders
      );
      if (!ownerProfileRes.ok) {
        siblingLookupFailed = true;
      } else if (ownerProfileRes.rows[0]) {
        const p = extractWebsiteAssetPath(ownerProfileRes.rows[0].avatar_url);
        if (p) protectedAssetPaths.add(p);
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
      } else {
        siblingLookupFailed = true;
      }
    }

    const otherSites = Array.from(siblingMap.values());
    for (const other of otherSites) {
      collectJsonbAssetPaths(other.config, protectedAssetPaths);
    }

    const targetStoreProducts: Array<{
      id: string;
      website_id?: string | null;
      image_url?: string | null;
    }> = [];
    const targetStoreProductIds = new Set<string>();
    const targetStoreOrders: Array<{ id?: string; items?: unknown }> = [];
    const targetStoreLogos: string[] = [];

    if (UUID_REGEX.test(targetStoreId) && UUID_REGEX.test(ownerUserId)) {
      const [targetProdsResp, targetOrdersResp, targetStoreRes] = await Promise.all([
        fetch(
          `${env.supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(
            targetStoreId
          )}&select=id,website_id,image_url`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetch(
          `${env.supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(
            targetStoreId
          )}&select=id,items`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetchJsonAllowingMissingColumn(
          `${env.supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(
            targetStoreId
          )}&select=id,logo_url&limit=1`,
          serviceHeaders
        ),
      ]);

      if (targetProdsResp.ok) {
        const targetProds = (await targetProdsResp.json()) as Array<{
          id: string;
          website_id?: string | null;
          image_url?: string | null;
        }>;
        for (const prod of Array.isArray(targetProds) ? targetProds : []) {
          if (prod?.id) {
            targetStoreProducts.push(prod);
            targetStoreProductIds.add(prod.id.toLowerCase());
          }
        }
      } else {
        siblingLookupFailed = true;
      }

      if (targetOrdersResp.ok) {
        const tOrders = (await targetOrdersResp.json()) as Array<{ id?: string; items?: unknown }>;
        if (Array.isArray(tOrders)) {
          targetStoreOrders.push(...tOrders);
        }
      } else {
        siblingLookupFailed = true;
      }

      if (!targetStoreRes.ok) {
        siblingLookupFailed = true;
      } else if (targetStoreRes.rows[0]) {
        const lp = extractWebsiteAssetPath(targetStoreRes.rows[0].logo_url);
        if (lp) targetStoreLogos.push(lp);
      }
    }

    // Protect any asset paths still referenced by products, order snapshots, or store logos in other surviving stores
    const otherStoreIds = Array.from(
      new Set(
        otherSites
          .map((s) => String(s.store_id || '').trim())
          .filter((sid) => UUID_REGEX.test(sid) && sid.toLowerCase() !== targetStoreId.toLowerCase())
      )
    );
    if (otherStoreIds.length > 0) {
      const otherIn = otherStoreIds.join(',');
      const [otherProdsResp, otherOrdersResp, otherStoresLogoRes] = await Promise.all([
        fetch(
          `${env.supabaseUrl}/rest/v1/products?store_id=in.(${otherIn})&select=id,image_url`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetch(
          `${env.supabaseUrl}/rest/v1/orders?store_id=in.(${otherIn})&select=id,items`,
          { method: 'GET', headers: serviceHeaders }
        ),
        fetchJsonAllowingMissingColumn(
          `${env.supabaseUrl}/rest/v1/stores?id=in.(${otherIn})&select=id,logo_url`,
          serviceHeaders
        ),
      ]);

      if (otherProdsResp.ok) {
        const otherProds = (await otherProdsResp.json()) as Array<{
          id: string;
          image_url?: string | null;
        }>;
        for (const op of Array.isArray(otherProds) ? otherProds : []) {
          if (!targetStoreProductIds.has(op.id.toLowerCase())) {
            const p = extractWebsiteAssetPath(op.image_url);
            if (p) protectedAssetPaths.add(p);
          }
        }
      } else {
        siblingLookupFailed = true;
      }

      if (otherOrdersResp.ok) {
        const otherOrders = (await otherOrdersResp.json()) as Array<{ id?: string; items?: unknown }>;
        for (const ord of Array.isArray(otherOrders) ? otherOrders : []) {
          collectJsonbAssetPaths(ord?.items, protectedAssetPaths);
        }
      } else {
        siblingLookupFailed = true;
      }

      if (!otherStoresLogoRes.ok) {
        siblingLookupFailed = true;
      } else {
        for (const st of otherStoresLogoRes.rows) {
          const p = extractWebsiteAssetPath(st?.logo_url);
          if (p) protectedAssetPaths.add(p);
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
      preservedStoreId?: unknown;
      isSharedStore?: unknown;
      storePreserved?: unknown;
      storePreservationReasons?: unknown;
      deletedProductIds?: unknown;
      preservedSharedProductIds?: unknown;
      deletedProductImageUrls?: unknown;
      cleanupObjectPaths?: unknown;
      preservedReferencedObjectPaths?: unknown;
      manualReviewObjectPaths?: unknown;
      manualReviewRequired?: unknown;
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
    // Reject malformed, missing, or contradictory store-deletion metadata.
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
    const normalizedPreservedStoreId =
      typeof rpcResult.preservedStoreId === 'string' && UUID_REGEX.test(rpcResult.preservedStoreId.trim())
        ? rpcResult.preservedStoreId.trim()
        : null;
    const rpcStorePreserved =
      typeof rpcResult.storePreserved === 'boolean'
        ? rpcResult.storePreserved
        : normalizedDeletedStoreId === null;
    const hasInconsistentSharedState =
      (rpcResult.isSharedStore === true || rpcStorePreserved) && normalizedDeletedStoreId !== null;
    const hasMismatchedDeletedStoreId =
      normalizedDeletedStoreId !== null &&
      (!UUID_REGEX.test(targetStoreId) ||
        normalizedDeletedStoreId.toLowerCase() !== targetStoreId.toLowerCase());
    const hasValidOwnerUid = UUID_REGEX.test(ownerUserId);

    const rpcDeletedProductIds = Array.isArray(rpcResult.deletedProductIds)
      ? rpcResult.deletedProductIds.filter(
          (id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim())
        )
      : [];
    const deletedProductIdSetLower = new Set(rpcDeletedProductIds.map((id) => id.trim().toLowerCase()));
    const rpcPreservedSharedProductIds = Array.isArray(rpcResult.preservedSharedProductIds)
      ? rpcResult.preservedSharedProductIds.filter(
          (id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim())
        )
      : [];
    const storePreservationReasons = Array.isArray(rpcResult.storePreservationReasons)
      ? rpcResult.storePreservationReasons.filter((r): r is string => typeof r === 'string' && r.length > 0)
      : [];
    const hasOwnershipMismatch = storePreservationReasons.includes('ownership_mismatch');

    const rpcPreservedRefPaths = Array.isArray(rpcResult.preservedReferencedObjectPaths)
      ? rpcResult.preservedReferencedObjectPaths.filter(
          (p): p is string => typeof p === 'string' && p.length > 0
        )
      : [];
    const rpcManualReviewPaths = Array.isArray(rpcResult.manualReviewObjectPaths)
      ? rpcResult.manualReviewObjectPaths.filter(
          (p): p is string => typeof p === 'string' && p.length > 0
        )
      : [];

    for (const rp of rpcPreservedRefPaths) {
      protectedAssetPaths.add(rp);
    }

    // When target store is preserved, protect every surviving product's image_url,
    // ALL surviving order item/branding snapshots, AND the preserved store's logo_url!
    if (normalizedDeletedStoreId === null) {
      for (const prod of targetStoreProducts) {
        if (!deletedProductIdSetLower.has(prod.id.toLowerCase())) {
          const p = extractWebsiteAssetPath(prod.image_url);
          if (p) protectedAssetPaths.add(p);
        }
      }
      for (const ord of targetStoreOrders) {
        collectJsonbAssetPaths(ord?.items, protectedAssetPaths);
      }
      for (const lp of targetStoreLogos) {
        protectedAssetPaths.add(lp);
      }
    }

    const protectedAssetPathsLower = new Set(
      Array.from(protectedAssetPaths).map((p) => p.trim().toLowerCase())
    );
    const manualReviewPaths = new Set<string>(rpcManualReviewPaths);
    const manualReviewPathsLower = new Set<string>(
      rpcManualReviewPaths.map((p) => p.trim().toLowerCase())
    );

    const recordManualReviewIfNotProtected = (rawOrPath: string) => {
      const clean = rawOrPath.trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (protectedAssetPathsLower.has(lower) || manualReviewPathsLower.has(lower)) return;
      manualReviewPaths.add(clean);
      manualReviewPathsLower.add(lower);
    };

    let storageCleanup: {
      deletedCount: number;
      deletedPaths: string[];
      failedPaths: string[];
      abortedPaths: string[];
      unverifiedPaths: string[];
      warning?: string;
    } = {
      deletedCount: 0,
      deletedPaths: [],
      failedPaths: [],
      abortedPaths: [],
      unverifiedPaths: [],
    };
    let storageCleanupSkipped = false;
    let verificationToken: string | null = null;
    const concurrentReferenceConflicts: string[] = [];
    const addConcurrentConflict = (p: string) => {
      const clean = p.trim();
      if (!clean) return;
      protectedAssetPaths.add(clean);
      protectedAssetPathsLower.add(clean.toLowerCase());
      if (!concurrentReferenceConflicts.some((x) => x.toLowerCase() === clean.toLowerCase())) {
        concurrentReferenceConflicts.push(clean);
      }
    };
    let cleanupRecordedStatus:
      | 'completed'
      | 'partial_failed'
      | 'manual_review_required'
      | 'skipped' = 'completed';

    if (
      siblingLookupFailed ||
      !hasValidWebsiteMatch ||
      !hasValidIsSharedFlag ||
      !hasValidDeletedStoreId ||
      hasInconsistentSharedState ||
      hasMismatchedDeletedStoreId ||
      !hasValidOwnerUid
    ) {
      storageCleanupSkipped = true;
      for (const p of preRpcWebsiteScopedPaths) {
        recordManualReviewIfNotProtected(p);
      }
      for (const p of preRpcWebsiteUncertainPaths) {
        recordManualReviewIfNotProtected(p);
      }
      cleanupRecordedStatus = manualReviewPaths.size > 0 ? 'manual_review_required' : 'skipped';
      storageCleanup = {
        deletedCount: 0,
        deletedPaths: [],
        failedPaths: [],
        abortedPaths: [],
        unverifiedPaths: [],
        warning: siblingLookupFailed
          ? 'Database deletion committed, but Storage cleanup was skipped because surviving website, product, or order references could not be verified. Any unverified paths were preserved for manual review.'
          : 'Database deletion committed, but Storage cleanup was skipped because the deletion response metadata was malformed or ambiguous.',
      };
    } else {
      const cleanupPaths = new Set<string>();
      const cleanupPathsLower = new Set<string>();
      let listHadError = false;

      const addCandidatePath = (p: string) => {
        const clean = p.trim();
        const lower = clean.toLowerCase();
        if (
          !clean ||
          protectedAssetPathsLower.has(lower) ||
          manualReviewPathsLower.has(lower) ||
          cleanupPathsLower.has(lower)
        ) {
          return;
        }
        cleanupPaths.add(clean);
        cleanupPathsLower.add(lower);
      };

      // Flag any non-website-scoped config asset references that aren't protected as surviving references
      for (const rawOrPath of preRpcWebsiteUncertainPaths) {
        recordManualReviewIfNotProtected(rawOrPath);
      }

      // Website-scoped assets: ALWAYS strictly scoped to <ownerUserId>/<websiteId>/*
      for (const p of preRpcWebsiteScopedPaths) {
        if (isSafeOwnedScopePath(p, ownerUserId, websiteId)) {
          addCandidatePath(p);
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
          addCandidatePath(p);
        }
      }

      // Deleted exclusive product image assets (applies both when whole store is deleted AND when
      // individual website-exclusive products are deleted inside a shared or preserved store).
      const considerProductImageRaw = (rawUrl: unknown) => {
        if (typeof rawUrl !== 'string' || !rawUrl.trim()) return;
        const imgPath = extractWebsiteAssetPath(rawUrl);
        if (!imgPath) {
          if (isSupabaseStorageUrlOrPath(rawUrl)) {
            recordManualReviewIfNotProtected(rawUrl);
          }
          return;
        }
        const inSite = isSafeOwnedScopePath(imgPath, ownerUserId, websiteId);
        const inOwnedStoreProducts =
          !hasOwnershipMismatch &&
          UUID_REGEX.test(targetStoreId) &&
          isSafeOwnedScopePath(imgPath, ownerUserId, targetStoreId) &&
          (normalizedDeletedStoreId !== null ||
            imgPath.toLowerCase().startsWith(`${ownerUserId.toLowerCase()}/${targetStoreId.toLowerCase()}/products/`));

        if (inSite || inOwnedStoreProducts) {
          addCandidatePath(imgPath);
        } else {
          recordManualReviewIfNotProtected(imgPath);
        }
      };

      for (const prod of targetStoreProducts) {
        if (
          normalizedDeletedStoreId !== null ||
          deletedProductIdSetLower.has(prod.id.toLowerCase())
        ) {
          considerProductImageRaw(prod.image_url);
        }
      }
      if (Array.isArray(rpcResult.deletedProductImageUrls)) {
        for (const rawUrl of rpcResult.deletedProductImageUrls) {
          considerProductImageRaw(rawUrl);
        }
      }
      if (Array.isArray(rpcResult.cleanupObjectPaths)) {
        for (const p of rpcResult.cleanupObjectPaths) {
          if (typeof p === 'string') {
            if (
              isSafeOwnedScopePath(p, ownerUserId, websiteId) ||
              (!hasOwnershipMismatch &&
                UUID_REGEX.test(targetStoreId) &&
                isSafeOwnedScopePath(p, ownerUserId, targetStoreId))
            ) {
              addCandidatePath(p);
            } else {
              recordManualReviewIfNotProtected(p);
            }
          }
        }
      }

      // Whole-store Storage directory sweep: ONLY when rpcResult confirms the entire store was exclusively deleted
      // (isSharedStore === false AND storePreserved === false AND deletedStoreId is valid UUID AND no ownership mismatch).
      if (
        rpcResult.isSharedStore === false &&
        !rpcStorePreserved &&
        !hasOwnershipMismatch &&
        normalizedDeletedStoreId !== null
      ) {
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
            addCandidatePath(p);
          }
        }
      }

      const preVerifyCandidates = Array.from(cleanupPaths);
      let finalExclusiveAssetPaths: string[] = [];
      let globalVerifyFailed = false;

      if (preVerifyCandidates.length > 0) {
        const verifyRes = await verifyStoragePathsGloballyViaRpc(
          env.supabaseUrl,
          serviceHeaders,
          {
            adminId: callerId,
            candidatePaths: preVerifyCandidates,
            excludeWebsiteId: websiteId,
          }
        );

        if (!verifyRes.verified) {
          globalVerifyFailed = true;
          for (const p of preVerifyCandidates) {
            recordManualReviewIfNotProtected(p);
          }
        } else {
          verificationToken = verifyRes.verificationToken;
          for (const rp of verifyRes.referencedPaths) {
            protectedAssetPaths.add(rp);
            protectedAssetPathsLower.add(rp.trim().toLowerCase());
          }
          for (const ap of verifyRes.abortedPaths) {
            addConcurrentConflict(ap);
          }
          finalExclusiveAssetPaths = verifyRes.safeToDeletePaths;
        }
      }

      if (globalVerifyFailed) {
        storageCleanupSkipped = true;
        storageCleanup = {
          deletedCount: 0,
          deletedPaths: [],
          failedPaths: [],
          abortedPaths: [],
          unverifiedPaths: [],
          warning:
            'Database deletion committed, but global Storage reference verification failed; objects were preserved and flagged for manual review.',
        };
      } else {
        storageCleanup = await removeStorageObjectsBatch(
          env.supabaseUrl,
          serviceHeaders,
          finalExclusiveAssetPaths,
          {
            preDeleteVerify: (batchPaths) =>
              verifyStoragePathsGloballyViaRpc(env.supabaseUrl, serviceHeaders, {
                adminId: callerId,
                candidatePaths: batchPaths,
                excludeWebsiteId: websiteId,
                verificationToken,
              }),
          }
        );
        for (const ap of storageCleanup.abortedPaths) {
          addConcurrentConflict(ap);
        }
        for (const up of storageCleanup.unverifiedPaths) {
          recordManualReviewIfNotProtected(up);
        }
      }

      if (listHadError && !storageCleanup.warning) {
        storageCleanup.warning =
          'Some storage folders could not be listed cleanly during post-deletion cleanup.';
      } else if (manualReviewPaths.size > 0 && !storageCleanup.warning) {
        storageCleanup.warning =
          'Database deletion committed cleanly; one or more storage references could not be proven exclusive and were preserved for manual review.';
      }

      if (storageCleanup.failedPaths.length > 0 || listHadError) {
        cleanupRecordedStatus = 'partial_failed';
      } else if (
        manualReviewPaths.size > 0 ||
        globalVerifyFailed ||
        storageCleanup.unverifiedPaths.length > 0
      ) {
        cleanupRecordedStatus = 'manual_review_required';
      } else {
        cleanupRecordedStatus = 'completed';
      }
    }

    const manualReviewAssetPaths = Array.from(manualReviewPaths);
    const manualReviewRequired = manualReviewAssetPaths.length > 0;

    const recordRes = await recordStorageCleanupResultBestEffort(env.supabaseUrl, serviceHeaders, {
      websiteId,
      adminId: callerId,
      status: cleanupRecordedStatus,
      deletedCount: storageCleanup.deletedCount,
      deletedPaths: storageCleanup.deletedPaths,
      verificationToken,
      failedPaths: storageCleanup.failedPaths,
      manualReviewPaths: manualReviewAssetPaths,
      error: storageCleanup.warning || null,
    });

    for (const lateRef of recordRes.lateConcurrentReferencePaths) {
      addConcurrentConflict(lateRef);
    }

    const preservedReferencedAssetPaths = Array.from(protectedAssetPaths);

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
      preservedStoreId: normalizedPreservedStoreId,
      isSharedStore: typeof rpcResult.isSharedStore === 'boolean' ? rpcResult.isSharedStore : false,
      storePreserved: rpcStorePreserved,
      storePreservationReasons,
      deletedProductIds: rpcDeletedProductIds,
      preservedSharedProductIds: rpcPreservedSharedProductIds,
      deletedCounts: rpcResult.deletedCounts || {},
      deletedStorageObjects: storageCleanup.deletedCount,
      storageCleanupStatus: cleanupRecordedStatus,
      manualReviewRequired,
      manualReviewAssetPaths,
      preservedReferencedAssetPaths,
      ...(concurrentReferenceConflicts.length > 0
        ? { concurrentReferenceConflicts }
        : {}),
      ...(storageCleanup.failedPaths.length > 0 ? { failedStoragePaths: storageCleanup.failedPaths } : {}),
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
