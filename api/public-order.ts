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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid order request body.' });
      return;
    }

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

    const storeId = String(site.storeId || site.store_id || '').trim();
    const websiteId = String(site.id || '').trim();
    if (!UUID_REGEX.test(storeId) || !UUID_REGEX.test(websiteId)) {
      sendJson(res, 422, {
        ok: false,
        code: 'STORE_NOT_LINKED',
        error: 'This website is not linked to an active merchant inventory store yet.',
      });
      return;
    }

    if (body.websiteId && String(body.websiteId).trim() !== websiteId) {
      sendJson(res, 403, {
        ok: false,
        code: 'TENANT_MISMATCH',
        error: 'Storefront identity mismatch.',
      });
      return;
    }

    // Step 2: Require server-only SUPABASE_SERVICE_ROLE_KEY for RLS-protected order & stock persistence
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
            subtotal: Number(row.subtotal) || 0,
            deliveryFee: Number(row.delivery_charge) || 0,
            total: Number(row.total) || 0,
            status: row.status || 'pending',
            paymentStatus: row.payment_status || 'pending',
            paymentMethod: row.payment_method || paymentMethod,
            items: Array.isArray(row.items) ? row.items : [],
            createdAt: row.created_at,
          },
        });
        return;
      }
    }

    // Step 4: Verify every requested product is published on THIS website and belongs to THIS store
    const publishedCatalog: any[] = Array.isArray(site.servicesOrProducts)
      ? site.servicesOrProducts.filter((it: any) => it && it.isVisible !== false)
      : [];
    const publishedByProductId = new Map<string, any>();
    for (const pubItem of publishedCatalog) {
      const pid = String(pubItem.productId || pubItem.id || '').trim();
      if (UUID_REGEX.test(pid)) {
        publishedByProductId.set(pid, pubItem);
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
            },
          }
        : {}),
    }));

    const orderInsertResp = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeId,
        order_number: orderNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
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
      const custLookupResp = await fetch(
        `${supabaseUrl}/rest/v1/customers?store_id=eq.${encodeURIComponent(storeId)}&phone=eq.${encodeURIComponent(customerPhone)}&select=*`,
        { method: 'GET', headers: adminHeaders }
      );
      const existingCustomers = custLookupResp.ok ? ((await custLookupResp.json()) as any[]) : [];
      if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
        const existingCust = existingCustomers[0];
        await fetch(
          `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(existingCust.id)}&store_id=eq.${encodeURIComponent(storeId)}`,
          {
            method: 'PATCH',
            headers: adminHeaders,
            body: JSON.stringify({
              name: customerName,
              ...(customerEmail ? { email: customerEmail } : {}),
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
            email: customerEmail || null,
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
        total: grandTotal,
        status: savedOrder.status || 'pending',
        paymentStatus: savedOrder.payment_status || 'pending',
        paymentMethod: savedOrder.payment_method || paymentMethod,
        source: savedOrder.source || `Website (${subdomain}.amaas.xyz)`,
        websiteId,
        websiteSubdomain: subdomain,
        items: orderItemsSnapshot,
        createdAt: savedOrder.created_at || new Date().toISOString(),
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
