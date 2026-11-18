import {
  CustomerCartLineItem,
  CustomerPortalProfile,
  CustomerSavedAddress,
  MerchantBrandingSnapshot,
  Order,
  OrderStatus,
  OrderStatusHistoryEntry,
  Store,
  SubscribedWebsite,
  WebsiteProductItem,
} from '../types';

const GUEST_CART_STORAGE_PREFIX = 'goamaas_storefront_guest_cart_v1:';
const CUSTOMER_CART_STORAGE_PREFIX = 'goamaas_storefront_customer_cart_v1:';
const STOREFRONT_LANG_STORAGE_KEY = 'goamaas_storefront_lang_v1';

export type StorefrontLang = 'en' | 'bn';

export function getSavedStorefrontLang(): StorefrontLang {
  if (typeof window === 'undefined') return 'en';
  try {
    const val = window.localStorage.getItem(STOREFRONT_LANG_STORAGE_KEY);
    return val === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

export function saveStorefrontLang(lang: StorefrontLang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STOREFRONT_LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage error
  }
}

export function resolveStoreScopeKey(site: Partial<SubscribedWebsite>): string {
  const sid = String(site.storeId || '').trim();
  if (sid) return sid;
  const wid = String(site.id || '').trim();
  if (wid) return wid;
  return String(site.subdomain || 'store').trim().toLowerCase() || 'store';
}

export function getGuestCartStorageKey(storeScopeKey: string): string {
  return `${GUEST_CART_STORAGE_PREFIX}${storeScopeKey}`;
}

export function getCustomerCartStorageKey(storeScopeKey: string, customerId: string): string {
  return `${CUSTOMER_CART_STORAGE_PREFIX}${storeScopeKey}:${customerId}`;
}

export function loadScopedCartFromStorage(storageKey: string): CustomerCartLineItem[] {
  if (typeof window === 'undefined' || !storageKey) return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomerCartLineItem =>
        Boolean(item) &&
        typeof item.productId === 'string' &&
        item.productId.trim().length > 0 &&
        typeof item.quantity === 'number' &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    );
  } catch {
    return [];
  }
}

export function saveScopedCartToStorage(
  storageKey: string,
  items: CustomerCartLineItem[]
): void {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    if (!items || items.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // Ignore quota errors
  }
}

export function clearScopedCartFromStorage(storageKey: string): void {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage errors
  }
}

