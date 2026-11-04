export type PaymentDiagnosticStage =
  | 'PAYMENT_SUBMIT_STARTED'
  | 'PRICING_VERIFICATION_SUCCEEDED'
  | 'PAYMENT_REQUEST_INSERT_STARTED'
  | 'PAYMENT_REQUEST_INSERT_SUCCEEDED'
  | 'PAYMENT_REQUEST_INSERT_FAILED'
  | 'ADMIN_QUEUE_FETCH_STARTED'
  | 'ADMIN_QUEUE_FETCH_SUCCEEDED'
  | 'ADMIN_QUEUE_FETCH_FAILED';

export interface PaymentDiagnosticRecord {
  timestamp: string;
  stage: PaymentDiagnosticStage;
  httpStatus: number | null;
  errorCode: string | null;
  operation?: string;
  table?: string;
  requestId: string | null;
  supabaseProjectRef: string;
  hasUserId: boolean;
  hasWebsiteId: boolean;
  source?: string;
  rowCount?: number;
}

const UUID_SIMPLE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DIAGNOSTIC_ENTRIES = 50;
const recentDiagnostics: PaymentDiagnosticRecord[] = [];

function detectDefaultProjectRef(): string {
  let rawUrl = '';
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      rawUrl = String(import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    }
  } catch {}

  if (!rawUrl) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        rawUrl = String(
          process.env.VITE_SUPABASE_URL ||
            process.env.SUPABASE_URL ||
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            ''
        ).trim();
      }
    } catch {}
  }

  if (!rawUrl) return 'unconfigured';
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : parsed.hostname.toLowerCase();
  } catch {
    return 'unconfigured';
  }
}

function sanitizeErrorCode(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Never allow JWTs, secret keys, emails, or phone numbers in errorCode
  if (
    trimmed.includes('@') ||
    trimmed.startsWith('eyJ') ||
    trimmed.startsWith('sb_secret_') ||
    /\b\d{10,15}\b/.test(trimmed)
  ) {
    return 'REDACTED_CODE';
  }
  const safe = trimmed.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 48);
  return safe || null;
}

function sanitizeRequestId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return UUID_SIMPLE_REGEX.test(trimmed) ? trimmed.toLowerCase() : null;
}

function sanitizeProjectRef(raw: string | null | undefined): string {
  const candidate = (raw ?? detectDefaultProjectRef()).trim().toLowerCase();
  if (!candidate) return 'unconfigured';
  if (candidate.startsWith('eyj') || candidate.includes('@') || candidate.startsWith('sb_secret_')) {
    return 'redacted';
  }
  return candidate.replace(/[^a-z0-9.-]/g, '').slice(0, 40) || 'unconfigured';
}

function sanitizeSourceLabel(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 40);
  return cleaned || undefined;
}

/**
 * Emits a structured, sanitized diagnostic event for payment submission and admin queue fetching.
 * Never logs access tokens, refresh tokens, passwords, raw credentials, emails, or phone numbers.
 */
export function emitPaymentDiagnostic(input: {
  stage: PaymentDiagnosticStage;
  httpStatus?: number | null;
  errorCode?: string | null;
  operation?: string;
  table?: string;
  requestId?: string | null;
  projectRef?: string | null;
  hasUserId: boolean;
  hasWebsiteId: boolean;
  source?: string;
  rowCount?: number;
}): PaymentDiagnosticRecord {
  const safeOperation = sanitizeSourceLabel(input.operation);
  const safeTable = sanitizeSourceLabel(input.table);
  const record: PaymentDiagnosticRecord = {
    timestamp: new Date().toISOString(),
    stage: input.stage,
    httpStatus:
      typeof input.httpStatus === 'number' && Number.isFinite(input.httpStatus)
        ? Math.trunc(input.httpStatus)
        : null,
    errorCode: sanitizeErrorCode(input.errorCode),
    ...(safeOperation ? { operation: safeOperation } : {}),
    ...(safeTable ? { table: safeTable } : {}),
    requestId: sanitizeRequestId(input.requestId),
    supabaseProjectRef: sanitizeProjectRef(input.projectRef),
    hasUserId: Boolean(input.hasUserId),
    hasWebsiteId: Boolean(input.hasWebsiteId),
    ...(sanitizeSourceLabel(input.source) ? { source: sanitizeSourceLabel(input.source) } : {}),
    ...(typeof input.rowCount === 'number' && Number.isFinite(input.rowCount)
      ? { rowCount: Math.max(0, Math.trunc(input.rowCount)) }
      : {}),
  };

  recentDiagnostics.push(record);
  if (recentDiagnostics.length > MAX_DIAGNOSTIC_ENTRIES) {
    recentDiagnostics.shift();
  }

  const isFailure =
    record.stage === 'PAYMENT_REQUEST_INSERT_FAILED' ||
    record.stage === 'ADMIN_QUEUE_FETCH_FAILED';

  if (isFailure) {
    console.error('[GoAMAAS][PaymentDiag]', record);
  } else {
    console.info('[GoAMAAS][PaymentDiag]', record);
  }

  return record;
}

export function getRecentPaymentDiagnostics(): PaymentDiagnosticRecord[] {
  return [...recentDiagnostics];
}

export function clearPaymentDiagnosticsForTest(): void {
  recentDiagnostics.length = 0;
}
