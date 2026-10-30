export type DashboardPlanId = 'starter' | 'business' | 'pro' | 'enterprise';
export type AutomationPackageId = 'basic_auto' | 'growth_auto' | 'ai_chatbot' | 'biz_auto_pro';
export type WebsitePackageId = 'starter_web' | 'business_web' | 'advanced_web';

export interface DashboardPlanConfig {
  id: DashboardPlanId;
  name: 'Starter' | 'Business' | 'Pro' | 'Enterprise';
  priceMonthly: number;
  subtitle: string;
  description: string;
  isPopular?: boolean;
  trialDays: number;
  features: string[];
  ctaLabel: string;
}

export interface AutomationPackageConfig {
  id: AutomationPackageId;
  name: string;
  priceMonthly: number;
  setupFee: number | 'Included';
  setupFeeLabel: string;
  description: string;
  isPopular?: boolean;
  features: string[];
  ctaLabel: string;
}

export interface WebsitePackageConfig {
  id: WebsitePackageId;
  name: string;
  priceOneTime: number;
  description: string;
  pagesLimit: string;
  isPopular?: boolean;
  estimatedTimeline: string;
  domainHostingBenefit: string;
  features: string[];
  scopeNote?: string;
  ctaLabel: string;
}

/**
 * Safely migrates legacy or prefixed dashboard plan identifiers to canonical
 * public.service_pricing_catalog service_code values ('starter' | 'business' | 'pro' | 'enterprise').
 * Legacy 500/1500/2500 aliases (plan_starter, plan_growth, plan_pro, plan_enterprise) are mapped
 * to their canonical active plan IDs and never resolve to legacy amounts.
 */
export const LEGACY_DASHBOARD_PLAN_ALIASES: Readonly<Record<string, DashboardPlanId>> = {
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

export function normalizeDashboardPlanId(raw: string | null | undefined): DashboardPlanId | null {
  const cleaned = (raw || '').trim().toLowerCase();
  if (!cleaned) return null;
  return LEGACY_DASHBOARD_PLAN_ALIASES[cleaned] ?? null;
}

export const DASHBOARD_SUBSCRIPTION_PLANS: DashboardPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 299,
    subtitle: 'For small online sellers',
    description: 'Essential operating tools to manage products, orders, and sales performance.',
    trialDays: 7,
    features: [
      'Product Management',
      'Order Management',
      'Customer Management',
      'Basic Sales Dashboard',
      'Order Status Tracking',
      'Up to 300 Orders/month',
      '1 User',
      '7-Day Free Trial',
    ],
    ctaLabel: 'Start Free Trial',
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 599,
    subtitle: 'For growing online businesses',
    description: 'Complete operational control with inventory tracking, reports, and courier dispatch.',
    isPopular: true,
    trialDays: 7,
    features: [
      'Everything in Starter',
      'Unlimited Orders',
      'Inventory & Stock Management',
      'Advanced Sales Analytics',
      'Customer Purchase History',
      'CSV/Excel Export',
      'Courier Management',
      'Up to 3 Staff Users',
      '7-Day Free Trial',
    ],
    ctaLabel: 'Start Free Trial',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 999,
    subtitle: 'For established businesses',
    description: 'Multi-store control with profit/loss metrics and automated communication integrations.',
    trialDays: 7,
    features: [
      'Everything in Business',
      'Multiple Stores',
      'Profit/Loss Tracking',
      'Advanced Reports',
      'Courier API Integration (when configured)',
      'WhatsApp Notification Integration (when configured)',
      'Up to 10 Staff Users',
      'Priority Support',
      '7-Day Free Trial',
    ],
    ctaLabel: 'Start Free Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 1999,
    subtitle: 'For larger businesses',
    description: 'Multi-branch operations with custom business intelligence, AI assistant, and full API.',
    trialDays: 7,
    features: [
      'Everything in Pro',
      'Multiple Branches',
      'Advanced Business Automation',
      'AI Business Assistant',
      'Custom Reports',
      'API Access',
      'Unlimited Staff',
      'Dedicated Support',
      '7-Day Free Trial',
    ],
    ctaLabel: 'Start Free Trial',
  },
];

export function getDashboardPlanById(raw: string | null | undefined): DashboardPlanConfig | undefined {
  const canonicalId = normalizeDashboardPlanId(raw);
  if (!canonicalId) return undefined;
  return DASHBOARD_SUBSCRIPTION_PLANS.find((plan) => plan.id === canonicalId);
}