function parseCatalogNumericPrice(item: WebsiteProductItem): number {
  if (
    typeof item.discountPrice === 'number' &&
    Number.isFinite(item.discountPrice) &&
    item.discountPrice >= 0
  ) {
    return item.discountPrice;
  }
  if (
    typeof item.priceNumeric === 'number' &&
    Number.isFinite(item.priceNumeric) &&
    item.priceNumeric >= 0
  ) {
    return item.priceNumeric;
  }
  const cleaned = Number(String(item.price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(cleaned) && cleaned >= 0 ? cleaned : 0;
}

function parseCatalogOriginalPrice(
  item: WebsiteProductItem,
  effectivePrice: number
): number | undefined {
  if (
    typeof item.originalPrice === 'number' &&
    Number.isFinite(item.originalPrice) &&
    item.originalPrice > effectivePrice
  ) {
    return item.originalPrice;
  }
  if (
    typeof item.discountPrice === 'number' &&
    typeof item.priceNumeric === 'number' &&
    item.priceNumeric > item.discountPrice
  ) {
    return item.priceNumeric;
  }
  return undefined;
}

/**
 * Revalidates cart items against the merchant's live published catalog (removes deleted/out-of-stock items,
 * refreshes authoritative unit/original prices, and caps quantities to available stock).
 */
export function revalidateCartAgainstCatalog(
  items: CustomerCartLineItem[],
  liveCatalog: WebsiteProductItem[]
): CustomerCartLineItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (!Array.isArray(liveCatalog) || liveCatalog.length === 0) return [];

  const catalogById = new Map<string, WebsiteProductItem>();
  for (const prod of liveCatalog) {
    if (!prod || prod.isVisible === false) continue;
    const pid = String(prod.productId || prod.id || '').trim();
    if (pid) catalogById.set(pid, prod);
  }

  const deduped = new Map<string, CustomerCartLineItem>();
  for (const line of items) {
    const pid = String(line?.productId || '').trim();
    if (!pid) continue;
    const live = catalogById.get(pid);
    if (!live) continue;

    const avail =
      typeof live.stock === 'number' && Number.isFinite(live.stock)
        ? Math.max(0, Math.trunc(live.stock))
        : undefined;
    if (live.inStock === false || (avail !== undefined && avail <= 0)) continue;

    const unitPrice = parseCatalogNumericPrice(live);
    const originalPrice = parseCatalogOriginalPrice(live, unitPrice);
    const existingQty = deduped.get(pid)?.quantity || 0;
    const requestedQty = Math.max(1, Math.trunc(Number(line.quantity) || 1));
    const combinedQty = existingQty + requestedQty;
    const cappedQty = avail !== undefined ? Math.min(combinedQty, avail) : combinedQty;
    if (cappedQty <= 0) continue;

    deduped.set(pid, {
      productId: pid,
      name: live.name,
      sku: live.sku,
      unitPrice,
      originalPrice,
      quantity: cappedQty,
      maxStock: avail,
      imageUrl: live.imageUrl || line.imageUrl,
      category: live.category || line.category,
    });
  }

  return Array.from(deduped.values());
}

/**
 * Merges guest cart lines into an authenticated customer's persisted cart for the current store
 * without duplicating product lines or exceeding live stock.
 */
export function mergeGuestAndCustomerCart(
  guestItems: CustomerCartLineItem[],
  customerItems: CustomerCartLineItem[],
  liveCatalog: WebsiteProductItem[]
): CustomerCartLineItem[] {
  return revalidateCartAgainstCatalog([...customerItems, ...guestItems], liveCatalog);
}

/**
 * Builds merchant branding snapshot from a website configuration and optional store fallback.
 * Never defaults the shop name to GoAMAAS.
 */
export function buildMerchantBrandingFromSite(
  site?: Partial<SubscribedWebsite> | null,
  store?: Partial<Store> | null
): MerchantBrandingSnapshot {
  const rawName = (site?.businessName || store?.name || '').trim();
  const subdomain = (site?.subdomain || store?.slug || '').trim().toLowerCase() || undefined;
  const customDomain = (site?.customDomain || '').trim().toLowerCase();
  const websiteUrl = customDomain
    ? `https://${customDomain}`
    : subdomain
    ? `https://${subdomain}.amaas.xyz`
    : site?.fullDomainUrl
    ? site.fullDomainUrl.startsWith('http')
      ? site.fullDomainUrl
      : `https://${site.fullDomainUrl}`
    : undefined;

  return {
    businessName: rawName || 'Merchant Store',
    logoUrl: (site?.logoUrl || store?.logo || '').trim() || undefined,
    brandColor:
      (site?.themeSettings?.primaryColor || site?.brandColor || '#2563EB').trim() || '#2563EB',
    phone: (site?.phone || store?.phone || '').trim() || undefined,
    email: (site?.email || '').trim() || undefined,
    address:
      (site?.themeSettings?.location?.address || site?.address || store?.address || '').trim() ||
      undefined,
    websiteUrl,
    subdomain,
  };
}

/**
 * Resolves branding for an order invoice, strictly prioritizing the historical branding snapshot
 * recorded on the order so past invoices remain accurate even if merchant details later change.
 */
export function resolveOrderBranding(
  order: Order,
  websites: SubscribedWebsite[] = [],
  stores: Store[] = [],
  currentSite?: Partial<SubscribedWebsite> | null
): MerchantBrandingSnapshot {
  const metaSnapshot =
    order.merchantBrandingSnapshot || order.items?.[0]?.orderMeta?.merchantBrandingSnapshot;
  if (metaSnapshot && metaSnapshot.businessName && metaSnapshot.businessName.trim()) {
    return {
      ...metaSnapshot,
      businessName: metaSnapshot.businessName.trim(),
      brandColor: metaSnapshot.brandColor || '#2563EB',
    };
  }

  const orderMeta = order.items?.[0]?.orderMeta;
  const orderSub = (order.websiteSubdomain || orderMeta?.websiteSubdomain || orderMeta?.subdomain || '')
    .trim()
    .toLowerCase();
  const orderWebsiteId = (order.websiteId || orderMeta?.websiteId || '').trim();
  const orderStoreId = (order.storeId || '').trim();

  const matchedSite =
    (currentSite &&
      ((orderWebsiteId && currentSite.id === orderWebsiteId) ||
        (orderSub && currentSite.subdomain?.toLowerCase() === orderSub) ||
        (orderStoreId && currentSite.storeId === orderStoreId))
      ? currentSite
      : undefined) ||
    websites.find(
      (w) =>
        (orderWebsiteId && w.id === orderWebsiteId) ||
        (orderSub && w.subdomain.toLowerCase() === orderSub) ||
        (orderStoreId && w.storeId === orderStoreId)
    );

  const matchedStore =
    (orderStoreId && stores.find((s) => s.id === orderStoreId)) ||
    (matchedSite?.storeId && stores.find((s) => s.id === matchedSite.storeId)) ||
    (!orderStoreId && !orderWebsiteId && !orderSub ? stores[0] : undefined);

  if (matchedSite || matchedStore) {
    const built = buildMerchantBrandingFromSite(matchedSite, matchedStore);
    if (orderSub && !built.subdomain) built.subdomain = orderSub;
    if (orderSub && !built.websiteUrl) built.websiteUrl = `https://${orderSub}.amaas.xyz`;
    return built;
  }

  const sourceDomainMatch = order.source?.match(/\(([^)]+)\)/);
  const derivedSub = orderSub || (sourceDomainMatch ? sourceDomainMatch[1].split('.')[0] : '');

  return {
    businessName: derivedSub ? derivedSub.toUpperCase() : 'Merchant Store',
    brandColor: '#2563EB',
    subdomain: derivedSub || undefined,
    websiteUrl: derivedSub ? `https://${derivedSub}.amaas.xyz` : undefined,
  };
}

