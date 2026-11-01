import { BusinessNiche } from '../types';
import { DashboardPlanId, AutomationPackageId, WebsitePackageId } from './pricingConfig';

export type Language = 'en' | 'bn';

export interface LocalizedCategoryMeta {
  label: string;
  groupLabel: string;
  shortDesc: string;
  itemTypeLabel: string;
}

export interface TranslationDictionary {
  langCode: Language;
  langLabel: string;
  nav: {
    home: string;
    features: string;
    solutions: string;
    websiteBuilder: string;
    pricing: string;
    about: string;
    contact: string;
    login: string;
    createWebsite: string;
    startFreeTrial: string;
    goToDashboard: string;
    openDashboard: string;
    toggleTheme: string;
    toggleMenu: string;
    languageAria: string;
  };
  footer: {
    businessName: string;
    tagline: string;
    location: string;
    mobile: string;
    website: string;
    hotline: string;
    directionsLabel: string;
    colPlatform: string;
    colServices: string;
    colCompany: string;
    links: {
      orders: string;
      inventory: string;
      websiteBuilder: string;
      automations: string;
      courier: string;
      websitePlan: string;
      dashboardPlans: string;
      customWeb: string;
      aiPackages: string;
      industrySolutions: string;
      about: string;
      contact: string;
      merchantLogin: string;
      freeTrial: string;
    };
    subdomainNote: string;
    copyright: string;
    badgeSecurity: string;
    badgeBangladesh: string;
  };
  home: {
    seoTitle: string;
    seoDescription: string;
    hero: {
      eyebrow: string;
      headline: string;
      headlineAccent: string;
      leadBold: string;
      subheadline: string;
      primaryCta: string;
      secondaryCta: string;
      pricingTeaserPrefix: string;
      pricingTeaserHighlight: string;
      pricingTeaserSubdomain: string;
      pricingTeaserCustomDomain: string;
      mockup: {
        viewDashboardTab: string;
        viewStorefrontTab: string;
        dashboardTitle: string;
        liveBadge: string;
        navOverview: string;
        navProducts: string;
        navOrders: string;
        navWebsite: string;
        navBilling: string;
        kpiStoreStatusLabel: string;
        kpiStoreStatusValue: string;
        kpiOrdersLabel: string;
        kpiOrdersValue: string;
        kpiCatalogLabel: string;
        kpiCatalogValue: string;
        recentOrdersTitle: string;
        recentOrdersSync: string;
        orderColId: string;
        orderColItem: string;
        orderColMethod: string;
        orderColStatus: string;
        statusConfirmed: string;
        statusDispatched: string;
        statusPending: string;
        channelWebsite: string;
        channelWhatsapp: string;
        channelCod: string;
        storefrontBadge: string;
        storefrontName: string;
        storefrontTagline: string;
        product1Name: string;
        product1Tag: string;
        product2Name: string;
        product2Tag: string;
        product3Name: string;
        orderNowBtn: string;
        mobileReadyLabel: string;
      };
    };
    valueProp: {
      eyebrow: string;
      title: string;
      subtitle: string;
      pillars: Array<{
        title: string;
        desc: string;
      }>;
    };
    howItWorks: {
      eyebrow: string;
      title: string;
      subtitle: string;
      cta: string;
      steps: Array<{
        step: string;
        title: string;
        desc: string;
      }>;
    };
    featureShowcase: {
      eyebrow: string;
      title: string;
      subtitle: string;
      tabs: Array<{
        id: 'builder' | 'orders' | 'inventory' | 'automation';
        label: string;
        kicker: string;
        heading: string;
        description: string;
        bullets: string[];
        panelTitle: string;
        panelSubtitle: string;
        metrics: Array<{ label: string; value: string }>;
      }>;
    };
    storefrontPreview: {
      eyebrow: string;
      title: string;
      subtitle: string;
      desktopLabel: string;
      mobileLabel: string;
      launchThisStyle: string;
      codBadge: string;
      whatsappBtn: string;
      niches: Array<{
        id: 'fashion' | 'electronics' | 'food';
        tabLabel: string;
        storeName: string;
        subdomain: string;
        accentHex: string;
        heroTitle: string;
        heroSubtitle: string;
        ctaLabel: string;
        products: Array<{
          name: string;
          price: string;
          meta: string;
        }>;
      }>;
    };
    management: {
      eyebrow: string;
      title: string;
      subtitle: string;
      cards: Array<{
        tag: string;
        title: string;
        desc: string;
        detail: string;
      }>;
    };
    pricing: {
      eyebrow: string;
      title: string;
      subtitle: string;
      websiteCard: {
        badge: string;
        planLabel: string;
        name: string;
        priceSuffix: string;
        zeroUpfront: string;
        description: string;
        subdomainBoxLabel: string;
        customDomainNote: string;
        features: string[];
        cta: string;
      };
      dashboardSection: {
        label: string;
        trialBadge: string;
        perMonth: string;
        popularBadge: string;
        cta: string;
        compareAllCta: string;
      };
    };
    faq: {
      eyebrow: string;
      title: string;
      subtitle: string;
      items: Array<{
        q: string;
        a: string;
      }>;
    };
    finalCta: {
      eyebrow: string;
      title: string;
      subtitle: string;
      primaryCta: string;
      secondaryCta: string;
      footnote: string;
    };
  };
  featuresPage: {
    seoTitle: string;
    seoDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    cards: Array<{
      title: string;
      desc: string;
      highlights: string[];
    }>;
    ctaTitle: string;
    ctaSubtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  solutionsPage: {
    seoTitle: string;
    seoDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    industries: Array<{
      title: string;
      tagline: string;
      points: string[];
    }>;
    bannerBadge: string;
    bannerTitle: string;
    bannerDesc: string;
    bannerPrimaryCta: string;
    bannerSecondaryCta: string;
  };
  pricingPage: {
    seoTitle: string;
    seoDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    tabs: {
      websiteSub: string;
      dashboard: string;
      automations: string;
      customWeb: string;
    };
    common: {
      perMonth: string;
      mostPopular: string;
      recommended: string;
      freeTrialBadge: string;
      currentlyUnavailable: string;
      currentActivePlan: string;
      cancel: string;
      included: string;
      unlimited: string;
      whenConfigured: string;
      sevenDaysFree: string;
    };
    dashboardTab: {
      kicker: string;
      subnote: string;
      integrationNoteLabel: string;
      integrationNoteBody: string;
      plans: Record<
        DashboardPlanId,
        {
          name: string;
          subtitle: string;
          description: string;
          features: string[];
          ctaLabel: string;
        }
      >;
    };
    automationsTab: {
      kicker: string;
      subnote: string;
      disclosureTitle: string;
      disclosureBody: string;
      packages: Record<
        AutomationPackageId,
        {
          name: string;
          setupFeeLabel: string;
          description: string;
          features: string[];
          ctaLabel: string;
        }
      >;
    };
    webSubTab: {
      kicker: string;
      title: string;
      subtitlePrefix: string;
      subtitleSuffix: string;
      bestBadge: string;
      planTypeLabel: string;
      planSubtitle: string;
      zeroUpfront: string;
      freeSubdomainLabel: string;
      customDomainSeparate: string;
      includedHeading: string;
      features: string[];
      limitsHeading: string;
      limitPages: string;
      limitPagesVal: (n: number) => string;
      limitStorage: string;
      limitStorageVal: (mb: number) => string;
      limitBandwidth: string;
      limitBandwidthVal: (gb: number) => string;
      limitUpdates: string;
      limitUpdatesVal: (n: number) => string;
      startCta: (price: number) => string;
      startSubnote: string;
      howKicker: string;
      howTitle: string;
      howSteps: Array<{ title: string; desc: string }>;
      compKicker: string;
      compTitle: string;
      compSubtitle: string;
      compColFeature: string;
      compColSub: string;
      compColOneTime: string;
      compRows: Array<{
        feature: string;
        subscriptionPlan: string;
        oneTimePackages: string;
      }>;
      termsHeading: string;
      disclosures: string[];
    };
    customWebTab: {
      kicker: string;
      subnote: string;
      oneTimeFeeLabel: string;
      packages: Record<
        WebsitePackageId,
        {
          name: string;
          description: string;
          estimatedTimeline: string;
          domainHostingBenefit: string;
          features: string[];
          scopeNote: string;
          ctaLabel: string;
        }
      >;
    };
    matrix: {
      title: string;
      subtitle: string;
      colCapability: string;
      rows: Array<{
        label: string;
        starter: string;
        business: string;
        pro: string;
        enterprise: string;
      }>;
    };
    commercialDisclosuresTitle: string;
    commercialDisclosures: string[];
    faqTitle: string;
    faqSubtitle: string;
    faqs: Array<{ q: string; a: string }>;
    modals: {
      confirmPlanTitle: (name: string) => string;
      billingType: string;
      monthlySubscription: string;
      subscriptionPrice: string;
      trialPeriod: string;
      includedFeatures: string;
      confirmApplyPlan: string;
      proceedTrialSignup: string;
      confirmAutoTitle: (name: string) => string;
      monthlyManagedFee: string;
      serviceFee: string;
      setupFee: string;
      metaBillingNote: string;
      submitSetupRequest: string;
      autoToastSuccess: (name: string) => string;
      webBriefTitle: (name: string) => string;
      oneTimeProjectFee: string;
      totalProjectPrice: string;
      hostingAndDomain: string;
      hostingSetupIncluded: string;
      timeline: string;
      webBriefHelper: string;
      proceedRequirements: string;
    };
  };
  aboutPage: {
    seoTitle: string;
    seoDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    storyTitle: string;
    storyP1: string;
    storyP2: string;
    stat1Val: string;
    stat1Label: string;
    stat2Val: string;
    stat2Label: string;
    founderRole: string;
    founderQuote: string;
    values: Array<{ title: string; desc: string }>;
    hqTitle: string;
    hqSubtitle: string;
    hqCta: string;
    hqDirectionsCta: string;
  };
  contactPage: {
    seoTitle: string;
    seoDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    directChannels: string;
    headOffice: string;
    headOfficeVal: string;
    directionsLabel: string;
    officialWebsiteLabel: string;
    engSales: string;
    hotlineLabel: string;
    hotlineVal: string;
    techSupport: string;
    techSupportVal: string;
    customWebPromptPrefix: string;
    customWebPromptLink: string;
    formTitle: string;
    fullName: string;
    fullNamePlaceholder: string;
    businessEmail: string;
    phoneWhatsapp: string;
    topic: string;
    topics: Array<{ value: string; label: string }>;
    message: string;
    messagePlaceholder: string;
    sending: string;
    sendMessage: string;
    receivedTitle: string;
    receivedBody: (name: string, email: string) => string;
    sendAnother: string;
    toastRequired: string;
    toastDelivered: string;
  };
  createWebsitePage: {
    seoTitle: string;
    seoDescription: string;
    planBarPeriod: string;
    openVisualEditor: string;
    steps: [string, string, string, string, string];
    stepOf: (current: number, total: number) => string;
    groups: Record<string, string>;
    categories: Record<BusinessNiche, LocalizedCategoryMeta>;
    step1: {
      title: string;
      subtitle: string;
      searchPlaceholder: string;
      selectContinue: string;
    };
    step2: {
      title: string;
      subtitlePrefix: string;
      subtitleSuffix: string;
      businessNameLabel: string;
      businessNamePlaceholder: string;
      subdomainLabel: string;
      subdomainReserved: (sub: string) => string;
      subdomainChecking: string;
      subdomainAvailable: (sub: string) => string;
      subdomainMinChars: string;
      subdomainTaken: string;
      subdomainVerifyError: string;
      customDomainLabel: string;
      customDomainPlaceholder: string;
      customDomainNote: string;
      phoneLabel: string;
      whatsappLabel: string;
      emailLabel: string;
      addressLabel: string;
      addressPlaceholder: string;
      facebookLabel: string;
      instagramLabel: string;
      heroHeadlineLabel: string;
      heroSubheadlineLabel: string;
      primaryCtaTextLabel: string;
      primaryCtaDestLabel: string;
      destWhatsapp: string;
      destCatalog: string;
      destContact: string;
      destAbout: string;
      changeCategory: string;
      continueProducts: string;
    };
    step3: {
      title: (itemType: string) => string;
      subtitle: string;
      itemNumber: (n: number) => string;
      removeItemTitle: string;
      itemNameLabel: string;
      priceLabel: string;
      descLabel: string;
      photoAttached: string;
      uploading: string;
      uploadProductImage: string;
      addAnother: string;
      back: string;
      continueDesign: string;
    };
    step4: {
      subtitleBadge: string;
      title: string;
      subtitle: string;
      logoLabel: string;
      removeLogo: string;
      uploadLogo: string;
      heroImageLabel: string;
      removeHero: string;
      uploadHero: string;
      heroLayoutLabel: string;
      layoutSplit: string;
      layoutCentered: string;
      layoutCover: string;
      typographyLabel: string;
      fontModern: string;
      fontEditorial: string;
      fontBold: string;
      fontMinimal: string;
      buttonsLabel: string;
      btnRounded: string;
      btnPill: string;
      btnSharp: string;
      livePreviewLabel: string;
      desktop: string;
      mobile: string;
      saveErrorTitle: string;
      savingWebsite: string;
      saveAndProceed: string;
    };
    step5: {
      title: string;
      savedAtPrefix: string;
      autoPublishTitle: (planName: string) => string;
      autoPublishBody: (fee: number, domain: string) => string;
      billingPeriod30: string;
      perMonth: string;
      bullet1: (domain: string) => string;
      bullet2: string;
      bullet3: string;
      bullet4: string;
      submitPaymentBtn: (fee: number) => string;
      openEditorBtn: string;
      customDomainTitle: string;
      customDomainBody: string;
      whatsappSupport: string;
      supportDesk: string;
      paymentSubmittedToast: string;
    };
    toasts: {
      signInUpload: string;
      uploadFailed: string;
      uploadSuccess: string;
      keepOneItem: string;
      signInSave: string;
      enterBusinessName: string;
      checkingSubdomain: string;
      chooseValidSubdomain: string;
      itemNeedsName: (index: number) => string;
    };
  };
  auth: {
    backToHome: string;
    continueWithGoogle: string;
    connectingGoogle: string;
    supabaseNeededOAuth: string;
    oauthModalTitle: string;
    oauthModalSubtitle: string;
    oauthModalIntro: string;
    missingEnvVars: string;
    setupInstructions: string;
    understood: string;
    close: string;
    login: {
      seoTitle: string;
      title: string;
      subtitle: string;
      orEmail: string;
      emailLabel: string;
      passwordLabel: string;
      forgotPassword: string;
      authenticating: string;
      signInBtn: string;
      noAccount: string;
      startTrialLink: string;
      errMissingFields: string;
    };
    register: {
      seoTitle: string;
      title: string;
      subtitle: string;
      orEmail: string;
      fullNameLabel: string;
      fullNamePlaceholder: string;
      storeNameLabel: string;
      storeNamePlaceholder: string;
      emailLabel: string;
      passwordLabel: string;
      passwordPlaceholder: string;
      creatingWorkspace: string;
      launchTrialBtn: string;
      perk1: string;
      perk2: string;
      haveAccount: string;
      loginLink: string;
      verifyTitle: string;
      verifyBody: (email: string) => string;
      sending: string;
      resendEmail: string;
      returnSignIn: string;
      errRequired: string;
      errPasswordLength: string;
    };
    forgot: {
      seoTitle: string;
      title: string;
      subtitle: string;
      supabaseResetBanner: string;
      viewSetupDetails: string;
      sentTitle: string;
      sentBody: (email: string) => string;
      returnSignIn: string;
      emailLabel: string;
      sendingLink: string;
      sendInstructionsBtn: string;
      backToLogin: string;
      errEmailRequired: string;
    };
    reset: {
      seoTitle: string;
      title: string;
      subtitle: string;
      successTitle: string;
      successBody: string;
      proceedSignIn: string;
      newPasswordLabel: string;
      confirmPasswordLabel: string;
      confirmPlaceholder: string;
      updating: string;
      savePasswordBtn: string;
      backToSignIn: string;
      errExpiredLink: string;
      errPasswordLength: string;
      errMismatch: string;
      errNoSupabase: string;
      toastUpdated: string;
    };
  };
  paymentModal: {
    title: string;
    description: string;
    targetWebsiteLabel: string;
    websiteSubscriptionLabel: string;
    selectedPlanLabel: string;
    exactPayableLabel: string;
    pendingAlreadyTitle: string;
    pendingAlreadyBody: string;
    statusLabel: string;
    statusPendingBadge: string;
    statusApprovedBadge: string;
    statusApprovedBody: string;
    statusRejectedBadge: string;
    statusRejectedReasonLabel: string;
    statusRejectedResubmitHint: string;
    step1ChooseMethod: string;
    sendMoney: string;
    unavailable: string;
    bankAc: string;
    copied: string;
    copyNumber: string;
    copyAc: string;
    copiedToast: string;
    copiedAccountSuccess: (account: string) => string;
    bkashUnavailableTitle: string;
    bkashUnavailableBody: string;
    recipientBkashLabel: string;
    bkashDefaultInstruction: (amountStr: string) => string;
    nagadUnavailableTitle: string;
    nagadUnavailableBody: string;
    recipientNagadLabel: string;
    nagadAccountTypeBadge: string;
    nagadStepsTitle: string;
    nagadManualOnlyNote: string;
    bankUnavailableTitle: string;
    bankUnavailableBody: string;
    bankNameLabel: string;
    accountNameLabel: string;
    recipientAcNumberLabel: string;
    branchLabel: string;
    routingLabel: string;
    depositSlipSupportLabel: string;
    depositSlipSupportBody: string;
    step2ProofTitle: string;
    trxIdBankLabel: string;
    trxIdWalletLabel: string;
    trxPlaceholderBank: string;
    trxPlaceholderNagad: string;
    trxPlaceholderBkash: string;
    duplicateTrxWarning: string;
    senderPhoneBankLabel: string;
    senderPhoneWalletLabel: (method: string) => string;
    payableAmountInputLabel: string;
    relatedPlanInputLabel: string;
    senderBankOptional: string;
    senderHolderOptional: string;
    cancel: string;
    submitVerificationBtn: (amountStr: string) => string;
    statusFooterNote: string;
    errors: {
      invalidPrice: string;
      bkashUnavailable: string;
      nagadUnavailable: string;
      bankUnavailable: string;
      requiredFields: string;
      duplicateTrx: (trx: string) => string;
      alreadyPending: string;
      submitFailed: string;
    };
  };
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    langCode: 'en',
    langLabel: 'English',
    nav: {
      home: 'Home',
      features: 'Features',
      solutions: 'Solutions',
      websiteBuilder: 'Website Builder',
      pricing: 'Pricing',
      about: 'About',
      contact: 'Contact',
      login: 'Log In',
      createWebsite: 'Create Your Website',
      startFreeTrial: 'Start Free Trial',
      goToDashboard: 'Dashboard',
      openDashboard: 'Open Dashboard',
      toggleTheme: 'Toggle color theme',
      toggleMenu: 'Toggle navigation menu',
      languageAria: 'Switch site language',
    },
    footer: {
      businessName: 'AMAAS Technologies',
      tagline:
        'Modern website creation and business management software engineered by AMAAS Technologies for Bangladeshi entrepreneurs and growing brands.',
      location: 'Fulbarigate, KUET-9203, Khulna, Bangladesh',
      mobile: '+8801605012812',
      website: 'https://amaas.xyz',
      hotline: '+8801605012812 · Sat–Thu (10:00 AM – 8:00 PM)',
      directionsLabel: 'Get Directions on Google Maps',
      colPlatform: 'Platform',
      colServices: 'Plans & Services',
      colCompany: 'Company',
      links: {
        orders: 'Multi-Channel Order Hub',
        inventory: 'Inventory & Stock Ledger',
        websiteBuilder: 'Visual Website Builder',
        automations: 'AI Automation Workflows',
        courier: 'Courier Dispatch Workflows',
        websitePlan: 'GoAMAAS Website (৳600/mo)',
        dashboardPlans: 'Dashboard Plans (from ৳299)',
        customWeb: 'Custom Web Engineering (from ৳8,000)',
        aiPackages: 'Managed AI Packages',
        industrySolutions: 'Industry Solutions',
        about: 'About AMAAS',
        contact: 'Contact Team',
        merchantLogin: 'Merchant Sign In',
        freeTrial: '7-Day Dashboard Trial',
      },
      subdomainNote:
        'Free businessname.amaas.xyz subdomain & GoAMAAS hosting included with Website Subscription · Custom domain registration billed separately.',
      copyright: 'AMAAS Technologies. All rights reserved.',
      badgeSecurity: 'Tenant-Isolated Cloud Architecture',
      badgeBangladesh: 'Built for Bangladesh Commerce',
    },
    home: {
      seoTitle: 'GoAMAAS — Create Your Business Website & Manage Orders Online',
      seoDescription:
        'Launch your business website on GoAMAAS for ৳600/month with free GoAMAAS cloud hosting and a free businessname.amaas.xyz subdomain, plus unified product, order, and inventory management.',
      hero: {
        eyebrow: 'AMAAS Technologies · Website & Commerce OS',
        headline: 'Create and run your business website',
        headlineAccent: 'without technical complexity.',
        leadBold: 'All-in-one storefront & commerce operations for Bangladesh.',
        subheadline:
          'Launch a fast mobile-ready storefront, accept Cash on Delivery and WhatsApp orders, track inventory, and manage billing via bKash, Nagad, or Bank Transfer from one clean workspace.',
        primaryCta: 'Create Your Website',
        secondaryCta: 'Explore Features',
        pricingTeaserPrefix: 'Website subscription',
        pricingTeaserHighlight: '৳600 / month',
        pricingTeaserSubdomain: 'Includes free businessname.amaas.xyz subdomain & GoAMAAS cloud hosting.',
        pricingTeaserCustomDomain: 'Custom domain (.com / .bd) supported — domain registration billed separately.',
        mockup: {
          viewDashboardTab: 'Merchant Dashboard',
          viewStorefrontTab: 'Mobile Storefront',
          dashboardTitle: 'GoAMAAS Merchant Workspace',
          liveBadge: 'LIVE · urbanloom.amaas.xyz',
          navOverview: 'Overview',
          navProducts: 'Products',
          navOrders: 'Orders',
          navWebsite: 'Website Editor',
          navBilling: 'Billing',
          kpiStoreStatusLabel: 'Storefront Status',
          kpiStoreStatusValue: 'Published · SSL Active',
          kpiOrdersLabel: 'Active Queue',
          kpiOrdersValue: '18 Orders',
          kpiCatalogLabel: 'Synced Catalog',
          kpiCatalogValue: '42 Items In Stock',
          recentOrdersTitle: 'Live Storefront & Social Orders',
          recentOrdersSync: 'Real-time catalog sync',
          orderColId: 'Order',
          orderColItem: 'Product',
          orderColMethod: 'Channel',
          orderColStatus: 'Stage',
          statusConfirmed: 'Confirmed',
          statusDispatched: 'Courier Ready',
          statusPending: 'New COD',
          channelWebsite: 'Website',
          channelWhatsapp: 'WhatsApp',
          channelCod: 'Website COD',
          storefrontBadge: 'Mobile Storefront Preview',
          storefrontName: 'Urban Loom Dhaka',
          storefrontTagline: 'Handcrafted Linen & Everyday Essentials',
          product1Name: 'Stitched Cotton Panjabi',
          product1Tag: 'Sizes M · L · XL',
          product2Name: 'Handloom Muslin Scarf',
          product2Tag: 'Ready to Ship',
          product3Name: 'Classic Oxford Shirt',
          orderNowBtn: 'Order via Website / WhatsApp',
          mobileReadyLabel: 'Responsive on every phone',
        },
      },
      valueProp: {
        eyebrow: 'Why Entrepreneurs Choose GoAMAAS',
        title: 'Everything required to move beyond scattered inbox orders.',
        subtitle:
          'Stop losing buyers in unorganized chat threads and spreadsheets. Present a credible storefront and run daily operations with clarity.',
        pillars: [
          {
            title: 'Zero Upfront Website Engineering Cost',
            desc: 'Launch with a predictable ৳600/month 30-day subscription instead of paying tens of thousands upfront before validating your store.',
          },
          {
            title: 'Free AMAAS Subdomain & Cloud Hosting',
            desc: 'Get your businessname.amaas.xyz address and GoAMAAS cloud hosting immediately, with optional custom domain connection whenever you are ready.',
          },
          {
            title: 'Tailored for Local Bangladeshi Commerce',
            desc: 'Designed around Cash on Delivery, direct WhatsApp inquiries, bKash, Nagad, Bank Transfer billing, and local courier workflows.',
          },
          {
            title: 'Instant Edits Without Developers',
            desc: 'Update product photos, prices, banners, and business contact details from your phone or laptop and publish changes anytime.',
          },
        ],
      },
      howItWorks: {
        eyebrow: 'How GoAMAAS Works',
        title: 'From business idea to live website in three clear steps.',
        subtitle:
          'No coding, server setup, or complicated plugins. Follow a guided setup built for busy store owners.',
        cta: 'Start Building Now',
        steps: [
          {
            step: '01',
            title: 'Choose your business category & brand identity',
            desc: 'Pick a layout tailored for e-commerce, fashion, food, clinic, salon, or services, then claim your free businessname.amaas.xyz subdomain.',
          },
          {
            step: '02',
            title: 'Add products, photos, and contact channels',
            desc: 'Upload your logo, hero banner, and product catalog with BDT (৳) pricing and direct WhatsApp or phone ordering links.',
          },
          {
            step: '03',
            title: 'Submit verified payment & publish live',
            desc: 'Submit your ৳600/month payment via bKash, Nagad Personal, or Bank Transfer. Once verified, your website publishes live automatically.',
          },
        ],
      },
      featureShowcase: {
        eyebrow: 'Platform Capabilities',
        title: 'One unified operating system for your storefront and back-office.',
        subtitle:
          'Explore how GoAMAAS connects your public website with product, order, and customer workflows.',
        tabs: [
          {
            id: 'builder',
            label: 'Visual Website Builder',
            kicker: 'Self-Service Storefront Engine',
            heading: 'Design, preview, and update your website in minutes.',
            description:
              'Switch between desktop and mobile previews in real time, customize colors and typography, upload product photography, and keep full control of your brand.',
            bullets: [
              'Live desktop & mobile viewport switcher before publishing',
              'Cloud media storage for logos, hero banners, and product photos',
              'Optional custom domain CNAME routing alongside free .amaas.xyz subdomain',
            ],
            panelTitle: 'Visual Theme & Catalog Workspace',
            panelSubtitle: 'Instant draft saving & one-click live updates',
            metrics: [
              { label: 'Hosting & SSL', value: 'Included on GoAMAAS' },
              { label: 'Subdomain Format', value: 'name.amaas.xyz' },
              { label: 'Layout Modes', value: 'Split · Centered · Cover' },
            ],
          },
          {
            id: 'orders',
            label: 'Order & Courier Hub',
            kicker: 'Centralized Fulfillment Pipeline',
            heading: 'Track every order from placement to doorstep delivery.',
            description:
              'Organize website, Messenger, and WhatsApp orders in a structured pipeline with status stages, printable invoices, and CSV exports.',
            bullets: [
              'Clear status workflow: Pending, Confirmed, Shipped, Delivered',
              'Customer order history and delivery address records',
              'Courier dispatch support for Steadfast, Pathao & RedX when configured',
            ],
            panelTitle: 'Multi-Channel Order Pipeline',
            panelSubtitle: 'Structured stages & invoice generation',
            metrics: [
              { label: 'Order Channels', value: 'Web · WhatsApp · Social' },
              { label: 'Data Export', value: 'CSV / Accounting Ready' },
              { label: 'Courier Sync', value: 'Configurable API Keys' },
            ],
          },
          {
            id: 'inventory',
            label: 'Catalog & Inventory',
            kicker: 'Real-Time Stock Discipline',
            heading: 'Know exactly what is in stock before promising delivery.',
            description:
              'Maintain accurate SKU prices, cost margins, visibility toggles, and low-stock alerts with recorded adjustment logs.',
            bullets: [
              'Synced product catalog across workspace and website',
              'Configurable low-stock threshold alerts',
              'Audit log for stock additions, sales, and manual adjustments',
            ],
            panelTitle: 'Inventory & SKU Ledger',
            panelSubtitle: 'Prevent overselling during peak campaigns',
            metrics: [
              { label: 'Visibility Control', value: 'Active / Draft Toggle' },
              { label: 'Stock Alerts', value: 'Custom Thresholds' },
              { label: 'Audit History', value: 'Timestamped Logs' },
            ],
          },
          {
            id: 'automation',
            label: 'AI & Landing Pages',
            kicker: 'Campaign & Inquiry Tools',
            heading: 'Build focused campaign pages and optional automated workflows.',
            description:
              'Launch single-product campaign landing pages inside your dashboard or request managed Messenger/WhatsApp automation packages as you scale.',
            bullets: [
              'Focused campaign landing page builder with COD order forms',
              'Optional managed AI workflow packages for Messenger or WhatsApp',
              'Transparent separation between software fees and provider API charges',
            ],
            panelTitle: 'Growth & Campaign Studio',
            panelSubtitle: 'Modular tools ready when your business expands',
            metrics: [
              { label: 'Landing Pages', value: 'Mobile-First Templates' },
              { label: 'Checkout Flow', value: 'Direct COD & Inquiry' },
              { label: 'AI Packages', value: 'Optional Managed Add-ons' },
            ],
          },
        ],
      },
      storefrontPreview: {
        eyebrow: 'Interactive Storefront Preview',
        title: 'See how your business looks across industries and devices.',
        subtitle:
          'Switch between sample business categories and inspect desktop and mobile layouts.',
        desktopLabel: 'Desktop View',
        mobileLabel: 'Mobile View',
        launchThisStyle: 'Build with this style',
        codBadge: 'Cash on Delivery & Direct Inquiry Ready',
        whatsappBtn: 'Order Now',
        niches: [
          {
            id: 'fashion',
            tabLabel: 'Apparel & Boutique',
            storeName: 'Noor Atelier',
            subdomain: 'nooratelier.amaas.xyz',
            accentHex: '#2563EB',
            heroTitle: 'Festive & Everyday Handcrafted Wear',
            heroSubtitle: 'Breathable natural fabrics tailored in Dhaka with nationwide delivery.',
            ctaLabel: 'Browse New Collection',
            products: [
              { name: 'Embroidered Cotton Kurti', price: '৳2,450', meta: 'Sizes S – XXL · In Stock' },
              { name: 'Textured Linen Panjabi', price: '৳2,950', meta: '100% Pure Linen · Ready' },
              { name: 'Handwoven Jamdani Dupatta', price: '৳3,600', meta: 'Artisan Weave · Limited' },
            ],
          },
          {
            id: 'electronics',
            tabLabel: 'Gadgets & Accessories',
            storeName: 'VoltGear BD',
            subdomain: 'voltgear.amaas.xyz',
            accentHex: '#0F172A',
            heroTitle: 'Verified Audio, Charging & Desk Gear',
            heroSubtitle: 'Official warranty coverage with fast dispatch inside and outside Dhaka.',
            ctaLabel: 'Shop Accessories',
            products: [
              { name: '65W GaN Fast Charger', price: '৳2,190', meta: 'Dual Type-C · 6M Warranty' },
              { name: 'ANC Wireless Earbuds', price: '৳3,490', meta: 'Bluetooth 5.3 · 32h Battery' },
              { name: 'Aluminum Laptop Stand', price: '৳1,650', meta: 'Ergonomic Fold · Silver' },
            ],
          },
          {
            id: 'food',
            tabLabel: 'Gourmet & Organic Food',
            storeName: 'PureHarvest',
            subdomain: 'pureharvest.amaas.xyz',
            accentHex: '#059669',
            heroTitle: 'Pure Sundarbans Honey, Ghee & Artisanal Pantry',
            heroSubtitle: 'Lab-checked batches packed in sealed glass jars for family kitchens.',
            ctaLabel: 'Order Fresh Batch',
            products: [
              { name: 'Raw Sundarbans Khalisha Honey', price: '৳1,150', meta: '500g Glass Jar · Pure' },
              { name: 'Pabna Desi Cow Ghee', price: '৳1,480', meta: '400g · Small Batch' },
              { name: 'Cold-Pressed Mustard Oil', price: '৳420', meta: '1 Liter · Wood Pressed' },
            ],
          },
        ],
      },
      management: {
        eyebrow: 'Website & Business Management',
        title: 'Engineered for calm, reliable daily operations.',
        subtitle:
          'Every screen is structured so business owners and staff can act quickly on phones or desktops.',
        cards: [
          {
            tag: 'Catalog & Media',
            title: 'Structured Product & Offering Control',
            desc: 'Upload crisp product photos, set BDT prices, write clear descriptions, and toggle item visibility whenever stock changes.',
            detail: 'Up to 10 pages/sections & 1 GB cloud media storage included in Website Subscription.',
          },
          {
            tag: 'Local Payments',
            title: 'Transparent Manual Billing Verification',
            desc: 'Pay subscriptions via bKash, Nagad Personal, or Official Bank Transfer with clear Transaction ID tracking and status visibility.',
            detail: 'Every payment displays Pending Verification, Approved, or Rejected status clearly.',
          },
          {
            tag: 'Mobile-First UX',
            title: 'Manage Your Storefront from Anywhere',
            desc: 'Both your public customer website and your merchant dashboard adapt cleanly to 375px mobile screens, tablets, and desktops.',
            detail: 'Touch-friendly controls and fast load performance on mobile networks.',
          },
          {
            tag: 'Domain Flexibility',
            title: 'Start Free on .amaas.xyz, Add Custom Domain Anytime',
            desc: 'Publish immediately on your free businessname.amaas.xyz subdomain, and connect your own .com or .bd domain whenever needed.',
            detail: 'GoAMAAS hosting included; custom domain registration is paid separately to your registrar.',
          },
        ],
      },
      pricing: {
        eyebrow: 'Simple, Honest Pricing',
        title: 'Clear Bangladeshi Taka (৳) plans with zero hidden surprises.',
        subtitle:
          'Start with the ৳600/month Website Subscription, or pair it with a GoAMAAS Dashboard plan featuring a 7-day free trial.',
        websiteCard: {
          badge: 'Most Popular for Online Sellers',
          planLabel: 'All-Inclusive Website Subscription',
          name: 'GoAMAAS Website',
          priceSuffix: '/ month (30 days)',
          zeroUpfront: '৳0 Upfront Development Fee',
          description:
            'Build, host, and manage your complete business website with visual editing and product catalog support.',
          subdomainBoxLabel: 'Free Subdomain & GoAMAAS Cloud Hosting Included',
          customDomainNote: 'Optional custom domain supported (domain registration billed separately)',
          features: [
            'Self-service visual website builder (logo, hero, theme & catalog)',
            'Free businessname.amaas.xyz subdomain',
            'Free cloud hosting on GoAMAAS infrastructure',
            'Responsive mobile & desktop storefront with WhatsApp ordering',
            'Automatic live publishing upon payment verification',
            '7-day grace period with full data preservation on renewal',
          ],
          cta: 'Create Your Website — ৳600/mo',
        },
        dashboardSection: {
          label: 'Merchant Operations Dashboard Plans',
          trialBadge: '7-Day Free Trial',
          perMonth: '/ mo',
          popularBadge: 'Popular',
          cta: 'Start 7-Day Trial',
          compareAllCta: 'Compare All Plans, AI & Custom Packages',
        },
      },
      faq: {
        eyebrow: 'Frequently Asked Questions',
        title: 'Straightforward answers before you get started.',
        subtitle: 'Clear details on pricing, domains, hosting, and payment verification.',
        items: [
          {
            q: 'Do I need coding or technical skills to create a GoAMAAS website?',
            a: 'No. GoAMAAS provides a guided 5-step website builder where you choose your business category, enter your brand name, upload product photos, preview desktop and mobile layouts, and publish without writing code.',
          },
          {
            q: 'What is included in the ৳600/month GoAMAAS Website subscription?',
            a: 'Your ৳600/month (30-day) subscription includes the visual website builder, product catalog management, free cloud hosting on GoAMAAS infrastructure, SSL support, and a free businessname.amaas.xyz subdomain with zero upfront development fee.',
          },
          {
            q: 'Is a custom domain (.com / .bd) free, or billed separately?',
            a: 'Your businessname.amaas.xyz subdomain and GoAMAAS cloud hosting are included at no extra cost. If you want to use your own custom domain (such as yourbrand.com), custom domain connection is supported, while domain registration and annual renewal fees are paid separately to your domain registrar.',
          },
          {
            q: 'How do bKash, Nagad Personal, and Bank Transfer payments work?',
            a: 'When activating or renewing a plan, select bKash, Nagad Personal (Send Money to the displayed recipient number), or Bank Transfer, send the exact displayed BDT amount, and submit your Transaction ID (TrxID) and sender phone number. Your payment enters Pending Verification and activates your subscription automatically once verified.',
          },
          {
            q: 'How does the 7-day free trial work for Dashboard plans?',
            a: 'All four Merchant Dashboard tiers (Starter ৳299, Business ৳599, Pro ৳999, and Enterprise ৳1,999) include a 7-day free trial so you can evaluate order tracking, inventory management, and analytics before paying.',
          },
          {
            q: 'What happens if my monthly website subscription reaches its end date?',
            a: 'Your website enters a 7-day grace period so you have time to submit a renewal payment without losing your catalog, photos, or settings. Even after expiry, your saved configuration remains preserved.',
          },
        ],
      },
      finalCta: {
        eyebrow: 'Ready to Launch Online?',
        title: 'Give your business a credible, fast website today.',
        subtitle:
          'Set up your storefront in minutes, claim your free .amaas.xyz address, and manage products and orders with confidence.',
        primaryCta: 'Create Your Website',
        secondaryCta: 'Talk to Our Team',
        footnote: '৳600/month website plan · Free .amaas.xyz subdomain & GoAMAAS hosting · Manual bKash, Nagad & Bank support',
      },
    },
    featuresPage: {
      seoTitle: 'Platform Features — GoAMAAS Website & Business Operations',
      seoDescription:
        'Explore GoAMAAS platform features: visual website builder, multi-channel order hub, inventory tracking, landing pages, analytics, and custom web engineering.',
      eyebrow: 'Platform Capabilities',
      title: 'Engineered for clarity, speed, and disciplined retail operations.',
      subtitle:
        'Every module in GoAMAAS is built to replace scattered chats and manual spreadsheets with a unified workspace.',
      cards: [
        {
          title: 'Unified Multi-Channel Order Hub',
          desc: 'Manage orders from your GoAMAAS website, Messenger, WhatsApp, and campaign pages in one clean table with invoice printing and status tracking.',
          highlights: [
            'Structured order pipeline (Pending → Confirmed → Shipped → Delivered)',
            'Courier dispatch workflow for Steadfast, Pathao & RedX (when configured)',
            'Customer purchase history and repeat buyer visibility',
            'CSV export for accounting and fulfillment teams',
          ],
        },
        {
          title: 'Real-Time Inventory & Stock Ledger',
          desc: 'Maintain accurate stock counts across your catalog. Low-stock alerts help prevent overselling, while movement logs record every adjustment.',
          highlights: [
            'Configurable low-stock warning thresholds per SKU',
            'Timestamped audit history for restocks and sales',
            'Multi-branch support on Enterprise plans',
            'Instant stock increment/decrement controls',
          ],
        },
        {
          title: 'Self-Service Website & Landing Page Builder',
          desc: 'Create a complete business website for ৳600/month or launch targeted single-product landing pages with mobile-first layouts.',
          highlights: [
            'Real-time desktop and mobile split preview',
            'Free businessname.amaas.xyz subdomain & GoAMAAS hosting included',
            'Section, brand palette, logo, and typography controls',
            'Direct Cash on Delivery & WhatsApp inquiry actions',
          ],
        },
        {
          title: 'Managed AI Automation Workflows',
          desc: 'Optional monthly automation packages for Messenger or WhatsApp to handle common FAQs, lead capture, and order follow-ups.',
          highlights: [
            'Configurable Messenger or WhatsApp inquiry assistant',
            'Lead qualification and contact capture workflows',
            'Order status notification workflows',
            'Clear separation of GoAMAAS fees and Meta/API provider charges',
          ],
        },
        {
          title: 'Sales Analytics & Financial Clarity',
          desc: 'Monitor order volume, gross revenue, product margins, and fulfillment ratios with clean visual reports and date filters.',
          highlights: [
            'Revenue and order trend charts with date-range selection',
            'Fulfillment stage breakdown to spot bottlenecks early',
            'Top-performing product and category insights',
            'Exportable summary reports for business owners',
          ],
        },
        {
          title: 'Custom Website Engineering by AMAAS',
          desc: 'Need a bespoke multi-page corporate or brand web application? Our AMAAS engineering team delivers custom projects starting from ৳8,000 one-time.',
          highlights: [
            'Custom responsive UI tailored to your brand brief',
            'Cloud deployment setup included (custom domain registration billed separately)',
            'WhatsApp, inquiry forms, and technical SEO setup',
            'Direct requirement submission inside your GoAMAAS workspace',
          ],
        },
      ],
      ctaTitle: 'Build your storefront or test the operations dashboard',
      ctaSubtitle:
        'Launch your GoAMAAS Website for ৳600/month or start a 7-day free trial on any Dashboard plan.',
      ctaPrimary: 'Create Your Website',
      ctaSecondary: 'Start 7-Day Free Trial',
    },
    solutionsPage: {
      seoTitle: 'Industry Solutions — GoAMAAS by AMAAS Technologies',
      seoDescription:
        'Explore how GoAMAAS adapts to fashion boutiques, electronics stores, organic food brands, D2C sellers, and wholesale distributors in Bangladesh.',
      eyebrow: 'Industry Solutions',
      title: 'Purpose-built workflows for every commerce vertical.',
      subtitle:
        'Whether you run a Facebook apparel brand, an electronics store in Dhaka, or a regional wholesale operation, GoAMAAS adapts to your catalog.',
      industries: [
        {
          title: 'Fashion, Apparel & Boutiques',
          tagline: 'Present seasonal lookbooks, size ranges, and effortless mobile ordering.',
          points: [
            'Clean product cards showcasing sizes, fabrics, and BDT pricing',
            'Exchange & return policy display on your storefront',
            'Campaign landing pages for festive and seasonal drops',
            'Direct WhatsApp & Cash on Delivery order capture',
          ],
        },
        {
          title: 'Electronics & Gadget Retailers',
          tagline: 'Highlight technical specs, warranty terms, and verified order confirmation.',
          points: [
            'SKU tracking and clean printable customer invoices',
            'Order confirmation workflow prior to courier dispatch',
            'Structured specification highlights on product listings',
            'Low-stock alerts for fast-moving accessories',
          ],
        },
        {
          title: 'Organic Groceries & Artisanal Food',
          tagline: 'Showcase fresh batches, transparent sourcing, and quick repeat ordering.',
          points: [
            'Clear weight/pack pricing and stock availability',
            'Fast WhatsApp and phone ordering for repeat family buyers',
            'Delivery zone fee display (Inside & Outside Dhaka)',
            'Simple catalog updates whenever new batches arrive',
          ],
        },
        {
          title: 'Direct-to-Consumer (D2C) Growth Brands',
          tagline: 'Convert ad clicks with fast-loading pages instead of slow chat replies.',
          points: [
            'Dedicated campaign landing pages and full brand website',
            'Mobile-optimized checkout and inquiry buttons',
            'Centralized order & customer history database',
            'Scalable Business, Pro, and Enterprise dashboard plans',
          ],
        },
        {
          title: 'Service Businesses, Clinics & Agencies',
          tagline: 'Present credentials, service packages, and direct appointment inquiries.',
          points: [
            'Dedicated templates for clinics, salons, real estate, and agencies',
            'Service rate cards and consultation booking CTAs',
            'Free professional businessname.amaas.xyz web address',
            'Optional custom domain connection for established firms',
          ],
        },
      ],
      bannerBadge: 'Custom Engineering Studio by AMAAS',
      bannerTitle: 'Need a bespoke custom-engineered website? Starting at ৳8,000 one-time.',
      bannerDesc:
        'Our engineering team builds custom React & Tailwind websites tailored to your exact project scope, including cloud deployment setup. Custom domain registration and third-party renewals are billed transparently at registrar cost.',
      bannerPrimaryCta: 'Request a Custom Website',
      bannerSecondaryCta: 'Compare Website Options',
    },
    pricingPage: {
      seoTitle: 'Pricing & Plans — GoAMAAS Website (৳600/mo) & Dashboard Plans',
      seoDescription:
        'Transparent pricing in Bangladeshi Taka (৳): GoAMAAS Website subscription at ৳600/month, Dashboard plans from ৳299/month, AI Automations, and Custom Website packages.',
      eyebrow: 'Transparent Pricing in Bangladeshi Taka (৳)',
      title: 'Predictable plans built for every stage of business growth.',
      subtitle:
        'Choose our all-inclusive ৳600/month Website Subscription, start a 7-day free trial on Dashboard plans, or request custom engineering.',
      tabs: {
        websiteSub: 'Website Subscription (৳600/mo)',
        dashboard: 'Dashboard Plans',
        automations: 'AI Automation',
        customWeb: 'Custom Dev (One-Time)',
      },
      common: {
        perMonth: '/ month',
        mostPopular: 'Most Popular',
        recommended: 'Recommended',
        freeTrialBadge: '7-Day Free Trial',
        currentlyUnavailable: 'Currently Unavailable',
        currentActivePlan: 'Current Active Plan',
        cancel: 'Cancel',
        included: 'Included',
        unlimited: 'Unlimited',
        whenConfigured: 'When configured',
        sevenDaysFree: '7 Days Free',
      },
      dashboardTab: {
        kicker: 'Merchant Operations Software Subscription',
        subnote: 'All four plans include a 7-day free trial. Upgrade or change plans anytime.',
        integrationNoteLabel: 'Integration Note:',
        integrationNoteBody:
          'Courier APIs and WhatsApp notification modules require active merchant credentials with Steadfast, Pathao, RedX, or Meta before live data transmits.',
        plans: {
          starter: {
            name: 'Starter',
            subtitle: 'For new online sellers',
            description: 'Essential tools to organize products, orders, and daily sales.',
            features: [
              'Product Management',
              'Order Management',
              'Customer Directory',
              'Sales Overview Dashboard',
              'Order Status Tracking',
              'Up to 300 Orders / month',
              '1 User Account',
              '7-Day Free Trial',
            ],
            ctaLabel: 'Start Free Trial',
          },
          business: {
            name: 'Business',
            subtitle: 'For growing online stores',
            description: 'Complete operational control with inventory tracking, exports, and courier workflows.',
            features: [
              'Everything in Starter',
              'Unlimited Orders',
              'Inventory & Stock Management',
              'Advanced Sales Analytics',
              'Customer Purchase History',
              'CSV / Excel Data Export',
              'Courier Management',
              'Up to 3 Staff Users',
              '7-Day Free Trial',
            ],
            ctaLabel: 'Start Free Trial',
          },
          pro: {
            name: 'Pro',
            subtitle: 'For established brands',
            description: 'Multi-store management with profit tracking and configurable API integrations.',
            features: [
              'Everything in Business',
              'Multiple Stores',
              'Profit / Loss Tracking',
              'Advanced Reports',
              'Courier API Integration (when configured)',
              'WhatsApp Notification Integration (when configured)',
              'Up to 10 Staff Users',
              'Priority Support',
              '7-Day Free Trial',
            ],
            ctaLabel: 'Start Free Trial',
          },
          enterprise: {
            name: 'Enterprise',
            subtitle: 'For multi-branch operations',
            description: 'Full multi-branch operations with custom reporting, API access, and dedicated support.',
            features: [
              'Everything in Pro',
              'Multiple Branches',
              'Advanced Business Automation',
              'AI Business Assistant',
              'Custom Reports',
              'API Access',
              'Unlimited Staff Users',
              'Dedicated Support',
              '7-Day Free Trial',
            ],
            ctaLabel: 'Start Free Trial',
          },
        },
      },
      automationsTab: {
        kicker: 'Managed Monthly Automation Services',
        subnote: 'Separate from Dashboard subscriptions. Managed setup and workflow maintenance.',
        disclosureTitle: 'Third-Party API & Provider Billing Disclosure',
        disclosureBody:
          'Official WhatsApp Business Cloud API conversation charges (Meta), Facebook Messenger platform fees, external SMS gateways, and AI provider usage costs are billed directly by their respective providers and are not included in GoAMAAS management fees.',
        packages: {
          basic_auto: {
            name: 'Basic Automation',
            setupFeeLabel: '৳1,000 one-time setup fee',
            description: 'Automate inbound lead capture and initial customer follow-up.',
            features: [
              'One configured workflow',
              'Lead capture automation',
              'Basic customer follow-up',
              'Monthly performance summary',
              'Standard email support',
            ],
            ctaLabel: 'Choose Automation',
          },
          growth_auto: {
            name: 'Growth Automation',
            setupFeeLabel: '৳1,500 one-time setup fee',
            description: 'Automate follow-ups, order status updates, and lead routing.',
            features: [
              'Up to 3 configured workflows',
              'Customer follow-up automation',
              'Lead management workflow',
              'Order notification workflow',
              'Monthly performance report',
              'Standard support',
            ],
            ctaLabel: 'Choose Automation',
          },
          ai_chatbot: {
            name: 'AI Chatbot',
            setupFeeLabel: 'Initial setup included',
            description: 'Conversational FAQ & inquiry assistant for Facebook Messenger OR WhatsApp.',
            features: [
              'One AI chatbot for Messenger OR WhatsApp',
              'Business FAQ responses',
              'Customer lead collection',
              'Product inquiry handling',
              'Conversation summary insights',
              'Initial setup included',
            ],
            ctaLabel: 'Request Setup',
          },
          biz_auto_pro: {
            name: 'Business Automation Pro',
            setupFeeLabel: 'Priority onboarding included',
            description: 'Cross-channel automation suite with CRM integration and priority support.',
            features: [
              'Up to 5 configured workflows',
              'One AI chatbot for Messenger OR WhatsApp',
              'Lead capture and follow-up',
              'Customer notification automation',
              'CRM workflow integration',
              'Monthly performance report',
              'Priority support',
            ],
            ctaLabel: 'Choose Automation',
          },
        },
      },
      webSubTab: {
        kicker: 'Single All-Inclusive Website Plan',
        title: 'GoAMAAS Website — ৳600 BDT / Month',
        subtitlePrefix: 'One transparent 30-day subscription including GoAMAAS cloud hosting and your free',
        subtitleSuffix: 'subdomain, with optional custom domain support.',
        bestBadge: 'Recommended for Online Businesses',
        planTypeLabel: '30-Day Website Subscription',
        planSubtitle: 'Build, customize, and publish your business website with zero upfront development cost.',
        zeroUpfront: '৳0 Upfront Development Fee',
        freeSubdomainLabel: 'Free Subdomain Included:',
        customDomainSeparate: 'Optional custom domain supported (domain registration paid separately)',
        includedHeading: 'Everything Included in Your ৳600/Month Subscription:',
        features: [
          'Self-service visual website builder (logo, hero, banners, sections & theme)',
          'Free customer subdomain: businessname.amaas.xyz',
          'Free cloud hosting on GoAMAAS infrastructure included',
          'Optional custom domain support (domain registration paid separately)',
          'Full product catalog manager with cloud image uploads & visibility toggles',
          'Templates for e-commerce, fashion, restaurant, clinic, salon, agency & more',
          'Custom brand colors, typography presets, and Desktop & Mobile layouts',
          'Business contact details, social links & direct WhatsApp ordering',
          'Save Draft & Publish Updates anytime with instant live updates',
          '30-day billing period via verified manual bKash, Nagad Personal, or Bank Transfer',
          'SSL/HTTPS enabled on supported domains',
        ],
        limitsHeading: 'Plan Resource Allowance & Fair Usage:',
        limitPages: 'Sections / Pages',
        limitPagesVal: (n) => `Up to ${n} Pages`,
        limitStorage: 'Media Storage',
        limitStorageVal: (mb) => `${mb} MB (1 GB)`,
        limitBandwidth: 'Monthly Bandwidth',
        limitBandwidthVal: (gb) => `${gb} GB / mo`,
        limitUpdates: 'Self-Service Edits',
        limitUpdatesVal: () => 'Unlimited Draft & Live Edits',
        startCta: (price) => `Create Your Website — ৳${price.toLocaleString()}/month`,
        startSubnote: 'Zero upfront fee · Live Desktop & Mobile preview · 7-day renewal grace period',
        howKicker: '3-Step Launch Workflow',
        howTitle: 'How Website Subscription Works',
        howSteps: [
          {
            title: '1. Configure Your Brand & Subdomain',
            desc: 'Choose your business category, enter your store name, and reserve your free businessname.amaas.xyz address.',
          },
          {
            title: '2. Add Products & Preview Design',
            desc: 'Upload your logo, hero banner, and products with BDT prices, and inspect live Desktop and Mobile previews.',
          },
          {
            title: '3. Verify Payment & Go Live',
            desc: 'Submit ৳600 via bKash, Nagad Personal, or Bank Transfer. Your website publishes automatically once verified.',
          },
        ],
        compKicker: 'Side-by-Side Comparison',
        compTitle: 'Website Subscription vs. One-Time Custom Development',
        compSubtitle: 'Choose self-service monthly agility or turnkey custom engineering.',
        compColFeature: 'Aspect',
        compColSub: 'GoAMAAS Website (৳600/mo)',
        compColOneTime: 'Custom Development (৳8,000+)',
        compRows: [
          {
            feature: 'Pricing Model',
            subscriptionPlan: '৳600 / 30 days (all-inclusive subscription)',
            oneTimePackages: '৳8,000 to ৳25,000 (one-time project fee)',
          },
          {
            feature: 'Upfront Cost',
            subscriptionPlan: '৳0 upfront development cost',
            oneTimePackages: 'Project fee per agreed scope',
          },
          {
            feature: 'Domain & Subdomain',
            subscriptionPlan: 'Free businessname.amaas.xyz + optional custom domain (billed separately)',
            oneTimePackages: 'Custom domain connection supported (registrar fee billed separately)',
          },
          {
            feature: 'Cloud Hosting',
            subscriptionPlan: 'GoAMAAS cloud hosting included in ৳600/mo',
            oneTimePackages: 'Initial deployment setup included; hosting renewals billed per plan',
          },
          {
            feature: 'Product & Content Edits',
            subscriptionPlan: 'Self-service visual editor anytime',
            oneTimePackages: 'CMS included on Business/Advanced; custom code changes quoted',
          },
          {
            feature: 'Launch Timeline',
            subscriptionPlan: 'Build in minutes; live immediately upon payment verification',
            oneTimePackages: 'Estimated 4–16 business days depending on package',
          },
        ],
        termsHeading: 'Subscription Terms & Infrastructure Transparency',
        disclosures: [
          'Single plan pricing: ৳600 BDT per 30-day billing period with zero upfront development fee.',
          'Free hosting on GoAMAAS infrastructure and free subdomain (businessname.amaas.xyz) are included. Optional custom domain registration is paid separately by the customer.',
          'Verified manual payment approval automatically publishes eligible websites and renews active subscriptions for 30 days.',
          'If a subscription reaches its billing end date, the website enters a 7-day grace period before going offline, and customer data remains preserved.',
        ],
      },
      customWebTab: {
        kicker: 'One-Time Custom Engineering Projects',
        subnote: 'Bespoke websites built by AMAAS engineers. Custom domain registration is billed separately.',
        oneTimeFeeLabel: 'one-time project fee',
        packages: {
          starter_web: {
            name: 'Starter Website',
            description: 'Clean responsive business website for startups, shops, and service brands.',
            estimatedTimeline: 'Estimated: 4–6 business days',
            domainHostingBenefit: 'Cloud deployment setup included · Custom domain billed separately',
            features: [
              'Up to 5 custom pages',
              'Modern responsive mobile & desktop design',
              'Contact & inquiry form',
              'Direct WhatsApp contact button',
              'Foundational on-page SEO setup',
              'Cloud deployment setup included (custom domain billed separately)',
            ],
            scopeNote:
              'Custom e-commerce databases, paid third-party plugins, and domain registrar charges are quoted separately.',
            ctaLabel: 'Request Starter Website',
          },
          business_web: {
            name: 'Business Website',
            description: 'Custom multi-page brand website with editable CMS sections and integrations.',
            estimatedTimeline: 'Estimated: 7–10 business days',
            domainHostingBenefit: 'Cloud deployment setup included · Custom domain billed separately',
            features: [
              'Up to 10 custom pages',
              'Bespoke brand design & responsive layouts',
              'CMS for editable page content',
              'Lead capture & inquiry forms',
              'WhatsApp & Google Maps integration',
              'On-page SEO & speed optimization',
              'Cloud deployment setup included (custom domain billed separately)',
            ],
            scopeNote:
              'Custom e-commerce carts, paid third-party APIs, and domain registrar charges are quoted separately.',
            ctaLabel: 'Request Business Website',
          },
          advanced_web: {
            name: 'Advanced Website',
            description: 'High-performance custom web architecture with advanced lead capture and technical SEO.',
            estimatedTimeline: 'Estimated: 12–16 business days',
            domainHostingBenefit: 'Cloud deployment setup included · Custom domain billed separately',
            features: [
              'Up to 15 custom pages',
              'Advanced bespoke UI architecture & CMS',
              'Multi-step forms and lead routing',
              'Optional chatbot UI integration (per scope)',
              'Analytics & technical SEO configuration',
              'Performance optimization',
              'Cloud deployment setup included (custom domain billed separately)',
            ],
            scopeNote:
              'Complex custom backends, paid third-party APIs, and domain registrar charges are quoted separately.',
            ctaLabel: 'Request Advanced Website',
          },
        },
      },
      matrix: {
        title: 'Dashboard Plan Comparison Matrix',
        subtitle: 'Compare operational limits and capabilities across all four SaaS tiers.',
        colCapability: 'Capability',
        rows: [
          {
            label: 'Monthly Order Volume',
            starter: '300 orders',
            business: 'Unlimited',
            pro: 'Unlimited',
            enterprise: 'Unlimited',
          },
          {
            label: 'Staff User Accounts',
            starter: '1 User',
            business: '3 Users',
            pro: '10 Users',
            enterprise: 'Unlimited',
          },
          {
            label: 'Inventory & Stock Ledger',
            starter: '—',
            business: 'Included',
            pro: 'Included',
            enterprise: 'Included',
          },
          {
            label: 'Courier Management',
            starter: 'Manual tracking',
            business: 'Included',
            pro: 'API Sync (when configured)',
            enterprise: 'API Sync (when configured)',
          },
          {
            label: 'Multiple Stores / Branches',
            starter: 'Single store',
            business: 'Single store',
            pro: 'Multiple stores',
            enterprise: 'Multiple branches',
          },
          {
            label: 'WhatsApp & SMS Integration',
            starter: '—',
            business: '—',
            pro: 'When configured',
            enterprise: 'When configured',
          },
          {
            label: 'Free Trial Period',
            starter: '7 Days Free',
            business: '7 Days Free',
            pro: '7 Days Free',
            enterprise: '7 Days Free',
          },
        ],
      },
      commercialDisclosuresTitle: 'Commercial Disclosures & Service Boundaries',
      commercialDisclosures: [
        'Third-Party Provider Fees: Official WhatsApp Business API charges (Meta), Messenger platform fees, SMS gateway credits, and external AI model usage are billed directly by their respective providers.',
        'Integration Credentials: Courier APIs and WhatsApp integrations require active merchant credentials configured in Settings before live transmission.',
        'Domain Registration: GoAMAAS Website (৳600/mo) includes a free businessname.amaas.xyz subdomain and GoAMAAS cloud hosting. Custom domain registration (.com, .bd, etc.) is billed separately.',
        'Manual Payment Verification: Subscriptions paid via bKash, Nagad Personal, or Bank Transfer activate upon Transaction ID verification.',
      ],
      faqTitle: 'Pricing & Billing FAQ',
      faqSubtitle: 'Clear answers on subscriptions, domains, trials, and manual payments.',
      faqs: [
        {
          q: 'How does the 7-day free trial for Dashboard plans work?',
          a: 'All four GoAMAAS Dashboard plans (Starter, Business, Pro, Enterprise) include a 7-day free trial so you can test order management, inventory tracking, and analytics before paying.',
        },
        {
          q: 'What is included in the ৳600/month GoAMAAS Website plan?',
          a: 'It includes the self-service visual website builder, product catalog management, GoAMAAS cloud hosting, and a free businessname.amaas.xyz subdomain for each 30-day billing cycle.',
        },
        {
          q: 'Are custom domains (.com / .xyz / .bd) included for free?',
          a: 'No — we keep domain pricing completely transparent. Your businessname.amaas.xyz subdomain is free, while custom domain registration and annual registrar renewals are paid separately.',
        },
        {
          q: 'How do I pay via Nagad, bKash, or Bank Transfer?',
          a: 'Select your preferred method in the payment modal, send the exact BDT amount (for Nagad Personal, use Send Money to our configured recipient number), and submit your Transaction ID and sender number for manual verification.',
        },
        {
          q: 'When do Courier API and WhatsApp integrations become active?',
          a: 'They operate once you enter valid active merchant API credentials from Steadfast, Pathao, RedX, or Meta inside your workspace settings.',
        },
      ],
      modals: {
        confirmPlanTitle: (name) => `Confirm Plan Selection — ${name}`,
        billingType: 'Billing Type:',
        monthlySubscription: 'Monthly Subscription',
        subscriptionPrice: 'Subscription Price:',
        trialPeriod: 'Trial Period:',
        includedFeatures: 'Included Features:',
        confirmApplyPlan: 'Confirm & Proceed to Billing',
        proceedTrialSignup: 'Proceed to Free Trial Sign Up',
        confirmAutoTitle: (name) => `Confirm Automation Request — ${name}`,
        monthlyManagedFee: 'Monthly Managed Service Fee',
        serviceFee: 'Service Fee:',
        setupFee: 'Setup Fee:',
        metaBillingNote:
          'Note: WhatsApp Cloud API conversation charges and Meta platform fees are billed separately by Meta.',
        submitSetupRequest: 'Submit Setup Request',
        autoToastSuccess: (name) =>
          `Setup request recorded for ${name}. Our engineering team will follow up.`,
        webBriefTitle: (name) => `Custom Website Brief — ${name}`,
        oneTimeProjectFee: 'One-Time Project Fee',
        totalProjectPrice: 'Project Price:',
        hostingAndDomain: 'Deployment & Domain:',
        hostingSetupIncluded: 'Cloud setup included · Custom domain billed separately',
        timeline: 'Estimated Timeline:',
        webBriefHelper:
          'Continue to the Website Requirements form to share your pages, brand goals, and reference links.',
        proceedRequirements: 'Proceed to Requirements Form →',
      },
    },
    aboutPage: {
      seoTitle: 'About AMAAS Technologies — Engineering GoAMAAS',
      seoDescription:
        'Learn how AMAAS Technologies builds accessible website creation and commerce operations software from Fulbarigate, KUET-9203, Khulna, Bangladesh.',
      eyebrow: 'About AMAAS Technologies',
      title: 'Building practical digital infrastructure for modern commerce.',
      subtitle:
        'AMAAS Technologies builds software so entrepreneurs can launch credible websites and run disciplined retail operations without technical friction.',
      storyTitle: 'Why We Built GoAMAAS',
      storyP1:
        'Across Bangladesh, ambitious entrepreneurs build strong product brands on social media yet struggle with manual inbox orders, scattered spreadsheets, and expensive agency quotes just to launch a clean website.',
      storyP2:
        'We engineered GoAMAAS to bring visual website creation, free .amaas.xyz cloud hosting, product catalogs, Cash on Delivery order pipelines, and local bKash/Nagad/Bank billing into one calm, reliable platform.',
      stat1Val: 'BDT ৳',
      stat1Label: 'Transparent Local Pricing',
      stat2Val: 'Khulna',
      stat2Label: 'In-House Product Engineering',
      founderRole: 'Founder & Chief Architect, AMAAS Technologies',
      founderQuote:
        '"Great business software should feel effortless from day one. Our mission with GoAMAAS is to give every entrepreneur clean, trustworthy tools to present their brand online and manage daily operations with precision."',
      values: [
        {
          title: 'Clarity Over Complexity',
          desc: 'We remove bloated menus and confusing setups so store owners and staff can manage products and orders comfortably from phone or desktop.',
        },
        {
          title: 'Strict Tenant Isolation & Privacy',
          desc: 'Your catalog, customer records, and financial data belong to your business. Every workspace is protected with row-level access controls.',
        },
        {
          title: 'Honest Commercial Terms',
          desc: 'No hidden website tiers or misleading domain claims—clear BDT pricing, transparent subdomain hosting, and verifiable billing records.',
        },
      ],
      hqTitle: 'Headquartered in Khulna, Bangladesh',
      hqSubtitle: 'Fulbarigate, KUET-9203, Khulna, Bangladesh · AMAAS Technologies · +8801605012812',
      hqCta: 'Contact Our Team',
      hqDirectionsCta: 'Open Google Maps',
    },
    contactPage: {
      seoTitle: 'Contact AMAAS Technologies — GoAMAAS Support & Sales',
      seoDescription:
        'Connect with AMAAS Technologies at Fulbarigate, KUET-9203, Khulna, Bangladesh (+8801605012812) for GoAMAAS website subscriptions, custom engineering briefs, or enterprise workspace inquiries.',
      eyebrow: 'Contact AMAAS Technologies',
      title: 'Speak directly with our product & support team.',
      subtitle:
        'Questions about launching your GoAMAAS website, connecting a custom domain, or choosing a dashboard plan? Send us a message below.',
      directChannels: 'Direct Contact Channels',
      headOffice: 'Office Location',
      headOfficeVal: 'Fulbarigate, KUET-9203, Khulna, Bangladesh',
      directionsLabel: 'View on Google Maps',
      officialWebsiteLabel: 'Official Website',
      engSales: 'Email',
      hotlineLabel: 'Phone & WhatsApp',
      hotlineVal: '+8801605012812 (Sat–Thu, 10:00 AM – 8:00 PM)',
      techSupport: 'Support Coverage',
      techSupportVal: 'Dedicated merchant assistance & priority SLA on Pro/Enterprise',
      customWebPromptPrefix: 'Planning a custom-engineered website project? Submit a detailed brief via our ',
      customWebPromptLink: 'Website Service Request form',
      formTitle: 'Send an Inquiry',
      fullName: 'Full Name *',
      fullNamePlaceholder: 'e.g. Arif Rahman',
      businessEmail: 'Email Address *',
      phoneWhatsapp: 'Phone / WhatsApp Number',
      topic: 'Inquiry Topic',
      topics: [
        { value: 'General Inquiry', label: 'General Inquiry' },
        { value: 'GoAMAAS Website (৳600/mo)', label: 'GoAMAAS Website Subscription (৳600/mo)' },
        { value: 'Website Development (৳8,000+)', label: 'Custom Website Development (৳8,000+)' },
        { value: 'Courier API Setup', label: 'Courier & Integration Setup' },
        { value: 'Enterprise Plan', label: 'Enterprise Plan Inquiry' },
      ],
      message: 'Message *',
      messagePlaceholder: 'Tell us about your business, website goals, or question...',
      sending: 'Sending...',
      sendMessage: 'Send Message',
      receivedTitle: 'Inquiry Received',
      receivedBody: (name, email) =>
        `Thank you, ${name}. Our team has logged your message and will reply to ${email}.`,
      sendAnother: 'Send Another Message',
      toastRequired: 'Please complete all required fields.',
      toastDelivered: 'Thank you! Your message has been sent to the AMAAS team.',
    },
    createWebsitePage: {
      seoTitle: 'Create Your Business Website — GoAMAAS Website Builder',
      seoDescription:
        'Build, preview, and publish your business website on GoAMAAS for ৳600/month with free cloud hosting and a free businessname.amaas.xyz subdomain.',
      planBarPeriod: '30-day billing period · Free GoAMAAS hosting & .amaas.xyz subdomain',
      openVisualEditor: 'Open Visual Website Editor →',
      steps: [
        '1. Category',
        '2. Business & Domain',
        '3. Products',
        '4. Design & Preview',
        '5. Activate & Publish',
      ],
      stepOf: (current, total) => `Step ${current} of ${total}`,
      groups: {
        All: 'All',
        Commerce: 'Commerce',
        'Food & Hospitality': 'Food & Hospitality',
        'Property & Construction': 'Property & Design',
        'Health & Personal Care': 'Health & Care',
        'Professional Services': 'Services',
        'Flexible Categories': 'Custom',
      },
      categories: {
        ecommerce: {
          label: 'E-commerce & Online Store',
          groupLabel: 'Commerce',
          shortDesc: 'Product catalog with Cash on Delivery & direct WhatsApp ordering.',
          itemTypeLabel: 'Products',
        },
        fashion: {
          label: 'Fashion & Clothing Boutique',
          groupLabel: 'Commerce',
          shortDesc: 'Apparel collections, size highlights, and seasonal lookbooks.',
          itemTypeLabel: 'Apparel Items',
        },
        restaurant: {
          label: 'Restaurant & Dining',
          groupLabel: 'Food & Hospitality',
          shortDesc: 'Digital menu, signature dishes, operating hours, and delivery orders.',
          itemTypeLabel: 'Menu Items',
        },
        cafe: {
          label: 'Café & Bakery',
          groupLabel: 'Food & Hospitality',
          shortDesc: 'Specialty coffee, fresh bakery items, and store location details.',
          itemTypeLabel: 'Menu Items',
        },
        real_estate: {
          label: 'Real Estate & Properties',
          groupLabel: 'Property & Design',
          shortDesc: 'Property listings, residential & commercial units, and site visit inquiries.',
          itemTypeLabel: 'Properties',
        },
        architecture: {
          label: 'Architecture & Interior Studio',
          groupLabel: 'Property & Design',
          shortDesc: 'Project portfolio, interior transformations, and consultation bookings.',
          itemTypeLabel: 'Projects',
        },
        clinic: {
          label: 'Medical & Dental Clinic',
          groupLabel: 'Health & Care',
          shortDesc: 'Clinical services, visiting hours, doctor profiles, and appointments.',
          itemTypeLabel: 'Services',
        },
        salon: {
          label: 'Beauty Salon & Wellness Spa',
          groupLabel: 'Health & Care',
          shortDesc: 'Service packages, bridal makeovers, and appointment bookings.',
          itemTypeLabel: 'Packages',
        },
        gym: {
          label: 'Gym & Fitness Studio',
          groupLabel: 'Health & Care',
          shortDesc: 'Membership plans, personal training, and studio operating hours.',
          itemTypeLabel: 'Memberships',
        },
        agency: {
          label: 'Creative & Digital Agency',
          groupLabel: 'Services',
          shortDesc: 'Service offerings, brand & marketing solutions, and proposal inquiries.',
          itemTypeLabel: 'Solutions',
        },
        portfolio: {
          label: 'Freelancer & Consultant Portfolio',
          groupLabel: 'Services',
          shortDesc: 'Featured work, advisory offerings, and direct consultation links.',
          itemTypeLabel: 'Projects',
        },
        other: {
          label: 'Custom Business Website',
          groupLabel: 'Custom',
          shortDesc: 'Flexible layout adaptable to any retail, service, or organization.',
          itemTypeLabel: 'Offerings',
        },
      },
      step1: {
        title: 'Choose Your Business Category',
        subtitle:
          'Select the starting structure that fits your business. You can customize every section, color, photo, and product anytime.',
        searchPlaceholder: 'Search categories (e.g. fashion, store, cafe, clinic)...',
        selectContinue: 'Select & Continue',
      },
      step2: {
        title: 'Business Identity & Free Subdomain',
        subtitlePrefix: 'Reserve your free',
        subtitleSuffix:
          'address. Optional contact fields left blank are cleanly omitted from your public site.',
        businessNameLabel: 'Business / Brand Name *',
        businessNamePlaceholder: 'e.g. Urban Fashion',
        subdomainLabel: 'Free GoAMAAS Subdomain (businessname.amaas.xyz) *',
        subdomainReserved: (sub) =>
          `Subdomain https://${sub}.amaas.xyz is reserved for your saved website.`,
        subdomainChecking: 'Checking availability...',
        subdomainAvailable: (sub) => `https://${sub}.amaas.xyz is available!`,
        subdomainMinChars: 'Subdomain must be at least 3 characters.',
        subdomainTaken: 'This subdomain is already taken or reserved.',
        subdomainVerifyError: 'Could not verify subdomain availability. Please try again.',
        customDomainLabel: 'Optional Custom Domain (if you own one)',
        customDomainPlaceholder: 'e.g. www.yourbrand.com (domain registration billed separately)',
        customDomainNote:
          'Free GoAMAAS cloud hosting & .amaas.xyz subdomain are included in your ৳600/mo plan. Custom domain registration is paid separately to your domain registrar.',
        phoneLabel: 'Customer Phone Number',
        whatsappLabel: 'WhatsApp Orders / Inquiry Number',
        emailLabel: 'Public Business Email (Optional)',
        addressLabel: 'Store / Office Address (Optional)',
        addressPlaceholder: 'e.g. Road 11, Banani, Dhaka',
        facebookLabel: 'Facebook Page URL (Optional)',
        instagramLabel: 'Instagram Profile URL (Optional)',
        heroHeadlineLabel: 'Hero Headline',
        heroSubheadlineLabel: 'Hero Subheadline',
        primaryCtaTextLabel: 'Primary CTA Button Label',
        primaryCtaDestLabel: 'Primary CTA Action',
        destWhatsapp: 'Direct WhatsApp Inquiry',
        destCatalog: 'Scroll to Products / Catalog',
        destContact: 'Scroll to Contact Section',
        destAbout: 'Scroll to About Section',
        changeCategory: 'Change Category',
        continueProducts: 'Continue to Products',
      },
      step3: {
        title: (itemType) => `Add Featured ${itemType}`,
        subtitle:
          'Add your products or services with BDT prices, descriptions, and images. You can add or edit items anytime from your dashboard.',
        itemNumber: (n) => `Item #${n}`,
        removeItemTitle: 'Remove item',
        itemNameLabel: 'Product / Service Name *',
        priceLabel: 'Price *',
        descLabel: 'Short Description',
        photoAttached: 'Product photo attached',
        uploading: 'Uploading...',
        uploadProductImage: 'Upload Product Image',
        addAnother: 'Add Another Product / Service',
        back: 'Back',
        continueDesign: 'Continue to Design & Preview',
      },
      step4: {
        subtitleBadge: 'Design, Media & Live Preview',
        title: 'Customize Branding & Preview Your Website',
        subtitle:
          'Upload your logo and hero banner, pick your color palette, and test both Desktop and Mobile views before saving.',
        logoLabel: 'Business Logo (Optional)',
        removeLogo: 'Remove Logo',
        uploadLogo: 'Upload Logo (PNG/JPG)',
        heroImageLabel: 'Hero Banner Image (Optional)',
        removeHero: 'Remove Banner',
        uploadHero: 'Upload Hero Image',
        heroLayoutLabel: 'Hero Layout',
        layoutSplit: 'Split',
        layoutCentered: 'Centered',
        layoutCover: 'Cover',
        typographyLabel: 'Typography',
        fontModern: 'Modern',
        fontEditorial: 'Editorial',
        fontBold: 'Bold',
        fontMinimal: 'Minimal',
        buttonsLabel: 'Buttons',
        btnRounded: 'Rounded',
        btnPill: 'Pill',
        btnSharp: 'Sharp',
        livePreviewLabel: 'Live Preview:',
        desktop: 'Desktop',
        mobile: 'Mobile',
        saveErrorTitle: 'Could not save website',
        savingWebsite: 'Saving Website...',
        saveAndProceed: 'Save Website & Proceed to Activation',
      },
      step5: {
        title: 'Website Saved & Subdomain Reserved',
        savedAtPrefix: 'Your website configuration is saved at',
        autoPublishTitle: (planName) => `${planName} — Instant Publishing on Verification`,
        autoPublishBody: (fee, domain) =>
          `Submit your ৳${fee} BDT monthly payment via bKash, Nagad Personal, or Bank Transfer below. Once verified by our operations team, your website goes live automatically at https://${domain} for a 30-day billing period.`,
        billingPeriod30: '30-day billing period',
        perMonth: '/ month',
        bullet1: (domain) =>
          `Free ${domain} subdomain & free cloud hosting on GoAMAAS infrastructure`,
        bullet2:
          'Full Visual Website Editor (sections, logo, hero banner, theme, products & images)',
        bullet3:
          'Optional custom domain connection supported (domain registration paid separately)',
        bullet4: 'Direct WhatsApp customer ordering & 30-day renewal cycle',
        submitPaymentBtn: (fee) => `Submit ৳${fee} Payment (bKash / Nagad / Bank)`,
        openEditorBtn: 'Open Visual Website Editor',
        customDomainTitle: 'Connecting your own custom domain?',
        customDomainBody:
          'Point your domain CNAME to cname.amaas.xyz inside the Website Editor. Custom domain purchase is billed separately.',
        whatsappSupport: 'WhatsApp Support',
        supportDesk: 'Support Desk',
        paymentSubmittedToast:
          'Payment submitted! Your website will publish live automatically once your payment is verified.',
      },
      toasts: {
        signInUpload: 'Please sign in first to upload media to cloud storage.',
        uploadFailed: 'Failed to upload image.',
        uploadSuccess: 'Image uploaded to cloud storage.',
        keepOneItem: 'Keep at least one product or offering, or edit the existing item.',
        signInSave: 'Please sign in or create an account to save and publish your website.',
        enterBusinessName: 'Please enter your business name.',
        checkingSubdomain: 'Verifying subdomain availability, please wait a moment.',
        chooseValidSubdomain: 'Please choose an available .amaas.xyz subdomain.',
        itemNeedsName: (index) => `Item #${index} needs a product or service name.`,
      },
    },
    auth: {
      backToHome: 'Back to Home',
      continueWithGoogle: 'Continue with Google',
      connectingGoogle: 'Connecting to Google...',
      supabaseNeededOAuth: 'Environment setup details for Google OAuth',
      oauthModalTitle: 'Authentication Environment Setup',
      oauthModalSubtitle: 'Supabase Auth credentials are required for live OAuth & email delivery',
      oauthModalIntro:
        'GoAMAAS uses official Supabase Auth for Google sign-in and password recovery emails.',
      missingEnvVars: 'Missing Environment Variables:',
      setupInstructions: 'Configuration Steps:',
      understood: 'Understood',
      close: 'Close',
      login: {
        seoTitle: 'Sign In — GoAMAAS Merchant Workspace',
        title: 'Sign in to your workspace',
        subtitle: 'Manage your website, catalog, orders, and billing.',
        orEmail: 'or sign in with email',
        emailLabel: 'Email Address',
        passwordLabel: 'Password',
        forgotPassword: 'Forgot password?',
        authenticating: 'Signing in...',
        signInBtn: 'Sign In',
        noAccount: "Don't have an account?",
        startTrialLink: 'Create Merchant Account',
        errMissingFields: 'Please enter both your email address and password.',
      },
      register: {
        seoTitle: 'Create Account — GoAMAAS by AMAAS Technologies',
        title: 'Create your GoAMAAS account',
        subtitle: 'Launch your website or start a 7-day free dashboard trial.',
        orEmail: 'or register with email',
        fullNameLabel: 'Your Full Name *',
        fullNamePlaceholder: 'e.g. Arif Rahman',
        storeNameLabel: 'Business / Store Name *',
        storeNamePlaceholder: 'e.g. Rahman Traders',
        emailLabel: 'Email Address *',
        passwordLabel: 'Password *',
        passwordPlaceholder: 'At least 6 characters',
        creatingWorkspace: 'Creating Workspace...',
        launchTrialBtn: 'Create Account & Continue',
        perk1: 'Access Website Builder & 7-day Dashboard trial',
        perk2: 'Transparent BDT pricing — cancel or change plans anytime',
        haveAccount: 'Already have an account?',
        loginLink: 'Log In',
        verifyTitle: 'Verify your email address',
        verifyBody: (email) =>
          `We sent a verification link to ${email}. Open your inbox and click the link to activate your workspace.`,
        sending: 'Sending...',
        resendEmail: 'Resend Verification Email',
        returnSignIn: 'Return to Sign In',
        errRequired: 'Please fill out all required fields.',
        errPasswordLength: 'Password must contain at least 6 characters.',
      },
      forgot: {
        seoTitle: 'Reset Password — GoAMAAS',
        title: 'Reset your password',
        subtitle: 'Enter your account email to receive a password reset link.',
        supabaseResetBanner: 'Active Supabase credentials are required to dispatch reset emails. ',
        viewSetupDetails: 'View setup details',
        sentTitle: 'Recovery link sent',
        sentBody: (email) =>
          `If an account exists for ${email}, a password recovery link has been sent to your inbox.`,
        returnSignIn: 'Return to Sign In',
        emailLabel: 'Email Address',
        sendingLink: 'Sending Recovery Link...',
        sendInstructionsBtn: 'Send Recovery Link',
        backToLogin: 'Back to Sign In',
        errEmailRequired: 'Please enter your account email address.',
      },
      reset: {
        seoTitle: 'Set New Password — GoAMAAS',
        title: 'Set a new password',
        subtitle: 'Choose a strong password for your GoAMAAS merchant account.',
        successTitle: 'Password updated',
        successBody: 'Your new password is active. Redirecting you to Sign In...',
        proceedSignIn: 'Proceed to Sign In',
        newPasswordLabel: 'New Password',
        confirmPasswordLabel: 'Confirm New Password',
        confirmPlaceholder: 'Repeat new password',
        updating: 'Updating Password...',
        savePasswordBtn: 'Save New Password',
        backToSignIn: 'Back to Sign In',
        errExpiredLink:
          'This password reset link has expired or is invalid. Please request a new link.',
        errPasswordLength: 'Password must contain at least 6 characters.',
        errMismatch: 'Passwords do not match.',
        errNoSupabase: 'Authentication service is not configured in this environment.',
        toastUpdated: 'Password updated! Please sign in.',
      },
    },
    paymentModal: {
      title: 'Submit Manual Payment Verification',
      description:
        'Send the exact payable amount to a verified GoAMAAS recipient account, then submit your Transaction ID and sender number.',
      targetWebsiteLabel: 'Target Website Subscription *',
      websiteSubscriptionLabel: 'Website Subscription',
      selectedPlanLabel: 'Selected Plan',
      exactPayableLabel: 'Exact Payable Amount',
      pendingAlreadyTitle: 'Pending Verification Already Submitted',
      pendingAlreadyBody:
        'A payment request for this subscription is currently awaiting verification. Your workspace updates automatically once reviewed.',
      statusLabel: 'Current Payment Status',
      statusPendingBadge: 'Pending Verification',
      statusApprovedBadge: 'Approved',
      statusApprovedBody:
        'Your latest payment submission for this service has been verified and approved.',
      statusRejectedBadge: 'Rejected',
      statusRejectedReasonLabel: 'Reason:',
      statusRejectedResubmitHint:
        'Please double-check your transfer details and submit a valid Transaction ID below.',
      step1ChooseMethod: '1. Select Payment Method *',
      sendMoney: 'Send Money',
      unavailable: 'Unavailable',
      bankAc: 'Bank A/C',
      copied: 'Copied',
      copyNumber: 'Copy Number',
      copyAc: 'Copy A/C',
      copiedToast: 'Copied to clipboard!',
      copiedAccountSuccess: (account) => `Copied ${account} to clipboard.`,
      bkashUnavailableTitle: 'bKash Channel Unavailable',
      bkashUnavailableBody:
        'bKash recipient details are currently disabled. Please choose another active payment method above.',
      recipientBkashLabel: 'Recipient bKash Number',
      bkashDefaultInstruction: (amountStr) =>
        `Send exactly ${amountStr} to the bKash number above, then enter your TrxID and sender number below.`,
      nagadUnavailableTitle: 'Nagad Channel Unavailable',
      nagadUnavailableBody:
        'Nagad recipient details are not active right now. Please select bKash or Bank Transfer.',
      recipientNagadLabel: 'Recipient Nagad Number',
      nagadAccountTypeBadge: 'Personal Account',
      nagadStepsTitle: 'How to pay via Nagad Personal (Send Money):',
      nagadManualOnlyNote:
        'Manual TrxID verification only — payments are verified by our operations team before activation.',
      bankUnavailableTitle: 'Bank Transfer Channel Unavailable',
      bankUnavailableBody:
        'Bank recipient details are currently disabled. Please select another active payment method.',
      bankNameLabel: 'Bank Name',
      accountNameLabel: 'Account Name',
      recipientAcNumberLabel: 'Recipient Account Number',
      branchLabel: 'Branch',
      routingLabel: 'Routing Number',
      depositSlipSupportLabel: 'Deposit Slip Support:',
      depositSlipSupportBody: 'You may also share your transfer receipt on WhatsApp at',
      step2ProofTitle: '2. Enter Transfer Details *',
      trxIdBankLabel: 'Transaction ID / Bank Reference *',
      trxIdWalletLabel: 'Transaction ID (TrxID) *',
      trxPlaceholderBank: 'e.g. NPSB-91028471',
      trxPlaceholderNagad: 'e.g. 72N9X48K',
      trxPlaceholderBkash: 'e.g. BKA79X2910',
      duplicateTrxWarning:
        'This Transaction ID has already been submitted and is pending or approved.',
      senderPhoneBankLabel: 'Sender Phone Number *',
      senderPhoneWalletLabel: (method) => `Sender ${method} Number *`,
      payableAmountInputLabel: 'Payable Amount (BDT ৳) *',
      relatedPlanInputLabel: 'Related Plan / Website',
      senderBankOptional: 'Sender Bank Name (Optional)',
      senderHolderOptional: 'Sender Account Holder Name (Optional)',
      cancel: 'Cancel',
      submitVerificationBtn: (amountStr) => `Submit ${amountStr} for Verification`,
      statusFooterNote:
        'Status starts as Pending Verification. Once verified, your subscription activates and eligible websites publish immediately.',
      errors: {
        invalidPrice: 'This plan or service does not currently have a valid active price.',
        bkashUnavailable:
          'bKash payment channel is currently unavailable. Please choose an active payment method.',
        nagadUnavailable:
          'Nagad payment channel is currently unavailable. Please choose bKash or Bank Transfer.',
        bankUnavailable:
          'Bank Transfer channel is currently unavailable. Please choose an active payment method.',
        requiredFields: 'Please complete all required payment fields.',
        duplicateTrx: (trx) =>
          `Transaction ID "${trx}" has already been submitted and is pending or approved.`,
        alreadyPending:
          'A payment request for this subscription is already pending verification.',
        submitFailed: 'Failed to submit payment request. Please try again.',
      },
    },
  },