export const AI_AUTOMATION_PACKAGES: AutomationPackageConfig[] = [
  {
    id: 'basic_auto',
    name: 'Basic Automation',
    priceMonthly: 999,
    setupFee: 1000,
    setupFeeLabel: '৳1,000 one-time setup fee',
    description: 'Kickstart automated customer interactions and capture inbound prospect inquiries.',
    features: [
      'One simple workflow',
      'Lead capture automation',
      'Basic customer follow-up',
      'Monthly performance summary',
      'Basic support',
    ],
    ctaLabel: 'Choose Automation',
  },
  {
    id: 'growth_auto',
    name: 'Growth Automation',
    priceMonthly: 2499,
    setupFee: 1500,
    setupFeeLabel: '৳1,500 one-time setup fee',
    description: 'Automate customer re-engagement, order status alerts, and pipeline lead capture.',
    isPopular: true,
    features: [
      'Up to 3 workflows',
      'Customer follow-up automation',
      'Lead management automation',
      'Order notification workflow',
      'Monthly performance report',
      'Standard support',
    ],
    ctaLabel: 'Choose Automation',
  },
  {
    id: 'ai_chatbot',
    name: 'AI Chatbot',
    priceMonthly: 3999,
    setupFee: 'Included',
    setupFeeLabel: 'Initial setup included',
    description: 'Deploy a 24/7 conversational assistant for either Facebook Messenger OR WhatsApp.',
    features: [
      'One AI chatbot for either Facebook Messenger OR WhatsApp',
      'Business FAQ responses',
      'Lead collection',
      'Customer inquiry handling',
      'Basic conversation insights',
      'Initial setup included',
    ],
    ctaLabel: 'Request Setup',
  },
  {
    id: 'biz_auto_pro',
    name: 'Business Automation Pro',
    priceMonthly: 7999,
    setupFee: 'Included',
    setupFeeLabel: 'Priority onboarding included',
    description: 'Comprehensive cross-channel automation engine with CRM integration and priority SLA.',
    features: [
      'Up to 5 configured workflows',
      'One AI chatbot for either Messenger OR WhatsApp',
      'Lead capture and follow-up',
      'Customer notification automation',
      'CRM workflow integration',
      'Monthly performance report',
      'Priority support',
    ],
    ctaLabel: 'Choose Automation',
  },
];

export const WEBSITE_DEVELOPMENT_PACKAGES: WebsitePackageConfig[] = [
  {
    id: 'starter_web',
    name: 'Starter Website',
    priceOneTime: 8000,
    description: 'Clean modern website engineered for startups, boutique shops, and emerging brands.',
    pagesLimit: 'Up to 5 pages',
    estimatedTimeline: 'Estimated: 4–6 business days',
    domainHostingBenefit: 'First-year domain + hosting FREE',
    features: [
      'Up to 5 pages',
      'Modern responsive design',
      'Mobile, tablet, and desktop support',
      'Contact form',
      'WhatsApp contact button',
      'Basic on-page SEO',
      'First-year domain + hosting FREE',
      'Delivery timeline displayed as an estimate (4–6 business days)',
    ],
    scopeNote: 'E-commerce, complex custom functionality, paid integrations, and recurring third-party costs must be quoted separately when outside the package scope.',
    ctaLabel: 'Request a Website',
  },
  {
    id: 'business_web',
    name: 'Business Website',
    priceOneTime: 15000,
    isPopular: true,
    description: 'Premium custom design with content management system and interactive integrations.',
    pagesLimit: 'Up to 10 pages',
    estimatedTimeline: 'Estimated: 7–10 business days',
    domainHostingBenefit: 'First-year domain + hosting FREE',
    features: [
      'Up to 10 pages',
      'Premium custom design',
      'Responsive layouts',
      'CMS for editable content',
      'Contact and inquiry forms',
      'WhatsApp integration',
      'Google Maps integration',
      'Basic on-page SEO',
      'First-year domain + hosting FREE',
    ],
    scopeNote: 'E-commerce, complex custom functionality, paid integrations, and recurring third-party costs must be quoted separately when outside the package scope.',
    ctaLabel: 'Request a Website',
  },
  {
    id: 'advanced_web',
    name: 'Advanced Website',
    priceOneTime: 25000,
    description: 'High-performance web architecture with advanced lead capture, analytics, and technical SEO.',
    pagesLimit: 'Up to 15 pages',
    estimatedTimeline: 'Estimated: 12–16 business days',
    domainHostingBenefit: 'First-year domain + hosting FREE',
    features: [
      'Up to 15 pages',
      'Advanced custom design',
      'CMS integration',
      'Advanced forms and lead capture',
      'AI chatbot integration UI/implementation, subject to scope',
      'Analytics integration',
      'Technical SEO setup',
      'Performance optimization',
      'First-year domain + hosting FREE',
    ],
    scopeNote: 'E-commerce, complex custom functionality, paid integrations, and recurring third-party costs must be quoted separately when outside the package scope.',
    ctaLabel: 'Request a Website',
  },
];

