import type { IncomingMessage, ServerResponse } from 'http';
import {
  AI_AUTOMATION_PACKAGES,
  DASHBOARD_SUBSCRIPTION_PLANS,
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
  WEBSITE_DEVELOPMENT_PACKAGES,
  normalizeDashboardPlanId,
} from '../src/data/pricingConfig';
import type { ServicePricingCatalogEntry } from '../src/types';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildServerAuthoritativeCatalog(): ServicePricingCatalogEntry[] {
  const entries: ServicePricingCatalogEntry[] = [
    {
      serviceType: 'website_subscription',
      serviceCode: 'website_lite',
      planTierLabel: DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.name,
      priceBdt: DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.priceMonthly,
      setupFeeBdt: 0,
      isActive: true,
    },
    ...WEBSITE_DEVELOPMENT_PACKAGES.map((pkg) => ({
      serviceType: 'website_package' as const,
      serviceCode: pkg.id,
      planTierLabel: pkg.name,
      priceBdt: pkg.priceOneTime,
      setupFeeBdt: 0,
      isActive: true,
    })),
    {
      serviceType: 'website_package',
      serviceCode: 'custom_setup',
      planTierLabel: 'Custom Setup',
      priceBdt: 3500,
      setupFeeBdt: 0,
      isActive: true,
    },
    ...DASHBOARD_SUBSCRIPTION_PLANS.map((plan) => ({
      serviceType: 'dashboard_plan' as const,
      serviceCode: plan.id,
      planTierLabel: plan.name,
      priceBdt: plan.priceMonthly,
      setupFeeBdt: 0,
      isActive: true,
    })),
    ...AI_AUTOMATION_PACKAGES.map((auto) => ({
      serviceType: 'ai_automation' as const,
      serviceCode: auto.id,
      planTierLabel: auto.name,
      priceBdt: auto.priceMonthly,
      setupFeeBdt: typeof auto.setupFee === 'number' ? auto.setupFee : 0,
      isActive: true,
    })),
  ];

  return entries;
}

function resolveSupabaseServerEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
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

  return { supabaseUrl, supabaseAnonKey, valid };
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

  try {
    const { supabaseUrl, supabaseAnonKey, valid } = resolveSupabaseServerEnv();
    if (!valid) {
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
      sendJson(res, 401, {
        ok: false,
        code: 'AUTH_EXPIRED',
        error: 'Your login session has expired. Please sign in again and retry payment submission.',
      });
      return;
    }

    const authUser = (await userResp.json()) as { id?: string; email?: string };
    if (!authUser?.id) {
      sendJson(res, 401, {
        ok: false,
        code: 'AUTH_INVALID',
        error: 'Unable to verify your authenticated account. Please sign in again.',
      });
      return;
    }

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

    let catalog: ServicePricingCatalogEntry[] = [];
    let catalogSource: 'database' | 'server_authoritative_fallback' = 'database';

    if (catalogResp.ok) {
      const rows = (await catalogResp.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(rows) && rows.length > 0) {
        catalog = rows.map((row) => ({
          serviceType: String(row.service_type) as ServicePricingCatalogEntry['serviceType'],
          serviceCode: String(row.service_code || ''),
          planTierLabel: String(row.plan_tier_label || ''),
          priceBdt: Number(row.price_bdt) || 0,
          setupFeeBdt: Number(row.setup_fee_bdt) || 0,
          isActive: Boolean(row.is_active),
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        }));
      } else {
        // Table exists in Production DB but has not been seeded yet — use server-owned authoritative catalog
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
        sendJson(res, 404, {
          ok: false,
          code: 'WEBSITE_NOT_FOUND',
          error: 'Target website not found under your account. Please save your website before submitting payment.',
        });
        return;
      }

      if (String(siteRow.user_id || '') !== authUser.id) {
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
        sendJson(res, 422, {
          ok: false,
          code: 'PACKAGE_INACTIVE',
          error: 'The selected website package is currently unavailable or inactive.',
        });
        return;
      }

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
      sendJson(res, 422, {
        ok: false,
        code: 'DASHBOARD_FREE',
        serviceId: canonical || serviceId,
        error: 'The GoAMAAS Merchant Dashboard is 100% free permanently. No subscription payment is required.',
      });
      return;
    }

    sendJson(res, 400, {
      ok: false,
      code: 'UNSUPPORTED_SERVICE_TYPE',
      error: 'Unsupported service type requested for pricing verification.',
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Server error while verifying active service pricing.',
    });
  }
}
