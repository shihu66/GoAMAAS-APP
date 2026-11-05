import {
  OrderItem,
  OrderItemMetadata,
  Product,
  ProductCatalogMetaEntry,
  SubscribedWebsite,
  WebsiteCustomLink,
  WebsiteProductItem,
  WebsiteSectionConfig,
  WebsiteThemeSettings,
} from '../types';

export const STOREFRONT_META_SOCIAL_KEY = '__storefrontMeta';

const ALLOWED_SOCIAL_KEYS = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube'] as const;

export interface PublicStorefrontMetaEnvelope {
  heroImageUrl?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bannerImageUrl?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCtaText?: string;
  bannerCtaLink?: string;
  customLinks?: WebsiteCustomLink[];
  sections?: WebsiteSectionConfig[];
  themeSettings?: WebsiteThemeSettings;
  customDomain?: string;
  nicheLabel?: string;
}

export function sanitizeSocialLinksObject(raw: unknown): SubscribedWebsite['socialLinks'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const src = raw as Record<string, unknown>;
  const clean: SubscribedWebsite['socialLinks'] = {};
  for (const key of ALLOWED_SOCIAL_KEYS) {
    const val = src[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      clean[key] = val.trim();
    }
  }
  return clean;
}

/**
 * Embeds non-sensitive public visual builder fields inside `config.socialLinks.__storefrontMeta`
 * alongside top-level `config.*` keys so Production's `20261017` `get_published_website_by_subdomain`
 * RPC projects `heroImageUrl`, `themeSettings`, `sections`, `banner*`, and `customLinks`
 * without requiring any database schema or RPC modification.
 *
 * SECURITY: Never embeds `draft`, `productCatalogMeta`, `userId`, `ownerName`, `notes`,
 * or any private/billing data inside `__storefrontMeta`.
 */
export function embedPublicStorefrontMetaInConfig(
  rawConfig: Record<string, any>
): Record<string, any> {
  const cleanSocials = sanitizeSocialLinksObject(rawConfig.socialLinks);
  const meta: PublicStorefrontMetaEnvelope = {
    heroImageUrl: typeof rawConfig.heroImageUrl === 'string' ? rawConfig.heroImageUrl.trim() : '',
    heroCtaText: typeof rawConfig.heroCtaText === 'string' ? rawConfig.heroCtaText.trim() : '',
    heroCtaLink: typeof rawConfig.heroCtaLink === 'string' ? rawConfig.heroCtaLink.trim() : '',
    secondaryCtaText:
      typeof rawConfig.secondaryCtaText === 'string' ? rawConfig.secondaryCtaText.trim() : '',
    secondaryCtaLink:
      typeof rawConfig.secondaryCtaLink === 'string' ? rawConfig.secondaryCtaLink.trim() : '',
    bannerImageUrl:
      typeof rawConfig.bannerImageUrl === 'string' ? rawConfig.bannerImageUrl.trim() : '',
    bannerTitle: typeof rawConfig.bannerTitle === 'string' ? rawConfig.bannerTitle.trim() : '',
    bannerSubtitle:
      typeof rawConfig.bannerSubtitle === 'string' ? rawConfig.bannerSubtitle.trim() : '',
    bannerCtaText:
      typeof rawConfig.bannerCtaText === 'string' ? rawConfig.bannerCtaText.trim() : '',
    bannerCtaLink:
      typeof rawConfig.bannerCtaLink === 'string' ? rawConfig.bannerCtaLink.trim() : '',
    customLinks: Array.isArray(rawConfig.customLinks) ? rawConfig.customLinks : [],
    sections: Array.isArray(rawConfig.sections) ? rawConfig.sections : undefined,
    themeSettings:
      rawConfig.themeSettings &&
      typeof rawConfig.themeSettings === 'object' &&
      !Array.isArray(rawConfig.themeSettings)
        ? rawConfig.themeSettings
        : undefined,
    customDomain: typeof rawConfig.customDomain === 'string' ? rawConfig.customDomain.trim() : '',
    nicheLabel: typeof rawConfig.nicheLabel === 'string' ? rawConfig.nicheLabel.trim() : '',
  };

  return {
    ...rawConfig,
    socialLinks: {
      ...cleanSocials,
      [STOREFRONT_META_SOCIAL_KEY]: meta,
    },
  };
}