/**
 * Extracts persisted chronological status history from an order without fabricating fake timestamps.
 */
export function buildOrderStatusHistory(order: Order): OrderStatusHistoryEntry[] {
  const fromMeta = order.statusHistory || order.items?.[0]?.orderMeta?.statusHistory;
  const normalized: OrderStatusHistoryEntry[] = [];
  const seen = new Set<string>();

  if (Array.isArray(fromMeta)) {
    for (const entry of fromMeta) {
      if (!entry || !entry.status || !entry.at) continue;
      const key = `${entry.status}:${entry.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        status: entry.status,
        at: entry.at,
        note: entry.note,
      });
    }
  }

  const hasPending = normalized.some((e) => e.status === 'pending');
  if (!hasPending && order.createdAt) {
    normalized.unshift({ status: 'pending', at: order.createdAt });
  }

  return normalized.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function appendStatusHistoryEntry(
  existing: OrderStatusHistoryEntry[] | undefined,
  status: OrderStatus,
  createdAtFallback?: string
): OrderStatusHistoryEntry[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  if (list.length === 0 && createdAtFallback) {
    list.push({ status: 'pending', at: createdAtFallback });
  }
  const nowIso = new Date().toISOString();
  const last = list[list.length - 1];
  if (!last || last.status !== status) {
    list.push({ status, at: nowIso });
  }
  return list;
}

export function buildOrderTrackingUrl(subdomain: string, orderNumber: string): string {
  if (typeof window === 'undefined') {
    return `https://${subdomain}.amaas.xyz/?portal=track&order=${encodeURIComponent(orderNumber)}`;
  }
  const origin = window.location.origin;
  const host = window.location.hostname.toLowerCase();
  const isTenantHost =
    (host.endsWith('.amaas.xyz') && host !== 'amaas.xyz') ||
    (host.endsWith('.localhost') && host !== 'localhost');
  const basePath = isTenantHost ? '/' : `/s/${encodeURIComponent(subdomain)}`;
  return `${origin}${basePath}?portal=track&order=${encodeURIComponent(orderNumber)}`;
}

// ============================================================================
// Authenticated Customer Portal API Client (Server-Verified JWT Bearer Auth)
// ============================================================================

async function callCustomerPortalApi<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<{ data: T | null; error: Error | null; statusCode?: number }> {
  try {
    const resp = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        data: null,
        statusCode: resp.status,
        error: new Error('Customer portal service is currently unavailable.'),
      };
    }

    const body = (await resp.json()) as {
      ok?: boolean;
      success?: boolean;
      error?: string;
      message?: string;
    } & T;

    if (!resp.ok || (body.ok !== true && body.success !== true)) {
      return {
        data: null,
        statusCode: resp.status,
        error: new Error(body.message || body.error || 'Request failed.'),
      };
    }

    return { data: body, error: null, statusCode: resp.status };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Network error contacting customer portal.'),
    };
  }
}