export const THIRD_PARTY_DISCLOSURES = [
  'Third-Party Platform Charges: Official WhatsApp Business API charges (Meta conversation fees), Facebook Messenger platform costs, external SMS gateway units, and AI model consumption fees are billed directly by their respective providers and are not included in GoAMAAS service fees.',
  'Integration Requirements: Third-party integrations (such as courier APIs, WhatsApp Business Cloud, and payment gateways) require user configuration and active merchant credentials with the respective providers before functioning.',
  'AI Usage Policies: GoAMAAS does not promise unlimited AI usage. Conversational workloads adhere to monthly rate limits and provider usage quotas.',
  'Website Project Scope: Website development fees are one-time project engagements. Custom e-commerce carts with custom databases, complex API middleware, and paid third-party extensions outside the stated scope are quoted separately.',
];

export const DEFAULT_WEBSITE_SUBSCRIPTION_PLAN: import('../types').WebsiteSubscriptionPlanConfig = {
  id: 'website_lite',
  name: 'GoAMAAS Website',
  priceMonthly: 600,
  badge: 'Single All-Inclusive Plan',
  subtitle: 'Build and host your own business website — one simple 30-day subscription',
  description: 'Self-service visual website builder with free hosting on GoAMAAS infrastructure, free businessname.amaas.xyz subdomain, product catalog management, and zero upfront development fees.',
  subdomainFormat: 'businessname.amaas.xyz',
  features: [
    'Self-service visual website builder (logo, hero, banners, sections & theme)',
    'Free customer subdomain: businessname.amaas.xyz',
    'Free cloud hosting on GoAMAAS infrastructure included',
    'Optional custom domain support (domain registration paid separately by customer)',
    'Full product catalog manager with image uploads & visibility controls',
    'Any business niche supported (restaurant, fashion, e-commerce, clinic, salon, agency, and more)',
    'Custom brand colors, typography presets, and responsive Desktop & Mobile layouts',
    'Business contact info, social links, custom footer links & WhatsApp ordering',
    'Save Draft & Publish Updates anytime with instant live storefront updates',
    '30-day billing period with verified manual bKash, Nagad, or Bank Transfer renewal',
    'SSL/HTTPS enabled on supported domains',
  ],
  limits: {
    maxPages: 10,
    maxStorageMb: 1024,
    maxBandwidthGb: 25,
    monthlyUpdateRequests: 999,
    gracePeriodDays: 7,
  },
  disclosures: [
    'Single plan pricing: ৳600 BDT per 30-day billing period with zero upfront development fee and no hidden website-builder tiers.',
    'Free hosting on GoAMAAS infrastructure and free subdomain (businessname.amaas.xyz) are included. Optional custom domain registration is paid separately by the customer.',
    'Verified payment approval automatically publishes valid websites and renews active subscriptions for 30 days.',
    'If a subscription reaches its billing end date, the website enters a 7-day grace period before going offline. Customer data and website configurations are preserved.',
    'Wildcard custom subdomains (*.amaas.xyz) require wildcard DNS and hosting TLS configuration at deployment time.',
  ],
  isVisible: true,
};

export interface SubscriptionVsOneTimeComparisonItem {
  feature: string;
  subscriptionPlan: string;
  oneTimePackages: string;
}

