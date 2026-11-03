import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

type PricingServiceType =
  | 'website_subscription'
  | 'website_package'
  | 'dashboard_plan'
  | 'ai_automation';

interface PricingCatalogEntry {
  serviceType: PricingServiceType;
  serviceCode: string;
  planTierLabel: string;
  priceBdt: number;
  setupFeeBdt: number;
  isActive: boolean;
  updatedAt?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEGACY_DASHBOARD_PLAN_ALIASES: Readonly<
  Record<string, 'starter' | 'business' | 'pro' | 'enterprise'>
> = {
  starter: 'starter',
  dashboard_starter: 'starter',
  plan_starter: 'starter',
  business: 'business',
  dashboard_business: 'business',
  plan_growth: 'business',
  growth: 'business',
  pro: 'pro',
  dashboard_pro: 'pro',
  plan_pro: 'pro',
  enterprise: 'enterprise',
  dashboard_enterprise: 'enterprise',
  plan_enterprise: 'enterprise',
};

function normalizeDashboardPlanId(
  raw: string | null | undefined
): 'starter' | 'business' | 'pro' | 'enterprise' | null {
  const cleaned = (raw || '').trim().toLowerCase();
  if (!cleaned) return null;
  return LEGACY_DASHBOARD_PLAN_ALIASES[cleaned] ?? null;
}

/**
 * Self-contained server-authoritative pricing catalog for Vercel Node ESM runtime.
 * Avoids cross-directory extensionless ESM relative imports that trigger
 * ERR_MODULE_NOT_FOUND / 500 FUNCTION_INVOCATION_FAILED on Vercel Production.
 */
function buildServerAuthoritativeCatalog(): PricingCatalogEntry[] {
  return [
    {
      serviceType: 'website_subscription',
      serviceCode: 'website_lite',
      planTierLabel: 'GoAMAAS Website',
      priceBdt: 600,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'website_package',
      serviceCode: 'starter_web',
      planTierLabel: 'Starter Website',
      priceBdt: 8000,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'website_package',
      serviceCode: 'business_web',
      planTierLabel: 'Business Website',
      priceBdt: 15000,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'website_package',
      serviceCode: 'advanced_web',
      planTierLabel: 'Advanced Website',
      priceBdt: 25000,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'website_package',
      serviceCode: 'custom_setup',
      planTierLabel: 'Custom Setup',
      priceBdt: 3500,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'dashboard_plan',
      serviceCode: 'starter',
      planTierLabel: 'Starter',
      priceBdt: 0,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'dashboard_plan',
      serviceCode: 'business',
      planTierLabel: 'Business',
      priceBdt: 0,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'dashboard_plan',
      serviceCode: 'pro',
      planTierLabel: 'Pro',
      priceBdt: 0,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'dashboard_plan',
      serviceCode: 'enterprise',
      planTierLabel: 'Enterprise',
      priceBdt: 0,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'ai_automation',
      serviceCode: 'basic_auto',
      planTierLabel: 'Basic Automation',
      priceBdt: 999,
      setupFeeBdt: 1000,
      isActive: true,
    },
    {
      serviceType: 'ai_automation',
      serviceCode: 'growth_auto',
      planTierLabel: 'Growth Automation',
      priceBdt: 2499,
      setupFeeBdt: 1500,
      isActive: true,
    },
    {
      serviceType: 'ai_automation',
      serviceCode: 'ai_chatbot',
      planTierLabel: 'AI Chatbot',
      priceBdt: 3999,
      setupFeeBdt: 0,
      isActive: true,
    },
    {
      serviceType: 'ai_automation',
      serviceCode: 'biz_auto_pro',
      planTierLabel: 'Business Automation Pro',
      priceBdt: 7999,
      setupFeeBdt: 0,
      isActive: true,
    },
  ];
}

function resolveSupabaseServerEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseProjectRef: string;
  valid: boolean;
} {
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

  let supabaseProjectRef = 'unconfigured';
  let valid =
    Boolean(supabaseUrl) &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    Boolean(supabaseAnonKey) &&
    supabaseAnonKey !== 'your-anon-key-here' &&
    supabaseAnonKey !== 'your-anon-key' &&
    !supabaseAnonKey.startsWith('sb_secret_');

  if (valid) {
    try {
      const parsedHost = new URL(supabaseUrl).hostname;
      const hostMatch = parsedHost.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      const urlRef = hostMatch ? hostMatch[1].toLowerCase() : '';
      supabaseProjectRef = urlRef || parsedHost.toLowerCase();
      const parts = supabaseAnonKey.split('.');
      if (parts.length === 3) {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (claims?.role === 'service_role') {
          valid = false;
        } else if (
          typeof claims?.ref === 'string' &&
          urlRef &&
          claims.ref.trim().toLowerCase() !== urlRef
        ) {
          valid = false;
        }
      }
    } catch {
      valid = false;
    }
  }

  return { supabaseUrl, supabaseAnonKey, supabaseProjectRef, valid };
}

