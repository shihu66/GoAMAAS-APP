import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import customerPortalHandler from '../api/customer-portal';
import publicOrderHandler from '../api/public-order';
import {
  buildGoogleOAuthQueryParams,
  getMainAppOrigin,
  isEmbeddedInAppWebViewUserAgent,
} from '../src/lib/supabase';

async function invokeHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }
): Promise<{ status: number; json: any }> {
  const req = new EventEmitter() as IncomingMessage & { body?: unknown; url?: string };
  req.method = opts.method;
  req.url = opts.url;
  req.headers = opts.headers || {};
  req.body = opts.body;

  let statusCode = 200;
  let rawOut = '';
  const res = {
    setHeader: () => res,
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) rawOut += chunk.toString();
    },
  } as unknown as ServerResponse;

  await handler(req, res);
  return { status: statusCode, json: rawOut ? JSON.parse(rawOut) : {} };
}

function testOAuthHelpersAndWebViewDetection(): void {
  // 1. Clean Google OAuth queryParams per flow
  assert.deepEqual(buildGoogleOAuthQueryParams({ isCustomerFlow: true }), {
    prompt: 'select_account',
  });
  assert.deepEqual(buildGoogleOAuthQueryParams({ isAdminFlow: true }), {
    prompt: 'select_account',
  });
  assert.deepEqual(buildGoogleOAuthQueryParams({}), {
    access_type: 'offline',
    prompt: 'select_account',
  });

  // 2. Embedded in-app WebView UA detection (403 disallowed_useragent prevention)
  assert.equal(
    isEmbeddedInAppWebViewUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/438.0]'
    ),
    true
  );
  assert.equal(
    isEmbeddedInAppWebViewUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36 Instagram 330.0'
    ),
    true
  );
  assert.equal(
    isEmbeddedInAppWebViewUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    ),
    false
  );
  assert.equal(
    isEmbeddedInAppWebViewUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
    ),
    false
  );

  // 3. SSR default main app origin points to app.amaas.xyz
  assert.equal(getMainAppOrigin(), 'https://app.amaas.xyz');

  console.log('PASS [1/3]: Storefront Google OAuth queryParams, WebView guard & main origin checks');
}

