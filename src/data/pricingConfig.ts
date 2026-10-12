export interface DashboardPlanConfig {
  id: 'STARTER' | 'BUSINESS' | 'PRO' | 'ENTERPRISE';
  name: string;
  priceMonthly: number;
  subtitle: string;
  description: string;
  isPopular?: boolean;
  trialDays: number;
  features: string[];
  ctaLabel: string;
}

export interface AutomationPackageConfig {
  id: 'BASIC_AUTO' | 'GROWTH_AUTO' | 'AI_CHATBOT' | 'BIZ_AUTO_PRO';
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
  id: 'STARTER_WEB' | 'BUSINESS_WEB' | 'ADVANCED_WEB';
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

export const DASHBOARD_SUBSCRIPTION_PLANS: DashboardPlanConfig[] = [
  {
    id: 'STARTER',
    name: 'STARTER',
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
    id: 'BUSINESS',
    name: 'BUSINESS',
    priceMonthly: 599,
    subtitle: 'For growing online businesses',
    description: 'Complete operational control with inventory tracking, reports, and courier dispatch.',
    isPopular: true, // Marked as "Most Popular" as requested
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
    id: 'PRO',
    name: 'PRO',
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
    id: 'ENTERPRISE',
    name: 'ENTERPRISE',
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

export const AI_AUTOMATION_PACKAGES: AutomationPackageConfig[] = [
  {
    id: 'BASIC_AUTO',
    name: 'BASIC AUTOMATION',
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
    id: 'GROWTH_AUTO',
    name: 'GROWTH AUTOMATION',
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
    id: 'AI_CHATBOT',
    name: 'AI CHATBOT',
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
    id: 'BIZ_AUTO_PRO',
    name: 'BUSINESS AUTOMATION PRO',
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
    id: 'STARTER_WEB',
    name: 'STARTER WEBSITE',
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
    id: 'BUSINESS_WEB',
    name: 'BUSINESS WEBSITE',
    priceOneTime: 15000,
    isPopular: true, // Marked as "Most Popular" as requested
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
    id: 'ADVANCED_WEB',
    name: 'ADVANCED WEBSITE',
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
  id: 'AMAAS_WEBSITE_LITE',
  name: 'AMAAS Website Lite',
  priceMonthly: 600,
  badge: 'Best for Small Businesses',
  subtitle: 'Custom-designed business website for any industry or niche',
  description: 'Turnkey mobile-responsive online presence with included hosting and your own AMAAS subdomain. Zero upfront development fees.',
  subdomainFormat: 'yourbusiness.amaas.xyz',
  features: [
    'Custom-designed, mobile-responsive business website',
    'Free subdomain: yourbusiness.amaas.xyz',
    'Website hosting included',
    'Any business niche supported (restaurant, café, e-commerce catalog, gym, salon, real estate, agency, portfolio, and more)',
    'Business-specific layout, colors, and branding',
    'Home, About, Services/Products, Contact sections',
    'WhatsApp contact button',
    'Google Maps integration when relevant',
    'Contact or inquiry form',
    'Basic on-page SEO',
    'SSL/HTTPS where supported',
    'Hosting and basic technical maintenance',
    'Website content and business information update requests through GoAMAAS',
    'Easy upgrade to a custom domain or a higher-tier website plan',
  ],
  limits: {
    maxPages: 5,
    maxStorageMb: 1024,
    maxBandwidthGb: 25,
    monthlyUpdateRequests: 2,
    gracePeriodDays: 7,
  },
  disclosures: [
    'Charge ৳600 monthly, billed as a recurring subscription with zero upfront development fee.',
    'The free subdomain uses format businessname.amaas.xyz under AMAAS infrastructure. A custom domain (.com) is NOT included.',
    'Storage is capped at 1GB media storage, 25GB monthly bandwidth, and up to 2 content updates per month.',
    'If a subscription expires, website enters a 7-day grace period. Customer data and website configurations are preserved and NOT deleted immediately.',
    'Subdomain provisioning, SSL issuance, and live routing operate in sandbox mode until production DNS infrastructure is configured.',
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
    feature: 'Pricing Model',
    subscriptionPlan: '৳600 / month (recurring subscription)',
    oneTimePackages: '৳8,000 to ৳25,000 (one-time project fee)',
  },
  {
    feature: 'Upfront Development Cost',
    subscriptionPlan: '৳0 (Zero development fee)',
    oneTimePackages: 'Full project fee (৳8k – ৳25k)',
  },
  {
    feature: 'Domain Included',
    subscriptionPlan: 'Free subdomain (businessname.amaas.xyz)',
    oneTimePackages: 'Free 1st-year custom top-level domain (.com)',
  },
  {
    feature: 'Hosting & Maintenance',
    subscriptionPlan: 'Hosting & maintenance included in ৳600/mo',
    oneTimePackages: '1st year free, client renews annually thereafter',
  },
  {
    feature: 'Update & Content Requests',
    subscriptionPlan: 'Included via GoAMAAS (2 update requests/mo)',
    oneTimePackages: 'Self-managed CMS; agency requests billed separately',
  },
  {
    feature: 'Resource Limits',
    subscriptionPlan: '5 pages, 1GB media storage, 25GB bandwidth',
    oneTimePackages: 'Up to 15+ custom pages, standard hosting limits',
  },
  {
    feature: 'Custom Domain Upgrade',
    subscriptionPlan: 'Seamless upgrade available anytime',
    oneTimePackages: 'Custom domain integrated from Day 1',
  },
  {
    feature: 'Cancellation & Grace Period',
    subscriptionPlan: 'Cancel anytime. 7-day grace period; data never deleted immediately',
    oneTimePackages: 'One-time investment; client owns final website code',
  },
];