export async function fetchCustomerOrdersFromPortal(
  subdomain: string,
  accessToken: string
): Promise<{ orders: Order[]; error: Error | null }> {
  const res = await callCustomerPortalApi<{ orders?: Order[] }>(
    `/api/customer-portal?action=orders&subdomain=${encodeURIComponent(subdomain)}`,
    accessToken,
    { method: 'GET' }
  );
  if (res.error || !res.data) {
    return { orders: [], error: res.error };
  }
  return {
    orders: Array.isArray(res.data.orders) ? res.data.orders : [],
    error: null,
  };
}

export async function fetchCustomerOrderDetailFromPortal(
  subdomain: string,
  orderIdOrNumber: string,
  accessToken: string
): Promise<{ order: Order | null; error: Error | null; statusCode?: number }> {
  const res = await callCustomerPortalApi<{ order?: Order }>(
    `/api/customer-portal?action=order&subdomain=${encodeURIComponent(subdomain)}&orderId=${encodeURIComponent(orderIdOrNumber)}`,
    accessToken,
    { method: 'GET' }
  );
  if (res.error || !res.data?.order) {
    return { order: null, error: res.error, statusCode: res.statusCode };
  }
  return { order: res.data.order, error: null, statusCode: res.statusCode };
}

export async function fetchCustomerProfileFromPortal(
  subdomain: string,
  accessToken: string
): Promise<{ profile: CustomerPortalProfile | null; error: Error | null }> {
  const res = await callCustomerPortalApi<{ profile?: CustomerPortalProfile }>(
    `/api/customer-portal?action=profile&subdomain=${encodeURIComponent(subdomain)}`,
    accessToken,
    { method: 'GET' }
  );
  if (res.error || !res.data?.profile) {
    return { profile: null, error: res.error };
  }
  return { profile: res.data.profile, error: null };
}