async function testCustomerDirectorySyncAndOrderMergeAcrossMerchants(): Promise<void> {
  const storeAId = '11111111-1111-4111-8111-111111111111';
  const storeBId = '22222222-2222-4222-8222-222222222222';
  const siteAId = '99999999-9999-4999-8999-999999999991';
  const siteBId = '99999999-9999-4999-8999-999999999992';
  const prodA1 = '33333333-3333-4333-8333-333333333331';
  const prodB1 = '44444444-4444-4444-8444-444444444441';
  const custAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const custBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const prevEnv = {
    url: process.env.VITE_SUPABASE_URL,
    anon: process.env.VITE_SUPABASE_ANON_KEY,
    srk: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const origFetch = globalThis.fetch;

  process.env.VITE_SUPABASE_URL = 'https://mockproj.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-placeholder';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mock_service_role_key';

  const userMetadataById: Record<string, Record<string, any>> = {
    [custAId]: { full_name: 'Nadia Rahman' },
    [custBId]: { full_name: 'Tariq Hasan' },
  };
  const emailByUserId: Record<string, string> = {
    [custAId]: 'nadia@gmail.com',
    [custBId]: 'tariq@gmail.com',
  };

  let prodAStock = 10;
  let custIdCounter = 1;
  let orderIdCounter = 1;
  const mockCustomers: Array<Record<string, any>> = [];
  const mockOrders: Array<Record<string, any>> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === 'string' ? input : input.toString());
    const authHdr = String((init?.headers as any)?.Authorization || '');
    const method = (init?.method || 'GET').toUpperCase();

    if (u.pathname === '/auth/v1/user') {
      if (authHdr === 'Bearer valid-jwt-token-customer-a-long') {
        return new Response(
          JSON.stringify({ id: custAId, email: emailByUserId[custAId], user_metadata: userMetadataById[custAId] }),
          { status: 200 }
        );
      }
      if (authHdr === 'Bearer valid-jwt-token-customer-b-long') {
        return new Response(
          JSON.stringify({ id: custBId, email: emailByUserId[custBId], user_metadata: userMetadataById[custBId] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: 'invalid jwt' }), { status: 401 });
    }

    if (u.pathname.startsWith('/auth/v1/admin/users/')) {
      const uid = decodeURIComponent(u.pathname.split('/').pop() || '');
      if (method === 'PUT' && init?.body) {
        const parsed = JSON.parse(String(init.body));
        userMetadataById[uid] = parsed.user_metadata;
      }
      return new Response(
        JSON.stringify({ id: uid, email: emailByUserId[uid] || '', user_metadata: userMetadataById[uid] || {} }),
        { status: 200 }
      );
    }

    if (u.pathname === '/rest/v1/rpc/get_published_website_by_subdomain') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const sub = String(body.p_subdomain || '').toLowerCase();
      const isB = sub === 'urbanfashion';
      return new Response(
        JSON.stringify({
          found: true,
          site: {
            id: isB ? siteBId : siteAId,
            storeId: isB ? storeBId : storeAId,
            subdomain: isB ? 'urbanfashion' : 'dhakakicks',
            businessName: isB ? 'Urban Fashion' : 'Dhaka Kicks',
            subscriptionStatus: 'active',
            paymentStatus: 'paid',
            deploymentStatus: 'live',
            currentPeriodEnd: '2099-01-01T00:00:00.000Z',
          },
        }),
        { status: 200 }
      );
    }

    if (u.pathname === '/rest/v1/subscribed_websites') {
      if (method === 'PATCH') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      const subFilter = u.searchParams.get('subdomain') || u.searchParams.get('id') || '';
      const isB = subFilter.includes('urbanfashion') || subFilter.includes(siteBId);
      const sitePayload = isB
        ? {
            id: siteBId,
            store_id: storeBId,
            subdomain: 'urbanfashion',
            business_name: 'Urban Fashion',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: '2099-01-01T00:00:00.000Z',
            config: {
              businessName: 'Urban Fashion',
              servicesOrProducts: [{ id: prodB1, productId: prodB1, name: 'Urban Jacket', isVisible: true, stock: 5 }],
            },
          }
        : {
            id: siteAId,
            store_id: storeAId,
            subdomain: 'dhakakicks',
            business_name: 'Dhaka Kicks',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: '2099-01-01T00:00:00.000Z',
            config: {
              businessName: 'Dhaka Kicks',
              servicesOrProducts: [{ id: prodA1, productId: prodA1, name: 'Dhaka Sneaker', isVisible: true, stock: prodAStock }],
            },
          };
      return new Response(JSON.stringify([sitePayload]), { status: 200 });
    }

    if (u.pathname === '/rest/v1/stores') {
      const sid = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      return new Response(
        JSON.stringify([{ id: sid, name: sid === storeBId ? 'Urban Fashion' : 'Dhaka Kicks' }]),
        { status: 200 }
      );
    }

    if (u.pathname === '/rest/v1/products') {
      if (method === 'PATCH' && init?.body) {
        const patch = JSON.parse(String(init.body));
        if (typeof patch.stock === 'number') {
          prodAStock = patch.stock;
        }
        return new Response(JSON.stringify([{ id: prodA1, stock: prodAStock }]), { status: 200 });
      }
      const sid = (u.searchParams.get('store_id') || '').replace(/^eq\./, '');
      const prods =
        sid === storeBId
          ? [{ id: prodB1, store_id: storeBId, name: 'Urban Jacket', sku: 'URB-1', price: 2500, stock: 5, sales_count: 0, status: 'active', is_visible: true }]
          : [{ id: prodA1, store_id: storeAId, name: 'Dhaka Sneaker', sku: 'DHK-1', price: 1000, stock: prodAStock, sales_count: 0, status: 'active', is_visible: true }];
      return new Response(JSON.stringify(prods), { status: 200 });
    }

    if (u.pathname === '/rest/v1/customers') {
      const storeFilter = (u.searchParams.get('store_id') || '').replace(/^eq\./, '');
      if (method === 'GET') {
        const idFilter = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        const emailIlike = (u.searchParams.get('email') || '').replace(/^ilike\./, '').toLowerCase();
        const orClause = u.searchParams.get('or') || '';
        const matches = mockCustomers.filter((c) => {
          if (storeFilter && c.store_id !== storeFilter) return false;
          if (idFilter && c.id !== idFilter) return false;
          if (emailIlike && String(c.email || '').toLowerCase() !== emailIlike) return false;
          if (orClause) {
            const phones = Array.from(orClause.matchAll(/phone\.eq\.([^,)]+)/g)).map((m) =>
              decodeURIComponent(m[1])
            );
            if (phones.length > 0 && !phones.includes(c.phone)) return false;
          }
          return true;
        });
        return new Response(JSON.stringify(matches), { status: 200 });
      }
      if (method === 'POST' && init?.body) {
        const body = JSON.parse(String(init.body));
        const row = { id: `cust-row-${custIdCounter++}`, ...body };
        mockCustomers.push(row);
        return new Response(JSON.stringify([row]), { status: 201 });
      }
      if (method === 'PATCH' && init?.body) {
        const idFilter = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        const patch = JSON.parse(String(init.body));
        const idx = mockCustomers.findIndex(
          (c) => c.id === idFilter && (!storeFilter || c.store_id === storeFilter)
        );
        if (idx >= 0) {
          mockCustomers[idx] = { ...mockCustomers[idx], ...patch };
          return new Response(JSON.stringify([mockCustomers[idx]]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
    }

    if (u.pathname === '/rest/v1/orders') {
      if (method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (method === 'POST' && init?.body) {
        const body = JSON.parse(String(init.body));
        const row = {
          id: `77777777-7777-4777-8777-77777777770${orderIdCounter++}`,
          ...body,
          created_at: new Date().toISOString(),
        };
        mockOrders.push(row);
        return new Response(JSON.stringify([row]), { status: 201 });
      }
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    const hdrA = { authorization: 'Bearer valid-jwt-token-customer-a-long' };
    const hdrB = { authorization: 'Bearer valid-jwt-token-customer-b-long' };

    // Step 1: Nadia signs in with Google and loads dhakakicks storefront -> customer registered in Dhaka Kicks store
    const profA1 = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=profile&subdomain=dhakakicks',
      headers: hdrA,
    });
    assert.equal(profA1.status, 200);
    assert.equal(mockCustomers.filter((c) => c.store_id === storeAId).length, 1);
    assert.equal(mockCustomers[0].email, 'nadia@gmail.com');
    assert.equal(mockCustomers[0].name, 'Nadia Rahman');
    assert.equal(mockCustomers[0].phone, 'Not provided');

    // Step 2: Re-fetching profile does NOT create duplicate row
    await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=profile&subdomain=dhakakicks',
      headers: hdrA,
    });
    assert.equal(mockCustomers.filter((c) => c.store_id === storeAId).length, 1);

    // Step 3: Nadia updates phone & address via PATCH profile -> updates same row cleanly
    const patchProf = await invokeHandler(customerPortalHandler, {
      method: 'PATCH',
      url: '/api/customer-portal?action=profile&subdomain=dhakakicks',
      headers: hdrA,
      body: {
        subdomain: 'dhakakicks',
        fullName: 'Nadia Rahman',
        phone: '01711223344',
        savedAddresses: [
          {
            id: 'addr-1',
            label: 'Home',
            recipientName: 'Nadia Rahman',
            phone: '01711223344',
            shippingAddress: 'House 10, Banani',
            city: 'Dhaka',
            isDefault: true,
          },
        ],
      },
    });
    assert.equal(patchProf.status, 200);
    assert.equal(mockCustomers.filter((c) => c.store_id === storeAId).length, 1);
    assert.equal(mockCustomers[0].phone, '01711223344');
    assert.equal(mockCustomers[0].address, 'House 10, Banani');

    // Step 4: Nadia visits Urban Fashion -> creates separate customer row scoped to storeBId
    const profBStore = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=profile&subdomain=urbanfashion',
      headers: hdrA,
    });
    assert.equal(profBStore.status, 200);
    assert.equal(mockCustomers.filter((c) => c.store_id === storeAId).length, 1);
    assert.equal(mockCustomers.filter((c) => c.store_id === storeBId).length, 1);
    assert.equal(
      mockCustomers.find((c) => c.store_id === storeBId)?.email,
      'nadia@gmail.com'
    );

    console.log('PASS [2/3]: Customer Google sign-in syncs CRM per store with strict multi-merchant isolation');

    // Step 5: Tariq signs in on Dhaka Kicks (creates row with phone: 'Not provided'),
    // then places an order with real phone 01812345678 and blank email field -> merges cleanly without duplicates!
    await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=profile&subdomain=dhakakicks',
      headers: hdrB,
    });
    assert.equal(mockCustomers.filter((c) => c.store_id === storeAId).length, 2);

    const tariqOrder = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      headers: hdrB,
      body: {
        subdomain: 'dhakakicks',
        checkoutAttemptId: 'attempt-tariq-0001',
        customerName: 'Tariq Hasan',
        customerPhone: '01812345678',
        customerEmail: '',
        shippingAddress: 'Road 4, Uttara',
        city: 'Dhaka',
        deliveryMethod: 'inside_dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: prodA1, quantity: 1 }],
      },
    });
    assert.equal(tariqOrder.status, 201);
    assert.equal(tariqOrder.json.order.customerAuthUserId, custBId);
    assert.equal(tariqOrder.json.order.customerEmail, 'tariq@gmail.com');

    const tariqStoreARows = mockCustomers.filter(
      (c) => c.store_id === storeAId && c.email === 'tariq@gmail.com'
    );
    assert.equal(tariqStoreARows.length, 1, 'Order must merge into existing verified-email row without duplicating');
    assert.equal(tariqStoreARows[0].phone, '01812345678');
    assert.equal(tariqStoreARows[0].orders_count, 1);
    assert.equal(tariqStoreARows[0].total_spent, 1060);

    // Step 6: Unauthenticated guest trying to pass tariq@gmail.com MUST NOT hijack Tariq's CRM row
    const guestSpoofOrder = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      headers: {},
      body: {
        subdomain: 'dhakakicks',
        checkoutAttemptId: 'attempt-guest-0002',
        customerName: 'Guest Buyer',
        customerPhone: '01911223344',
        customerEmail: 'tariq@gmail.com',
        shippingAddress: 'Mirpur 12',
        city: 'Dhaka',
        deliveryMethod: 'inside_dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: prodA1, quantity: 1 }],
      },
    });
    assert.equal(guestSpoofOrder.status, 201);
    assert.equal(guestSpoofOrder.json.order.customerAuthUserId, undefined);
    // Tariq's verified row stays untouched
    assert.equal(tariqStoreARows[0].orders_count, 1);
    assert.equal(tariqStoreARows[0].phone, '01812345678');
    // Guest got a separate CRM row by its own phone
    assert.equal(
      mockCustomers.filter((c) => c.store_id === storeAId && c.phone === '01911223344').length,
      1
    );

    console.log('PASS [3/3]: Order checkout merges verified Google CRM row, preserves guest checkout & blocks email spoofing');
  } finally {
    globalThis.fetch = origFetch;
    process.env.VITE_SUPABASE_URL = prevEnv.url;
    process.env.VITE_SUPABASE_ANON_KEY = prevEnv.anon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.srk;
  }
}

async function main() {
  testOAuthHelpersAndWebViewDetection();
  await testCustomerDirectorySyncAndOrderMergeAcrossMerchants();
  console.log('\nALL STOREFRONT GOOGLE AUTH & CUSTOMER CRM SYNC TESTS PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