  bn: {
    langCode: 'bn',
    langLabel: 'বাংলা',
    nav: {
      home: 'হোম',
      features: 'ফিচারসমূহ',
      solutions: 'সলিউশনস',
      websiteBuilder: 'ওয়েবসাইট বিল্ডার',
      pricing: 'প্রাইসিং',
      about: 'আমাদের সম্পর্কে',
      contact: 'যোগাযোগ',
      login: 'লগ ইন',
      createWebsite: 'ওয়েবসাইট তৈরি করুন',
      startFreeTrial: 'ফ্রি ট্রায়াল শুরু করুন',
      goToDashboard: 'ড্যাশবোর্ড',
      openDashboard: 'ড্যাশবোর্ড খুলুন',
      toggleTheme: 'থিম পরিবর্তন করুন',
      toggleMenu: 'মেনু খুলুন বা বন্ধ করুন',
      languageAria: 'ভাষা পরিবর্তন করুন',
    },
    footer: {
      businessName: 'AMAAS Technologies',
      tagline:
        'বাংলাদেশি উদ্যোক্তা ও অনলাইন ব্যবসার জন্য AMAAS Technologies নির্মিত আধুনিক ওয়েবসাইট বিল্ডার এবং বিজনেস ম্যানেজমেন্ট প্ল্যাটফর্ম।',
      location: 'ফুলবাড়িগেট, কুয়েট-৯২০৩, খুলনা, বাংলাদেশ',
      mobile: '+8801605012812',
      website: 'https://amaas.xyz',
      hotline: '+8801605012812 · শনি–বৃহস্পতি (সকাল ১০টা – রাত ৮টা)',
      directionsLabel: 'গুগল ম্যাপে অবস্থান দেখুন',
      colPlatform: 'প্ল্যাটফর্ম',
      colServices: 'প্ল্যান ও সার্ভিস',
      colCompany: 'কোম্পানি',
      links: {
        orders: 'মাল্টি-চ্যানেল অর্ডার হাব',
        inventory: 'ইনভেন্টরি ও স্টক ট্র্যাকিং',
        websiteBuilder: 'ভিজ্যুয়াল ওয়েবসাইট বিল্ডার',
        automations: 'এআই অটোমেশন ওয়ার্কফ্লো',
        courier: 'কুরিয়ার ডিসপ্যাচ ম্যানেজমেন্ট',
        websitePlan: 'GoAMAAS Website (৳৬০০/মাস)',
        dashboardPlans: 'ড্যাশবোর্ড প্ল্যান (৳২৯৯ থেকে)',
        customWeb: 'কাস্টম ওয়েব ডেভেলপমেন্ট (৳৮,০০০ থেকে)',
        aiPackages: 'ম্যানেজড এআই প্যাকেজ',
        industrySolutions: 'ব্যবসাভিত্তিক সলিউশন',
        about: 'AMAAS সম্পর্কে',
        contact: 'টিমের সাথে যোগাযোগ',
        merchantLogin: 'মার্চেন্ট লগ ইন',
        freeTrial: '৭ দিনের ফ্রি ড্যাশবোর্ড ট্রায়াল',
      },
      subdomainNote:
        'ওয়েবসাইট সাবস্ক্রিপশনে ফ্রি businessname.amaas.xyz সাবডোমেইন ও GoAMAAS ক্লাউড হোস্টিং অন্তর্ভুক্ত · কাস্টম ডোমেইন রেজিস্ট্রেশন চার্জ আলাদা।',
      copyright: 'AMAAS Technologies। সর্বস্বত্ব সংরক্ষিত।',
      badgeSecurity: 'নিরাপদ মাল্টি-টেন্যান্ট ক্লাউড আর্কিটেকচার',
      badgeBangladesh: 'বাংলাদেশের ই-কমার্স ও ব্যবসার জন্য নির্মিত',
    },
    home: {
      seoTitle: 'GoAMAAS — সহজেই আপনার ব্যবসার ওয়েবসাইট তৈরি ও পরিচালনা করুন',
      seoDescription:
        'মাসে মাত্র ৳৬০০ টাকায় ফ্রি GoAMAAS ক্লাউড হোস্টিং ও ফ্রি businessname.amaas.xyz সাবডোমেইনসহ আপনার ব্যবসার ওয়েবসাইট চালু করুন এবং পণ্য, অর্ডার ও স্টক পরিচালনা করুন।',
      hero: {
        eyebrow: 'AMAAS Technologies · ওয়েবসাইট ও বিজনেস প্ল্যাটফর্ম',
        headline: 'কোনো টেকনিক্যাল ঝামেলা ছাড়াই আপনার ব্যবসার',
        headlineAccent: 'পেশাদার ওয়েবসাইট তৈরি ও পরিচালনা করুন।',
        leadBold: 'বাংলাদেশের উদ্যোক্তা ও অনলাইন ব্যবসার পূর্ণাঙ্গ ওয়েবসাইট ও ই-কমার্স সলিউশন।',
        subheadline:
          'কয়েক মিনিটে মোবাইল-ফ্রেন্ডলি অনলাইন স্টোর সাজান, ক্যাশ অন ডেলিভারি ও WhatsApp অর্ডার নিন, স্টক ট্র্যাক করুন এবং বিকাশ, নগদ বা ব্যাংকের মাধ্যমে সহজে সাবস্ক্রিপশন পরিচালনা করুন।',
        primaryCta: 'আপনার ওয়েবসাইট তৈরি করুন',
        secondaryCta: 'ফিচারসমূহ দেখুন',
        pricingTeaserPrefix: 'ওয়েবসাইট সাবস্ক্রিপশন',
        pricingTeaserHighlight: '৳৬০০ / মাস',
        pricingTeaserSubdomain: 'ফ্রি businessname.amaas.xyz সাবডোমেইন ও GoAMAAS ক্লাউড হোস্টিং অন্তর্ভুক্ত।',
        pricingTeaserCustomDomain: 'কাস্টম ডোমেইন (.com / .bd) সাপোর্ট করে — ডোমেইন রেজিস্ট্রেশন ফি আলাদা।',
        mockup: {
          viewDashboardTab: 'মার্চেন্ট ড্যাশবোর্ড',
          viewStorefrontTab: 'মোবাইল স্টোরফ্রন্ট',
          dashboardTitle: 'GoAMAAS মার্চেন্ট ড্যাশবোর্ড',
          liveBadge: 'লাইভ · urbanloom.amaas.xyz',
          navOverview: 'ওভারভিউ',
          navProducts: 'পণ্যসমূহ',
          navOrders: 'অর্ডার',
          navWebsite: 'ওয়েবসাইট এডিটর',
          navBilling: 'বিলিং',
          kpiStoreStatusLabel: 'স্টোরফ্রন্ট স্ট্যাটাস',
          kpiStoreStatusValue: 'লাইভ · SSL সক্রিয়',
          kpiOrdersLabel: 'চলমান অর্ডার',
          kpiOrdersValue: '১৮টি অর্ডার',
          kpiCatalogLabel: 'ক্যাটালগ স্টক',
          kpiCatalogValue: '৪২টি পণ্য প্রস্তুত',
          recentOrdersTitle: 'ওয়েবসাইট ও সোশ্যাল অর্ডার তালিকা',
          recentOrdersSync: 'রিয়েল-টাইম ক্যাটালগ সিঙ্ক',
          orderColId: 'অর্ডার',
          orderColItem: 'পণ্য',
          orderColMethod: 'চ্যানেল',
          orderColStatus: 'অবস্থা',
          statusConfirmed: 'কনফার্মড',
          statusDispatched: 'কুরিয়ার প্রস্তুত',
          statusPending: 'নতুন COD',
          channelWebsite: 'ওয়েবসাইট',
          channelWhatsapp: 'WhatsApp',
          channelCod: 'ওয়েবসাইট COD',
          storefrontBadge: 'মোবাইল স্টোরফ্রন্ট প্রিভিউ',
          storefrontName: 'Urban Loom Dhaka',
          storefrontTagline: 'প্রিমিয়াম লিনেন ও দেশীয় পোশাক সংগ্রহ',
          product1Name: 'সুতি স্টিচড পাঞ্জাবি',
          product1Tag: 'সাইজ M · L · XL',
          product2Name: 'হ্যান্ডলুম মসলিন স্কার্ফ',
          product2Tag: 'ডেলিভারির জন্য প্রস্তুত',
          product3Name: 'ক্লাসিক অক্সফোর্ড শার্ট',
          orderNowBtn: 'ওয়েবসাইট / WhatsApp অর্ডার',
          mobileReadyLabel: 'প্রতিটি মোবাইলে নিখুঁত ভিউ',
        },
      },
      valueProp: {
        eyebrow: 'কেন উদ্যোক্তারা GoAMAAS বেছে নেন',
        title: 'ইনবক্সের বিশৃঙ্খল অর্ডার থেকে বেরিয়ে পেশাদার ব্র্যান্ড গড়ে তুলুন।',
        subtitle:
          'মেসেজ হারিয়ে যাওয়া বা খাতায় হিসাব রাখার বদলে গ্রাহকের সামনে তুলে ধরুন একটি আধুনিক অনলাইন স্টোর এবং গোছানো অর্ডার সিস্টেম।',
        pillars: [
          {
            title: 'শুরুতে বড় কোনো ডেভেলপমেন্ট খরচ নেই',
            desc: 'শুরুতেই হাজার হাজার টাকা খরচের বদলে মাসে মাত্র ৳৬০০ (৩০ দিন) সাবস্ক্রিপশনে নিজের ব্যবসার ওয়েবসাইট চালু করুন।',
          },
          {
            title: 'ফ্রি AMAAS সাবডোমেইন ও ক্লাউড হোস্টিং',
            desc: 'সাথে সাথেই পান businessname.amaas.xyz ঠিকানা এবং GoAMAAS ক্লাউড হোস্টিং; চাইলে যেকোনো সময় নিজের কাস্টম ডোমেইন যুক্ত করতে পারবেন।',
          },
          {
            title: 'বাংলাদেশি ব্যবসার বাস্তব প্রয়োজন অনুযায়ী তৈরি',
            desc: 'ক্যাশ অন ডেলিভারি (COD), সরাসরি WhatsApp অর্ডার, বিকাশ, নগদ পার্সোনাল ও ব্যাংক ট্রান্সফার বিলিং এবং লোকাল কুরিয়ার ওয়ার্কফ্লো সাপোর্ট।',
          },
          {
            title: 'ডেভেলপার ছাড়াই তাৎক্ষণিক আপডেট',
            desc: 'মোবাইল বা ল্যাপটপ থেকেই পণ্যের ছবি, দাম, ব্যানার এবং যোগাযোগের তথ্য পরিবর্তন করে সাথে সাথে লাইভ আপডেট করুন।',
          },
        ],
      },
      howItWorks: {
        eyebrow: 'GoAMAAS কীভাবে কাজ করে',
        title: 'মাত্র ৩টি সহজ ধাপে আপনার ওয়েবসাইট লাইভ করুন।',
        subtitle:
          'কোনো কোডিং, সার্ভার সেটআপ বা জটিল প্লাগইনের প্রয়োজন নেই। সহজ গাইডেড ধাপ অনুসরণ করুন।',
        cta: 'এখনই তৈরি শুরু করুন',
        steps: [
          {
            step: '০১',
            title: 'ব্যবসার ক্যাটাগরি ও সাবডোমেইন নির্বাচন করুন',
            desc: 'ই-কমার্স, ফ্যাশন, রেস্টুরেন্ট, ক্লিনিক, স্যালন বা সার্ভিস ক্যাটাগরি বেছে নিয়ে আপনার ফ্রি businessname.amaas.xyz সাবডোমেইন রিজার্ভ করুন।',
          },
          {
            step: '০২',
            title: 'পণ্য, ছবি ও ব্র্যান্ডিং যুক্ত করুন',
            desc: 'আপনার লোগো, ব্যানার এবং পণ্যের ছবি ও মূল্য (৳) যুক্ত করুন এবং ডেস্কটপ ও মোবাইল প্রিভিউ দেখে নিন।',
          },
          {
            step: '০৩',
            title: 'পেমেন্ট যাচাই ও তাৎক্ষণিক লাইভ পাবলিশ',
            desc: 'বিকাশ, নগদ পার্সোনাল অথবা ব্যাংক ট্রান্সফারের মাধ্যমে ৳৬০০ পেমেন্ট সাবমিট করুন। যাচাই সম্পন্ন হলেই ওয়েবসাইট স্বয়ংক্রিয়ভাবে লাইভ হবে।',
          },
        ],
      },
      featureShowcase: {
        eyebrow: 'প্ল্যাটফর্মের মূল সক্ষমতা',
        title: 'ওয়েবসাইট এবং ব্যবসা পরিচালনার সম্পূর্ণ সমাধান এক জায়গায়।',
        subtitle:
          'দেখুন কীভাবে GoAMAAS আপনার অনলাইন স্টোরফ্রন্টের সাথে পণ্য, অর্ডার ও স্টক ব্যবস্থাপনাকে যুক্ত রাখে।',
        tabs: [
          {
            id: 'builder',
            label: 'ভিজ্যুয়াল ওয়েবসাইট বিল্ডার',
            kicker: 'সেল্ফ-সার্ভিস স্টোরফ্রন্ট ইঞ্জিন',
            heading: 'কয়েক মিনিটে ওয়েবসাইট ডিজাইন, প্রিভিউ ও আপডেট করুন।',
            description:
              'পাবলিশ করার আগেই ডেস্কটপ ও মোবাইল ভিউ পরীক্ষা করুন, ব্র্যান্ড কালার ও ফন্ট বেছে নিন এবং ক্লাউডে পণ্যের ছবি আপলোড করুন।',
            bullets: [
              'লাইভ ডেস্কটপ ও মোবাইল প্রিভিউ সুইচার',
              'লোগো, ব্যানার ও পণ্যের ছবির জন্য ক্লাউড মিডিয়া স্টোরেজ',
              'ফ্রি .amaas.xyz সাবডোমেইনের পাশাপাশি ঐচ্ছিক কাস্টম ডোমেইন CNAME সুবিধা',
            ],
            panelTitle: 'ভিজ্যুয়াল থিম ও ক্যাটালগ এডিটর',
            panelSubtitle: 'ড্রাফট সেভ ও তাৎক্ষণিক লাইভ আপডেট সুবিধা',
            metrics: [
              { label: 'হোস্টিং ও SSL', value: 'GoAMAAS-এ অন্তর্ভুক্ত' },
              { label: 'সাবডোমেইন ফরম্যাট', value: 'name.amaas.xyz' },
              { label: 'লেআউট স্টাইল', value: 'Split · Centered · Cover' },
            ],
          },
          {
            id: 'orders',
            label: 'অর্ডার ও কুরিয়ার হাব',
            kicker: 'কেন্দ্রীয় অর্ডার ম্যানেজমেন্ট',
            heading: 'অর্ডার গ্রহণ থেকে ডেলিভারি পর্যন্ত প্রতিটি ধাপ ট্র্যাক করুন।',
            description:
              'ওয়েবসাইট, মেসেঞ্জার ও WhatsApp-এর অর্ডারগুলো একটি গোছানো তালিকায় রাখুন, ইনভয়েস প্রিন্ট করুন এবং স্ট্যাটাস আপডেট করুন।',
            bullets: [
              'স্পষ্ট অর্ডার ধাপ: Pending, Confirmed, Shipped, Delivered',
              'গ্রাহকের পূর্ববর্তী অর্ডার ইতিহাস ও ঠিকানা সংরক্ষণ',
              'কনফিগার করা থাকলে Steadfast, Pathao ও RedX কুরিয়ার ওয়ার্কফ্লো সাপোর্ট',
            ],
            panelTitle: 'মাল্টি-চ্যানেল অর্ডার পাইপলাইন',
            panelSubtitle: 'সহজ ইনভয়েস প্রিন্ট ও স্ট্যাটাস ফিল্টার',
            metrics: [
              { label: 'অর্ডার সোর্স', value: 'Web · WhatsApp · Social' },
              { label: 'ডেটা এক্সপোর্ট', value: 'CSV / হিসাব প্রস্তুত' },
              { label: 'কুরিয়ার সিঙ্ক', value: 'কনফিগারযোগ্য API' },
            ],
          },
          {
            id: 'inventory',
            label: 'ক্যাটালগ ও ইনভেন্টরি',
            kicker: 'নির্ভুল স্টক নিয়ন্ত্রণ',
            heading: 'কোন পণ্য কতটি স্টকে আছে তা সবসময় নিশ্চিত জানুন।',
            description:
              'প্রতিটি পণ্যের মূল্য, ক্রয়মূল্য, ভিজিবিলিটি এবং লো-স্টক অ্যালার্ট সেট করুন যাতে ক্যাম্পেইনের সময় স্টকআউট সমস্যা না হয়।',
            bullets: [
              'ড্যাশবোর্ড ও ওয়েবসাইটের সমন্বিত প্রোডাক্ট ক্যাটালগ',
              'লো-স্টক থ্রেশহোল্ড সতর্কবার্তা',
              'স্টক সংযোজন ও পরিবর্তনের সময়ভিত্তিক লগ',
            ],
            panelTitle: 'ইনভেন্টরি ও SKU লেজার',
            panelSubtitle: 'স্টক পরিবর্তন ও ভিজিবিলিটি নিয়ন্ত্রণ',
            metrics: [
              { label: 'ভিজিবিলিটি কন্ট্রোল', value: 'Active / Draft টগল' },
              { label: 'স্টক সতর্কতা', value: 'কাস্টম লিমিট' },
              { label: 'অডিট রেকর্ড', value: 'সময়সহ সম্পূর্ণ লগ' },
            ],
          },
          {
            id: 'automation',
            label: 'এআই ও ল্যান্ডিং পেজ',
            kicker: 'ক্যাম্পেইন ও অটোমেশন টুলস',
            heading: 'সিঙ্গেল-প্রোডাক্ট ক্যাম্পেইন পেজ এবং ঐচ্ছিক এআই অটোমেশন চালু করুন।',
            description:
              'বিজ্ঞাপনের জন্য দ্রুতগতির ক্যাম্পেইন ল্যান্ডিং পেজ তৈরি করুন অথবা ব্যবসার পরিধি বাড়লে ম্যানেজড মেসেঞ্জার/WhatsApp অটোমেশন যুক্ত করুন।',
            bullets: [
              'COD অর্ডার ফর্মসহ মোবাইল-অপ্টিমাইজড ল্যান্ডিং পেজ বিল্ডার',
              'মেসেঞ্জার বা WhatsApp-এর জন্য ঐচ্ছিক ম্যানেজড এআই প্যাকেজ',
              'সফটওয়্যার ফি এবং তৃতীয় পক্ষের API চার্জের স্বচ্ছ বিভাজন',
            ],
            panelTitle: 'ক্যাম্পেইন ও অটোমেশন স্টুডিও',
            panelSubtitle: 'ব্যবসা বৃদ্ধির সাথে যুক্ত করার মতো মডিউল',
            metrics: [
              { label: 'ল্যান্ডিং পেজ', value: 'মোবাইল-ফার্স্ট টেমপ্লেট' },
              { label: 'অর্ডার ফ্লো', value: 'সরাসরি COD ও ইনকোয়ারি' },
              { label: 'এআই প্যাকেজ', value: 'ঐচ্ছিক ম্যানেজড সার্ভিস' },
            ],
          },
        ],
      },
      storefrontPreview: {
        eyebrow: 'ইন্টারঅ্যাক্টিভ স্টোরফ্রন্ট প্রিভিউ',
        title: 'বিভিন্ন ব্যবসার ধরন ও ডিভাইসে আপনার ওয়েবসাইট কেমন দেখাবে দেখুন।',
        subtitle:
          'নমুনা ক্যাটাগরি পরিবর্তন করে ডেস্কটপ ও মোবাইল ভিউ সরাসরি পরখ করুন।',
        desktopLabel: 'ডেস্কটপ ভিউ',
        mobileLabel: 'মোবাইল ভিউ',
        launchThisStyle: 'এই স্টাইলে ওয়েবসাইট তৈরি করুন',
        codBadge: 'ক্যাশ অন ডেলিভারি ও সরাসরি অর্ডার প্রস্তুত',
        whatsappBtn: 'অর্ডার করুন',
        niches: [
          {
            id: 'fashion',
            tabLabel: 'ফ্যাশন ও বুটিক',
            storeName: 'Noor Atelier',
            subdomain: 'nooratelier.amaas.xyz',
            accentHex: '#2563EB',
            heroTitle: 'উৎসব ও প্রতিদিনের আরামদায়ক দেশীয় পোশাক',
            heroSubtitle: 'ঢাকা থেকে সারাদেশে দ্রুত হোম ডেলিভারি ও সহজ সাইজ এক্সচেঞ্জ সুবিধা।',
            ctaLabel: 'নতুন কালেকশন দেখুন',
            products: [
              { name: 'এমব্রয়ডারি সুতি কুর্তি', price: '৳২,৪৫০', meta: 'সাইজ S – XXL · স্টকে আছে' },
              { name: 'টেক্সচার্ড লিনেন পাঞ্জাবি', price: '৳২,৯৫০', meta: '১০০% পিওর লিনেন · প্রস্তুত' },
              { name: 'হ্যান্ডলুম জামদানি ওড়না', price: '৳৩,৬০০', meta: 'তাঁত বুনন · সীমিত স্টক' },
            ],
          },
          {
            id: 'electronics',
            tabLabel: 'গ্যাজেট ও ইলেকট্রনিক্স',
            storeName: 'VoltGear BD',
            subdomain: 'voltgear.amaas.xyz',
            accentHex: '#0F172A',
            heroTitle: 'অরিজিনাল চার্জার, অডিও ও ডেস্ক অ্যাক্সেসরিজ',
            heroSubtitle: 'অফিশিয়াল ওয়ারেন্টি ও ঢাকা এবং ঢাকার বাইরে নির্ভরযোগ্য কুরিয়ার ডেলিভারি।',
            ctaLabel: 'অ্যাক্সেসরিজ দেখুন',
            products: [
              { name: '65W GaN ফাস্ট চার্জার', price: '৳২,১৯০', meta: 'ডুয়াল Type-C · ৬ মাস ওয়ারেন্টি' },
              { name: 'ANC ওয়্যারলেস ইয়ারবাডস', price: '৳৩,৪৯০', meta: 'Bluetooth 5.3 · ৩২ ঘণ্টা ব্যাটারি' },
              { name: 'অ্যালুমিনিয়াম ল্যাপটপ স্ট্যান্ড', price: '৳১,৬৫০', meta: 'ফোল্ডেবল ডিজাইন · সিলভার' },
            ],
          },
          {
            id: 'food',
            tabLabel: 'অর্গানিক ও ঘরোয়া খাবার',
            storeName: 'PureHarvest',
            subdomain: 'pureharvest.amaas.xyz',
            accentHex: '#059669',
            heroTitle: 'খাঁটি সুন্দরবনের মধু, দেশি ঘি ও অর্গানিক খাবার',
            heroSubtitle: 'মান পরীক্ষিত ব্যাচ ও স্বাস্থ্যসম্মত কাঁচের জারে সারাদেশে ডেলিভারি।',
            ctaLabel: 'ফ্রেশ ব্যাচ অর্ডার করুন',
            products: [
              { name: 'সুন্দরবনের খলিশা ফুলের মধু', price: '৳১,১৫০', meta: '৫০০ গ্রাম জার · খাঁটি' },
              { name: 'পাবনার খাঁটি গাওয়া ঘি', price: '৳১,৪৮০', meta: '৪০০ গ্রাম · স্পেশাল ব্যাচ' },
              { name: 'কাঠের ঘানির সরিষার তেল', price: '৳৪২০', meta: '১ লিটার বোতল · খাঁটি' },
            ],
          },
        ],
      },
      management: {
        eyebrow: 'ওয়েবসাইট ও ব্যবসা ব্যবস্থাপনা',
        title: 'প্রতিদিনের কাজ সহজ, দ্রুত ও নির্ভুল করার জন্য নির্মিত।',
        subtitle:
          'মোবাইল হোক বা ডেস্কটপ—প্রতিটি স্ক্রিন সাজানো হয়েছে যেন আপনি ও আপনার টিম সহজেই কাজ করতে পারেন।',
        cards: [
          {
            tag: 'ক্যাটালগ ও মিডিয়া',
            title: 'সহজ প্রোডাক্ট ও ছবি ব্যবস্থাপনা',
            desc: 'পণ্যের ছবি আপলোড করুন, টাকায় (৳) দাম নির্ধারণ করুন, বিবরণ লিখুন এবং স্টক না থাকলে এক ক্লিকে ভিজিবিলিটি বন্ধ রাখুন।',
            detail: 'ওয়েবসাইট প্ল্যানে সর্বোচ্চ ১০টি সেকশন/পেজ ও ১ জিবি মিডিয়া স্টোরেজ অন্তর্ভুক্ত।',
          },
          {
            tag: 'লোকাল পেমেন্ট',
            title: 'স্বচ্ছ ম্যানুয়াল পেমেন্ট ভেরিফিকেশন',
            desc: 'বিকাশ, নগদ পার্সোনাল বা ব্যাংক ট্রান্সফারের মাধ্যমে পেমেন্ট করুন এবং ড্যাশবোর্ডে সরাসরি স্ট্যাটাস দেখুন।',
            detail: 'Pending Verification, Approved এবং Rejected স্ট্যাটাস স্পষ্টভাবে প্রদর্শিত হয়।',
          },
          {
            tag: 'মোবাইল-ফার্স্ট অভিজ্ঞতা',
            title: 'হাতের স্মার্টফোন থেকেই সম্পূর্ণ নিয়ন্ত্রণ',
            desc: 'আপনার গ্রাহকের ওয়েবসাইট এবং মার্চেন্ট ড্যাশবোর্ড উভয়ই মোবাইল, ট্যাবলেট ও ডেস্কটপে সমানভাবে দ্রুত ও স্বাচ্ছন্দ্যময়।',
            detail: 'মোবাইল ডেটা নেটওয়ার্কেও দ্রুত লোডিং পারফরম্যান্স।',
          },
          {
            tag: 'ডোমেইন স্বাধীনতা',
            title: 'ফ্রি .amaas.xyz দিয়ে শুরু করুন, প্রয়োজনে কাস্টম ডোমেইন যুক্ত করুন',
            desc: 'শুরুতেই আপনার ফ্রি businessname.amaas.xyz সাবডোমেইনে সাইট লাইভ করুন এবং যেকোনো সময় নিজের .com বা .bd ডোমেইন যুক্ত করুন।',
            detail: 'GoAMAAS হোস্টিং অন্তর্ভুক্ত; কাস্টম ডোমেইন রেজিস্ট্রেশন ফি আলাদা।',
          },
        ],
      },
      pricing: {
        eyebrow: 'সহজ ও স্বচ্ছ প্রাইসিং',
        title: 'কোনো লুকানো চার্জ ছাড়া পরিষ্কার বাংলা টাকায় (৳) প্ল্যান।',
        subtitle:
          'মাসে ৳৬০০ টাকায় আপনার ওয়েবসাইট চালু করুন, অথবা ৭ দিনের ফ্রি ট্রায়ালসহ ড্যাশবোর্ড প্ল্যান বেছে নিন।',
        websiteCard: {
          badge: 'অনলাইন উদ্যোক্তাদের প্রথম পছন্দ',
          planLabel: 'অল-ইনক্লুসিভ ওয়েবসাইট সাবস্ক্রিপশন',
          name: 'GoAMAAS Website',
          priceSuffix: '/ মাস (৩০ দিন)',
          zeroUpfront: '৳০ প্রাথমিক ডেভেলপমেন্ট খরচ',
          description:
            'ভিজ্যুয়াল এডিটর ও প্রোডাক্ট ক্যাটালগসহ আপনার ব্যবসার পূর্ণাঙ্গ ওয়েবসাইট তৈরি, হোস্ট ও পরিচালনা করুন।',
          subdomainBoxLabel: 'ফ্রি সাবডোমেইন ও GoAMAAS ক্লাউড হোস্টিং অন্তর্ভুক্ত',
          customDomainNote: 'ঐচ্ছিক কাস্টম ডোমেইন সাপোর্ট (ডোমেইন রেজিস্ট্রেশন ফি আলাদা)',
          features: [
            'সেল্ফ-সার্ভিস ভিজ্যুয়াল ওয়েবসাইট বিল্ডার (লোগো, ব্যানার, থিম ও ক্যাটালগ)',
            'ফ্রি businessname.amaas.xyz সাবডোমেইন',
            'GoAMAAS ইনফ্রাস্ট্রাকচারে ফ্রি ক্লাউড হোস্টিং',
            'মোবাইল ও ডেস্কটপ রেসপনসিভ স্টোরফ্রন্ট ও WhatsApp অর্ডারিং',
            'পেমেন্ট যাচাই সম্পন্ন হলেই স্বয়ংক্রিয় লাইভ পাবলিশিং',
            'মেয়াদ শেষে ৭ দিনের গ্রেস পিরিয়ড ও সম্পূর্ণ ডেটা সংরক্ষণ',
          ],
          cta: 'ওয়েবসাইট তৈরি করুন — ৳৬০০/মাস',
        },
        dashboardSection: {
          label: 'মার্চেন্ট অপারেশনস ড্যাশবোর্ড প্ল্যানসমূহ',
          trialBadge: '৭ দিনের ফ্রি ট্রায়াল',
          perMonth: '/ মাস',
          popularBadge: 'জনপ্রিয়',
          cta: '৭ দিনের ট্রায়াল শুরু করুন',
          compareAllCta: 'সব প্ল্যান, এআই ও কাস্টম প্যাকেজ তুলনা করুন',
        },
      },
      faq: {
        eyebrow: 'সচরাচর জিজ্ঞাসিত প্রশ্ন (FAQ)',
        title: 'শুরু করার আগে আপনার প্রয়োজনীয় প্রশ্নগুলোর পরিষ্কার উত্তর।',
        subtitle: 'প্রাইসিং, ডোমেইন, হোস্টিং এবং পেমেন্ট যাচাইকরণ সম্পর্কে স্বচ্ছ ধারণা নিন।',
        items: [
          {
            q: 'GoAMAAS-এ ওয়েবসাইট তৈরি করতে কি কোডিং বা টেকনিক্যাল জ্ঞান লাগে?',
            a: 'না। GoAMAAS-এর ৫-ধাপের সহজ বিল্ডারে আপনি ক্যাটাগরি নির্বাচন করে ব্যবসার নাম, পণ্যের ছবি ও দাম লিখে ডেস্কটপ ও মোবাইল প্রিভিউ দেখে সহজেই ওয়েবসাইট তৈরি করতে পারবেন।',
          },
          {
            q: '৳৬০০/মাস GoAMAAS Website সাবস্ক্রিপশনে কী কী অন্তর্ভুক্ত?',
            a: 'প্রতি ৩০ দিনের ৳৬০০ প্ল্যানে ভিজ্যুয়াল ওয়েবসাইট বিল্ডার, প্রোডাক্ট ক্যাটালগ ম্যানেজার, GoAMAAS ক্লাউড হোস্টিং, SSL সাপোর্ট এবং একটি ফ্রি businessname.amaas.xyz সাবডোমেইন অন্তর্ভুক্ত থাকে—শুরুতে কোনো আলাদা ডেভেলপমেন্ট ফি নেই।',
          },
          {
            q: 'কাস্টম ডোমেইন (.com / .bd) কি ফ্রি নাকি আলাদাভাবে কিনতে হয়?',
            a: 'আপনার businessname.amaas.xyz সাবডোমেইন এবং GoAMAAS ক্লাউড হোস্টিং সম্পূর্ণ অন্তর্ভুক্ত। তবে আপনি যদি নিজস্ব কাস্টম ডোমেইন (যেমন yourbrand.com) ব্যবহার করতে চান, সেটি যুক্ত করার সুবিধা রয়েছে—কিন্তু ডোমেইন কেনা ও বার্ষিক রিনিউয়াল ফি ডোমেইন রেজিস্ট্রারকে আলাদাভাবে পরিশোধ করতে হয়।',
          },
          {
            q: 'বিকাশ, নগদ পার্সোনাল এবং ব্যাংক ট্রান্সফারের মাধ্যমে কীভাবে পেমেন্ট করব?',
            a: 'পেমেন্ট মোডালে বিকাশ, নগদ পার্সোনাল (প্রদর্শিত প্রাপক নম্বরে Send Money), অথবা ব্যাংক ট্রান্সফার বেছে নিয়ে নির্ধারিত পরিমাণ টাকা পাঠান এবং আপনার Transaction ID (TrxID) ও প্রেরকের নম্বর সাবমিট করুন। যাচাই সম্পন্ন হলেই আপনার সাবস্ক্রিপশন সক্রিয় হবে এবং ওয়েবসাইট লাইভ হবে।',
          },
          {
            q: 'ড্যাশবোর্ড প্ল্যানের ৭ দিনের ফ্রি ট্রায়াল কীভাবে কাজ করে?',
            a: 'চারটি ড্যাশবোর্ড প্ল্যানেই (Starter ৳২৯৯, Business ৳৫৯৯, Pro ৳৯৯৯ এবং Enterprise ৳১,৯৯৯) ৭ দিনের ফ্রি ট্রায়াল রয়েছে, যাতে আপনি অর্ডার ম্যানেজমেন্ট, ইনভেন্টরি ও অ্যানালিটিক্স ব্যবহার করে দেখে সিদ্ধান্ত নিতে পারেন।',
          },
          {
            q: 'মাসিক সাবস্ক্রিপশনের মেয়াদ শেষ হলে ওয়েবসাইটের কী হবে?',
            a: 'মেয়াদ পূর্ণ হলে আপনার ওয়েবসাইট ৭ দিনের গ্রেস পিরিয়ডে থাকবে যাতে আপনি নিরবচ্ছিন্নভাবে রিনিউ করতে পারেন। মেয়াদোত্তীর্ণ হলেও আপনার পণ্যের তথ্য, ছবি ও সেটিংস সুরক্ষিত থাকে।',
          },
        ],
      },
      finalCta: {
        eyebrow: 'অনলাইনে আপনার ব্র্যান্ড চালু করতে প্রস্তুত?',
        title: 'আজই আপনার ব্যবসার জন্য একটি আধুনিক ও দ্রুতগতির ওয়েবসাইট তৈরি করুন।',
        subtitle:
          'কয়েক মিনিটে স্টোরফ্রন্ট সাজান, ফ্রি .amaas.xyz ঠিকানা নিন এবং আত্মবিশ্বাসের সাথে পণ্য ও অর্ডার পরিচালনা করুন।',
        primaryCta: 'আপনার ওয়েবসাইট তৈরি করুন',
        secondaryCta: 'টিমের সাথে কথা বলুন',
        footnote: '৳৬০০/মাস ওয়েবসাইট প্ল্যান · ফ্রি .amaas.xyz সাবডোমেইন ও GoAMAAS হোস্টিং · বিকাশ, নগদ ও ব্যাংক সাপোর্ট',
      },
    },
    featuresPage: {
      seoTitle: 'ফিচারসমূহ — GoAMAAS ওয়েবসাইট ও বিজনেস প্ল্যাটফর্ম',
      seoDescription:
        'GoAMAAS-এর সকল ফিচার দেখুন: ভিজ্যুয়াল ওয়েবসাইট বিল্ডার, মাল্টি-চ্যানেল অর্ডার হাব, ইনভেন্টরি ট্র্যাকিং, ল্যান্ডিং পেজ, অ্যানালিটিক্স এবং কাস্টম ওয়েব ডেভেলপমেন্ট।',
      eyebrow: 'প্ল্যাটফর্মের সক্ষমতা',
      title: 'দ্রুতগতি, স্বচ্ছ হিসাব এবং গোছানো ব্যবসা পরিচালনার জন্য নির্মিত।',
      subtitle:
        'অগোছালো চ্যাট ও স্প্রেডশিটের বদলে আপনার পুরো ব্যবসাকে একটি আধুনিক ও নিরাপদ সিস্টেমে নিয়ে আসুন।',
      cards: [
        {
          title: 'মাল্টি-চ্যানেল অর্ডার ম্যানেজমেন্ট হাব',
          desc: 'আপনার ওয়েবসাইট, মেসেঞ্জার, WhatsApp ও ক্যাম্পেইন পেজের সব অর্ডার এক জায়গায় পরিচালনা করুন এবং এক ক্লিকে ইনভয়েস প্রিন্ট করুন।',
          highlights: [
            'স্পষ্ট অর্ডার ধাপ (Pending → Confirmed → Shipped → Delivered)',
            'Steadfast, Pathao ও RedX কুরিয়ার ডিসপ্যাচ সাপোর্ট (কনফিগার করা থাকলে)',
            'গ্রাহকের অর্ডার ইতিহাস ও রিপিট কাস্টমার ট্র্যাকিং',
            'হিসাব ও গুদাম ব্যবস্থাপনার জন্য CSV/Excel এক্সপোর্ট',
          ],
        },
        {
          title: 'রিয়েল-টাইম ইনভেন্টরি ও স্টক অডিট',
          desc: 'প্রতিটি পণ্যের নিখুঁত স্টক হিসাব রাখুন। স্টক কমে গেলে অ্যালার্ট পান এবং প্রতিটি পরিবর্তনের সময়ভিত্তিক রেকর্ড দেখুন।',
          highlights: [
            'কাস্টমাইজযোগ্য লো-স্টক সতর্কবার্তা',
            'স্টক সংযোজন ও বিক্রয়ের সম্পূর্ণ অডিট লগ',
            'Enterprise প্ল্যানে মাল্টি-ব্রাঞ্চ সুবিধা',
            'টেবিল থেকেই দ্রুত স্টক আপডেট শর্টকাট',
          ],
        },
        {
          title: 'ভিজ্যুয়াল ওয়েবসাইট ও ল্যান্ডিং পেজ বিল্ডার',
          desc: 'মাসে ৳৬০০ টাকায় পূর্ণাঙ্গ বিজনেস ওয়েবসাইট তৈরি করুন অথবা ক্যাম্পেইনের জন্য মোবাইল-অপ্টিমাইজড ল্যান্ডিং পেজ সাজান।',
          highlights: [
            'ডেস্কটপ ও মোবাইলের রিয়েল-টাইম প্রিভিউ',
            'ফ্রি businessname.amaas.xyz সাবডোমেইন ও GoAMAAS ক্লাউড হোস্টিং',
            'ব্র্যান্ড কালার, ফন্ট, লোগো ও ব্যানার কাস্টমাইজেশন',
            'সরাসরি ক্যাশ অন ডেলিভারি ও WhatsApp অর্ডার বাটন',
          ],
        },
        {
          title: 'ম্যানেজড এআই অটোমেশন ওয়ার্কফ্লো',
          desc: 'মেসেঞ্জার বা WhatsApp-এ সাধারণ প্রশ্নের উত্তর, লিড সংগ্রহ এবং ফলো-আপের জন্য ঐচ্ছিক মাসিক অটোমেশন প্যাকেজ।',
          highlights: [
            'মেসেঞ্জার অথবা WhatsApp কনভারসেশনাল অ্যাসিস্ট্যান্ট',
            'গ্রাহকের তথ্য ও ফোন নম্বর সংগ্রহ ওয়ার্কফ্লো',
            'অর্ডার আপডেট নোটিফিকেশন ফ্লো',
            'সফটওয়্যার ফি ও তৃতীয় পক্ষের API চার্জের স্বচ্ছ নীতিমালা',
          ],
        },
        {
          title: 'সেলস অ্যানালিটিক্স ও লাভ-ক্ষতির হিসাব',
          desc: 'মোট বিক্রি, নিট মুনাফা, জনপ্রিয় পণ্য এবং ডেলিভারি পারফরম্যান্স পরিষ্কার চার্ট ও রিপোর্টের মাধ্যমে বিশ্লেষণ করুন।',
          highlights: [
            'তারিখ অনুযায়ী রেভিনিউ ও অর্ডার ট্রেন্ড চার্ট',
            'ডেলিভারি ধাপ অনুযায়ী পারফরম্যান্স বিশ্লেষণ',
            'সেরা বিক্রিত পণ্যের তালিকা ও কাস্টমার ইনসাইটস',
            'ব্যবসার মালিকদের জন্য ডাউনলোডযোগ্য রিপোর্ট',
          ],
        },
        {
          title: 'AMAAS কাস্টম ওয়েব ডেভেলপমেন্ট সার্ভিস',
          desc: 'আপনার ব্র্যান্ডের জন্য কি সম্পূর্ণ কাস্টম ডিজাইনের মাল্টি-পেজ ওয়েবসাইট প্রয়োজন? আমাদের ইঞ্জিনিয়ারিং টিম এককালীন ৳৮,০০০ থেকে প্রজেক্ট তৈরি করে।',
          highlights: [
            'আপনার রিকোয়ারমেন্ট অনুযায়ী কাস্টম রেসপনসিভ ডিজাইন',
            'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত (কাস্টম ডোমেইন ফি আলাদা)',
            'WhatsApp, ইনকোয়ারি ফর্ম এবং অন-পেজ SEO সেটআপ',
            'ড্যাশবোর্ড থেকেই প্রজেক্ট রিকোয়েস্ট ও অগ্রগতি ট্র্যাকিং',
          ],
        },
      ],
      ctaTitle: 'আপনার অনলাইন স্টোর তৈরি করুন অথবা ড্যাশবোর্ড পরখ করুন',
      ctaSubtitle:
        'মাসে ৳৬০০ টাকায় GoAMAAS Website চালু করুন অথবা যেকোনো ড্যাশবোর্ড প্ল্যানে ৭ দিনের ফ্রি ট্রায়াল শুরু করুন।',
      ctaPrimary: 'ওয়েবসাইট তৈরি করুন',
      ctaSecondary: '৭ দিনের ফ্রি ট্রায়াল',
    },
    solutionsPage: {
      seoTitle: 'ব্যবসাভিত্তিক সলিউশন — GoAMAAS by AMAAS Technologies',
      seoDescription:
        'ফ্যাশন বুটিক, গ্যাজেট শপ, অর্গানিক ফুড, D2C ব্র্যান্ড ও পাইকারি ব্যবসার জন্য GoAMAAS-এর বিশেষায়িত সমাধান।',
      eyebrow: 'ব্যবসাভিত্তিক সলিউশন',
      title: 'আপনার ব্যবসার ধরন অনুযায়ী সাজানো কার্যকর ওয়ার্কফ্লো।',
      subtitle:
        'আপনি ফেসবুকে পোশাক বিক্রি করুন, ঢাকায় গ্যাজেট শপ চালান বা সারাদেশে পাইকারি পণ্য সরবরাহ করুন—GoAMAAS আপনার কাজের ধরনে মানিয়ে নেয়।',
      industries: [
        {
          title: 'ফ্যাশন, পোশাক ও বুটিক ব্র্যান্ড',
          tagline: 'নতুন কালেকশন, সাইজ ভ্যারিয়েশন ও দ্রুত মোবাইল অর্ডার ব্যবস্থাপনা।',
          points: [
            'সাইজ, ফেব্রিক ও দামসহ আকর্ষণীয় প্রোডাক্ট কার্ড',
            'ওয়েবসাইটে রিটার্ন ও সাইজ এক্সচেঞ্জ নীতিমালা প্রদর্শন',
            'ঈদ ও মৌসুমি কালেকশনের জন্য ক্যাম্পেইন ল্যান্ডিং পেজ',
            'সরাসরি WhatsApp ও ক্যাশ অন ডেলিভারি অর্ডার সুবিধা',
          ],
        },
        {
          title: 'ইলেকট্রনিক্স ও গ্যাজেট শপ',
          tagline: 'স্পেসিফিকেশন, ওয়ারেন্টি তথ্য ও অর্ডার কনফার্মেশন ট্র্যাকিং।',
          points: [
            'SKU ট্র্যাকিং ও পেশাদার প্রিন্টেবল ইনভয়েস',
            'কুরিয়ারে পাঠানোর আগে অর্ডার যাচাইকরণ ধাপ',
            'পণ্যের টেকনিক্যাল স্পেসিফিকেশন স্পষ্টভাবে উপস্থাপন',
            'দ্রুত শেষ হওয়া অ্যাক্সেসরিজের জন্য লো-স্টক অ্যালার্ট',
          ],
        },
        {
          title: 'অর্গানিক ফুড ও ঘরোয়া পণ্য',
          tagline: 'তাজা ব্যাচের তথ্য, প্যাক সাইজ ও নিয়মিত গ্রাহকের দ্রুত রি-অর্ডার।',
          points: [
            'ওজন ও জার অনুযায়ী স্পষ্ট দাম এবং স্টক স্ট্যাটাস',
            'পরিবারের নিয়মিত ক্রেতাদের জন্য সহজ WhatsApp ও ফোন অর্ডার',
            'ঢাকার ভেতরে ও বাইরে ডেলিভারি চার্জ প্রদর্শন',
            'নতুন ব্যাচ এলে তাৎক্ষণিক ক্যাটালগ আপডেট',
          ],
        },
        {
          title: 'ডিরেক্ট-টু-কনজিউমার (D2C) ব্র্যান্ড',
          tagline: 'বিজ্ঞাপনের ট্রাফিককে ধীর চ্যাটের বদলে দ্রুতগতির ওয়েবসাইটে রূপান্তর করুন।',
          points: [
            'ক্যাম্পেইন ল্যান্ডিং পেজ এবং পূর্ণাঙ্গ ব্র্যান্ড স্টোরফ্রন্ট',
            'মোবাইল-অপ্টিমাইজড অর্ডার ও ইনকোয়ারি অভিজ্ঞতা',
            'কেন্দ্রীয় কাস্টমার ও অর্ডার ডাটাবেস',
            'ব্যবসা বড় হওয়ার সাথে সাথে Business, Pro ও Enterprise প্ল্যান',
          ],
        },
        {
          title: 'সার্ভিস প্রতিষ্ঠান, ক্লিনিক ও এজেন্সি',
          tagline: 'সেবার তালিকা, দক্ষতা ও অ্যাপয়েন্টমেন্ট বুকিং পেশাদারভাবে তুলে ধরুন।',
          points: [
            'ক্লিনিক, স্যালন, রিয়েল এস্টেট ও এজেন্সির জন্য রেডি লেআউট',
            'সার্ভিস প্যাকেজ ও কনসালটেশন বুকিং বাটন',
            'ফ্রি পেশাদার businessname.amaas.xyz ওয়েব ঠিকানা',
            'প্রতিষ্ঠিত প্রতিষ্ঠানের জন্য ঐচ্ছিক কাস্টম ডোমেইন সুবিধা',
          ],
        },
      ],
      bannerBadge: 'AMAAS কাস্টম ইঞ্জিনিয়ারিং স্টুডিও',
      bannerTitle: 'সম্পূর্ণ কাস্টম ডিজাইনের ওয়েবসাইট প্রয়োজন? এককালীন ৳৮,০০০ থেকে শুরু।',
      bannerDesc:
        'আমাদের ইঞ্জিনিয়ারিং টিম আপনার প্রজেক্টের চাহিদা অনুযায়ী আধুনিক React ও Tailwind ওয়েবসাইট তৈরি করে, যেখানে ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত থাকে। কাস্টম ডোমেইন রেজিস্ট্রেশন ও রিনিউয়াল ফি রেজিস্ট্রার চার্জ অনুযায়ী আলাদা।',
      bannerPrimaryCta: 'কাস্টম ওয়েবসাইট রিকোয়েস্ট করুন',
      bannerSecondaryCta: 'ওয়েবসাইট প্ল্যানগুলো তুলনা করুন',
    },
    pricingPage: {
      seoTitle: 'প্রাইসিং ও প্ল্যান — GoAMAAS Website (৳৬০০/মাস) ও ড্যাশবোর্ড প্ল্যান',
      seoDescription:
        'বাংলাদেশি টাকায় (৳) স্বচ্ছ প্রাইসিং: GoAMAAS Website সাবস্ক্রিপশন ৳৬০০/মাস, ড্যাশবোর্ড প্ল্যান ৳২৯৯/মাস থেকে, এআই অটোমেশন ও কাস্টম ওয়েবসাইট প্যাকেজ।',
      eyebrow: 'বাংলাদেশি টাকায় (৳) স্বচ্ছ ও পরিষ্কার প্রাইসিং',
      title: 'আপনার ব্যবসার প্রতিটি ধাপের জন্য সাশ্রয়ী ও নির্ভরযোগ্য প্ল্যান।',
      subtitle:
        'মাসে ৳৬০০ টাকায় অল-ইনক্লুসিভ ওয়েবসাইট সাবস্ক্রিপশন নিন, ৭ দিনের ফ্রি ট্রায়ালে ড্যাশবোর্ড শুরু করুন, অথবা কাস্টম ডেভেলপমেন্ট বেছে নিন।',
      tabs: {
        websiteSub: 'ওয়েবসাইট সাবস্ক্রিপশন (৳৬০০/মাস)',
        dashboard: 'ড্যাশবোর্ড প্ল্যান',
        automations: 'এআই অটোমেশন',
        customWeb: 'কাস্টম ওয়েব (এককালীন)',
      },
      common: {
        perMonth: '/ মাস',
        mostPopular: 'সবচেয়ে জনপ্রিয়',
        recommended: 'রিকমেন্ডেড',
        freeTrialBadge: '৭ দিনের ফ্রি ট্রায়াল',
        currentlyUnavailable: 'বর্তমানে অনুপলব্ধ',
        currentActivePlan: 'আপনার বর্তমান প্ল্যান',
        cancel: 'বাতিল',
        included: 'অন্তর্ভুক্ত',
        unlimited: 'আনলিমিটেড',
        whenConfigured: 'কনফিগার করা থাকলে',
        sevenDaysFree: '৭ দিন ফ্রি',
      },
      dashboardTab: {
        kicker: 'মাসিক সফটওয়্যার সাবস্ক্রিপশন',
        subnote: 'প্রতিটি ড্যাশবোর্ড প্ল্যানে ৭ দিনের ফ্রি ট্রায়াল রয়েছে। যেকোনো সময় প্ল্যান পরিবর্তন করা যাবে।',
        integrationNoteLabel: 'ইন্টিগ্রেশন নোট:',
        integrationNoteBody:
          'Steadfast, Pathao, RedX বা WhatsApp API ইন্টিগ্রেশন সচল করতে Settings-এ আপনার নিজস্ব সক্রিয় মার্চেন্ট API কী (Credentials) যুক্ত করতে হবে।',
        plans: {
          starter: {
            name: 'Starter',
            subtitle: 'নতুন অনলাইন বিক্রেতাদের জন্য',
            description: 'পণ্য, অর্ডার এবং প্রতিদিনের বিক্রি গুছিয়ে রাখার প্রয়োজনীয় টুলস।',
            features: [
              'প্রোডাক্ট ম্যানেজমেন্ট',
              'অর্ডার ম্যানেজমেন্ট',
              'কাস্টমার তালিকা',
              'বেসিক সেলস ড্যাশবোর্ড',
              'অর্ডার স্ট্যাটাস ট্র্যাকিং',
              'মাসে সর্বোচ্চ ৩০০ অর্ডার',
              '১ জন ইউজার',
              '৭ দিনের ফ্রি ট্রায়াল',
            ],
            ctaLabel: 'ফ্রি ট্রায়াল শুরু করুন',
          },
          business: {
            name: 'Business',
            subtitle: 'ক্রমবর্ধমান অনলাইন ব্যবসার জন্য',
            description: 'ইনভেন্টরি ট্র্যাকিং, রিপোর্ট ও কুরিয়ার ব্যবস্থাপনাসহ পূর্ণাঙ্গ নিয়ন্ত্রণ।',
            features: [
              'Starter প্ল্যানের সব সুবিধা',
              'আনলিমিটেড অর্ডার',
              'ইনভেন্টরি ও স্টক ম্যানেজমেন্ট',
              'অ্যাডভান্সড সেলস অ্যানালিটিক্স',
              'গ্রাহকের ক্রয় ইতিহাস',
              'CSV / Excel এক্সপোর্ট',
              'কুরিয়ার ম্যানেজমেন্ট',
              'সর্বোচ্চ ৩ জন স্টাফ ইউজার',
              '৭ দিনের ফ্রি ট্রায়াল',
            ],
            ctaLabel: 'ফ্রি ট্রায়াল শুরু করুন',
          },
          pro: {
            name: 'Pro',
            subtitle: 'প্রতিষ্ঠিত ব্র্যান্ডের জন্য',
            description: 'মাল্টি-স্টোর নিয়ন্ত্রণ, লাভ-ক্ষতির হিসাব এবং কনফিগারযোগ্য API সংযোগ।',
            features: [
              'Business প্ল্যানের সব সুবিধা',
              'একাধিক স্টোর পরিচালনা',
              'লাভ-ক্ষতি (Profit/Loss) ট্র্যাকিং',
              'অ্যাডভান্সড রিপোর্টস',
              'কুরিয়ার API ইন্টিগ্রেশন (কনফিগার করা থাকলে)',
              'WhatsApp নোটিফিকেশন ইন্টিগ্রেশন (কনফিগার করা থাকলে)',
              'সর্বোচ্চ ১০ জন স্টাফ ইউজার',
              'প্রায়োরিটি সাপোর্ট',
              '৭ দিনের ফ্রি ট্রায়াল',
            ],
            ctaLabel: 'ফ্রি ট্রায়াল শুরু করুন',
          },
          enterprise: {
            name: 'Enterprise',
            subtitle: 'বড় ও মাল্টি-ব্রাঞ্চ প্রতিষ্ঠানের জন্য',
            description: 'মাল্টি-ব্রাঞ্চ অপারেশন, কাস্টম রিপোর্ট, এআই অ্যাসিস্ট্যান্ট ও পূর্ণ API সুবিধা।',
            features: [
              'Pro প্ল্যানের সব সুবিধা',
              'একাধিক ব্রাঞ্চ ও আউটলেট',
              'অ্যাডভান্সড বিজনেস অটোমেশন',
              'এআই বিজনেস অ্যাসিস্ট্যান্ট',
              'কাস্টম রিপোর্টস',
              'API অ্যাক্সেস',
              'আনলিমিটেড স্টাফ ইউজার',
              'ডেডিকেটেড সাপোর্ট',
              '৭ দিনের ফ্রি ট্রায়াল',
            ],
            ctaLabel: 'ফ্রি ট্রায়াল শুরু করুন',
          },
        },
      },
      automationsTab: {
        kicker: 'মাসিক ম্যানেজড অটোমেশন সার্ভিস',
        subnote: 'ড্যাশবোর্ড সাবস্ক্রিপশন থেকে আলাদা। কনভারসেশনাল বট ও ওয়ার্কফ্লো পরিচালনার মাসিক ফি।',
        disclosureTitle: 'তৃতীয় পক্ষের API ও মেটা বিলিং সংক্রান্ত তথ্য',
        disclosureBody:
          'অফিশিয়াল WhatsApp Business Cloud API কনভারসেশন চার্জ (Meta), ফেসবুক মেসেঞ্জার প্ল্যাটফর্ম চার্জ, বাহ্যিক SMS গেটওয়ে এবং এআই মডেল ব্যবহারের খরচ সংশ্লিষ্ট প্রোভাইডার সরাসরি বিল করে—এগুলো GoAMAAS সার্ভিস ফির অন্তর্ভুক্ত নয়।',
        packages: {
          basic_auto: {
            name: 'Basic Automation',
            setupFeeLabel: '৳১,০০০ এককালীন সেটআপ ফি',
            description: 'লিড সংগ্রহ এবং প্রাথমিক কাস্টমার ফলো-আপ অটোমেট করুন।',
            features: [
              '১টি কনফিগার করা ওয়ার্কফ্লো',
              'লিড ক্যাপচার অটোমেশন',
              'বেসিক কাস্টমার ফলো-আপ',
              'মাসিক পারফরম্যান্স সারসংক্ষেপ',
              'স্ট্যান্ডার্ড সাপোর্ট',
            ],
            ctaLabel: 'অটোমেশন বেছে নিন',
          },
          growth_auto: {
            name: 'Growth Automation',
            setupFeeLabel: '৳১,৫০০ এককালীন সেটআপ ফি',
            description: 'কাস্টমার ফলো-আপ, অর্ডার স্ট্যাটাস অ্যালার্ট ও লিড ম্যানেজমেন্ট অটোমেট করুন।',
            features: [
              'সর্বোচ্চ ৩টি ওয়ার্কফ্লো',
              'কাস্টমার ফলো-আপ অটোমেশন',
              'লিড ম্যানেজমেন্ট অটোমেশন',
              'অর্ডার নোটিফিকেশন ওয়ার্কফ্লো',
              'মাসিক পারফরম্যান্স রিপোর্ট',
              'স্ট্যান্ডার্ড সাপোর্ট',
            ],
            ctaLabel: 'অটোমেশন বেছে নিন',
          },
          ai_chatbot: {
            name: 'AI Chatbot',
            setupFeeLabel: 'প্রাথমিক সেটআপ অন্তর্ভুক্ত',
            description: 'Facebook Messenger অথবা WhatsApp-এর জন্য ২৪/৭ কনভারসেশনাল অ্যাসিস্ট্যান্ট।',
            features: [
              'Messenger অথবা WhatsApp-এর জন্য ১টি এআই চ্যাটবট',
              'ব্যবসার সাধারণ প্রশ্নের (FAQ) স্বয়ংক্রিয় উত্তর',
              'কাস্টমার লিড সংগ্রহ',
              'পণ্য বিষয়ক জিজ্ঞাসার উত্তর',
              'কনভারসেশন ইনসাইটস',
              'প্রাথমিক সেটআপ অন্তর্ভুক্ত',
            ],
            ctaLabel: 'সেটআপ রিকোয়েস্ট করুন',
          },
          biz_auto_pro: {
            name: 'Business Automation Pro',
            setupFeeLabel: 'প্রায়োরিটি অনবোর্ডিং অন্তর্ভুক্ত',
            description: 'CRM ইন্টিগ্রেশন ও প্রায়োরিটি সাপোর্টসহ পূর্ণাঙ্গ অটোমেশন স্যুট।',
            features: [
              'সর্বোচ্চ ৫টি কনফিগার করা ওয়ার্কফ্লো',
              'Messenger অথবা WhatsApp-এর জন্য ১টি এআই চ্যাটবট',
              'লিড ক্যাপচার ও ফলো-আপ',
              'কাস্টমার নোটিফিকেশন অটোমেশন',
              'CRM ওয়ার্কফ্লো ইন্টিগ্রেশন',
              'মাসিক পারফরম্যান্স রিপোর্ট',
              'প্রায়োরিটি সাপোর্ট',
            ],
            ctaLabel: 'অটোমেশন বেছে নিন',
          },
        },
      },
      webSubTab: {
        kicker: 'একটিই অল-ইনক্লুসিভ ওয়েবসাইট প্ল্যান',
        title: 'GoAMAAS Website — ৳৬০০ টাকা / মাস',
        subtitlePrefix: '৩০ দিনের একটি সহজ সাবস্ক্রিপশন—যেখানে GoAMAAS ক্লাউড হোস্টিং ও আপনার ফ্রি',
        subtitleSuffix: 'সাবডোমেইন অন্তর্ভুক্ত এবং ঐচ্ছিক কাস্টম ডোমেইন যুক্ত করার সুবিধা রয়েছে।',
        bestBadge: 'অনলাইন ব্যবসার জন্য সেরা',
        planTypeLabel: '৩০ দিনের ওয়েবসাইট সাবস্ক্রিপশন',
        planSubtitle: 'কোনো প্রাথমিক ডেভেলপমেন্ট খরচ ছাড়াই নিজের ব্যবসার ওয়েবসাইট তৈরি ও হোস্ট করুন।',
        zeroUpfront: '৳০ প্রাথমিক ডেভেলপমেন্ট ফি',
        freeSubdomainLabel: 'ফ্রি সাবডোমেইন অন্তর্ভুক্ত:',
        customDomainSeparate: 'ঐচ্ছিক কাস্টম ডোমেইন সাপোর্ট (ডোমেইন রেজিস্ট্রেশন ফি আলাদা)',
        includedHeading: '৳৬০০/মাস সাবস্ক্রিপশনে যা যা অন্তর্ভুক্ত:',
        features: [
          'সেল্ফ-সার্ভিস ভিজ্যুয়াল ওয়েবসাইট বিল্ডার (লোগো, হিরো ব্যানার, সেকশন ও থিম)',
          'ফ্রি সাবডোমেইন: businessname.amaas.xyz',
          'GoAMAAS ইনফ্রাস্ট্রাকচারে ফ্রি ক্লাউড হোস্টিং',
          'ঐচ্ছিক কাস্টম ডোমেইন সাপোর্ট (ডোমেইন রেজিস্ট্রেশন গ্রাহক আলাদাভাবে পরিশোধ করবেন)',
          'ক্লাউড ইমেজ আপলোড ও ভিজিবিলিটি কন্ট্রোলসহ প্রোডাক্ট ক্যাটালগ ম্যানেজার',
          'ই-কমার্স, ফ্যাশন, রেস্টুরেন্ট, ক্লিনিক, স্যালন, এজেন্সিসহ সব ধরনের ব্যবসার টেমপ্লেট',
          'ব্র্যান্ড কালার, ফন্ট প্রিসেট এবং রেসপনসিভ ডেস্কটপ ও মোবাইল লেআউট',
          'ব্যবসার ফোন, ঠিকানা, সোশ্যাল লিংক ও সরাসরি WhatsApp অর্ডারিং',
          'যেকোনো সময় ড্রাফট সেভ ও তাৎক্ষণিক লাইভ আপডেট সুবিধা',
          'বিকাশ, নগদ পার্সোনাল বা ব্যাংক ট্রান্সফারের মাধ্যমে ৩০ দিনের সহজ রিনিউয়াল',
          'সাপোর্টেড ডোমেইনে SSL/HTTPS সক্রিয়',
        ],
        limitsHeading: 'রিসোর্স সীমা ও ফেয়ার ইউজেস:',
        limitPages: 'পেজ / সেকশন',
        limitPagesVal: (n) => `সর্বোচ্চ ${n}টি পেজ`,
        limitStorage: 'মিডিয়া স্টোরেজ',
        limitStorageVal: (mb) => `${mb} MB (১ GB)`,
        limitBandwidth: 'মাসিক ব্যান্ডউইথ',
        limitBandwidthVal: (gb) => `${gb} GB / মাস`,
        limitUpdates: 'কনটেন্ট এডিট',
        limitUpdatesVal: () => 'আনলিমিটেড সেল্ফ-সার্ভিস এডিট',
        startCta: (price) => `ওয়েবসাইট তৈরি করুন — ৳${price.toLocaleString()}/মাস`,
        startSubnote: 'শুরুতে ৳০ ফি · লাইভ ডেস্কটপ ও মোবাইল প্রিভিউ · ৭ দিনের রিনিউয়াল গ্রেস পিরিয়ড',
        howKicker: '৩ ধাপে সহজ লঞ্চ',
        howTitle: 'ওয়েবসাইট সাবস্ক্রিপশন যেভাবে কাজ করে',
        howSteps: [
          {
            title: '১. ব্র্যান্ড তথ্য ও সাবডোমেইন নির্বাচন',
            desc: 'আপনার ব্যবসার ক্যাটাগরি ও নাম লিখুন এবং ফ্রি businessname.amaas.xyz ঠিকানাটি রিজার্ভ করুন।',
          },
          {
            title: '২. পণ্য সংযোজন ও ডিজাইন প্রিভিউ',
            desc: 'লোগো, ব্যানার ও পণ্যের ছবি-দাম যুক্ত করে ডেস্কটপ ও মোবাইল প্রিভিউ পরীক্ষা করুন।',
          },
          {
            title: '৩. পেমেন্ট যাচাই ও স্বয়ংক্রিয় পাবলিশ',
            desc: 'বিকাশ, নগদ পার্সোনাল বা ব্যাংক ট্রান্সফারে ৳৬০০ জমা দিন—যাচাই হলেই সাইট লাইভ হয়ে যাবে।',
          },
        ],
        compKicker: 'স্বচ্ছ তুলনা',
        compTitle: 'ওয়েবসাইট সাবস্ক্রিপশন বনাম এককালীন কাস্টম ডেভেলপমেন্ট',
        compSubtitle: 'মাসিক সাশ্রয়ী সাবস্ক্রিপশন অথবা কাস্টম ইঞ্জিনিয়ারিং প্রজেক্টের পার্থক্য দেখুন।',
        compColFeature: 'বিষয়',
        compColSub: 'GoAMAAS Website (৳৬০০/মাস)',
        compColOneTime: 'কাস্টম ডেভেলপমেন্ট (৳৮,০০০+)',
        compRows: [
          {
            feature: 'প্রাইসিং মডেল',
            subscriptionPlan: '৳৬০০ / ৩০ দিন (অল-ইনক্লুসিভ সাবস্ক্রিপশন)',
            oneTimePackages: '৳৮,০০০ থেকে ৳২৫,০০০ (এককালীন প্রজেক্ট ফি)',
          },
          {
            feature: 'প্রাথমিক ডেভেলপমেন্ট খরচ',
            subscriptionPlan: '৳০ (সেল্ফ-সার্ভিস ভিজ্যুয়াল বিল্ডার)',
            oneTimePackages: 'নির্ধারিত প্রজেক্ট ফি',
          },
          {
            feature: 'ডোমেইন ও সাবডোমেইন',
            subscriptionPlan: 'ফ্রি businessname.amaas.xyz + ঐচ্ছিক কাস্টম ডোমেইন (চার্জ আলাদা)',
            oneTimePackages: 'কাস্টম ডোমেইন কানেকশন সাপোর্ট (রেজিস্ট্রেশন চার্জ আলাদা)',
          },
          {
            feature: 'ক্লাউড হোস্টিং',
            subscriptionPlan: '৳৬০০/মাস প্ল্যানেই GoAMAAS ক্লাউড হোস্টিং অন্তর্ভুক্ত',
            oneTimePackages: 'প্রাথমিক ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত; রিনিউয়াল আলাদা',
          },
          {
            feature: 'পণ্য ও তথ্য পরিবর্তন',
            subscriptionPlan: 'যেকোনো সময় নিজেই ভিজ্যুয়াল এডিটরে আপডেট',
            oneTimePackages: 'Business/Advanced-এ CMS থাকে; কাস্টম কোড পরিবর্তনে আলাদা কোটেশন',
          },
          {
            feature: 'লাইভ হওয়ার সময়',
            subscriptionPlan: 'কয়েক মিনিটে তৈরি; পেমেন্ট যাচাই হলেই তাৎক্ষণিক লাইভ',
            oneTimePackages: 'প্যাকেজ ভেদে আনুমানিক ৪–১৬ কার্যদিবস',
          },
        ],
        termsHeading: 'সাবস্ক্রিপশন শর্তাবলি ও অবকাঠামোগত স্বচ্ছতা',
        disclosures: [
          'একক প্ল্যান মূল্য: প্রতি ৩০ দিনের বিলিং সাইকেলে ৳৬০০ টাকা; কোনো প্রাথমিক ডেভেলপমেন্ট চার্জ নেই।',
          'GoAMAAS ক্লাউড হোস্টিং এবং ফ্রি সাবডোমেইন (businessname.amaas.xyz) অন্তর্ভুক্ত। কাস্টম ডোমেইন রেজিস্ট্রেশন ফি গ্রাহক আলাদাভাবে বহন করবেন।',
          'ম্যানুয়াল পেমেন্ট যাচাই সম্পন্ন হলে বৈধ ওয়েবসাইট স্বয়ংক্রিয়ভাবে লাইভ হয় এবং সাবস্ক্রিপশন ৩০ দিনের জন্য নবায়ন হয়।',
          'বিলিং মেয়াদ শেষ হলে ওয়েবসাইট ৭ দিনের গ্রেস পিরিয়ডে থাকে এবং গ্রাহকের সকল ডেটা ও কনফিগারেশন সংরক্ষিত থাকে।',
        ],
      },
      customWebTab: {
        kicker: 'এককালীন কাস্টম ইঞ্জিনিয়ারিং প্রজেক্ট',
        subnote: 'AMAAS ইঞ্জিনিয়ারদের তৈরি কাস্টম ওয়েবসাইট। কাস্টম ডোমেইন রেজিস্ট্রেশন চার্জ আলাদা।',
        oneTimeFeeLabel: 'এককালীন প্রজেক্ট ফি',
        packages: {
          starter_web: {
            name: 'Starter Website',
            description: 'নতুন ব্যবসা, শপ ও সার্ভিস প্রতিষ্ঠানের জন্য আধুনিক রেসপনসিভ ওয়েবসাইট।',
            estimatedTimeline: 'আনুমানিক সময়: ৪–৬ কার্যদিবস',
            domainHostingBenefit: 'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত · কাস্টম ডোমেইন চার্জ আলাদা',
            features: [
              'সর্বোচ্চ ৫টি পেজ',
              'আধুনিক মোবাইল ও ডেস্কটপ রেসপনসিভ ডিজাইন',
              'কন্টাক্ট ও ইনকোয়ারি ফর্ম',
              'সরাসরি WhatsApp বাটন',
              'বেসিক অন-পেজ SEO সেটআপ',
              'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত (কাস্টম ডোমেইন চার্জ আলাদা)',
            ],
            scopeNote:
              'কাস্টম ই-কমার্স ডাটাবেস, পেইড থার্ড-পার্টি ইন্টিগ্রেশন এবং ডোমেইন রেজিস্ট্রেশন ফি প্যাকেজের বাইরে আলাদাভাবে নির্ধারিত হবে।',
            ctaLabel: 'Starter ওয়েবসাইট রিকোয়েস্ট করুন',
          },
          business_web: {
            name: 'Business Website',
            description: 'এডিটেবল CMS ও ইন্টারঅ্যাক্টিভ ফিচারসহ প্রিমিয়াম কাস্টম বিজনেস ওয়েবসাইট।',
            estimatedTimeline: 'আনুমানিক সময়: ৭–১০ কার্যদিবস',
            domainHostingBenefit: 'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত · কাস্টম ডোমেইন চার্জ আলাদা',
            features: [
              'সর্বোচ্চ ১০টি পেজ',
              'প্রিমিয়াম কাস্টম ডিজাইন ও রেসপনসিভ লেআউট',
              'কনটেন্ট পরিবর্তনের জন্য CMS সুবিধা',
              'লিড ক্যাপচার ও ইনকোয়ারি ফর্ম',
              'WhatsApp ও Google Maps ইন্টিগ্রেশন',
              'অন-পেজ SEO ও স্পিড অপ্টিমাইজেশন',
              'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত (কাস্টম ডোমেইন চার্জ আলাদা)',
            ],
            scopeNote:
              'কাস্টম ই-কমার্স কার্ট, পেইড থার্ড-পার্টি API এবং ডোমেইন রেজিস্ট্রেশন ফি আলাদাভাবে নির্ধারিত হবে।',
            ctaLabel: 'Business ওয়েবসাইট রিকোয়েস্ট করুন',
          },
          advanced_web: {
            name: 'Advanced Website',
            description: 'অ্যাডভান্সড লিড ক্যাপচার, অ্যানালিটিক্স ও টেকনিক্যাল SEO সমৃদ্ধ কাস্টম ওয়েব আর্কিটেকচার।',
            estimatedTimeline: 'আনুমানিক সময়: ১২–১৬ কার্যদিবস',
            domainHostingBenefit: 'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত · কাস্টম ডোমেইন চার্জ আলাদা',
            features: [
              'সর্বোচ্চ ১৫টি পেজ',
              'অ্যাডভান্সড কাস্টম UI ও CMS ইন্টিগ্রেশন',
              'মাল্টি-স্টেপ ফর্ম ও লিড রাউটিং',
              'স্কোপ অনুযায়ী চ্যাটবট UI সংযোজন',
              'অ্যানালিটিক্স ও টেকনিক্যাল SEO সেটআপ',
              'পারফরম্যান্স অপ্টিমাইজেশন',
              'ক্লাউড ডিপ্লয়মেন্ট সেটআপ অন্তর্ভুক্ত (কাস্টম ডোমেইন চার্জ আলাদা)',
            ],
            scopeNote:
              'জটিল কাস্টম ব্যাকএন্ড, পেইড থার্ড-পার্টি API এবং ডোমেইন রেজিস্ট্রেশন ফি আলাদাভাবে নির্ধারিত হবে।',
            ctaLabel: 'Advanced ওয়েবসাইট রিকোয়েস্ট করুন',
          },
        },
      },
      matrix: {
        title: 'ড্যাশবোর্ড প্ল্যান তুলনামূলক ছক',
        subtitle: 'চারটি SaaS প্ল্যানের সীমা ও সুবিধাসমূহ এক নজরে দেখুন।',
        colCapability: 'সুবিধা / সক্ষমতা',
        rows: [
          {
            label: 'মাসিক অর্ডার সীমা',
            starter: '৩০০ অর্ডার',
            business: 'আনলিমিটেড',
            pro: 'আনলিমিটেড',
            enterprise: 'আনলিমিটেড',
          },
          {
            label: 'স্টাফ ইউজার অ্যাকাউন্ট',
            starter: '১ জন ইউজার',
            business: '৩ জন ইউজার',
            pro: '১০ জন ইউজার',
            enterprise: 'আনলিমিটেড',
          },
          {
            label: 'ইনভেন্টরি ও স্টক ট্র্যাকিং',
            starter: '—',
            business: 'অন্তর্ভুক্ত',
            pro: 'অন্তর্ভুক্ত',
            enterprise: 'অন্তর্ভুক্ত',
          },
          {
            label: 'কুরিয়ার ম্যানেজমেন্ট',
            starter: 'ম্যানুয়াল ট্র্যাকিং',
            business: 'অন্তর্ভুক্ত',
            pro: 'API সিঙ্ক (কনফিগার করা থাকলে)',
            enterprise: 'API সিঙ্ক (কনফিগার করা থাকলে)',
          },
          {
            label: 'একাধিক স্টোর / ব্রাঞ্চ',
            starter: '১টি স্টোর',
            business: '১টি স্টোর',
            pro: 'একাধিক স্টোর',
            enterprise: 'একাধিক ব্রাঞ্চ ও আউটলেট',
          },
          {
            label: 'WhatsApp ও SMS ইন্টিগ্রেশন',
            starter: '—',
            business: '—',
            pro: 'কনফিগার করা থাকলে',
            enterprise: 'কনফিগার করা থাকলে',
          },
          {
            label: 'ফ্রি ট্রায়াল সুবিধা',
            starter: '৭ দিন ফ্রি',
            business: '৭ দিন ফ্রি',
            pro: '৭ দিন ফ্রি',
            enterprise: '৭ দিন ফ্রি',
          },
        ],
      },
      commercialDisclosuresTitle: 'বাণিজ্যিক শর্তাবলি ও সেবার পরিধি',
      commercialDisclosures: [
        'তৃতীয় পক্ষের প্ল্যাটফর্ম চার্জ: অফিশিয়াল WhatsApp Business API চার্জ (Meta), মেসেঞ্জার ফি, SMS গেটওয়ে ইউনিট এবং এআই মডেল ব্যবহারের খরচ সংশ্লিষ্ট প্রোভাইডার সরাসরি বিল করে।',
        'ইন্টিগ্রেশন কনফিগারেশন: কুরিয়ার API এবং WhatsApp ইন্টিগ্রেশন কার্যকর করতে মার্চেন্টের নিজস্ব সক্রিয় API ক্রেডেনশিয়াল প্রয়োজন।',
        'ডোমেইন নীতিমালা: GoAMAAS Website (৳৬০০/মাস) প্ল্যানে ফ্রি businessname.amaas.xyz সাবডোমেইন ও ক্লাউড হোস্টিং অন্তর্ভুক্ত। কাস্টম ডোমেইন (.com, .bd ইত্যাদি) রেজিস্ট্রেশন চার্জ আলাদা।',
        'ম্যানুয়াল পেমেন্ট যাচাইকরণ: বিকাশ, নগদ পার্সোনাল অথবা ব্যাংক ট্রান্সফারের মাধ্যমে প্রদত্ত পেমেন্ট Transaction ID যাচাইয়ের পর সক্রিয় হয়।',
      ],
      faqTitle: 'প্রাইসিং ও বিলিং সংক্রান্ত প্রশ্নোত্তর',
      faqSubtitle: 'সাবস্ক্রিপশন, ডোমেইন, ফ্রি ট্রায়াল ও পেমেন্ট পদ্ধতি সম্পর্কে পরিষ্কার উত্তর।',
      faqs: [
        {
          q: 'ড্যাশবোর্ড প্ল্যানের ৭ দিনের ফ্রি ট্রায়াল কীভাবে কাজ করে?',
          a: 'চারটি ড্যাশবোর্ড প্ল্যানেই (Starter, Business, Pro, Enterprise) ৭ দিনের ফ্রি ট্রায়াল রয়েছে, যাতে আপনি অগ্রিম পেমেন্ট ছাড়াই অর্ডার ও ইনভেন্টরি ম্যানেজমেন্ট যাচাই করতে পারেন।',
        },
        {
          q: '৳৬০০/মাস GoAMAAS Website প্ল্যানে কী কী সুবিধা পাব?',
          a: 'প্রতি ৩০ দিনের সাইকেলে ভিজ্যুয়াল ওয়েবসাইট বিল্ডার, প্রোডাক্ট ক্যাটালগ ম্যানেজমেন্ট, GoAMAAS ক্লাউড হোস্টিং এবং একটি ফ্রি businessname.amaas.xyz সাবডোমেইন পাবেন।',
        },
        {
          q: 'কাস্টম ডোমেইন (.com / .xyz / .bd) কি প্ল্যানের সাথে ফ্রি?',
          a: 'না—ডোমেইন বিষয়ে আমরা সম্পূর্ণ স্বচ্ছ। আপনার businessname.amaas.xyz সাবডোমেইনটি ফ্রি, তবে নিজস্ব কাস্টম ডোমেইন কিনতে ও নবায়ন করতে রেজিস্ট্রার চার্জ আলাদাভাবে প্রযোজ্য।',
        },
        {
          q: 'নগদ, বিকাশ বা ব্যাংক ট্রান্সফারের মাধ্যমে কীভাবে পেমেন্ট জমা দেব?',
          a: 'পেমেন্ট মোডালে আপনার পছন্দের মাধ্যম নির্বাচন করুন, প্রদর্শিত নির্দিষ্ট পরিমাণ টাকা পাঠান (নগদ পার্সোনালের ক্ষেত্রে প্রদর্শিত নম্বরে Send Money করুন) এবং আপনার TrxID ও প্রেরকের নম্বর সাবমিট করুন।',
        },
        {
          q: 'কুরিয়ার API ও WhatsApp ইন্টিগ্রেশন কখন কাজ শুরু করে?',
          a: 'ড্যাশবোর্ডের Settings থেকে Steadfast, Pathao, RedX অথবা Meta-এর বৈধ API কী যুক্ত করার পর লাইভ ডেটা আদান-প্রদান সচল হয়।',
        },
      ],
      modals: {
        confirmPlanTitle: (name) => `প্ল্যান নির্বাচন নিশ্চিত করুন — ${name}`,
        billingType: 'বিলিং ধরন:',
        monthlySubscription: 'মাসিক সাবস্ক্রিপশন',
        subscriptionPrice: 'মাসিক মূল্য:',
        trialPeriod: 'ট্রায়াল মেয়াদ:',
        includedFeatures: 'অন্তর্ভুক্ত সুবিধাসমূহ:',
        confirmApplyPlan: 'নিশ্চিত করুন ও বিলিংয়ে যান',
        proceedTrialSignup: 'ফ্রি ট্রায়াল রেজিস্ট্রেশনে যান',
        confirmAutoTitle: (name) => `অটোমেশন রিকোয়েস্ট নিশ্চিত করুন — ${name}`,
        monthlyManagedFee: 'মাসিক ম্যানেজড সার্ভিস ফি',
        serviceFee: 'মাসিক ফি:',
        setupFee: 'সেটআপ ফি:',
        metaBillingNote:
          'নোট: WhatsApp Cloud API কনভারসেশন চার্জ ও মেটা প্ল্যাটফর্ম ফি মেটা কর্তৃক আলাদাভাবে বিল করা হয়।',
        submitSetupRequest: 'সেটআপ রিকোয়েস্ট পাঠান',
        autoToastSuccess: (name) =>
          `${name}-এর সেটআপ রিকোয়েস্ট গৃহীত হয়েছে। আমাদের ইঞ্জিনিয়ারিং টিম শীঘ্রই যোগাযোগ করবে।`,
        webBriefTitle: (name) => `কাস্টম ওয়েবসাইট ব্রিফ — ${name}`,
        oneTimeProjectFee: 'এককালীন প্রজেক্ট ফি',
        totalProjectPrice: 'প্রজেক্ট মূল্য:',
        hostingAndDomain: 'ডিপ্লয়মেন্ট ও ডোমেইন:',
        hostingSetupIncluded: 'ক্লাউড সেটআপ অন্তর্ভুক্ত · কাস্টম ডোমেইন আলাদা',
        timeline: 'আনুমানিক সময়:',
        webBriefHelper:
          'আপনার প্রয়োজনীয় পেজ, ফিচার ও রেফারেন্স তথ্য দিতে পরের ফর্মে এগিয়ে যান।',
        proceedRequirements: 'রিকোয়ারমেন্ট ফর্মে যান →',
      },
    },
    aboutPage: {
      seoTitle: 'আমাদের সম্পর্কে — AMAAS Technologies ও GoAMAAS',
      seoDescription:
        'জানুন কীভাবে খুলনার ফুলবাড়িগেট, কুয়েট-৯২০৩ থেকে AMAAS Technologies বাংলাদেশি উদ্যোক্তাদের জন্য আধুনিক ওয়েবসাইট ও ই-কমার্স ম্যানেজমেন্ট সফটওয়্যার তৈরি করছে।',
      eyebrow: 'AMAAS Technologies সম্পর্কে',
      title: 'আধুনিক উদ্যোক্তাদের জন্য সহজ ও নির্ভরযোগ্য ডিজিটাল অবকাঠামো।',
      subtitle:
        'AMAAS Technologies এমন সফটওয়্যার তৈরি করে যাতে যেকোনো উদ্যোক্তা জটিল প্রযুক্তি ছাড়াই পেশাদার ওয়েবসাইট ও গোছানো ব্যবসা পরিচালনা করতে পারেন।',
      storyTitle: 'কেন আমরা GoAMAAS তৈরি করেছি',
      storyP1:
        'বাংলাদেশে অসংখ্য উদ্যোক্তা সোশ্যাল মিডিয়ায় চমৎকার পণ্যের ব্যবসা গড়ে তুললেও ইনবক্সে অর্ডার সামলাতে, স্টক হিসাব রাখতে এবং বড় অঙ্কের এজেন্সি খরচের কারণে নিজস্ব ওয়েবসাইট চালু করতে হিমশিম খান।',
      storyP2:
        'সেই বাস্তব সমস্যা সমাধানে আমরা তৈরি করেছি GoAMAAS—যেখানে ভিজ্যুয়াল ওয়েবসাইট বিল্ডার, ফ্রি .amaas.xyz ক্লাউড হোস্টিং, প্রোডাক্ট ক্যাটালগ, ক্যাশ অন ডেলিভারি অর্ডার হাব এবং বিকাশ/নগদ/ব্যাংক বিলিং এক প্ল্যাটফর্মে যুক্ত।',
      stat1Val: 'BDT ৳',
      stat1Label: 'স্বচ্ছ দেশীয় প্রাইসিং',
      stat2Val: 'খুলনা',
      stat2Label: 'ইন-হাউস প্রোডাক্ট ইঞ্জিনিয়ারিং',
      founderRole: 'প্রতিষ্ঠাতা ও চিফ আর্কিটেক্ট, AMAAS Technologies',
      founderQuote:
        '"ভালো বিজনেস সফটওয়্যার পরিচালনা করতে প্রযুক্তিবিদ হওয়ার প্রয়োজন নেই। GoAMAAS-এর লক্ষ্য হলো প্রতিটি উদ্যোক্তার হাতে একটি পরিচ্ছন্ন, দ্রুত ও বিশ্বাসযোগ্য ডিজিটাল প্ল্যাটফর্ম তুলে দেওয়া।"',
      values: [
        {
          title: 'জটিলতামুক্ত ও দ্রুত অভিজ্ঞতা',
          desc: 'অপ্রয়োজনীয় জটিল মেনু বাদ দিয়ে আমরা প্রতিটি স্ক্রিন এমনভাবে সাজিয়েছি যেন মোবাইল বা কম্পিউটার থেকে দ্রুত কাজ সারা যায়।',
        },
        {
          title: 'ডেটা নিরাপত্তা ও গোপনীয়তা',
          desc: 'আপনার পণ্যের তালিকা, গ্রাহকের তথ্য ও বিক্রির হিসাব সম্পূর্ণ আপনার প্রতিষ্ঠানের নিজস্ব—প্রতিটি ওয়ার্কস্পেস নিরাপদভাবে আলাদা।',
        },
        {
          title: 'স্বচ্ছ বাণিজ্যিক নীতিমালা',
          desc: 'কোনো লুকানো চার্জ বা বিভ্রান্তিকর ডোমেইন দাবি নয়—পরিষ্কার টাকায় মূল্য তালিকা এবং যাচাইযোগ্য বিলিং রেকর্ড।',
        },
      ],
      hqTitle: 'খুলনা, বাংলাদেশ থেকে পরিচালিত',
      hqSubtitle: 'ফুলবাড়িগেট, কুয়েট-৯২০৩, খুলনা, বাংলাদেশ · AMAAS Technologies · +8801605012812',
      hqCta: 'আমাদের সাথে যোগাযোগ করুন',
      hqDirectionsCta: 'গুগল ম্যাপে দেখুন',
    },
    contactPage: {
      seoTitle: 'যোগাযোগ — AMAAS Technologies ও GoAMAAS সাপোর্ট',
      seoDescription:
        'ওয়েবসাইট সাবস্ক্রিপশন, কাস্টম ওয়েব ডেভেলপমেন্ট বা ড্যাশবোর্ড প্ল্যান বিষয়ে খুলনায় (ফুলবাড়িগেট, কুয়েট-৯২০৩, +8801605012812) আমাদের AMAAS Technologies টিমের সাথে যোগাযোগ করুন।',
      eyebrow: 'AMAAS-এর সাথে যোগাযোগ',
      title: 'আমাদের প্রোডাক্ট ও সাপোর্ট টিমের সাথে সরাসরি কথা বলুন।',
      subtitle:
        'GoAMAAS ওয়েবসাইট চালু করা, কাস্টম ডোমেইন যুক্ত করা বা এন্টারপ্রাইজ প্ল্যান সম্পর্কে যেকোনো প্রশ্নে নিচের ফর্মে বার্তা পাঠান।',
      directChannels: 'সরাসরি যোগাযোগের মাধ্যম',
      headOffice: 'প্রধান কার্যালয়',
      headOfficeVal: 'ফুলবাড়িগেট, কুয়েট-৯২০৩, খুলনা, বাংলাদেশ',
      directionsLabel: 'গুগল ম্যাপে দেখুন',
      officialWebsiteLabel: 'অফিশিয়াল ওয়েবসাইট',
      engSales: 'ইমেইল',
      hotlineLabel: 'হটলাইন ও WhatsApp',
      hotlineVal: '+8801605012812 (শনি–বৃহস্পতি, সকাল ১০টা – রাত ৮টা)',
      techSupport: 'টেকনিক্যাল সাপোর্ট',
      techSupportVal: 'নিবেদিত মার্চেন্ট সহায়তা এবং Pro/Enterprise প্ল্যানে প্রায়োরিটি সাপোর্ট',
      customWebPromptPrefix: 'কাস্টম ওয়েবসাইট ডেভেলপমেন্ট প্রজেক্টের জন্য বিস্তারিত জানাতে ব্যবহার করুন আমাদের ',
      customWebPromptLink: 'ওয়েবসাইট সার্ভিস রিকোয়েস্ট ফর্ম',
      formTitle: 'বার্তা পাঠান',
      fullName: 'পূর্ণ নাম *',
      fullNamePlaceholder: 'যেমন: আরিফ রহমান',
      businessEmail: 'ইমেইল ঠিকানা *',
      phoneWhatsapp: 'ফোন / WhatsApp নম্বর',
      topic: 'বিষয়',
      topics: [
        { value: 'General Inquiry', label: 'সাধারণ জিজ্ঞাসা' },
        { value: 'GoAMAAS Website (৳600/mo)', label: 'GoAMAAS ওয়েবসাইট সাবস্ক্রিপশন (৳৬০০/মাস)' },
        { value: 'Website Development (৳8,000+)', label: 'কাস্টম ওয়েবসাইট ডেভেলপমেন্ট (৳৮,০০০+)' },
        { value: 'Courier API Setup', label: 'কুরিয়ার ও API ইন্টিগ্রেশন' },
        { value: 'Enterprise Plan', label: 'Enterprise প্ল্যান জিজ্ঞাসা' },
      ],
      message: 'আপনার বার্তা *',
      messagePlaceholder: 'আপনার ব্যবসা, ওয়েবসাইটের প্রয়োজন বা প্রশ্ন সংক্ষেপে লিখুন...',
      sending: 'পাঠানো হচ্ছে...',
      sendMessage: 'বার্তা পাঠান',
      receivedTitle: 'বার্তা গৃহীত হয়েছে!',
      receivedBody: (name, email) =>
        `ধন্যবাদ, ${name}। আমাদের টিম আপনার বার্তাটি পেয়েছে এবং শীঘ্রই ${email} ঠিকানায় উত্তর দেবে।`,
      sendAnother: 'আরেকটি বার্তা পাঠান',
      toastRequired: 'অনুগ্রহ করে সকল আবশ্যক ঘর পূরণ করুন।',
      toastDelivered: 'ধন্যবাদ! আপনার বার্তাটি AMAAS টিমের কাছে পাঠানো হয়েছে।',
    },
    createWebsitePage: {
      seoTitle: 'আপনার ওয়েবসাইট তৈরি করুন — GoAMAAS ওয়েবসাইট বিল্ডার',
      seoDescription:
        'মাসে ৳৬০০ টাকায় ফ্রি ক্লাউড হোস্টিং ও ফ্রি businessname.amaas.xyz সাবডোমেইনসহ আপনার ব্যবসার ওয়েবসাইট তৈরি ও পাবলিশ করুন।',
      planBarPeriod: '৩০ দিনের বিলিং মেয়াদ · ফ্রি GoAMAAS হোস্টিং ও .amaas.xyz সাবডোমেইন',
      openVisualEditor: 'ভিজ্যুয়াল ওয়েবসাইট এডিটর খুলুন →',
      steps: [
        '১. ক্যাটাগরি',
        '২. ব্যবসা ও ডোমেইন',
        '৩. পণ্যসমূহ',
        '৪. ডিজাইন ও প্রিভিউ',
        '৫. পেমেন্ট ও পাবলিশ',
      ],
      stepOf: (current, total) => `ধাপ ${current} / ${total}`,
      groups: {
        All: 'সবগুলো',
        Commerce: 'ই-কমার্স ও শপ',
        'Food & Hospitality': 'রেস্টুরেন্ট ও ফুড',
        'Property & Construction': 'প্রপার্টি ও ডিজাইন',
        'Health & Personal Care': 'স্বাস্থ্য ও কেয়ার',
        'Professional Services': 'প্রফেশনাল সার্ভিস',
        'Flexible Categories': 'কাস্টম',
      },
      categories: {
        ecommerce: {
          label: 'ই-কমার্স ও অনলাইন স্টোর',
          groupLabel: 'ই-কমার্স ও শপ',
          shortDesc: 'ক্যাশ অন ডেলিভারি ও সরাসরি WhatsApp অর্ডারসহ ডিজিটাল প্রোডাক্ট ক্যাটালগ।',
          itemTypeLabel: 'পণ্যসমূহ',
        },
        fashion: {
          label: 'ফ্যাশন ও ক্লোদিং বুটিক',
          groupLabel: 'ই-কমার্স ও শপ',
          shortDesc: 'পোশাক কালেকশন, সাইজ তথ্য ও মৌসুমি লুকবুক প্রদর্শন।',
          itemTypeLabel: 'পোশাক আইটেম',
        },
        restaurant: {
          label: 'রেস্টুরেন্ট ও ডাইনিং',
          groupLabel: 'রেস্টুরেন্ট ও ফুড',
          shortDesc: 'ডিজিটাল মেনু, স্পেশাল আইটেম, খোলার সময় ও হোম ডেলিভারি অর্ডার।',
          itemTypeLabel: 'মেনু আইটেম',
        },
        cafe: {
          label: 'ক্যাফে ও বেকারি',
          groupLabel: 'রেস্টুরেন্ট ও ফুড',
          shortDesc: 'স্পেশালিটি কফি, বেকারি আইটেম ও আউটলেটের অবস্থান।',
          itemTypeLabel: 'মেনু আইটেম',
        },
        real_estate: {
          label: 'রিয়েল এস্টেট ও প্রপার্টি',
          groupLabel: 'প্রপার্টি ও ডিজাইন',
          shortDesc: 'অ্যাপার্টমেন্ট ও কমার্শিয়াল স্পেস তালিকা এবং সাইট ভিজিট বুকিং।',
          itemTypeLabel: 'প্রপার্টি তালিকা',
        },
        architecture: {
          label: 'আর্কিটেকচার ও ইন্টেরিয়র ডিজাইন',
          groupLabel: 'প্রপার্টি ও ডিজাইন',
          shortDesc: 'প্রজেক্ট পোর্টফোলিও, ইন্টেরিয়র ডিজাইন ও কনসালটেশন বুকিং।',
          itemTypeLabel: 'প্রজেক্টসমূহ',
        },
        clinic: {
          label: 'মেডিকেল ও ডেন্টাল ক্লিনিক',
          groupLabel: 'স্বাস্থ্য ও কেয়ার',
          shortDesc: 'চিকিৎসা সেবা, ডাক্তারদের চেম্বার সময় ও অ্যাপয়েন্টমেন্ট বুকিং।',
          itemTypeLabel: 'সেবাসমূহ',
        },
        salon: {
          label: 'বিউটি স্যালন ও ওয়েলনেস স্পা',
          groupLabel: 'স্বাস্থ্য ও কেয়ার',
          shortDesc: 'সার্ভিস প্যাকেজ, ব্রাইডাল মেকওভার ও বুকিং সুবিধা।',
          itemTypeLabel: 'প্যাকেজসমূহ',
        },
        gym: {
          label: 'জিম ও ফিটনেস স্টুডিও',
          groupLabel: 'স্বাস্থ্য ও কেয়ার',
          shortDesc: 'মেম্বারশিপ প্ল্যান, পার্সোনাল ট্রেনিং ও জিমের সময়সূচি।',
          itemTypeLabel: 'মেম্বারশিপ প্ল্যান',
        },
        agency: {
          label: 'ক্রিয়েটিভ ও ডিজিটাল এজেন্সি',
          groupLabel: 'প্রফেশনাল সার্ভিস',
          shortDesc: 'ব্র্যান্ডিং, মার্কেটিং ও টেক সার্ভিস উপস্থাপন এবং প্রপোজাল ইনকোয়ারি।',
          itemTypeLabel: 'সার্ভিস সলিউশন',
        },
        portfolio: {
          label: 'ফ্রিল্যান্সার ও কনসালট্যান্ট পোর্টফোলিও',
          groupLabel: 'প্রফেশনাল সার্ভিস',
          shortDesc: 'কাজের নমুনা, অভিজ্ঞতা ও সরাসরি পরামর্শ বুকিং।',
          itemTypeLabel: 'প্রজেক্ট ও সেবা',
        },
        other: {
          label: 'কাস্টম বিজনেস ওয়েবসাইট',
          groupLabel: 'কাস্টম',
          shortDesc: 'যেকোনো বাণিজ্যিক প্রতিষ্ঠান বা সংগঠনের উপযোগী ফ্লেক্সিবল লেআউট।',
          itemTypeLabel: 'পণ্য / সেবা',
        },
      },
      step1: {
        title: 'আপনার ব্যবসার ক্যাটাগরি নির্বাচন করুন',
        subtitle:
          'আপনার ব্যবসার সাথে মানানসই লেআউটটি বেছে নিন। পরবর্তীতে প্রতিটি সেকশন, রং, ছবি ও পণ্য ইচ্ছেমতো পরিবর্তন করতে পারবেন।',
        searchPlaceholder: 'ক্যাটাগরি খুঁজুন (যেমন: fashion, cafe, clinic)...',
        selectContinue: 'নির্বাচন করে এগিয়ে যান',
      },
      step2: {
        title: 'ব্যবসার পরিচয় ও ফ্রি সাবডোমেইন',
        subtitlePrefix: 'আপনার ফ্রি',
        subtitleSuffix:
          'ঠিকানাটি রিজার্ভ করুন। ঐচ্ছিক ঘরগুলো ফাঁকা রাখলে পাবলিশড সাইটে তা পরিচ্ছন্নভাবে বাদ থাকবে।',
        businessNameLabel: 'ব্যবসা / ব্র্যান্ডের নাম *',
        businessNamePlaceholder: 'যেমন: Urban Fashion',
        subdomainLabel: 'ফ্রি GoAMAAS সাবডোমেইন (businessname.amaas.xyz) *',
        subdomainReserved: (sub) =>
          `https://${sub}.amaas.xyz সাবডোমেইনটি আপনার সেভ করা ওয়েবসাইটের জন্য সংরক্ষিত।`,
        subdomainChecking: 'সাবডোমেইন যাচাই করা হচ্ছে...',
        subdomainAvailable: (sub) => `https://${sub}.amaas.xyz খালি আছে!`,
        subdomainMinChars: 'সাবডোমেইন কমপক্ষে ৩ অক্ষরের হতে হবে।',
        subdomainTaken: 'এই সাবডোমেইনটি ইতিমধ্যে ব্যবহৃত বা সংরক্ষিত।',
        subdomainVerifyError: 'সাবডোমেইন যাচাই করা যায়নি। আবার চেষ্টা করুন।',
        customDomainLabel: 'ঐচ্ছিক কাস্টম ডোমেইন (যদি আপনার কেনা থাকে)',
        customDomainPlaceholder: 'যেমন: www.yourbrand.com (ডোমেইন রেজিস্ট্রেশন ফি আলাদা)',
        customDomainNote:
          'আপনার ৳৬০০/মাস প্ল্যানে ফ্রি GoAMAAS হোস্টিং ও .amaas.xyz সাবডোমেইন অন্তর্ভুক্ত। কাস্টম ডোমেইন কেনার খরচ ডোমেইন রেজিস্ট্রারকে আলাদাভাবে পরিশোধ করতে হয়।',
        phoneLabel: 'গ্রাহক যোগাযোগের ফোন নম্বর',
        whatsappLabel: 'WhatsApp অর্ডার / ইনকোয়ারি নম্বর',
        emailLabel: 'পাবলিক বিজনেস ইমেইল (ঐচ্ছিক)',
        addressLabel: 'দোকান / অফিসের ঠিকানা (ঐচ্ছিক)',
        addressPlaceholder: 'যেমন: রোড ১১, বনানী, ঢাকা',
        facebookLabel: 'Facebook পেজ লিংক (ঐচ্ছিক)',
        instagramLabel: 'Instagram প্রোফাইল লিংক (ঐচ্ছিক)',
        heroHeadlineLabel: 'হিরো শিরোনাম (Headline)',
        heroSubheadlineLabel: 'হিরো সংক্ষিপ্ত বিবরণ',
        primaryCtaTextLabel: 'মূল বাটনের লেখা (Primary CTA)',
        primaryCtaDestLabel: 'মূল বাটনের কাজ',
        destWhatsapp: 'সরাসরি WhatsApp ইনকোয়ারি',
        destCatalog: 'পণ্য / ক্যাটালগ সেকশনে স্ক্রল',
        destContact: 'যোগাযোগ সেকশনে স্ক্রল',
        destAbout: 'আমাদের সম্পর্কে সেকশনে স্ক্রল',
        changeCategory: 'ক্যাটাগরি পরিবর্তন',
        continueProducts: 'পণ্য সংযোজনে এগিয়ে যান',
      },
      step3: {
        title: (itemType) => `আপনার প্রধান ${itemType} যুক্ত করুন`,
        subtitle:
          'পণ্যের নাম, মূল্য (৳), বিবরণ ও ছবি যুক্ত করুন। এগুলো আপনার ডাটাবেস ক্যাটালগে সংরক্ষিত হবে এবং যেকোনো সময় আপডেট করা যাবে।',
        itemNumber: (n) => `আইটেম #${n}`,
        removeItemTitle: 'আইটেম মুছুন',
        itemNameLabel: 'পণ্য / সেবার নাম *',
        priceLabel: 'মূল্য *',
        descLabel: 'সংক্ষিপ্ত বিবরণ',
        photoAttached: 'পণ্যের ছবি যুক্ত হয়েছে',
        uploading: 'আপলোড হচ্ছে...',
        uploadProductImage: 'পণ্যের ছবি আপলোড করুন',
        addAnother: 'আরেকটি পণ্য / সেবা যুক্ত করুন',
        back: 'পেছনে যান',
        continueDesign: 'ডিজাইন ও প্রিভিউতে যান',
      },
      step4: {
        subtitleBadge: 'ডিজাইন, মিডিয়া ও লাইভ প্রিভিউ',
        title: 'ব্র্যান্ডিং সাজান এবং লাইভ প্রিভিউ দেখুন',
        subtitle:
          'লোগো ও হিরো ব্যানার আপলোড করুন, কালার প্যালেট বেছে নিন এবং সেভ করার আগে ডেস্কটপ ও মোবাইল ভিউ পরীক্ষা করুন।',
        logoLabel: 'ব্যবসার লোগো (ঐচ্ছিক)',
        removeLogo: 'লোগো সরান',
        uploadLogo: 'লোগো আপলোড করুন (PNG/JPG)',
        heroImageLabel: 'হিরো ব্যানার ছবি (ঐচ্ছিক)',
        removeHero: 'ব্যানার সরান',
        uploadHero: 'হিরো ছবি আপলোড করুন',
        heroLayoutLabel: 'হিরো লেআউট',
        layoutSplit: 'স্প্লিট',
        layoutCentered: 'সেন্টার্ড',
        layoutCover: 'কভার',
        typographyLabel: 'টাইপোগ্রাফি',
        fontModern: 'মডার্ন',
        fontEditorial: 'এডিটোরিয়াল',
        fontBold: 'বোল্ড',
        fontMinimal: 'মিনিমাল',
        buttonsLabel: 'বাটন স্টাইল',
        btnRounded: 'রাউন্ডেড',
        btnPill: 'পিল',
        btnSharp: 'শার্প',
        livePreviewLabel: 'লাইভ প্রিভিউ:',
        desktop: 'ডেস্কটপ',
        mobile: 'মোবাইল',
        saveErrorTitle: 'ওয়েবসাইট সেভ করা যায়নি',
        savingWebsite: 'ওয়েবসাইট সেভ হচ্ছে...',
        saveAndProceed: 'ওয়েবসাইট সেভ করুন ও অ্যাক্টিভেশনে যান',
      },
      step5: {
        title: 'ওয়েবসাইট সেভ হয়েছে ও সাবডোমেইন সংরক্ষিত',
        savedAtPrefix: 'আপনার ওয়েবসাইটটি সংরক্ষিত হয়েছে এই ঠিকানায়:',
        autoPublishTitle: (planName) => `${planName} — পেমেন্ট যাচাইয়ে স্বয়ংক্রিয় লাইভ পাবলিশিং`,
        autoPublishBody: (fee, domain) =>
          `নিচে বিকাশ, নগদ পার্সোনাল অথবা ব্যাংক ট্রান্সফারের মাধ্যমে আপনার মাসিক ৳${fee} BDT পেমেন্ট সাবমিট করুন। আমাদের অপারেশনস টিম পেমেন্ট যাচাই করলেই আপনার ওয়েবসাইট স্বয়ংক্রিয়ভাবে https://${domain} ঠিকানায় ৩০ দিনের জন্য লাইভ হয়ে যাবে।`,
        billingPeriod30: '৩০ দিনের বিলিং মেয়াদ',
        perMonth: '/ মাস',
        bullet1: (domain) =>
          `ফ্রি ${domain} সাবডোমেইন এবং GoAMAAS ইনফ্রাস্ট্রাকচারে ফ্রি ক্লাউড হোস্টিং`,
        bullet2:
          'পূর্ণাঙ্গ ভিজ্যুয়াল ওয়েবসাইট এডিটর (সেকশন, লোগো, ব্যানার, থিম, পণ্য ও ছবি)',
        bullet3:
          'ঐচ্ছিক কাস্টম ডোমেইন কানেকশন সুবিধা (ডোমেইন রেজিস্ট্রেশন ফি আলাদা)',
        bullet4: 'সরাসরি WhatsApp অর্ডারিং ও ৩০ দিনের সহজ রিনিউয়াল সাইকেল',
        submitPaymentBtn: (fee) => `৳${fee} পেমেন্ট সাবমিট করুন (বিকাশ / নগদ / ব্যাংক)`,
        openEditorBtn: 'ভিজ্যুয়াল ওয়েবসাইট এডিটর খুলুন',
        customDomainTitle: 'নিজের কাস্টম ডোমেইন যুক্ত করতে চান?',
        customDomainBody:
          'ওয়েবসাইট এডিটরের ভেতরে আপনার ডোমেইনের CNAME পয়েন্ট করুন cname.amaas.xyz-এ। ডোমেইন কেনার খরচ আলাদা।',
        whatsappSupport: 'WhatsApp সাপোর্ট',
        supportDesk: 'সাপোর্ট ডেস্ক',
        paymentSubmittedToast:
          'পেমেন্ট সাবমিট হয়েছে! পেমেন্ট যাচাই সম্পন্ন হলেই আপনার ওয়েবসাইট স্বয়ংক্রিয়ভাবে লাইভ হবে।',
      },
      toasts: {
        signInUpload: 'ক্লাউড স্টোরেজে ছবি আপলোড করতে অনুগ্রহ করে আগে সাইন ইন করুন।',
        uploadFailed: 'ছবি আপলোড করা যায়নি।',
        uploadSuccess: 'ছবি ক্লাউড স্টোরেজে আপলোড হয়েছে।',
        keepOneItem: 'কমপক্ষে একটি পণ্য বা সেবা রাখুন, অথবা বর্তমান আইটেমটি সম্পাদনা করুন।',
        signInSave: 'আপনার ওয়েবসাইট সেভ ও পাবলিশ করতে অনুগ্রহ করে সাইন ইন বা অ্যাকাউন্ট তৈরি করুন।',
        enterBusinessName: 'অনুগ্রহ করে আপনার ব্যবসার নাম লিখুন।',
        checkingSubdomain: 'সাবডোমেইন যাচাই করা হচ্ছে, অনুগ্রহ করে একটু অপেক্ষা করুন।',
        chooseValidSubdomain: 'অনুগ্রহ করে একটি খালি .amaas.xyz সাবডোমেইন নির্বাচন করুন।',
        itemNeedsName: (index) => `আইটেম #${index}-এর জন্য পণ্য বা সেবার নাম দিন।`,
      },
    },
    auth: {
      backToHome: 'হোমে ফিরে যান',
      continueWithGoogle: 'Google দিয়ে এগিয়ে যান',
      connectingGoogle: 'Google-এ সংযুক্ত হচ্ছে...',
      supabaseNeededOAuth: 'Google OAuth এনভায়রনমেন্ট সেটআপ তথ্য',
      oauthModalTitle: 'অথেনটিকেশন এনভায়রনমেন্ট সেটআপ',
      oauthModalSubtitle: 'লাইভ Google লগইন ও ইমেইল পাঠানোর জন্য Supabase Auth কনফিগারেশন প্রয়োজন',
      oauthModalIntro:
        'GoAMAAS নিরাপদ Google সাইন-ইন ও পাসওয়ার্ড রিকভারি ইমেইলের জন্য অফিশিয়াল Supabase Auth ব্যবহার করে।',
      missingEnvVars: 'অনুপস্থিত এনভায়রনমেন্ট ভ্যারিয়েবল:',
      setupInstructions: 'সেটআপ নির্দেশনা:',
      understood: 'বুঝেছি',
      close: 'বন্ধ করুন',
      login: {
        seoTitle: 'সাইন ইন — GoAMAAS মার্চেন্ট ওয়ার্কস্পেস',
        title: 'আপনার ওয়ার্কস্পেসে সাইন ইন করুন',
        subtitle: 'আপনার ওয়েবসাইট, পণ্য, অর্ডার ও বিলিং পরিচালনা করুন।',
        orEmail: 'অথবা ইমেইল দিয়ে সাইন ইন করুন',
        emailLabel: 'ইমেইল ঠিকানা',
        passwordLabel: 'পাসওয়ার্ড',
        forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
        authenticating: 'সাইন ইন হচ্ছে...',
        signInBtn: 'সাইন ইন করুন',
        noAccount: 'এখনও অ্যাকাউন্ট নেই?',
        startTrialLink: 'মার্চেন্ট অ্যাকাউন্ট খুলুন',
        errMissingFields: 'অনুগ্রহ করে ইমেইল ঠিকানা এবং পাসওয়ার্ড উভয়ই লিখুন।',
      },
      register: {
        seoTitle: 'অ্যাকাউন্ট তৈরি করুন — GoAMAAS',
        title: 'আপনার GoAMAAS অ্যাকাউন্ট তৈরি করুন',
        subtitle: 'ওয়েবসাইট তৈরি করুন অথবা ৭ দিনের ফ্রি ড্যাশবোর্ড ট্রায়াল শুরু করুন।',
        orEmail: 'অথবা ইমেইল দিয়ে রেজিস্ট্রেশন করুন',
        fullNameLabel: 'আপনার পূর্ণ নাম *',
        fullNamePlaceholder: 'যেমন: আরিফ রহমান',
        storeNameLabel: 'ব্যবসা / স্টোরের নাম *',
        storeNamePlaceholder: 'যেমন: রহমান ট্রেডার্স',
        emailLabel: 'ইমেইল ঠিকানা *',
        passwordLabel: 'পাসওয়ার্ড *',
        passwordPlaceholder: 'কমপক্ষে ৬ অক্ষর',
        creatingWorkspace: 'ওয়ার্কস্পেস তৈরি হচ্ছে...',
        launchTrialBtn: 'অ্যাকাউন্ট তৈরি করে এগিয়ে যান',
        perk1: 'ওয়েবসাইট বিল্ডার ও ৭ দিনের ড্যাশবোর্ড ট্রায়াল সুবিধা',
        perk2: 'স্বচ্ছ টাকায় (৳) প্রাইসিং — যেকোনো সময় প্ল্যান পরিবর্তনযোগ্য',
        haveAccount: 'ইতিমধ্যে অ্যাকাউন্ট আছে?',
        loginLink: 'লগ ইন করুন',
        verifyTitle: 'আপনার ইমেইল যাচাই করুন',
        verifyBody: (email) =>
          `আমরা ${email} ঠিকানায় একটি ভেরিফিকেশন লিংক পাঠিয়েছি। ইনবক্স খুলে লিংকে ক্লিক করে ওয়ার্কস্পেস সক্রিয় করুন।`,
        sending: 'পাঠানো হচ্ছে...',
        resendEmail: 'ভেরিফিকেশন ইমেইল পুনরায় পাঠান',
        returnSignIn: 'সাইন ইন পেজে ফিরে যান',
        errRequired: 'অনুগ্রহ করে সকল আবশ্যক ঘর পূরণ করুন।',
        errPasswordLength: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
      },
      forgot: {
        seoTitle: 'পাসওয়ার্ড রিসেট — GoAMAAS',
        title: 'পাসওয়ার্ড রিসেট করুন',
        subtitle: 'রিসেট লিংক পেতে আপনার অ্যাকাউন্টের ইমেইল ঠিকানা দিন।',
        supabaseResetBanner: 'রিসেট ইমেইল পাঠানোর জন্য সক্রিয় Supabase ক্রেডেনশিয়াল প্রয়োজন। ',
        viewSetupDetails: 'সেটআপ তথ্য দেখুন',
        sentTitle: 'রিকভারি লিংক পাঠানো হয়েছে',
        sentBody: (email) =>
          `${email} ঠিকানায় অ্যাকাউন্ট থাকলে একটি পাসওয়ার্ড রিসেট লিংক আপনার ইনবক্সে পাঠানো হয়েছে।`,
        returnSignIn: 'সাইন ইন পেজে ফিরে যান',
        emailLabel: 'ইমেইল ঠিকানা',
        sendingLink: 'লিংক পাঠানো হচ্ছে...',
        sendInstructionsBtn: 'রিকভারি লিংক পাঠান',
        backToLogin: 'সাইন ইন-এ ফিরে যান',
        errEmailRequired: 'অনুগ্রহ করে আপনার অ্যাকাউন্টের ইমেইল ঠিকানা লিখুন।',
      },
      reset: {
        seoTitle: 'নতুন পাসওয়ার্ড সেট করুন — GoAMAAS',
        title: 'নতুন পাসওয়ার্ড নির্ধারণ করুন',
        subtitle: 'আপনার GoAMAAS অ্যাকাউন্টের জন্য একটি নিরাপদ পাসওয়ার্ড দিন।',
        successTitle: 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে',
        successBody: 'আপনার নতুন পাসওয়ার্ড সক্রিয় হয়েছে। সাইন ইন পেজে নিয়ে যাওয়া হচ্ছে...',
        proceedSignIn: 'এখনই সাইন ইন করুন',
        newPasswordLabel: 'নতুন পাসওয়ার্ড',
        confirmPasswordLabel: 'নতুন পাসওয়ার্ড নিশ্চিত করুন',
        confirmPlaceholder: 'পাসওয়ার্ডটি পুনরায় লিখুন',
        updating: 'আপডেট হচ্ছে...',
        savePasswordBtn: 'নতুন পাসওয়ার্ড সেভ করুন',
        backToSignIn: 'সাইন ইন-এ ফিরে যান',
        errExpiredLink:
          'এই পাসওয়ার্ড রিসেট লিংকটির মেয়াদ শেষ বা সঠিক নয়। অনুগ্রহ করে নতুন লিংক রিকোয়েস্ট করুন।',
        errPasswordLength: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
        errMismatch: 'দুটি পাসওয়ার্ড মিলছে না।',
        errNoSupabase: 'এই এনভায়রনমেন্টে অথেনটিকেশন সার্ভিস কনফিগার করা নেই।',
        toastUpdated: 'পাসওয়ার্ড আপডেট হয়েছে! অনুগ্রহ করে সাইন ইন করুন।',
      },
    },
    paymentModal: {
      title: 'ম্যানুয়াল পেমেন্ট ভেরিফিকেশন সাবমিট করুন',
      description:
        'নির্ধারিত পরিমাণ টাকা GoAMAAS-এর ভেরিফাইড অ্যাকাউন্টে পাঠিয়ে নিচে আপনার Transaction ID এবং প্রেরকের নম্বর জমা দিন।',
      targetWebsiteLabel: 'সংশ্লিষ্ট ওয়েবসাইট সাবস্ক্রিপশন *',
      websiteSubscriptionLabel: 'ওয়েবসাইট সাবস্ক্রিপশন',
      selectedPlanLabel: 'নির্বাচিত প্ল্যান',
      exactPayableLabel: 'প্রদেয় নির্ধারিত পরিমাণ',
      pendingAlreadyTitle: 'পেমেন্ট ইতিমধ্যে যাচাইয়ের অপেক্ষায় রয়েছে',
      pendingAlreadyBody:
        'এই সাবস্ক্রিপশনের একটি পেমেন্ট রিকোয়েস্ট বর্তমানে যাচাইয়ের অপেক্ষায় (Pending Verification) আছে। যাচাই হলেই ড্যাশবোর্ড আপডেট হবে।',
      statusLabel: 'বর্তমান পেমেন্ট স্ট্যাটাস',
      statusPendingBadge: 'যাচাইয়ের অপেক্ষায় (Pending Verification)',
      statusApprovedBadge: 'অনুমোদিত (Approved)',
      statusApprovedBody:
        'এই সার্ভিসের জন্য আপনার সর্বশেষ পেমেন্ট যাচাই ও অনুমোদিত হয়েছে।',
      statusRejectedBadge: 'প্রত্যাখ্যাত (Rejected)',
      statusRejectedReasonLabel: 'কারণ:',
      statusRejectedResubmitHint:
        'অনুগ্রহ করে লেনদেনের তথ্য যাচাই করে নিচে সঠিক Transaction ID পুনরায় সাবমিট করুন।',
      step1ChooseMethod: '১. পেমেন্ট মাধ্যম নির্বাচন করুন *',
      sendMoney: 'Send Money',
      unavailable: 'অনুপলব্ধ',
      bankAc: 'ব্যাংক হিসাব',
      copied: 'কপি হয়েছে',
      copyNumber: 'নম্বর কপি করুন',
      copyAc: 'হিসাব কপি করুন',
      copiedToast: 'ক্লিপবোর্ডে কপি হয়েছে!',
      copiedAccountSuccess: (account) => `${account} ক্লিপবোর্ডে কপি হয়েছে।`,
      bkashUnavailableTitle: 'বিকাশ চ্যানেল বর্তমানে বন্ধ',
      bkashUnavailableBody:
        'বিকাশ প্রাপক নম্বর বর্তমানে নিষ্ক্রিয় রয়েছে। অনুগ্রহ করে ওপর থেকে অন্য সক্রিয় মাধ্যম বেছে নিন।',
      recipientBkashLabel: 'প্রাপক বিকাশ নম্বর',
      bkashDefaultInstruction: (amountStr) =>
        `ওপরের বিকাশ নম্বরে ঠিক ${amountStr} পাঠান, এরপর নিচে আপনার TrxID ও প্রেরকের নম্বর লিখুন।`,
      nagadUnavailableTitle: 'নগদ চ্যানেল বর্তমানে বন্ধ',
      nagadUnavailableBody:
        'নগদ প্রাপক নম্বর এই মুহূর্তে সক্রিয় নেই। অনুগ্রহ করে বিকাশ বা ব্যাংক ট্রান্সফার বেছে নিন।',
      recipientNagadLabel: 'প্রাপক নগদ নম্বর',
      nagadAccountTypeBadge: 'পার্সোনাল অ্যাকাউন্ট (Personal)',
      nagadStepsTitle: 'নগদ পার্সোনাল (Send Money) পেমেন্ট করার নিয়ম:',
      nagadManualOnlyNote:
        'শুধুমাত্র ম্যানুয়াল TrxID যাচাইকরণ — অপারেশনস টিম যাচাই করার পর সাবস্ক্রিপশন সক্রিয় হবে।',
      bankUnavailableTitle: 'ব্যাংক ট্রান্সফার বর্তমানে বন্ধ',
      bankUnavailableBody:
        'ব্যাংক হিসাবের তথ্য বর্তমানে নিষ্ক্রিয় রয়েছে। অনুগ্রহ করে অন্য সক্রিয় পেমেন্ট মাধ্যম বেছে নিন।',
      bankNameLabel: 'ব্যাংকের নাম',
      accountNameLabel: 'হিসাবের নাম',
      recipientAcNumberLabel: 'প্রাপক ব্যাংক হিসাব নম্বর',
      branchLabel: 'শাখা (Branch)',
      routingLabel: 'রাউটিং নম্বর',
      depositSlipSupportLabel: 'ডিপোজিট স্লিপ সহায়তা:',
      depositSlipSupportBody: 'চাইলে ব্যাংকের রসিদ WhatsApp-এ পাঠাতে পারেন:',
      step2ProofTitle: '২. লেনদেনের তথ্য দিন *',
      trxIdBankLabel: 'Transaction ID / ব্যাংক রেফারেন্স *',
      trxIdWalletLabel: 'Transaction ID (TrxID) *',
      trxPlaceholderBank: 'যেমন: NPSB-91028471',
      trxPlaceholderNagad: 'যেমন: 72N9X48K',
      trxPlaceholderBkash: 'যেমন: BKA79X2910',
      duplicateTrxWarning:
        'এই Transaction ID ইতিমধ্যে জমা দেওয়া হয়েছে এবং যাচাইয়ের অপেক্ষায় বা অনুমোদিত অবস্থায় রয়েছে।',
      senderPhoneBankLabel: 'প্রেরকের ফোন নম্বর *',
      senderPhoneWalletLabel: (method) => `প্রেরকের ${method} নম্বর *`,
      payableAmountInputLabel: 'প্রদেয় পরিমাণ (BDT ৳) *',
      relatedPlanInputLabel: 'সংশ্লিষ্ট প্ল্যান / ওয়েবসাইট',
      senderBankOptional: 'প্রেরকের ব্যাংকের নাম (ঐচ্ছিক)',
      senderHolderOptional: 'প্রেরকের হিসাবধারীর নাম (ঐচ্ছিক)',
      cancel: 'বাতিল',
      submitVerificationBtn: (amountStr) => `${amountStr} যাচাইয়ের জন্য সাবমিট করুন`,
      statusFooterNote:
        'সাবমিট করার পর স্ট্যাটাস Pending Verification থাকবে। যাচাই সম্পন্ন হলেই আপনার সাবস্ক্রিপশন সক্রিয় হবে এবং বৈধ ওয়েবসাইট তাৎক্ষণিকভাবে লাইভ হবে।',
      errors: {
        invalidPrice: 'এই প্ল্যান বা সার্ভিসের জন্য বর্তমানে কোনো বৈধ সক্রিয় মূল্য নেই।',
        bkashUnavailable:
          'বিকাশ পেমেন্ট চ্যানেল বর্তমানে অনুপলব্ধ। অনুগ্রহ করে সক্রিয় পেমেন্ট মাধ্যম বেছে নিন।',
        nagadUnavailable:
          'নগদ পেমেন্ট চ্যানেল বর্তমানে অনুপলব্ধ। অনুগ্রহ করে বিকাশ বা ব্যাংক ট্রান্সফার বেছে নিন।',
        bankUnavailable:
          'ব্যাংক ট্রান্সফার চ্যানেল বর্তমানে অনুপলব্ধ। অনুগ্রহ করে সক্রিয় পেমেন্ট মাধ্যম বেছে নিন।',
        requiredFields: 'অনুগ্রহ করে পেমেন্টের সকল আবশ্যক তথ্য সঠিকভাবে পূরণ করুন।',
        duplicateTrx: (trx) =>
          `Transaction ID "${trx}" ইতিমধ্যে জমা দেওয়া হয়েছে এবং যাচাইয়ের অপেক্ষায় বা অনুমোদিত রয়েছে।`,
        alreadyPending:
          'এই সাবস্ক্রিপশনের একটি পেমেন্ট রিকোয়েস্ট ইতিমধ্যে যাচাইয়ের অপেক্ষায় রয়েছে।',
        submitFailed: 'পেমেন্ট রিকোয়েস্ট জমা দেওয়া যায়নি। আবার চেষ্টা করুন।',
      },
    },
  },
};