export function extractPublicStorefrontMeta(raw: Record<string, any> | null | undefined): {
  socialLinks: SubscribedWebsite['socialLinks'];
  heroImageUrl?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bannerImageUrl?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCtaText?: string;
  bannerCtaLink?: string;
  customLinks: WebsiteCustomLink[];
  sections?: WebsiteSectionConfig[];
  themeSettings?: WebsiteThemeSettings;
  customDomain?: string;
  nicheLabel?: string;
} {
  const src = raw && typeof raw === 'object' ? raw : {};
  const cfg = src.config && typeof src.config === 'object' ? src.config : {};
  const rawSocials =
    (src.socialLinks && typeof src.socialLinks === 'object' ? src.socialLinks : null) ||
    (cfg.socialLinks && typeof cfg.socialLinks === 'object' ? cfg.socialLinks : {}) ||
    {};

  const metaRaw =
    rawSocials[STOREFRONT_META_SOCIAL_KEY] &&
    typeof rawSocials[STOREFRONT_META_SOCIAL_KEY] === 'object' &&
    !Array.isArray(rawSocials[STOREFRONT_META_SOCIAL_KEY])
      ? (rawSocials[STOREFRONT_META_SOCIAL_KEY] as PublicStorefrontMetaEnvelope)
      : {};

  const pickStr = (key: keyof PublicStorefrontMetaEnvelope): string | undefined => {
    const topVal = src[key];
    if (typeof topVal === 'string' && topVal.trim().length > 0) return topVal.trim();
    const cfgVal = cfg[key];
    if (typeof cfgVal === 'string' && cfgVal.trim().length > 0) return cfgVal.trim();
    // If top-level explicitly set to '' (cleared), respect empty string over stale meta
    if (topVal === '' || cfgVal === '') return undefined;
    const metaVal = metaRaw[key];
    if (typeof metaVal === 'string' && metaVal.trim().length > 0) return metaVal.trim();
    return undefined;
  };

  const customLinks: WebsiteCustomLink[] = Array.isArray(src.customLinks)
    ? src.customLinks
    : Array.isArray(cfg.customLinks)
    ? cfg.customLinks
    : Array.isArray(metaRaw.customLinks)
    ? metaRaw.customLinks
    : [];

  const sections: WebsiteSectionConfig[] | undefined = Array.isArray(src.sections)
    ? src.sections
    : Array.isArray(cfg.sections)
    ? cfg.sections
    : Array.isArray(metaRaw.sections)
    ? metaRaw.sections
    : undefined;

  const themeSettings: WebsiteThemeSettings | undefined =
    src.themeSettings && typeof src.themeSettings === 'object' && !Array.isArray(src.themeSettings)
      ? src.themeSettings
      : cfg.themeSettings &&
        typeof cfg.themeSettings === 'object' &&
        !Array.isArray(cfg.themeSettings)
      ? cfg.themeSettings
      : metaRaw.themeSettings &&
        typeof metaRaw.themeSettings === 'object' &&
        !Array.isArray(metaRaw.themeSettings)
      ? metaRaw.themeSettings
      : undefined;

  return {
    socialLinks: sanitizeSocialLinksObject(rawSocials),
    heroImageUrl: pickStr('heroImageUrl'),
    heroCtaText: pickStr('heroCtaText'),
    heroCtaLink: pickStr('heroCtaLink'),
    secondaryCtaText: pickStr('secondaryCtaText'),
    secondaryCtaLink: pickStr('secondaryCtaLink'),
    bannerImageUrl: pickStr('bannerImageUrl'),
    bannerTitle: pickStr('bannerTitle'),
    bannerSubtitle: pickStr('bannerSubtitle'),
    bannerCtaText: pickStr('bannerCtaText'),
    bannerCtaLink: pickStr('bannerCtaLink'),
    customLinks,
    sections,
    themeSettings,
    customDomain: pickStr('customDomain'),
    nicheLabel: pickStr('nicheLabel'),
  };
}