export const SUBSCRIPTION_VS_ONETIME_COMPARISON: SubscriptionVsOneTimeComparisonItem[] = [
  {
    feature: 'Plan & Pricing Model',
    subscriptionPlan: 'GoAMAAS Website — ৳600 / 30 days (one simple plan)',
    oneTimePackages: '৳8,000 to ৳25,000 (one-time bespoke engineering project)',
  },
  {
    feature: 'Upfront Development Cost',
    subscriptionPlan: '৳0 (Self-service visual website builder)',
    oneTimePackages: 'Full project fee (৳8k – ৳25k)',
  },
  {
    feature: 'Domain & Subdomain',
    subscriptionPlan: 'Free businessname.amaas.xyz + optional custom domain (registration paid separately)',
    oneTimePackages: 'Free 1st-year custom top-level domain (.com)',
  },
  {
    feature: 'Hosting & Infrastructure',
    subscriptionPlan: 'Free GoAMAAS cloud hosting included in ৳600/mo',
    oneTimePackages: '1st year free, client renews annually thereafter',
  },
  {
    feature: 'Editing & Product Updates',
    subscriptionPlan: 'Unlimited self-service visual edits, Save Draft & Publish Updates',
    oneTimePackages: 'Delivered turnkey; agency change requests billed separately',
  },
  {
    feature: 'Resource Allowance',
    subscriptionPlan: 'Up to 10 sections/pages, 1GB media storage, 25GB monthly bandwidth',
    oneTimePackages: 'Up to 15+ custom pages, standard hosting limits',
  },
  {
    feature: 'Activation & Publishing',
    subscriptionPlan: 'Automatically published live upon payment verification',
    oneTimePackages: 'Custom engineering delivery in 5–21 business days',
  },
  {
    feature: 'Cancellation & Grace Period',
    subscriptionPlan: 'Cancel anytime. 7-day grace period; data preserved on expiry',
    oneTimePackages: 'One-time investment; client owns final website code',
  },
];

export interface ResolvedCatalogPlanState {
  serviceCode: string;
  planTierLabel: string;
  priceBdt: number | null;
  setupFeeBdt: number;
  isAvailable: boolean;
}

/**
 * Resolves display & checkout metadata for a plan/package against public.service_pricing_catalog.
 * When `requireCatalog` is true (or `catalog` is provided), missing or inactive catalog entries
 * return `isAvailable: false` and `priceBdt: null` without falling back to static frontend prices.
 */
export function resolveCatalogPlanState(params: {
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceId: string;
  fallbackLabel: string;
  fallbackPriceBdt: number;
  fallbackSetupFeeBdt?: number;
  catalog?: Array<import('../types').ServicePricingCatalogEntry>;
  requireCatalog?: boolean;
}): ResolvedCatalogPlanState {
  const rawCode = (params.serviceId || '').trim().toLowerCase();
  const canonicalCode =
    params.serviceType === 'dashboard_plan'
      ? normalizeDashboardPlanId(rawCode) || ''
      : rawCode;

  const enforceCatalogOnly = Boolean(params.requireCatalog || params.catalog !== undefined);

  if (!canonicalCode) {
    return {
      serviceCode: rawCode,
      planTierLabel: params.fallbackLabel,
      priceBdt: null,
      setupFeeBdt: 0,
      isAvailable: false,
    };
  }

  if (enforceCatalogOnly) {
    const match = (params.catalog || []).find(
      (entry) =>
        entry.serviceType === params.serviceType &&
        entry.serviceCode.trim().toLowerCase() === canonicalCode &&
        entry.isActive &&
        Number.isFinite(entry.priceBdt) &&
        entry.priceBdt > 0
    );
    if (!match) {
      return {
        serviceCode: canonicalCode,
        planTierLabel: params.fallbackLabel,
        priceBdt: null,
        setupFeeBdt: 0,
        isAvailable: false,
      };
    }
    const dbLabel = (match.planTierLabel || '').trim();
    const cleanFallback = (params.fallbackLabel || '').trim();
    const resolvedLabel =
      dbLabel && cleanFallback && dbLabel.toLowerCase() === cleanFallback.toLowerCase()
        ? cleanFallback
        : dbLabel || cleanFallback;
    return {
      serviceCode: canonicalCode,
      planTierLabel: resolvedLabel,
      priceBdt: match.priceBdt,
      setupFeeBdt: Number(match.setupFeeBdt) || 0,
      isAvailable: true,
    };
  }

  return {
    serviceCode: canonicalCode,
    planTierLabel: params.fallbackLabel,
    priceBdt: params.fallbackPriceBdt,
    setupFeeBdt: params.fallbackSetupFeeBdt || 0,
    isAvailable: true,
  };
}

/**
 * Resolves the authoritative BDT price for a given service type and service code,
 * matching public.service_pricing_catalog enforced by PostgreSQL triggers.
 *
 * Security rule: Whenever `catalog` is provided or `requireCatalog` is true,
 * static frontend fallback maps are NEVER used — inactive or missing plans return `null`.
 */
