import type { IncomingMessage, ServerResponse } from 'http';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
  url?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function readJsonBody(req: RequestWithBody): Promise<Record<string, any> | null> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, any>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
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
        resolve(null);
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve(null);
    });
  });
}

function isValidSubdomain(subdomain: string): boolean {
  return (
    Boolean(subdomain) &&
    subdomain.length >= 3 &&
    subdomain.length <= 30 &&
    !subdomain.includes('.') &&
    !subdomain.startsWith('xn--') &&
    !RESERVED_SUBDOMAINS.has(subdomain) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)
  );
}

function parseNumPrice(item: any): number {
  if (typeof item?.discountPrice === 'number' && Number.isFinite(item.discountPrice) && item.discountPrice >= 0) {
    return item.discountPrice;
  }
  if (typeof item?.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) && item.priceNumeric >= 0) {
    return item.priceNumeric;
  }
  const cleaned = Number(String(item?.price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(cleaned) && cleaned >= 0 ? cleaned : 0;
}

function buildPhoneVariants(rawPhone: string): string[] {
  const cleaned = String(rawPhone || '').replace(/[\s()-]+/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'not provided') return [];
  const digitsOnly = cleaned.replace(/^\+/, '');
  const variants = new Set<string>([cleaned]);
  if (/^8801[3-9]\d{8}$/.test(digitsOnly)) {
    variants.add(`0${digitsOnly.slice(3)}`);
    variants.add(digitsOnly);
    variants.add(`+${digitsOnly}`);
  } else if (/^01[3-9]\d{8}$/.test(digitsOnly)) {
    variants.add(digitsOnly);
    variants.add(`88${digitsOnly}`);
    variants.add(`+88${digitsOnly}`);
  }
  return Array.from(variants);
}

/**
 * Connects a verified Google-authenticated customer to the current merchant's public.customers
 * CRM directory strictly scoped by store_id, preventing duplicate customer rows and never
 * overwriting valid order phone numbers or historical totals.
 */
async function syncAuthenticatedCustomerToStoreDirectory(params: {
  supabaseUrl: string;
  adminHeaders: Record<string, string>;
  storeId: string;
  subdomain: string;
  verifiedEmail: string;
  fullName: string;
  phone?: string;
  shippingAddress?: string;
  city?: string;
  preferProfileOverwrite?: boolean;
}): Promise<void> {
  try {
    const cleanEmail = String(params.verifiedEmail || '').trim().toLowerCase();
    const rawPhone = String(params.phone || '').replace(/[\s()-]+/g, '').trim().slice(0, 30);
    const cleanPhone =
      rawPhone && rawPhone.toLowerCase() !== 'not provided' ? rawPhone : '';
    if (!cleanEmail && !cleanPhone) return;

    const cleanName =
      String(params.fullName || '').trim().slice(0, 120) ||
      (cleanEmail ? cleanEmail.split('@')[0] : 'Customer');
    const cleanAddress = String(params.shippingAddress || '').trim().slice(0, 400);
    const cleanCity = String(params.city || '').trim().slice(0, 80);

    let existingCust: any = null;
    if (cleanEmail) {
      const emailLookupResp = await fetch(
        `${params.supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(params.storeId)}&email=ilike.${encodeURIComponent(cleanEmail)}&order=created_at.asc&limit=1&select=*`,
        { method: 'GET', headers: params.adminHeaders }
      );
      if (emailLookupResp.ok) {
        const rows = (await emailLookupResp.json()) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          existingCust = rows[0];
        }
      }
    }

    if (!existingCust && cleanPhone) {
      const variants = buildPhoneVariants(cleanPhone);
      if (variants.length > 0) {
        const phoneOrClause = variants.map((p) => `phone.eq.${encodeURIComponent(p)}`).join(',');
        const phoneLookupResp = await fetch(
          `${params.supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(params.storeId)}&or=(${phoneOrClause})&order=created_at.asc&limit=1&select=*`,
          { method: 'GET', headers: params.adminHeaders }
        );
        if (phoneLookupResp.ok) {
          const rows = (await phoneLookupResp.json()) as any[];
          if (Array.isArray(rows) && rows.length > 0) {
            existingCust = rows[0];
          }
        }
      }
    }

    if (existingCust && existingCust.id) {
      const patchBody: Record<string, unknown> = {};
      const existingEmail = String(existingCust.email || '').trim().toLowerCase();
      if (cleanEmail && existingEmail !== cleanEmail) {
        patchBody.email = cleanEmail;
      }

      const existingName = String(existingCust.name || '').trim();
      if (
        cleanName &&
        (params.preferProfileOverwrite || !existingName || existingName === 'Customer') &&
        existingName !== cleanName
      ) {
        patchBody.name = cleanName;
      }

      const existingPhone = String(existingCust.phone || '').trim();
      const existingPhoneMissing =
        !existingPhone || existingPhone.toLowerCase() === 'not provided';
      if (
        cleanPhone &&
        (existingPhoneMissing || params.preferProfileOverwrite) &&
        existingPhone !== cleanPhone
      ) {
        patchBody.phone = cleanPhone;
      }

      const existingAddress = String(existingCust.address || '').trim();
      if (
        cleanAddress &&
        (params.preferProfileOverwrite || !existingAddress) &&
        existingAddress !== cleanAddress
      ) {
        patchBody.address = cleanAddress;
      }

      const existingCity = String(existingCust.city || '').trim();
      if (
        cleanCity &&
        (params.preferProfileOverwrite || !existingCity) &&
        existingCity !== cleanCity
      ) {
        patchBody.city = cleanCity;
      }

      if (Object.keys(patchBody).length > 0) {
        await fetch(
          `${params.supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(existingCust.id)}&store_id=eq.${encodeURIComponent(params.storeId)}`,
          {
            method: 'PATCH',
            headers: params.adminHeaders,
            body: JSON.stringify(patchBody),
          }
        );
      }
      return;
    }

    await fetch(`${params.supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: params.adminHeaders,
      body: JSON.stringify({
        store_id: params.storeId,
        name: cleanName,
        phone: cleanPhone || 'Not provided',
        email: cleanEmail || null,
        address: cleanAddress,
        city: cleanCity,
        orders_count: 0,
        total_spent: 0,
        notes: `Signed in with Google via ${params.subdomain}.amaas.xyz`,
      }),
    });
  } catch {
    // Non-fatal store directory sync; never break customer portal operations
  }
}

function mapDbOrderToCustomerDto(
  row: any,
  fallbackBranding: Record<string, any>
): Record<string, any> {
  const items = Array.isArray(row.items) ? row.items : [];
  const firstMeta =
    items[0]?.orderMeta && typeof items[0].orderMeta === 'object' ? items[0].orderMeta : {};
  const subtotal = Number(row.subtotal) || 0;
  const deliveryFee = Number(row.delivery_charge) || 0;
  const total = Number(row.total) || 0;
  const discount =
    Number(firstMeta.discountTotal) ||
    Math.max(0, subtotal + deliveryFee - total);

  return {
    id: row.id,
    storeId: row.store_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email || '',
    customerPhone: row.customer_phone,
    customerAuthUserId: firstMeta.customerAuthUserId || undefined,
    items,
    subtotal,
    total,
    deliveryFee,
    discount,
    status: row.status || 'pending',
    statusHistory: Array.isArray(firstMeta.statusHistory)
      ? firstMeta.statusHistory
      : [{ status: 'pending', at: row.created_at }],
    paymentStatus: row.payment_status || 'pending',
    paymentMethod: row.payment_method || 'Cash on Delivery (COD)',
    shippingAddress: row.address || '',
    city: row.city || '',
    deliveryArea: firstMeta.deliveryArea || undefined,
    deliveryMethod: firstMeta.deliveryMethod || undefined,
    deliveryInstructions: firstMeta.deliveryInstructions || undefined,
    notes: firstMeta.orderNotes || undefined,
    courierName: row.courier_name || undefined,
    trackingCode: row.tracking_code || undefined,
    source: row.source || undefined,
    websiteId: firstMeta.websiteId || undefined,
    websiteSubdomain: firstMeta.websiteSubdomain || firstMeta.subdomain || undefined,
    merchantBrandingSnapshot: firstMeta.merchantBrandingSnapshot || fallbackBranding,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export default async function handler(req: RequestWithBody, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
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

    if (!supabaseUrl.startsWith('https://') || !supabaseAnonKey || !serviceRoleKey) {
      sendJson(res, 503, {
        ok: false,
        code: 'PORTAL_BACKEND_UNCONFIGURED',
        error: 'Customer portal backend requires Supabase server credentials.',
      });
      return;
    }

    // 1. Strict server-side JWT verification
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      sendJson(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        error: 'Sign in with Google to access your customer portal.',
      });
      return;
    }
    const accessToken = authHeader.slice(7).trim();
    if (accessToken.length < 20) {
      sendJson(res, 401, { ok: false, code: 'INVALID_TOKEN', error: 'Invalid session token.' });
      return;
    }

    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userResp.ok) {
      sendJson(res, 401, {
        ok: false,
        code: 'SESSION_EXPIRED',
        error: 'Your sign-in session has expired. Please sign in again.',
      });
      return;
    }
    const verifiedAuthUser = (await userResp.json()) as {
      id?: string;
      email?: string;
      user_metadata?: Record<string, any>;
    };
    const verifiedUserId = String(verifiedAuthUser?.id || '').trim();
    if (!UUID_REGEX.test(verifiedUserId)) {
      sendJson(res, 401, { ok: false, code: 'INVALID_USER', error: 'Unable to verify customer identity.' });
      return;
    }

    // 2. Parse action & subdomain
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const action = (parsedUrl.searchParams.get('action') || '').trim().toLowerCase();
    let body: Record<string, any> | null = null;
    if (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST') {
      body = await readJsonBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid request body.' });
        return;
      }
    }

    const subdomain = String(parsedUrl.searchParams.get('subdomain') || body?.subdomain || '')
      .trim()
      .toLowerCase();
    if (!isValidSubdomain(subdomain)) {
      sendJson(res, 400, { ok: false, code: 'INVALID_SUBDOMAIN', error: 'Invalid storefront subdomain.' });
      return;
    }

    const adminHeaders: Record<string, string> = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    // 3. Resolve live published storefront -> authoritative storeId
    const siteLookupResp = await fetch(
      `${supabaseUrl}/rest/v1/subscribed_websites?subdomain=ilike.${encodeURIComponent(subdomain)}&select=id,store_id,user_id,business_name,subdomain,full_domain,status,payment_status,deployment_status,current_period_end,config&limit=1`,
      { method: 'GET', headers: adminHeaders }
    );
    if (!siteLookupResp.ok) {
      sendJson(res, 502, { ok: false, code: 'STOREFRONT_LOOKUP_FAILED', error: 'Unable to resolve storefront.' });
      return;
    }
    const siteRows = (await siteLookupResp.json()) as any[];
    const siteRow = Array.isArray(siteRows) ? siteRows[0] : null;
    if (!siteRow) {
      sendJson(res, 404, { ok: false, code: 'STOREFRONT_NOT_FOUND', error: 'Storefront not found.' });
      return;
    }

    const periodEndMs = siteRow.current_period_end ? Date.parse(String(siteRow.current_period_end)) : NaN;
    const isExpired =
      siteRow.status === 'grace_period' ||
      siteRow.status === 'past_due' ||
      (Number.isFinite(periodEndMs) && periodEndMs <= Date.now());
    if (
      isExpired ||
      siteRow.status !== 'active' ||
      siteRow.payment_status !== 'paid' ||
      siteRow.deployment_status !== 'live'
    ) {
      sendJson(res, 403, { ok: false, code: 'STOREFRONT_INACTIVE', error: 'This storefront is currently offline.' });
      return;
    }

    let storeId = String(siteRow.store_id || '').trim();
    const siteOwnerUserId = String(siteRow.user_id || '').trim();
    let storeRow: any = null;
    if (UUID_REGEX.test(storeId)) {
      const storeResp = await fetch(
        `${supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(storeId)}&select=id,owner_id,name,phone,address,logo_url&limit=1`,
        { method: 'GET', headers: adminHeaders }
      );
      if (storeResp.ok) {
        const sRows = (await storeResp.json()) as any[];
        storeRow = sRows?.[0] || null;
      }
    } else if (UUID_REGEX.test(siteOwnerUserId)) {
      const ownerStoresResp = await fetch(
        `${supabaseUrl}/rest/v1/stores?owner_id=eq.${encodeURIComponent(siteOwnerUserId)}&order=created_at.asc&limit=2&select=id,owner_id,name,phone,address,logo_url`,
        { method: 'GET', headers: adminHeaders }
      );
      if (ownerStoresResp.ok) {
        const rawStores = (await ownerStoresResp.json()) as any[];
        if (Array.isArray(rawStores) && rawStores.length === 1) {
          storeRow = rawStores[0];
          storeId = String(storeRow.id || '').trim();
        }
      }
    }

    if (!UUID_REGEX.test(storeId)) {
      sendJson(res, 422, { ok: false, code: 'STORE_NOT_LINKED', error: 'Storefront inventory store not linked.' });
      return;
    }

    const cfg = siteRow.config && typeof siteRow.config === 'object' ? siteRow.config : {};
    const cfgTheme = cfg.themeSettings && typeof cfg.themeSettings === 'object' ? cfg.themeSettings : {};
    const cfgLoc = cfgTheme.location && typeof cfgTheme.location === 'object' ? cfgTheme.location : {};
    const customDomain = String(cfg.customDomain || '').trim().toLowerCase();
    const fallbackBranding = {
      businessName:
        String(cfg.businessName || siteRow.business_name || storeRow?.name || '').trim() ||
        `${subdomain.toUpperCase()} Store`,
      logoUrl: String(cfg.logoUrl || storeRow?.logo_url || '').trim() || undefined,
      brandColor: String(cfgTheme.primaryColor || cfg.brandColor || '#2563EB').trim() || '#2563EB',
      phone: String(cfg.phone || storeRow?.phone || '').trim() || undefined,
      email: String(cfg.email || '').trim() || undefined,
      address: String(cfgLoc.address || cfg.address || storeRow?.address || '').trim() || undefined,
      websiteUrl: customDomain ? `https://${customDomain}` : `https://${subdomain}.amaas.xyz`,
      subdomain,
    };

    // =========================================================================
    // ACTION: orders (list authenticated customer's orders strictly in this store)
    // =========================================================================
    if (req.method === 'GET' && action === 'orders') {
      const jsonbAuthFilter = encodeURIComponent(verifiedUserId);
      const ordersResp = await fetch(
        `${supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&items->0->orderMeta->>customerAuthUserId=eq.${jsonbAuthFilter}&order=created_at.desc&limit=200&select=*`,
        { method: 'GET', headers: adminHeaders }
      );
      if (!ordersResp.ok) {
        sendJson(res, 502, { ok: false, code: 'ORDERS_FETCH_FAILED', error: 'Unable to load customer orders.' });
        return;
      }
      const allStoreOrders = (await ordersResp.json()) as any[];
      const customerOrders = (Array.isArray(allStoreOrders) ? allStoreOrders : [])
        .filter((row) => {
          const items = Array.isArray(row?.items) ? row.items : [];
          const metaUid = String(items[0]?.orderMeta?.customerAuthUserId || '').trim();
          return metaUid === verifiedUserId;
        })
        .map((row) => mapDbOrderToCustomerDto(row, fallbackBranding));

      sendJson(res, 200, { ok: true, orders: customerOrders });
      return;
    }

    // =========================================================================
    // ACTION: order (single order tracking & invoice detail with strict IDOR check)
    // =========================================================================
    if (req.method === 'GET' && action === 'order') {
      const orderIdParam = String(parsedUrl.searchParams.get('orderId') || '').trim();
      if (!orderIdParam) {
        sendJson(res, 400, { ok: false, code: 'MISSING_ORDER_ID', error: 'Order reference is required.' });
        return;
      }
      const filterCol = UUID_REGEX.test(orderIdParam) ? 'id' : 'order_number';
      const orderResp = await fetch(
        `${supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&${filterCol}=eq.${encodeURIComponent(orderIdParam)}&limit=1&select=*`,
        { method: 'GET', headers: adminHeaders }
      );
      if (!orderResp.ok) {
        sendJson(res, 502, { ok: false, code: 'ORDER_FETCH_FAILED', error: 'Unable to load order details.' });
        return;
      }
      const rows = (await orderResp.json()) as any[];
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) {
        sendJson(res, 404, { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order not found in this store.' });
        return;
      }
      const items = Array.isArray(row.items) ? row.items : [];
      const ownerAuthUid = String(items[0]?.orderMeta?.customerAuthUserId || '').trim();
      if (!ownerAuthUid || ownerAuthUid !== verifiedUserId) {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_ORDER_ACCESS',
          error: 'You are not authorized to view this order.',
        });
        return;
      }

      sendJson(res, 200, { ok: true, order: mapDbOrderToCustomerDto(row, fallbackBranding) });
      return;
    }

    // Fetch authoritative auth user metadata via service_role admin endpoint
    const adminUserResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(verifiedUserId)}`, {
      method: 'GET',
      headers: adminHeaders,
    });
    if (!adminUserResp.ok) {
      sendJson(res, 502, { ok: false, code: 'USER_METADATA_UNAVAILABLE', error: 'Unable to load account details.' });
      return;
    }
    const adminUserJson = (await adminUserResp.json()) as {
      id: string;
      email?: string;
      user_metadata?: Record<string, any>;
    };
    const existingUserMeta =
      adminUserJson?.user_metadata && typeof adminUserJson.user_metadata === 'object'
        ? adminUserJson.user_metadata
        : {};

    // =========================================================================
    // ACTION: profile (GET & PATCH authenticated customer profile + saved addresses)
    // =========================================================================
    if (action === 'profile') {
      const portalProfile =
        existingUserMeta.customer_portal_profile &&
        typeof existingUserMeta.customer_portal_profile === 'object'
          ? existingUserMeta.customer_portal_profile
          : {};

      if (req.method === 'GET') {
        const resolvedEmail = String(adminUserJson.email || verifiedAuthUser.email || '').trim().toLowerCase();
        const resolvedFullName =
          String(portalProfile.fullName || existingUserMeta.full_name || existingUserMeta.name || '').trim() ||
          String(resolvedEmail || '').split('@')[0] ||
          'Customer';
        const savedAddresses = Array.isArray(portalProfile.savedAddresses)
          ? portalProfile.savedAddresses
          : [];
        const defaultSavedAddress =
          savedAddresses.find((a: any) => a && a.isDefault) || savedAddresses[0] || null;
        const resolvedPhone = String(
          portalProfile.phone || defaultSavedAddress?.phone || ''
        ).trim();

        await syncAuthenticatedCustomerToStoreDirectory({
          supabaseUrl,
          adminHeaders,
          storeId,
          subdomain,
          verifiedEmail: resolvedEmail,
          fullName: resolvedFullName,
          phone: resolvedPhone,
          shippingAddress: defaultSavedAddress?.shippingAddress || '',
          city: defaultSavedAddress?.city || '',
          preferProfileOverwrite: false,
        });

        sendJson(res, 200, {
          ok: true,
          profile: {
            authUserId: verifiedUserId,
            fullName: resolvedFullName,
            email: String(adminUserJson.email || verifiedAuthUser.email || '').trim(),
            avatarUrl:
              String(existingUserMeta.avatar_url || existingUserMeta.picture || '').trim() || undefined,
            phone: String(portalProfile.phone || '').trim(),
            savedAddresses,
          },
        });
        return;
      }

      if (req.method === 'PATCH' && body) {
        const nextFullName =
          typeof body.fullName === 'string'
            ? body.fullName.trim().slice(0, 120)
            : String(portalProfile.fullName || existingUserMeta.full_name || existingUserMeta.name || '').trim();
        const nextPhone =
          typeof body.phone === 'string'
            ? body.phone.replace(/[\s()-]+/g, '').trim().slice(0, 30)
            : String(portalProfile.phone || '').trim();

        const rawAddresses = Array.isArray(body.savedAddresses)
          ? body.savedAddresses
          : Array.isArray(portalProfile.savedAddresses)
          ? portalProfile.savedAddresses
          : [];

        const cleanAddresses: Array<{
          id: string;
          label: string;
          recipientName: string;
          phone: string;
          shippingAddress: string;
          city: string;
          deliveryArea?: string;
          isDefault: boolean;
        }> = rawAddresses
          .filter((a: any) => a && typeof a === 'object' && String(a.shippingAddress || '').trim().length >= 3)
          .slice(0, 8)
          .map((a: any, idx: number) => ({
            id: String(a.id || `addr-${Date.now()}-${idx}`).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 64),
            label: String(a.label || 'Delivery Address').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40) || 'Address',
            recipientName: String(a.recipientName || nextFullName || 'Recipient').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 120),
            phone: String(a.phone || nextPhone || '').replace(/[\s()-]+/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 30),
            shippingAddress: String(a.shippingAddress || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 350),
            city: String(a.city || 'Dhaka').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80) || 'Dhaka',
            deliveryArea: String(a.deliveryArea || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 100) || undefined,
            isDefault: Boolean(a.isDefault),
          }));

        if (cleanAddresses.length > 0) {
          let chosenDefaultIdx = -1;
          for (let i = cleanAddresses.length - 1; i >= 0; i--) {
            if (cleanAddresses[i].isDefault) {
              chosenDefaultIdx = i;
              break;
            }
          }
          if (chosenDefaultIdx < 0) chosenDefaultIdx = 0;
          cleanAddresses.forEach((addr, idx) => {
            addr.isDefault = idx === chosenDefaultIdx;
          });
        }

        const updatedMeta = {
          ...existingUserMeta,
          ...(nextFullName ? { full_name: nextFullName } : {}),
          customer_portal_profile: {
            fullName: nextFullName,
            phone: nextPhone,
            savedAddresses: cleanAddresses,
            updatedAt: new Date().toISOString(),
          },
        };

        const updateAuthResp = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(verifiedUserId)}`,
          {
            method: 'PUT',
            headers: adminHeaders,
            body: JSON.stringify({ user_metadata: updatedMeta }),
          }
        );
        if (!updateAuthResp.ok) {
          sendJson(res, 502, { ok: false, code: 'PROFILE_UPDATE_FAILED', error: 'Failed to save customer profile.' });
          return;
        }

        // Safely update full_name in profiles without EVER touching role
        if (nextFullName) {
          await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(verifiedUserId)}`,
            {
              method: 'PATCH',
              headers: adminHeaders,
              body: JSON.stringify({ full_name: nextFullName }),
            }
          ).catch(() => {});
        }

        const verifiedEmail = String(adminUserJson.email || verifiedAuthUser.email || '')
          .trim()
          .toLowerCase();
        const defaultSavedAddress =
          cleanAddresses.find((a) => a.isDefault) || cleanAddresses[0] || null;
        await syncAuthenticatedCustomerToStoreDirectory({
          supabaseUrl,
          adminHeaders,
          storeId,
          subdomain,
          verifiedEmail,
          fullName: nextFullName || 'Customer',
          phone: nextPhone || defaultSavedAddress?.phone || '',
          shippingAddress: defaultSavedAddress?.shippingAddress || '',
          city: defaultSavedAddress?.city || '',
          preferProfileOverwrite: true,
        });

        sendJson(res, 200, {
          ok: true,
          profile: {
            authUserId: verifiedUserId,
            fullName: nextFullName || 'Customer',
            email: String(adminUserJson.email || verifiedAuthUser.email || '').trim(),
            avatarUrl:
              String(existingUserMeta.avatar_url || existingUserMeta.picture || '').trim() || undefined,
            phone: nextPhone,
            savedAddresses: cleanAddresses,
          },
        });
        return;
      }
    }

    // =========================================================================
    // ACTION: cart (GET & PUT authenticated customer cart scoped to storeId)
    // =========================================================================
    if (action === 'cart') {
      const configCatalog = Array.isArray(cfg.servicesOrProducts) ? cfg.servicesOrProducts : [];
      const catalogMeta =
        cfg.productCatalogMeta && typeof cfg.productCatalogMeta === 'object'
          ? (cfg.productCatalogMeta as Record<string, any>)
          : {};

      const prodResp = await fetch(
        `${supabaseUrl}/rest/v1/products?store_id=eq.${encodeURIComponent(storeId)}&status=eq.active&select=id,name,sku,category,price,stock,status,image_url,is_visible`,
        { method: 'GET', headers: adminHeaders }
      );
      const dbProducts = prodResp.ok ? ((await prodResp.json()) as any[]) : [];
      const dbProdById = new Map<string, any>();
      for (const p of Array.isArray(dbProducts) ? dbProducts : []) {
        if (p?.id) dbProdById.set(String(p.id), p);
      }

      const publishedById = new Map<string, any>();
      for (const pub of configCatalog) {
        if (!pub || pub.isVisible === false) continue;
        const pid = String(pub.productId || pub.id || '').trim();
        if (!UUID_REGEX.test(pid)) continue;
        if (catalogMeta[pid]?.isVisible === false) continue;
        const dbProd = dbProdById.get(pid);
        if (!dbProd || dbProd.is_visible === false) continue;
        const stock = Math.max(0, Math.trunc(Number(dbProd.stock) || 0));
        if (stock <= 0) continue;

        const basePrice = Math.max(0, Number(dbProd.price) || 0);
        const metaDisc =
          typeof catalogMeta[pid]?.discountPrice === 'number'
            ? catalogMeta[pid].discountPrice
            : typeof pub.discountPrice === 'number'
            ? pub.discountPrice
            : undefined;
        const effectivePrice =
          metaDisc !== undefined && metaDisc > 0 && metaDisc < basePrice ? metaDisc : basePrice;

        publishedById.set(pid, {
          productId: pid,
          name: String(dbProd.name || pub.name || 'Product'),
          sku: String(dbProd.sku || pub.sku || ''),
          unitPrice: effectivePrice,
          originalPrice: effectivePrice < basePrice ? basePrice : undefined,
          maxStock: stock,
          imageUrl: String(pub.imageUrl || catalogMeta[pid]?.imageUrl || dbProd.image_url || '').trim() || undefined,
          category: String(dbProd.category || pub.category || '').trim() || undefined,
        });
      }

      const existingStoreCarts =
        existingUserMeta.customer_store_carts &&
        typeof existingUserMeta.customer_store_carts === 'object'
          ? { ...(existingUserMeta.customer_store_carts as Record<string, any>) }
          : {};

      const normalizeCartRecord = (
        rawEntry: any
      ): { items: Array<{ productId: string; quantity: number }>; version: number; updatedAt: string } => {
        if (Array.isArray(rawEntry)) {
          return { items: rawEntry, version: rawEntry.length > 0 ? 1 : 0, updatedAt: '' };
        }
        if (rawEntry && typeof rawEntry === 'object') {
          return {
            items: Array.isArray(rawEntry.items) ? rawEntry.items : [],
            version:
              typeof rawEntry.version === 'number' && Number.isFinite(rawEntry.version)
                ? Math.max(0, Math.trunc(rawEntry.version))
                : 0,
            updatedAt: typeof rawEntry.updatedAt === 'string' ? rawEntry.updatedAt : '',
          };
        }
        return { items: [], version: 0, updatedAt: '' };
      };

      const currentRecord = normalizeCartRecord(existingStoreCarts[storeId]);

      const hydrateValidatedList = (rawList: Array<{ productId: string; quantity: number }>) => {
        const dedupedQty = new Map<string, number>();
        for (const entry of rawList.slice(0, 100)) {
          const pid = String(entry?.productId || '').trim();
          const qty = Math.max(0, Math.trunc(Number(entry?.quantity) || 0));
          if (!UUID_REGEX.test(pid) || qty <= 0) continue;
          const liveInfo = publishedById.get(pid);
          if (!liveInfo) continue;
          const combined = (dedupedQty.get(pid) || 0) + qty;
          dedupedQty.set(pid, Math.min(combined, liveInfo.maxStock, 500));
        }

        const compact = Array.from(dedupedQty.entries())
          .slice(0, 25)
          .map(([productId, quantity]) => ({ productId, quantity }));

        const hydrated = compact
          .map((c) => {
            const info = publishedById.get(c.productId);
            if (!info) return null;
            return {
              ...info,
              quantity: c.quantity,
            };
          })
          .filter(Boolean);

        return { compact, hydrated };
      };

      if (req.method === 'PUT' && body && Array.isArray(body.items)) {
        const expectedVersion =
          typeof body.expectedVersion === 'number' && Number.isFinite(body.expectedVersion)
            ? Math.max(0, Math.trunc(body.expectedVersion))
            : undefined;

        if (expectedVersion !== undefined && currentRecord.version > expectedVersion) {
          const { hydrated: currentHydrated } = hydrateValidatedList(currentRecord.items);
          sendJson(res, 409, {
            ok: false,
            code: 'CART_CONFLICT',
            error: 'Your shopping bag was updated on another device.',
            serverCart: {
              items: currentHydrated,
              version: currentRecord.version,
              updatedAt: currentRecord.updatedAt || undefined,
            },
          });
          return;
        }

        const { compact: validatedCompact, hydrated: hydratedCart } = hydrateValidatedList(body.items);
        const nextVersion = currentRecord.version + 1;
        const nextUpdatedAt = new Date().toISOString();

        if (validatedCompact.length === 0) {
          delete existingStoreCarts[storeId];
        } else {
          existingStoreCarts[storeId] = {
            items: validatedCompact,
            version: nextVersion,
            updatedAt: nextUpdatedAt,
          };
          // Bound metadata size to at most 5 recently active stores (evict oldest updatedAt)
          const storeKeys = Object.keys(existingStoreCarts);
          if (storeKeys.length > 5) {
            const sortedOtherKeys = storeKeys
              .filter((k) => k !== storeId)
              .sort((a, b) => {
                const ta = Date.parse(normalizeCartRecord(existingStoreCarts[a]).updatedAt || '') || 0;
                const tb = Date.parse(normalizeCartRecord(existingStoreCarts[b]).updatedAt || '') || 0;
                return ta - tb;
              });
            while (Object.keys(existingStoreCarts).length > 5 && sortedOtherKeys.length > 0) {
              const evictKey = sortedOtherKeys.shift()!;
              delete existingStoreCarts[evictKey];
            }
          }
        }

        const saveCartResp = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(verifiedUserId)}`,
          {
            method: 'PUT',
            headers: adminHeaders,
            body: JSON.stringify({
              user_metadata: {
                ...existingUserMeta,
                customer_store_carts: existingStoreCarts,
              },
            }),
          }
        );
        if (!saveCartResp.ok) {
          sendJson(res, 502, { ok: false, code: 'CART_SYNC_FAILED', error: 'Unable to sync shopping bag.' });
          return;
        }

        if (validatedCompact.length > 0) {
          const portalProfile =
            existingUserMeta.customer_portal_profile &&
            typeof existingUserMeta.customer_portal_profile === 'object'
              ? existingUserMeta.customer_portal_profile
              : {};
          const verifiedEmail = String(adminUserJson.email || verifiedAuthUser.email || '')
            .trim()
            .toLowerCase();
          const savedAddresses = Array.isArray(portalProfile.savedAddresses)
            ? portalProfile.savedAddresses
            : [];
          const defaultSavedAddress =
            savedAddresses.find((a: any) => a && a.isDefault) || savedAddresses[0] || null;
          await syncAuthenticatedCustomerToStoreDirectory({
            supabaseUrl,
            adminHeaders,
            storeId,
            subdomain,
            verifiedEmail,
            fullName:
              String(portalProfile.fullName || existingUserMeta.full_name || existingUserMeta.name || '').trim() ||
              String(verifiedEmail || '').split('@')[0] ||
              'Customer',
            phone: String(portalProfile.phone || defaultSavedAddress?.phone || '').trim(),
            shippingAddress: defaultSavedAddress?.shippingAddress || '',
            city: defaultSavedAddress?.city || '',
            preferProfileOverwrite: false,
          });
        }

        sendJson(res, 200, {
          ok: true,
          storeId,
          items: hydratedCart,
          version: validatedCompact.length === 0 ? 0 : nextVersion,
          updatedAt: nextUpdatedAt,
        });
        return;
      }

      const { hydrated: hydratedCart } = hydrateValidatedList(currentRecord.items);
      sendJson(res, 200, {
        ok: true,
        storeId,
        items: hydratedCart,
        version: currentRecord.version,
        updatedAt: currentRecord.updatedAt || undefined,
      });
      return;
    }

    sendJson(res, 400, { ok: false, code: 'UNSUPPORTED_ACTION', error: 'Unsupported customer portal action.' });
  } catch {
    sendJson(res, 500, { ok: false, code: 'INTERNAL_PORTAL_ERROR', error: 'Unexpected customer portal server error.' });
  }
}
