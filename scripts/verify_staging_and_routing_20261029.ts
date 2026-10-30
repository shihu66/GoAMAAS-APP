import handler from '../api/resolve-tenant';
import { RESERVED_PLATFORM_SUBDOMAINS, validateSubdomainFormat } from '../src/lib/supabase';

const AUTHORIZED_STAGING_REF = 'umiheyukaddfaupsyooh';
const AUTHORIZED_STAGING_HOST = `${AUTHORIZED_STAGING_REF}.supabase.co`;

function invokeServerlessHandler(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const resHeaders: Record<string, string> = {};
    let bodyStr = '';
    const req: any = {
      method: opts.method || 'GET',
      url: opts.url || '/api/resolve-tenant',
      headers: opts.headers || {},
    };
    const res: any = {
      statusCode: 200,
      setHeader(k: string, v: string) {
        resHeaders[k.toLowerCase()] = String(v);
      },
      end(chunk?: string) {
        if (chunk) bodyStr += chunk;
        let parsed: any = bodyStr;
        try {
          parsed = bodyStr ? JSON.parse(bodyStr) : null;
        } catch {
          // keep raw string
        }
        resolve({ statusCode: this.statusCode, headers: resHeaders, body: parsed });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function runLiveStagingVerification() {
  console.log('=== GOAMAAS LIVE STAGING (umiheyukaddfaupsyooh) & TENANT ROUTING VERIFICATION ===');
  let passed = 0;
  let total = 0;

  async function check(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Reason: ${err?.message || String(err)}`);
    }
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const supabaseEnv = (process.env.VITE_SUPABASE_ENV || '').trim().toLowerCase();

  // 1. Strict Staging Target Guard (never print secrets, halt immediately if not GoAmaas-Staging)
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
  }
  const parsedHost = new URL(supabaseUrl).hostname.toLowerCase();
  if (parsedHost !== AUTHORIZED_STAGING_HOST || supabaseEnv !== 'staging') {
    throw new Error(
      `SAFETY HALT: Target host (${parsedHost}) or env (${supabaseEnv}) does not match authorized staging (${AUTHORIZED_STAGING_HOST} / staging).`
    );
  }

  await check('1. Environment strictly targets authorized GoAmaas-Staging (umiheyukaddfaupsyooh) with non-privileged publishable/anon key', async () => {
    if (supabaseAnonKey.startsWith('sb_secret_')) {
      throw new Error('Privileged sb_secret_ key must never be configured in VITE_SUPABASE_ANON_KEY');
    }
    const parts = supabaseAnonKey.split('.');
    if (parts.length === 3) {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (claims.role !== 'anon') {
        throw new Error(`Expected anon role key, got role="${claims.role}"`);
      }
      if (claims.ref !== AUTHORIZED_STAGING_REF) {
        throw new Error(`JWT ref "${claims.ref}" does not match ${AUTHORIZED_STAGING_REF}`);
      }
    } else if (!supabaseAnonKey.startsWith('sb_publishable_')) {
      throw new Error('VITE_SUPABASE_ANON_KEY is neither a 3-segment anon JWT nor an sb_publishable_ key');
    }
  });

  const anonHeaders = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };

  await check('2. Live staging RLS & privilege lockdown blocks anonymous direct access to tenant & billing tables', async () => {
    const protectedTables = [
      'stores',
      'subscribed_websites',
      'payment_requests',
      'service_pricing_catalog',
      'payment_gateway_configs',
      'products',
      'website_lifecycle_audit_logs',
    ];

    for (const table of protectedTables) {
      const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
        method: 'GET',
        headers: anonHeaders,
      });
      if (resp.status === 401 || resp.status === 403) {
        continue;
      }
      if (resp.ok) {
        const rows = (await resp.json()) as unknown[];
        if (Array.isArray(rows) && rows.length === 0) {
          continue;
        }
        throw new Error(`Table public.${table} leaked ${rows.length} row(s) to anonymous client`);
      }
    }
  });

  await check('3. Live staging privileged RPCs reject anonymous invocation (401/403 permission denied)', async () => {
    const privilegedRpcs: Array<{ name: string; args: Record<string, unknown> }> = [
      {
        name: 'admin_approve_payment_request',
        args: { p_request_id: '00000000-0000-0000-0000-000000000000', p_admin_note: 'probe' },
      },
      {
        name: 'admin_reject_payment_request',
        args: { p_request_id: '00000000-0000-0000-0000-000000000000', p_admin_note: 'probe' },
      },
      {
        name: 'admin_update_website_lifecycle',
        args: {
          p_website_id: '00000000-0000-0000-0000-000000000000',
          p_action: 'suspend',
          p_reason: 'probe',
        },
      },
      {
        name: 'publish_client_website',
        args: { p_website_id: '00000000-0000-0000-0000-000000000000' },
      },
    ];

    for (const rpc of privilegedRpcs) {
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc.name}`, {
        method: 'POST',
        headers: anonHeaders,
        body: JSON.stringify(rpc.args),
      });
      if (resp.status !== 401 && resp.status !== 403 && resp.status !== 404) {
        throw new Error(`Privileged RPC ${rpc.name} returned unexpected HTTP ${resp.status} for anon`);
      }
    }
  });

  await check('4. Live staging public subdomain availability & published storefront RPCs enforce reserved-name and not-found contracts', async () => {
    for (const reserved of ['admin', 'www', 'stage', 'api', 'dashboard']) {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/check_subdomain_availability`, {
        method: 'POST',
        headers: anonHeaders,
        body: JSON.stringify({ p_subdomain: reserved }),
      });
      if (!r.ok) {
        throw new Error(`check_subdomain_availability(${reserved}) returned HTTP ${r.status}`);
      }
      const data = (await r.json()) as any;
      if (data.available !== false || data.code !== 'RESERVED') {
        throw new Error(`Expected RESERVED for "${reserved}", got ${JSON.stringify(data)}`);
      }
    }

    const availResp = await fetch(`${supabaseUrl}/rest/v1/rpc/check_subdomain_availability`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({ p_subdomain: 'urbanfashioncheck20261029' }),
    });
    if (!availResp.ok) {
      throw new Error(`check_subdomain_availability returned HTTP ${availResp.status}`);
    }
    const availJson = (await availResp.json()) as any;
    if (availJson.available !== true) {
      throw new Error(`Expected unprovisioned subdomain to be available, got ${JSON.stringify(availJson)}`);
    }

    const pubResp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_published_website_by_subdomain`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({ p_subdomain: 'urbanfashioncheck20261029' }),
    });
    if (!pubResp.ok) {
      throw new Error(`get_published_website_by_subdomain returned HTTP ${pubResp.status}`);
    }
    const pubJson = (await pubResp.json()) as any;
    if (pubJson.found !== false) {
      throw new Error(`Expected found=false for unprovisioned subdomain, got ${JSON.stringify(pubJson)}`);
    }
  });

  await check('5. Serverless /api/resolve-tenant handler resolves wildcard Host headers, Vary caching headers, reserved subdomains, and 405 method guards against live staging', async () => {
    // 5a. Valid tenant wildcard host (urbanfashion.amaas.xyz) -> calls live staging RPC -> 404 JSON + Vary header
    const tenantRes = await invokeServerlessHandler({
      method: 'GET',
      url: '/api/resolve-tenant',
      headers: { host: 'urbanfashion.amaas.xyz' },
    });
    if (
      (tenantRes.statusCode !== 404 && tenantRes.statusCode !== 200) ||
      !tenantRes.headers['vary']?.toLowerCase().includes('host') ||
      tenantRes.headers['x-content-type-options'] !== 'nosniff'
    ) {
      throw new Error(`Unexpected response for Host: urbanfashion.amaas.xyz -> ${JSON.stringify(tenantRes)}`);
    }

    // 5b. Reserved subdomains on wildcard host (admin.amaas.xyz, stage.amaas.xyz, www.amaas.xyz) -> 400
    for (const reserved of ['admin', 'stage', 'www', 'api', 'dashboard']) {
      const resv = await invokeServerlessHandler({
        method: 'GET',
        url: '/api/resolve-tenant',
        headers: { 'x-forwarded-host': `${reserved}.amaas.xyz` },
      });
      if (resv.statusCode !== 400 || resv.body?.found !== false) {
        throw new Error(`Expected 400 for reserved host ${reserved}.amaas.xyz, got ${JSON.stringify(resv)}`);
      }
    }

    // 5c. Multi-level subdomain attempt (sub.urbanfashion.amaas.xyz) -> 400
    const multiLevel = await invokeServerlessHandler({
      method: 'GET',
      url: '/api/resolve-tenant',
      headers: { host: 'sub.urbanfashion.amaas.xyz' },
    });
    if (multiLevel.statusCode !== 400) {
      throw new Error(`Expected 400 for multi-label subdomain, got ${multiLevel.statusCode}`);
    }

    // 5d. POST request -> 405 Method Not Allowed
    const postRes = await invokeServerlessHandler({
      method: 'POST',
      url: '/api/resolve-tenant?subdomain=urbanfashion',
      headers: { host: 'amaas.xyz' },
    });
    if (postRes.statusCode !== 405) {
      throw new Error(`Expected 405 for POST /api/resolve-tenant, got ${postRes.statusCode}`);
    }

    // 5e. Frontend & serverless reserved-subdomain parity (all 54 reserved names rejected)
    if (RESERVED_PLATFORM_SUBDOMAINS.size !== 54) {
      throw new Error(`Expected 54 reserved platform subdomains, got ${RESERVED_PLATFORM_SUBDOMAINS.size}`);
    }
    for (const word of RESERVED_PLATFORM_SUBDOMAINS) {
      if (validateSubdomainFormat(word).valid) {
        throw new Error(`Frontend validateSubdomainFormat failed to block reserved word "${word}"`);
      }
    }
  });

  // Diagnostic read-only probe of 20261029 storage bucket & auth autoconfirm state on umiheyukaddfaupsyooh
  const bucketProbe = await fetch(`${supabaseUrl}/storage/v1/bucket/website-assets`, {
    method: 'GET',
    headers: anonHeaders,
  });
  const authSettingsProbe = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    method: 'GET',
    headers: { apikey: supabaseAnonKey },
  });
  const bucketJson = (await bucketProbe.json().catch(() => ({}))) as any;
  const authSettingsJson = (await authSettingsProbe.json().catch(() => ({}))) as any;

  console.log(
    `[INFO] Live GoAmaas-Staging (${AUTHORIZED_STAGING_REF}) post-20261029 state: website-assets bucket=${
      bucketProbe.ok && bucketJson?.id === 'website-assets' ? 'PRESENT (20261029 APPLIED)' : 'NOT_FOUND (20261029 PENDING SQL APPLY)'
    }, MailerAutoconfirm=${Boolean(authSettingsJson?.mailer_autoconfirm ?? authSettingsJson?.MailerAutoconfirm)}`
  );

  console.log(`\n=== SUMMARY: ${passed}/${total} LIVE STAGING & ROUTING CHECKS PASSED ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runLiveStagingVerification().catch((err) => {
  console.error('Fatal live staging verification error:', err?.message || err);
  process.exit(1);
});