// ==============================================================================
// Store <-> Website Product Synchronization & Publishing State
// ==============================================================================

export type ProductWebsiteSyncState = 'published' | 'update_pending' | 'unavailable' | 'draft';

export function getEffectiveProductUnitPrice(product: {
  price: number;
  discountPrice?: number;
}): { unitPrice: number; hasDiscount: boolean; originalPrice?: number } {
  const basePrice = Math.max(0, Number(product.price) || 0);
  const disc =
    typeof product.discountPrice === 'number' && Number.isFinite(product.discountPrice)
      ? Number(product.discountPrice)
      : 0;
  if (disc > 0 && disc < basePrice) {
    return { unitPrice: disc, hasDiscount: true, originalPrice: basePrice };
  }
  return { unitPrice: basePrice, hasDiscount: false };
}

export function buildWebsiteProductItemFromProduct(
  product: Product,
  sortOrderOverride?: number
): WebsiteProductItem {
  const { unitPrice, hasDiscount, originalPrice } = getEffectiveProductUnitPrice(product);
  const cleanStock = Math.max(0, Math.trunc(Number(product.stock) || 0));
  const inStock = product.status === 'active' && cleanStock > 0;

  return {
    id: product.id,
    productId: product.id,
    sku: (product.sku || '').trim() || undefined,
    name: product.name.trim(),
    price: `৳${unitPrice.toLocaleString()}`,
    priceNumeric: Math.max(0, Number(product.price) || 0),
    discountPrice: hasDiscount ? unitPrice : undefined,
    originalPrice: hasDiscount && originalPrice ? `৳${originalPrice.toLocaleString()}` : undefined,
    description: (product.description || '').trim(),
    imageUrl: (product.image || '').trim() || undefined,
    category: (product.category || '').trim() || undefined,
    stock: cleanStock,
    inStock,
    isVisible: product.isVisible !== false && product.status !== 'archived',
    sortOrder: sortOrderOverride ?? product.sortOrder ?? 0,
    publishedAt: new Date().toISOString(),
  };
}