export async function updateCustomerProfileInPortal(
  subdomain: string,
  accessToken: string,
  updates: {
    fullName?: string;
    phone?: string;
    savedAddresses?: CustomerSavedAddress[];
  }
): Promise<{ profile: CustomerPortalProfile | null; error: Error | null }> {
  const res = await callCustomerPortalApi<{ profile?: CustomerPortalProfile }>(
    `/api/customer-portal?action=profile&subdomain=${encodeURIComponent(subdomain)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ subdomain, ...updates }),
    }
  );
  if (res.error || !res.data?.profile) {
    return { profile: null, error: res.error };
  }
  return { profile: res.data.profile, error: null };
}

export interface CustomerCartSyncResponse {
  items: CustomerCartLineItem[];
  version: number;
  updatedAt?: string;
  conflict?: boolean;
  error: Error | null;
}

/**
 * 3-way delta reconciliation when Device A and Device B concurrently edit the same customer's
 * store cart: preserves non-conflicting product edits across both devices and keeps newer
 * server updates when the exact same product collided.
 */
export function reconcileConflictingCart(params: {
  baseItems: CustomerCartLineItem[];
  localItems: CustomerCartLineItem[];
  serverItems: CustomerCartLineItem[];
  liveCatalog: WebsiteProductItem[];
}): CustomerCartLineItem[] {
  const baseQty = new Map<string, number>();
  for (const item of params.baseItems) {
    baseQty.set(item.productId, item.quantity);
  }
  const localQty = new Map<string, number>();
  for (const item of params.localItems) {
    localQty.set(item.productId, item.quantity);
  }
  const serverQty = new Map<string, number>();
  for (const item of params.serverItems) {
    serverQty.set(item.productId, item.quantity);
  }

  const allProductIds = new Set<string>([
    ...baseQty.keys(),
    ...localQty.keys(),
    ...serverQty.keys(),
  ]);

  const mergedDraft: CustomerCartLineItem[] = [];
  const itemLookup = new Map<string, CustomerCartLineItem>();
  for (const item of [...params.serverItems, ...params.localItems, ...params.baseItems]) {
    if (!itemLookup.has(item.productId)) itemLookup.set(item.productId, item);
  }

  for (const pid of allProductIds) {
    const b = baseQty.get(pid) || 0;
    const l = localQty.get(pid) || 0;
    const s = serverQty.get(pid) || 0;

    let chosenQty = s;
    if (s === b) {
      // Only local changed this SKU
      chosenQty = l;
    } else if (l === b) {
      // Only another device changed this SKU
      chosenQty = s;
    } else {
      // Both devices changed this SKU concurrently: keep the larger quantity (union/no silent item drop)
      chosenQty = Math.max(s, l);
    }

    if (chosenQty > 0) {
      const sample = itemLookup.get(pid);
      if (sample) {
        mergedDraft.push({ ...sample, quantity: chosenQty });
      }
    }
  }

  return revalidateCartAgainstCatalog(mergedDraft, params.liveCatalog);
}

export async function fetchCustomerCartFromPortal(
  subdomain: string,
  accessToken: string
): Promise<CustomerCartSyncResponse> {
  const res = await callCustomerPortalApi<{
    items?: CustomerCartLineItem[];
    version?: number;
    updatedAt?: string;
  }>(
    `/api/customer-portal?action=cart&subdomain=${encodeURIComponent(subdomain)}`,
    accessToken,
    { method: 'GET' }
  );
  if (res.error || !res.data) {
    return { items: [], version: 0, error: res.error };
  }
  return {
    items: Array.isArray(res.data.items) ? res.data.items : [],
    version: typeof res.data.version === 'number' ? res.data.version : 0,
    updatedAt: res.data.updatedAt,
    error: null,
  };
}

export async function syncCustomerCartToPortal(
  subdomain: string,
  accessToken: string,
  items: Array<{ productId: string; quantity: number }>,
  expectedVersion?: number
): Promise<CustomerCartSyncResponse> {
  try {
    const resp = await fetch(
      `/api/customer-portal?action=cart&subdomain=${encodeURIComponent(subdomain)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          subdomain,
          ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
        cache: 'no-store',
      }
    );

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        items: [],
        version: expectedVersion ?? 0,
        error: new Error('Customer portal service is currently unavailable.'),
      };
    }

    const body = (await resp.json()) as {
      ok?: boolean;
      success?: boolean;
      code?: string;
      error?: string;
      message?: string;
      items?: CustomerCartLineItem[];
      version?: number;
      updatedAt?: string;
      serverCart?: {
        items?: CustomerCartLineItem[];
        version?: number;
        updatedAt?: string;
      };
    };

    if (resp.status === 409 && body.code === 'CART_CONFLICT' && body.serverCart) {
      return {
        items: Array.isArray(body.serverCart.items) ? body.serverCart.items : [],
        version: typeof body.serverCart.version === 'number' ? body.serverCart.version : 0,
        updatedAt: body.serverCart.updatedAt,
        conflict: true,
        error: null,
      };
    }

    if (!resp.ok || (body.ok !== true && body.success !== true)) {
      return {
        items: [],
        version: expectedVersion ?? 0,
        error: new Error(body.message || body.error || 'Unable to sync shopping bag.'),
      };
    }

    return {
      items: Array.isArray(body.items) ? body.items : [],
      version: typeof body.version === 'number' ? body.version : 0,
      updatedAt: body.updatedAt,
      conflict: false,
      error: null,
    };
  } catch (err: unknown) {
    return {
      items: [],
      version: expectedVersion ?? 0,
      error: err instanceof Error ? err : new Error('Network error syncing shopping bag.'),
    };
  }
}