function logServerPricingDiagnostic(params: {
  stage: 'PRICING_VERIFICATION_SUCCEEDED' | 'PRICING_VERIFICATION_FAILED';
  httpStatus: number;
  errorCode: string | null;
  supabaseProjectRef: string;
  hasUserId: boolean;
  hasWebsiteId: boolean;
  catalogSource?: string;
}): void {
  const safeCode = params.errorCode
    ? params.errorCode.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 48)
    : null;
  const payload = {
    timestamp: new Date().toISOString(),
    stage: params.stage,
    httpStatus: params.httpStatus,
    errorCode: safeCode,
    requestId: null,
    supabaseProjectRef: params.supabaseProjectRef || 'unconfigured',
    hasUserId: Boolean(params.hasUserId),
    hasWebsiteId: Boolean(params.hasWebsiteId),
    ...(params.catalogSource ? { source: params.catalogSource } : {}),
  };
  if (params.stage === 'PRICING_VERIFICATION_FAILED') {
    console.error('[GoAMAAS][PaymentDiag]', JSON.stringify(payload));
  } else {
    console.info('[GoAMAAS][PaymentDiag]', JSON.stringify(payload));
  }
}

async function readJsonBody(req: RequestWithBody): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > 32_768) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: RequestWithBody, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    return;
  }

  const { supabaseUrl, supabaseAnonKey, supabaseProjectRef, valid } = resolveSupabaseServerEnv();
  let hasUserId = false;
  let hasWebsiteId = false;

  try {
    if (!valid) {
      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_FAILED',
        httpStatus: 503,
        errorCode: 'SUPABASE_NOT_CONFIGURED',
        supabaseProjectRef,
        hasUserId: false,
        hasWebsiteId: false,
      });
      sendJson(res, 503, {
        ok: false,
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Server Supabase configuration is unavailable.',
      });
      return;
    }

    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!bearerToken) {
      sendJson(res, 401, {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Authentication required: please sign in to verify service pricing.',
      });
      return;
    }

    // 1. Verify caller's Supabase user session token against GoTrue
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!userResp.ok) {
      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_FAILED',
        httpStatus: 401,
        errorCode: 'AUTH_EXPIRED',
        supabaseProjectRef,
        hasUserId: false,
        hasWebsiteId: false,
      });
      sendJson(res, 401, {
        ok: false,
        code: 'AUTH_EXPIRED',
        error: 'Your login session has expired. Please sign in again and retry payment submission.',
      });
      return;
    }

    const authUser = (await userResp.json()) as { id?: string; email?: string };
    if (!authUser?.id) {
      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_FAILED',
        httpStatus: 401,
        errorCode: 'AUTH_INVALID',
        supabaseProjectRef,
        hasUserId: false,
        hasWebsiteId: false,
      });
      sendJson(res, 401, {
        ok: false,
        code: 'AUTH_INVALID',
        error: 'Unable to verify your authenticated account. Please sign in again.',
      });
      return;
    }
    hasUserId = true;

    // 2. Parse optional target service parameters from query or JSON body
    const hostHeader = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
    const cleanHost = hostHeader.split(':')[0].toLowerCase();
    const parsedUrl = new URL(req.url || '/', `http://${cleanHost}`);
    const body = req.method === 'POST' ? await readJsonBody(req) : {};

    const serviceType = String(
      body.serviceType ?? parsedUrl.searchParams.get('serviceType') ?? ''
    ).trim();
    const serviceId = String(
      body.serviceId ?? parsedUrl.searchParams.get('serviceId') ?? ''
    ).trim();
    const serviceName = String(
      body.serviceName ?? parsedUrl.searchParams.get('serviceName') ?? ''
    ).trim();
    const planTier = String(
      body.planTier ?? parsedUrl.searchParams.get('planTier') ?? ''
    ).trim();
    const includeSetupFee = Boolean(
      body.includeSetupFee === true || parsedUrl.searchParams.get('includeSetupFee') === 'true'
    );

    hasWebsiteId =
      (serviceType === 'website_subscription' || serviceType === 'website_package') &&
      UUID_REGEX.test(serviceId);

    // 3. Query public.service_pricing_catalog with the authenticated user's JWT
    const catalogUrl = `${supabaseUrl}/rest/v1/service_pricing_catalog?select=*&order=service_type.asc,service_code.asc`;
    const catalogResp = await fetch(catalogUrl, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
    });

    let catalog: PricingCatalogEntry[] = [];
    let catalogSource: 'database' | 'server_authoritative_fallback' = 'database';

    if (catalogResp.ok) {
      const rows = (await catalogResp.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(rows) && rows.length > 0) {
        catalog = rows.map((row) => ({
          serviceType: String(row.service_type) as PricingServiceType,
          serviceCode: String(row.service_code || ''),
          planTierLabel: String(row.plan_tier_label || ''),
          priceBdt: Number(row.price_bdt) || 0,
          setupFeeBdt: Number(row.setup_fee_bdt) || 0,
          isActive: Boolean(row.is_active),
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        }));
      } else {
        catalog = buildServerAuthoritativeCatalog();
        catalogSource = 'server_authoritative_fallback';
      }
    } else {
      let errPayload: Record<string, unknown> = {};
      try {
        errPayload = (await catalogResp.json()) as Record<string, unknown>;
      } catch {
        errPayload = {};
      }
      const errCode = String(errPayload.code || '');
      const errMsg = String(errPayload.message || '');
      const isTableMissing =
        catalogResp.status === 404 ||
        errCode === 'PGRST205' ||
        errCode === '42P01' ||
        /service_pricing_catalog/i.test(errMsg);

      if (isTableMissing) {
        catalog = buildServerAuthoritativeCatalog();
        catalogSource = 'server_authoritative_fallback';
      } else {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 502,
          errorCode: errCode || 'PRICING_QUERY_FAILED',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId,
        });
        sendJson(res, 502, {
          ok: false,
          code: 'PRICING_QUERY_FAILED',
          error: errMsg || 'Unable to query active service pricing from database.',
        });
        return;
      }
    }

    // If caller only requested the active catalog (no specific serviceType), return immediately
    if (!serviceType) {
      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_SUCCEEDED',
        httpStatus: 200,
        errorCode: null,
        supabaseProjectRef,
        hasUserId,
        hasWebsiteId: false,
        catalogSource,
      });
      sendJson(res, 200, {
        ok: true,
        catalog,
        catalogSource,
      });
      return;
    }

    // 4. Verify exact target service & compute authoritative server BDT price
    if (serviceType === 'website_subscription' || serviceType === 'website_package') {
      if (!UUID_REGEX.test(serviceId)) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 400,
          errorCode: 'INVALID_WEBSITE_ID',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: false,
        });
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_WEBSITE_ID',
          error: 'Invalid website ID format. Please save your website first before submitting payment.',
        });
        return;
      }

      const siteUrl = `${supabaseUrl}/rest/v1/subscribed_websites?id=eq.${encodeURIComponent(
        serviceId
      )}&select=*`;

      const siteResp = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
        },
      });

      if (!siteResp.ok) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 502,
          errorCode: 'WEBSITE_LOOKUP_FAILED',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: true,
        });
        sendJson(res, 502, {
          ok: false,
          code: 'WEBSITE_LOOKUP_FAILED',
          error: 'Unable to verify target website ownership from database.',
        });
        return;
      }

      const siteRows = (await siteResp.json()) as Array<Record<string, unknown>>;
      const siteRow = Array.isArray(siteRows) ? siteRows[0] : undefined;

      if (!siteRow) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 404,
          errorCode: 'WEBSITE_NOT_FOUND',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: true,
        });
        sendJson(res, 404, {
          ok: false,
          code: 'WEBSITE_NOT_FOUND',
          error: 'Target website not found under your account. Please save your website before submitting payment.',
        });
        return;
      }

      if (String(siteRow.user_id || '') !== authUser.id) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 403,
          errorCode: 'WEBSITE_OWNERSHIP_MISMATCH',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: true,
        });
        sendJson(res, 403, {
          ok: false,
          code: 'WEBSITE_OWNERSHIP_MISMATCH',
          error: 'Unauthorized: You can only submit a payment request for your own website.',
        });
        return;
      }

      if (serviceType === 'website_subscription') {
        const liteEntry = catalog.find(
          (entry) =>
            entry.serviceType === 'website_subscription' &&
            entry.serviceCode.trim().toLowerCase() === 'website_lite'
        );

        if (!liteEntry || !liteEntry.isActive || !(liteEntry.priceBdt > 0)) {
          logServerPricingDiagnostic({
            stage: 'PRICING_VERIFICATION_FAILED',
            httpStatus: 422,
            errorCode: 'PLAN_INACTIVE',
            supabaseProjectRef,
            hasUserId,
            hasWebsiteId: true,
          });
          sendJson(res, 422, {
            ok: false,
            code: 'PLAN_INACTIVE',
            error: 'The GoAMAAS Website subscription plan is currently unavailable or inactive.',
          });
          return;
        }

        const rowMonthlyFee = Number(siteRow.monthly_fee);
        const authoritativeAmount =
          Number.isFinite(rowMonthlyFee) && rowMonthlyFee > 0
            ? rowMonthlyFee
            : liteEntry.priceBdt;

        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_SUCCEEDED',
          httpStatus: 200,
          errorCode: null,
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: true,
          catalogSource,
        });

        sendJson(res, 200, {
          ok: true,
          catalog,
          catalogSource,
          resolvedPrice: {
            serviceType: 'website_subscription',
            serviceId: String(siteRow.id),
            subdomain: String(siteRow.subdomain || ''),
            businessName: String(siteRow.business_name || ''),
            planTierLabel:
              liteEntry.planTierLabel || String(siteRow.plan_tier || 'GoAMAAS Website'),
            amount: authoritativeAmount,
            currency: '৳',
          },
        });
        return;
      }

      // website_package
      const lowerTier = planTier.toLowerCase();
      const lowerName = serviceName.toLowerCase();
      const inferredCode =
        lowerTier.includes('starter') || lowerName.includes('starter')
          ? 'starter_web'
          : lowerTier.includes('business') || lowerName.includes('business')
          ? 'business_web'
          : lowerTier.includes('advanced') || lowerName.includes('advanced')
          ? 'advanced_web'
          : lowerName.includes('custom setup') || lowerTier === 'one-time'
          ? 'custom_setup'
          : '';

      const matchedPkg = catalog.find((entry) => {
        if (entry.serviceType !== 'website_package' || !entry.isActive || !(entry.priceBdt > 0)) {
          return false;
        }
        const code = entry.serviceCode.trim().toLowerCase();
        const label = entry.planTierLabel.trim().toLowerCase();
        if (inferredCode) return code === inferredCode;
        return code === lowerTier || code === lowerName || label === lowerTier || label === lowerName;
      });

      if (!matchedPkg) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 422,
          errorCode: 'PACKAGE_INACTIVE',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: true,
        });
        sendJson(res, 422, {
          ok: false,
          code: 'PACKAGE_INACTIVE',
          error: 'The selected website package is currently unavailable or inactive.',
        });
        return;
      }

      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_SUCCEEDED',
        httpStatus: 200,
        errorCode: null,
        supabaseProjectRef,
        hasUserId,
        hasWebsiteId: true,
        catalogSource,
      });

      sendJson(res, 200, {
        ok: true,
        catalog,
        catalogSource,
        resolvedPrice: {
          serviceType: 'website_package',
          serviceId: String(siteRow.id),
          subdomain: String(siteRow.subdomain || ''),
          businessName: String(siteRow.business_name || ''),
          planTierLabel: matchedPkg.planTierLabel,
          amount: matchedPkg.priceBdt,
          currency: '৳',
        },
      });
      return;
    }

    if (serviceType === 'ai_automation') {
      const cleanCode = serviceId.toLowerCase();
      const matchedAuto = catalog.find(
        (entry) =>
          entry.serviceType === 'ai_automation' &&
          entry.serviceCode.trim().toLowerCase() === cleanCode &&
          entry.isActive &&
          entry.priceBdt > 0
      );

      if (!matchedAuto) {
        logServerPricingDiagnostic({
          stage: 'PRICING_VERIFICATION_FAILED',
          httpStatus: 422,
          errorCode: 'AUTOMATION_INACTIVE',
          supabaseProjectRef,
          hasUserId,
          hasWebsiteId: false,
        });
        sendJson(res, 422, {
          ok: false,
          code: 'AUTOMATION_INACTIVE',
          error: 'The selected automation package is currently unavailable or inactive.',
        });
        return;
      }

      const amount = includeSetupFee
        ? matchedAuto.priceBdt + (matchedAuto.setupFeeBdt || 0)
        : matchedAuto.priceBdt;

      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_SUCCEEDED',
        httpStatus: 200,
        errorCode: null,
        supabaseProjectRef,
        hasUserId,
        hasWebsiteId: false,
        catalogSource,
      });

      sendJson(res, 200, {
        ok: true,
        catalog,
        catalogSource,
        resolvedPrice: {
          serviceType: 'ai_automation',
          serviceId: cleanCode,
          planTierLabel: matchedAuto.planTierLabel,
          amount,
          monthlyAmount: matchedAuto.priceBdt,
          setupAmount: matchedAuto.priceBdt + (matchedAuto.setupFeeBdt || 0),
          currency: '৳',
        },
      });
      return;
    }

    if (serviceType === 'dashboard_plan') {
      const canonical = normalizeDashboardPlanId(serviceId);
      logServerPricingDiagnostic({
        stage: 'PRICING_VERIFICATION_FAILED',
        httpStatus: 422,
        errorCode: 'DASHBOARD_FREE',
        supabaseProjectRef,
        hasUserId,
        hasWebsiteId: false,
      });
      sendJson(res, 422, {
        ok: false,
        code: 'DASHBOARD_FREE',
        serviceId: canonical || serviceId,
        error: 'The GoAMAAS Merchant Dashboard is 100% free permanently. No subscription payment is required.',
      });
      return;
    }

    logServerPricingDiagnostic({
      stage: 'PRICING_VERIFICATION_FAILED',
      httpStatus: 400,
      errorCode: 'UNSUPPORTED_SERVICE_TYPE',
      supabaseProjectRef,
      hasUserId,
      hasWebsiteId: false,
    });
    sendJson(res, 400, {
      ok: false,
      code: 'UNSUPPORTED_SERVICE_TYPE',
      error: 'Unsupported service type requested for pricing verification.',
    });
  } catch {
    logServerPricingDiagnostic({
      stage: 'PRICING_VERIFICATION_FAILED',
      httpStatus: 500,
      errorCode: 'INTERNAL_ERROR',
      supabaseProjectRef,
      hasUserId,
      hasWebsiteId,
    });
    sendJson(res, 500, {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Server error while verifying active service pricing.',
    });
  }
}