export function upsertProductIntoWebsiteCatalog(
  existingItems: WebsiteProductItem[],
  product: Product,
  options?: { visible?: boolean }
): WebsiteProductItem[] {
  const targetVisible = options?.visible ?? (product.isVisible !== false && product.status === 'active');
  const normalizedProduct: Product = {
    ...product,
    isVisible: targetVisible,
  };
  const nextEntry = buildWebsiteProductItemFromProduct(normalizedProduct);
  const cleanSku = (product.sku || '').trim().toLowerCase();

  let matched = false;
  const deduplicated: WebsiteProductItem[] = [];
  const seenProductIds = new Set<string>();

  for (const item of existingItems || []) {
    if (!item) continue;
    const itemProdId = (item.productId || item.id || '').trim();
    const isMatch =
      itemProdId === product.id ||
      (cleanSku.length > 0 && (item.sku || '').trim().toLowerCase() === cleanSku);

    if (isMatch) {
      if (!matched) {
        deduplicated.push({
          ...nextEntry,
          sortOrder: product.sortOrder ?? item.sortOrder ?? deduplicated.length,
        });
        seenProductIds.add(product.id);
        matched = true;
      }
      continue;
    }

    if (itemProdId && seenProductIds.has(itemProdId)) {
      continue;
    }
    if (itemProdId) {
      seenProductIds.add(itemProdId);
    }
    deduplicated.push(item);
  }

  if (!matched && targetVisible) {
    deduplicated.push({
      ...nextEntry,
      sortOrder: product.sortOrder ?? deduplicated.length,
    });
  }

  return deduplicated.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function removeProductFromWebsiteCatalog(
  existingItems: WebsiteProductItem[],
  productId: string,
  sku?: string
): WebsiteProductItem[] {
  const cleanId = (productId || '').trim();
  const cleanSku = (sku || '').trim().toLowerCase();
  return (existingItems || []).filter((item) => {
    if (!item) return false;
    if ((item.productId || '').trim() === cleanId || (item.id || '').trim() === cleanId) {
      return false;
    }
    if (cleanSku && (item.sku || '').trim().toLowerCase() === cleanSku) {
      return false;
    }
    return true;
  });
}

/**
 * Merges `public.products` rows with rich website metadata (`productCatalogMeta` & `servicesOrProducts`)
 * so `image`, `discountPrice`, `websiteId`, `isVisible`, and `sortOrder` persist reliably even when
 * `public.products` uses the Production `20261018` schema baseline.
 */
export function mergeStoreProductsWithWebsites(
  dbProducts: Product[],
  websites: SubscribedWebsite[]
): Product[] {
  if (!websites || websites.length === 0) {
    return dbProducts;
  }

  return dbProducts.map((prod) => {
    let resolvedWebsiteId = prod.websiteId;
    let resolvedImage = prod.image;
    let resolvedDiscountPrice = prod.discountPrice;
    let resolvedIsVisible = prod.isVisible;
    let resolvedSortOrder = prod.sortOrder;

    for (const site of websites) {
      const metaMap = site.productCatalogMeta || {};
      const metaEntry: ProductCatalogMetaEntry | undefined = metaMap[prod.id];

      const publishedMatch = (site.servicesOrProducts || []).find(
        (item) =>
          item &&
          (item.productId === prod.id ||
            item.id === prod.id ||
            (prod.sku && item.sku && item.sku.trim().toLowerCase() === prod.sku.trim().toLowerCase()))
      );

      if (metaEntry || publishedMatch) {
        if (!resolvedWebsiteId) {
          resolvedWebsiteId = metaEntry?.websiteId || site.id;
        }
        if (!resolvedImage) {
          resolvedImage = metaEntry?.imageUrl || publishedMatch?.imageUrl || undefined;
        }
        if (resolvedDiscountPrice === undefined) {
          resolvedDiscountPrice =
            metaEntry?.discountPrice ?? publishedMatch?.discountPrice ?? undefined;
        }
        if (resolvedIsVisible === undefined || prod.websiteId === undefined) {
          if (publishedMatch && publishedMatch.isVisible !== false) {
            resolvedIsVisible = true;
          } else if (metaEntry?.isVisible !== undefined) {
            resolvedIsVisible = metaEntry.isVisible;
          } else {
            resolvedIsVisible = Boolean(publishedMatch && publishedMatch.isVisible !== false);
          }
        }
        if (resolvedSortOrder === undefined) {
          resolvedSortOrder = metaEntry?.sortOrder ?? publishedMatch?.sortOrder ?? 0;
        }
        break;
      }
    }

    return {
      ...prod,
      websiteId: resolvedWebsiteId,
      image: resolvedImage,
      discountPrice: resolvedDiscountPrice,
      isVisible: resolvedIsVisible ?? false,
      sortOrder: resolvedSortOrder,
    };
  });
}

export function computeProductWebsiteSyncState(
  product: Product,
  websites: SubscribedWebsite[]
): {
  state: ProductWebsiteSyncState;
  website: SubscribedWebsite | null;
  publishedItem: WebsiteProductItem | null;
} {
  const targetSite =
    (product.websiteId ? websites.find((w) => w.id === product.websiteId) : null) ||
    websites.find((w) =>
      (w.servicesOrProducts || []).some(
        (it) => it && (it.productId === product.id || it.id === product.id)
      )
    ) ||
    null;

  const publishedItem = targetSite
    ? (targetSite.servicesOrProducts || []).find(
        (it) =>
          it &&
          it.isVisible !== false &&
          (it.productId === product.id ||
            it.id === product.id ||
            (product.sku && it.sku && it.sku.trim().toLowerCase() === product.sku.trim().toLowerCase()))
      ) || null
    : null;

  if (product.stock <= 0 || product.status === 'archived') {
    return { state: 'unavailable', website: targetSite, publishedItem };
  }

  if (!targetSite || product.status === 'draft' || !publishedItem || product.isVisible === false) {
    // Check if staged in draftConfig.servicesOrProducts on targetSite
    const stagedInDraft = targetSite?.draftConfig?.servicesOrProducts?.some(
      (it) => it && it.isVisible !== false && (it.productId === product.id || it.id === product.id)
    );
    if (stagedInDraft) {
      return { state: 'update_pending', website: targetSite || null, publishedItem };
    }
    return { state: 'draft', website: targetSite, publishedItem: null };
  }

  // Product is present in published servicesOrProducts — check if any field drifted or site is not yet live
  const { unitPrice, hasDiscount } = getEffectiveProductUnitPrice(product);
  const expectedDiscount = hasDiscount ? unitPrice : undefined;
  const priceDrifted =
    (publishedItem.priceNumeric !== undefined && publishedItem.priceNumeric !== product.price) ||
    (publishedItem.discountPrice ?? undefined) !== expectedDiscount;
  const contentDrifted =
    publishedItem.name.trim() !== product.name.trim() ||
    (publishedItem.description || '').trim() !== (product.description || '').trim() ||
    (publishedItem.imageUrl || '') !== (product.image || '') ||
    (publishedItem.stock !== undefined && publishedItem.stock !== product.stock);

  if (priceDrifted || contentDrifted || targetSite.deploymentStatus !== 'live') {
    return { state: 'update_pending', website: targetSite, publishedItem };
  }

  return { state: 'published', website: targetSite, publishedItem };
}

// ==============================================================================
// Public Storefront Customer Checkout Validation & Order Metadata Helpers
// ==============================================================================

export type PublicDeliveryMethod =
  | 'Inside Dhaka'
  | 'Outside Dhaka'
  | 'Store Pickup'
  | 'inside_dhaka'
  | 'outside_dhaka'
  | 'store_pickup';

export interface PublicCustomerOrderInput {
  subdomain: string;
  websiteId?: string;
  checkoutAttemptId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: string;
  city: string;
  deliveryArea?: string;
  deliveryInstructions?: string;
  orderNotes?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    area?: string;
    deliveryInstructions?: string;
    orderNotes?: string;
  };
  deliveryMethod: PublicDeliveryMethod;
  paymentMethod: 'Cash on Delivery (COD)' | 'bKash' | 'Nagad' | 'Bank Transfer';
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export const BD_OR_INTL_PHONE_REGEX = /^(?:\+?8801[3-9]\d{8}|01[3-9]\d{8}|\+?[1-9]\d{7,14})$/;

export function normalizeCustomerPhone(raw: string): string {
  return (raw || '').replace(/[\s()-]+/g, '').trim();
}

export function validatePublicCustomerOrderInput(
  input: PublicCustomerOrderInput
): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid order payload.' };
  }
  const subdomain = (input.subdomain || '').trim().toLowerCase();
  if (!subdomain || subdomain.length < 3) {
    return { valid: false, error: 'Invalid storefront identifier.' };
  }
  const name = (input.customerName || input.customer?.name || '').trim();
  if (name.length < 2) {
    return { valid: false, error: 'Please enter your full name.' };
  }
  const phone = normalizeCustomerPhone(input.customerPhone || input.customer?.phone || '');
  if (!BD_OR_INTL_PHONE_REGEX.test(phone)) {
    return {
      valid: false,
      error: 'Please enter a valid mobile number (e.g., 017XXXXXXXX or +88017XXXXXXXX).',
    };
  }
  const email = (input.customerEmail || input.customer?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Please enter a valid email address or leave it blank.' };
  }
  const address = (input.shippingAddress || input.customer?.address || '').trim();
  if (address.length < 5) {
    return { valid: false, error: 'Please enter your full delivery address.' };
  }
  const city = (input.city || input.customer?.city || '').trim();
  if (city.length < 2) {
    return { valid: false, error: 'Please select or enter your district / city.' };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { valid: false, error: 'Your order bag is empty. Please add at least one item.' };
  }
  for (const item of input.items) {
    if (!item.productId || typeof item.productId !== 'string') {
      return { valid: false, error: 'Invalid product selection in order.' };
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      return { valid: false, error: 'Item quantity must be a whole number of at least 1.' };
    }
  }
  return { valid: true };
}

export function extractOrderMetadataFromItems(items: OrderItem[] | null | undefined): OrderItemMetadata {
  if (!Array.isArray(items) || items.length === 0) return {};
  const firstMeta = items[0]?.orderMeta;
  if (!firstMeta || typeof firstMeta !== 'object') return {};
  return firstMeta;
}