export function resolveAuthoritativeServicePrice(params: {
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceId: string;
  planTier?: string;
  serviceName?: string;
  websiteMonthlyFee?: number;
  includeSetupFee?: boolean;
  catalog?: Array<import('../types').ServicePricingCatalogEntry>;
  requireCatalog?: boolean;
}): number | null {
  const code = (params.serviceId || '').trim().toLowerCase();
  const tier = (params.planTier || '').trim().toLowerCase();
  const name = (params.serviceName || '').trim().toLowerCase();
  const enforceCatalogOnly = Boolean(params.requireCatalog || params.catalog !== undefined);
  const activeCatalog = (params.catalog || []).filter(
    (entry) => entry.isActive && entry.serviceType === params.serviceType
  );

  if (params.serviceType === 'website_subscription') {
    const liteEntry = activeCatalog.find(
      (entry) => entry.serviceCode.trim().toLowerCase() === 'website_lite'
    );
    if (enforceCatalogOnly) {
      if (!liteEntry || !Number.isFinite(liteEntry.priceBdt) || liteEntry.priceBdt <= 0) {
        return null;
      }
      const fee = Number(params.websiteMonthlyFee);
      return Number.isFinite(fee) && fee > 0 ? fee : liteEntry.priceBdt;
    }
    const fee = Number(params.websiteMonthlyFee);
    if (Number.isFinite(fee) && fee > 0) return fee;
    if (liteEntry && Number.isFinite(liteEntry.priceBdt) && liteEntry.priceBdt > 0) {
      return liteEntry.priceBdt;
    }
    return DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.priceMonthly;
  }

  if (params.serviceType === 'website_package') {
    const matchedCode =
      code === 'starter_web' || tier.includes('starter') || name.includes('starter')
        ? 'starter_web'
        : code === 'business_web' || tier.includes('business') || name.includes('business')
        ? 'business_web'
        : code === 'advanced_web' || tier.includes('advanced') || name.includes('advanced')
        ? 'advanced_web'
        : code === 'custom_setup' || name.includes('custom setup') || tier === 'one-time'
        ? 'custom_setup'
        : code;
    const catMatch = activeCatalog.find(
      (entry) =>
        entry.serviceCode.trim().toLowerCase() === matchedCode ||
        entry.planTierLabel.trim().toLowerCase() === tier ||
        entry.planTierLabel.trim().toLowerCase() === name
    );
    if (catMatch && Number.isFinite(catMatch.priceBdt) && catMatch.priceBdt > 0) {
      return catMatch.priceBdt;
    }
    if (enforceCatalogOnly) return null;
    if (matchedCode === 'starter_web') return 8000;
    if (matchedCode === 'business_web') return 15000;
    if (matchedCode === 'advanced_web') return 25000;
    if (matchedCode === 'custom_setup') return 5000;
    return null;
  }

  if (params.serviceType === 'dashboard_plan') {
    const canonicalPlanId = normalizeDashboardPlanId(code);
    if (!canonicalPlanId) return null;

    const catMatch = activeCatalog.find(
      (entry) => entry.serviceCode.trim().toLowerCase() === canonicalPlanId
    );
    if (catMatch && Number.isFinite(catMatch.priceBdt) && catMatch.priceBdt > 0) {
      return catMatch.priceBdt;
    }
    if (enforceCatalogOnly) return null;

    const offlineDashboardMap: Record<DashboardPlanId, number> = {
      starter: 299,
      business: 599,
      pro: 999,
      enterprise: 1999,
    };
    return offlineDashboardMap[canonicalPlanId] ?? null;
  }

  if (params.serviceType === 'ai_automation') {
    if (!code) return null;
    const catMatch = activeCatalog.find(
      (entry) => entry.serviceCode.trim().toLowerCase() === code
    );
    if (catMatch && Number.isFinite(catMatch.priceBdt) && catMatch.priceBdt > 0) {
      return params.includeSetupFee
        ? catMatch.priceBdt + (Number(catMatch.setupFeeBdt) || 0)
        : catMatch.priceBdt;
    }
    if (enforceCatalogOnly) return null;

    const offlineAutoMap: Record<string, { monthly: number; setup: number }> = {
      basic_auto: { monthly: 999, setup: 1000 },
      growth_auto: { monthly: 2499, setup: 1500 },
      ai_chatbot: { monthly: 3999, setup: 0 },
      biz_auto_pro: { monthly: 7999, setup: 0 },
      messenger_starter: { monthly: 999, setup: 1000 },
      whatsapp_sales: { monthly: 2499, setup: 2500 },
      order_suite: { monthly: 3999, setup: 3500 },
      full_ai_pack: { monthly: 7999, setup: 5000 },
      ai_automations: { monthly: 999, setup: 1000 },
      ai_order_assistant: { monthly: 2000, setup: 0 },
      ai_bot: { monthly: 1200, setup: 0 },
    };
    const entry = offlineAutoMap[code];
    if (!entry) return null;
    return params.includeSetupFee ? entry.monthly + entry.setup : entry.monthly;
  }

  return null;
}


