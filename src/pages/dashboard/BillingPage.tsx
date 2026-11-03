import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  Shield,
  Globe,
  Globe2,
  Bot,
  Info,
  Layers,
  RefreshCw,
  XCircle,
  Truck,
  ExternalLink,
  FileText,
} from 'lucide-react';
import {
  FREE_MERCHANT_DASHBOARD_PLAN,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  AutomationPackageConfig,
  WebsitePackageConfig,
  resolveCatalogPlanState,
} from '../../data/pricingConfig';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  buildVerifiedPaymentReceipt,
  formatSubscriptionDateDisplay,
  getPublicWebsiteHref,
  isWebsitePaymentService,
  isWebsiteTrulyLive,
  resolveClientWebsiteLifecycleState,
} from '../../lib/paymentWorkflow';
import { PaymentRequest, SubscribedWebsite } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';
import { ManualPaymentModal } from '../../components/payment/ManualPaymentModal';
import { PaymentReceiptModal } from '../../components/payment/PaymentReceiptModal';

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    currentPlan,
    trialDaysLeft,
    invoices,
    updatePlan,
    cancelSubscription,
    activeStore,
    websiteSubscriptionPlan,
    subscribedWebsites,
    showToast,
    serviceTrials,
    getServiceAccess,
    activateServiceTrial,
    paymentRequests,
    isPaymentsLoading,
    refreshPaymentRequests,
    refreshSubscribedWebsites,
    paymentGatewayConfigs,
    servicePricingCatalog,
    isPricingCatalogLoading,
    isPricingCatalogLoaded,
    pricingCatalogError,
    refreshServicePricingCatalog,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'automations' | 'websites' | 'webSubscription'>('dashboard');

  const myPaymentRequests = paymentRequests
    .filter((r) => !user?.id || r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Confirmation dialogs, receipt viewer & verified payment modal payload
  const [selectedAutoPackage, setSelectedAutoPackage] = useState<AutomationPackageConfig | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [receiptTargetRequest, setReceiptTargetRequest] = useState<PaymentRequest | null>(null);
  const [checkoutPayload, setCheckoutPayload] = useState<{
    serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
    serviceId: string;
    serviceName: string;
    planTier: string;
    amount: number;
    allowWebsiteSelection?: boolean;
    targetWebsite?: SubscribedWebsite | null;
  } | null>(null);

  const findExactUserWebsiteForRequest = (req: PaymentRequest): SubscribedWebsite | null => {
    if (!isWebsitePaymentService(req.serviceType)) return null;
    const cleanId = (req.serviceId || '').trim().toLowerCase();
    if (!cleanId) return null;
    return subscribedWebsites.find((w) => w.id.trim().toLowerCase() === cleanId) || null;
  };

  const verifiedReceiptEntries = myPaymentRequests
    .filter((r) => r.status === 'approved')
    .map((req) => {
      const site = findExactUserWebsiteForRequest(req);
      const receipt = buildVerifiedPaymentReceipt(req, site);
      return receipt ? { req, site, receipt } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const isCatalogPending = isSupabaseConfigured && isPricingCatalogLoading && !isPricingCatalogLoaded;

  const getAutomationPackageState = (pkg: AutomationPackageConfig) =>
    resolveCatalogPlanState({
      serviceType: 'ai_automation',
      serviceId: pkg.id,
      fallbackLabel: pkg.name,
      fallbackPriceBdt: pkg.priceMonthly,
      fallbackSetupFeeBdt: typeof pkg.setupFee === 'number' ? pkg.setupFee : 0,
      catalog: isSupabaseConfigured ? servicePricingCatalog : undefined,
      requireCatalog: isSupabaseConfigured,
    });

  const getWebsitePackageState = (web: WebsitePackageConfig) =>
    resolveCatalogPlanState({
      serviceType: 'website_package',
      serviceId: web.id,
      fallbackLabel: web.name,
      fallbackPriceBdt: web.priceOneTime,
      catalog: isSupabaseConfigured ? servicePricingCatalog : undefined,
      requireCatalog: isSupabaseConfigured,
    });

  const basicAutoConfig = AI_AUTOMATION_PACKAGES.find((a) => a.id === 'basic_auto')!;
  const basicAutoState = getAutomationPackageState(basicAutoConfig);

  // Gracefully handle legacy /dashboard/billing?plan=... links without opening paid checkout
  useEffect(() => {
    const rawRequestedPlan = (searchParams.get('plan') || '').trim();
    if (!rawRequestedPlan) return;

    setActiveTab('dashboard');
    showToast(
      'All core Merchant Dashboard features are 100% free permanently — no paid subscription is required.',
      'info'
    );

    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, showToast]);

  const handleConfirmAutomation = () => {
    if (!selectedAutoPackage) return;
    const autoState = getAutomationPackageState(selectedAutoPackage);
    if (!autoState.isAvailable || autoState.priceBdt === null || autoState.priceBdt <= 0) {
      showToast('This automation package is currently unavailable or inactive.', 'error');
      setSelectedAutoPackage(null);
      return;
    }
    setSelectedAutoPackage(null);
    setCheckoutPayload({
      serviceType: 'ai_automation',
      serviceId: autoState.serviceCode,
      serviceName: autoState.planTierLabel,
      planTier: autoState.planTierLabel,
      amount: autoState.priceBdt,
    });
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Subscriptions, Billing & Service Packages
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Review your active SaaS tier, managed automation services, custom website packages, and historical billing statements.
        </p>
      </div>

      {/* Workspace Access & Optional Add-On Services Hub */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Core Merchant Dashboard — 100% Free Forever
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every registered merchant receives permanent free access to the core Merchant Dashboard and Landing Page Builder. Optional standalone services (GoAMAAS Website hosting, Custom Website Engineering, and AI Automation packages) are billed separately.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="font-mono tabular-nums font-bold">৳0/mo</span>
            <span>Core Dashboard Fee</span>
          </div>
        </div>

        {/* 4 Core Services Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Service 1: Free Merchant Dashboard */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Core SaaS</span>
                <span className="text-xs font-bold text-emerald-600 font-mono tabular-nums">৳0 / Forever</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Dashboard &amp; Commerce</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Products, stock ledger, orders, CRM, sales graphs, website sync &amp; courier/payment settings.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Unlocked Free</span>
              </button>
            </div>
          </div>

          {/* Service 2: AI Automations */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Messaging</span>
                <span className="text-xs font-bold text-purple-600 font-mono tabular-nums">
                  {isCatalogPending
                    ? 'Loading...'
                    : basicAutoState.priceBdt !== null
                    ? `৳${basicAutoState.priceBdt.toLocaleString()}/mo`
                    : 'Optional'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">AI Automation Suite</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Optional managed Messenger &amp; WhatsApp bots, cart recovery &amp; automated workflows.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <TrialStatusBadge
                serviceId="ai_automations"
                serviceName="AI Automation Suite"
                category="ai_automation"
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* Service 3: Landing Page Visual Builder */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page Engine</span>
                <span className="text-xs font-bold text-emerald-600 font-mono tabular-nums">৳0 / Included</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Landing Page Builder</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                High-converting campaign landing pages with 1-click Cash on Delivery forms.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => navigate('/dashboard/landing-pages')}
                className="w-full py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Builder</span>
              </button>
            </div>
          </div>

          {/* Service 4: GoAMAAS Website */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Managed Web</span>
                <span className="text-xs font-bold text-emerald-600 font-mono tabular-nums">৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}/mo</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">GoAMAAS Website</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Visual website builder, free GoAMAAS hosting, free *.amaas.xyz subdomain &amp; 30-day cycle.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => navigate('/create-website')}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Build Website (৳600/mo)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs for Billing Panel */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Merchant Dashboard (100% Free Forever)</span>
        </button>

        <button
          onClick={() => setActiveTab('automations')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'automations'
              ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>AI Automation Packages (Monthly Service Fee)</span>
        </button>

        <button
          onClick={() => setActiveTab('websites')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'websites'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5" />
          <span>Website Development Packages (One-Time)</span>
        </button>

        <button
          onClick={() => setActiveTab('webSubscription')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'webSubscription'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>GoAMAAS Website (৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}/mo)</span>
        </button>
      </div>

      {isSupabaseConfigured && pricingCatalogError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>
              <strong>Unable to verify live plan pricing:</strong> {pricingCatalogError} Plan selection is disabled until verified database pricing is loaded.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refreshServicePricingCatalog()}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Pricing Sync</span>
          </button>
        </div>
      )}

      {/* TAB 1: Free Merchant Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
              <div className="space-y-1.5 max-w-2xl">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {FREE_MERCHANT_DASHBOARD_PLAN.badge} · Active for Every Registered Merchant
                </span>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {FREE_MERCHANT_DASHBOARD_PLAN.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {FREE_MERCHANT_DASHBOARD_PLAN.description}
                </p>
              </div>

              <div className="sm:text-right shrink-0">
                <div className="flex sm:justify-end items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                    ৳0
                  </span>
                  <span className="text-xs text-slate-500">/ month forever</span>
                </div>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">
                  Zero subscription fee · No trial expiry
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Permanently Unlocked Core Merchant Features
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                {FREE_MERCHANT_DASHBOARD_PLAN.features.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Go to Merchant Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/settings')}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Configure Couriers &amp; Payment Gateways</span>
              </button>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <span>External Provider Fees &amp; Optional Standalone Services</span>
            </div>
            <ul className="space-y-1.5 list-disc pl-5 leading-relaxed">
              {FREE_MERCHANT_DASHBOARD_PLAN.externalDisclosures.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: AI Automation Packages */}
      {activeTab === 'automations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {AI_AUTOMATION_PACKAGES.map((auto) => {
              const autoState = getAutomationPackageState(auto);
              const isUnavailable = !isCatalogPending && (!autoState.isAvailable || autoState.priceBdt === null);

              return (
                <div
                  key={auto.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                    isUnavailable
                      ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white opacity-70 relative'
                      : auto.isPopular
                      ? 'bg-slate-900 text-white border-2 border-purple-500 shadow-md relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                  }`}
                >
                  {auto.isPopular && !isUnavailable && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-600 text-white font-semibold text-[10px] uppercase tracking-wider">
                      Recommended
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-base">{autoState.planTierLabel}</h4>
                      <p className={`text-xs mt-1 ${auto.isPopular && !isUnavailable ? 'text-slate-300' : 'text-slate-500'}`}>
                        {auto.description}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1">
                        {isCatalogPending ? (
                          <span className="text-lg font-bold text-slate-400">Verifying price...</span>
                        ) : autoState.priceBdt !== null ? (
                          <>
                            <span className="text-3xl font-extrabold font-mono tabular-nums">
                              ৳{autoState.priceBdt.toLocaleString()}
                            </span>
                            <span className={`text-xs ${auto.isPopular && !isUnavailable ? 'text-slate-400' : 'text-slate-500'}`}>
                              / month
                            </span>
                          </>
                        ) : (
                          <span className="text-lg font-bold text-slate-400">Currently unavailable</span>
                        )}
                      </div>
                      <span className={`block text-[11px] font-mono mt-1 ${auto.isPopular && !isUnavailable ? 'text-purple-300' : 'text-slate-500'}`}>
                        {autoState.isAvailable && autoState.setupFeeBdt > 0
                          ? `৳${autoState.setupFeeBdt.toLocaleString()} one-time setup fee`
                          : auto.setupFeeLabel}
                      </span>
                    </div>

                    <div className={`space-y-2 pt-3 border-t text-xs ${auto.isPopular && !isUnavailable ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                      {auto.features.map((f, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              auto.isPopular && !isUnavailable ? 'text-purple-400' : 'text-blue-600'
                            }`}
                          />
                          <span className={auto.isPopular && !isUnavailable ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      disabled={isCatalogPending || isUnavailable}
                      onClick={() => {
                        if (autoState.isAvailable && autoState.priceBdt !== null) {
                          setSelectedAutoPackage(auto);
                        }
                      }}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                        isCatalogPending || isUnavailable
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : auto.isPopular
                          ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white cursor-pointer'
                      }`}
                    >
                      {isCatalogPending ? 'Loading...' : isUnavailable ? 'Currently Unavailable' : auto.ctaLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Third-Party Platform Charges Disclosure:</span>
            </span>
            <p className="leading-relaxed">
              WhatsApp Business API conversation fees (Meta charges), SMS gateway delivery fees, and AI token costs are billed separately by providers. Never promises unlimited AI usage.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: Website Packages */}
      {activeTab === 'websites' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WEBSITE_DEVELOPMENT_PACKAGES.map((web) => {
              const webState = getWebsitePackageState(web);
              return (
                <div
                  key={web.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                    web.isPopular
                      ? 'bg-slate-900 text-white border-2 border-blue-500 shadow-md relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                  }`}
                >
                  {web.isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white font-semibold text-[10px] uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-base">{webState.planTierLabel}</h4>
                      <p className={`text-xs mt-1 ${web.isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                        {web.description}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1">
                        {isCatalogPending ? (
                          <span className="text-lg font-bold text-slate-400">Verifying price...</span>
                        ) : webState.priceBdt !== null ? (
                          <>
                            <span className="text-3xl font-extrabold font-mono tabular-nums">
                              ৳{webState.priceBdt.toLocaleString()}
                            </span>
                            <span className={`text-xs ${web.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                              one-time project fee
                            </span>
                          </>
                        ) : (
                          <span className="text-lg font-bold text-slate-400">Custom Quote Required</span>
                        )}
                      </div>
                      <span className={`block text-[11px] font-mono mt-1 ${web.isPopular ? 'text-blue-300' : 'text-slate-500'}`}>
                        {web.estimatedTimeline}
                      </span>
                    </div>

                    <div className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                      web.isPopular
                        ? 'bg-blue-950/80 border-blue-700 text-blue-200'
                        : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-300'
                    }`}>
                      <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{web.domainHostingBenefit}</span>
                    </div>

                    <div className={`space-y-2 pt-3 border-t text-xs ${web.isPopular ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                      {web.features.map((f, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              web.isPopular ? 'text-blue-400' : 'text-blue-600'
                            }`}
                          />
                          <span className={web.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>

                    {web.scopeNote && (
                      <p className={`text-[10px] leading-relaxed pt-2 border-t ${
                        web.isPopular ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-100 dark:border-slate-800'
                      }`}>
                        {web.scopeNote}
                      </p>
                    )}
                  </div>

                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard/website-requests')}
                      className={`block w-full py-2.5 text-center rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        web.isPopular
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white'
                      }`}
                    >
                      {web.ctaLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: Website Subscription (AMAAS Website Lite - ৳600/month) */}
      {activeTab === 'webSubscription' && (
        <div className="space-y-6">
          {/* Client Websites Subscription Lifecycle Cards */}
          {subscribedWebsites.length > 0 ? (
            <div className="space-y-4">
              {subscribedWebsites.map((site) => {
                const siteRequests = myPaymentRequests.filter(
                  (r) =>
                    isWebsitePaymentService(r.serviceType) &&
                    r.serviceId.trim().toLowerCase() === site.id.trim().toLowerCase()
                );
                const lifecycle = resolveClientWebsiteLifecycleState(site, siteRequests);
                const latestApprovedSitePayment = siteRequests.find((r) => r.status === 'approved');
                const siteTrulyLive = isWebsiteTrulyLive(site);
                const payableFee = site.monthlyFee || websiteSubscriptionPlan.priceMonthly;

                return (
                  <div
                    key={site.id}
                    className="p-6 rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-slate-900 border-2 border-blue-600 text-white shadow-xl space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg border ${
                              lifecycle.stage === 'live'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                : lifecycle.stage === 'payment_rejected' ||
                                  lifecycle.stage === 'expired'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                            }`}
                          >
                            {lifecycle.label}
                          </span>
                          <span className="text-slate-300 font-semibold">
                            Payment: {lifecycle.paymentStatusLabel}
                          </span>
                          <span className="text-slate-600">&middot;</span>
                          <span className="text-slate-300 font-semibold">
                            Publication: {lifecycle.publicationStatusLabel}
                          </span>
                        </div>

                        <h3 className="text-xl font-bold text-white">{site.businessName}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-blue-300 font-mono">
                          <Globe className="w-3.5 h-3.5" />
                          <span className="font-semibold">https://{site.fullDomainUrl}</span>
                          <span className="text-slate-400 font-sans text-[11px]">
                            (Website ID: {site.id.slice(0, 8)}...)
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                          {lifecycle.description}
                        </p>
                      </div>

                      <div className="text-left sm:text-right sm:border-l sm:border-slate-800 sm:pl-6 shrink-0 space-y-1">
                        <div className="text-2xl font-black font-mono text-white tabular-nums">
                          ৳{payableFee.toLocaleString()}
                          <span className="text-xs text-slate-400 font-sans font-normal"> / 30 days</span>
                        </div>
                        <div className="text-[11px] text-slate-300">
                          Start:{' '}
                          <strong className="text-white font-mono">
                            {formatSubscriptionDateDisplay(lifecycle.subscriptionStartIso)}
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-300">
                          {lifecycle.isExpired ? 'Expired On:' : '30-Day Expiry:'}{' '}
                          <strong
                            className={`font-mono ${
                              lifecycle.isExpired ? 'text-rose-300' : 'text-emerald-300'
                            }`}
                          >
                            {formatSubscriptionDateDisplay(lifecycle.subscriptionExpiryIso)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Resource consumption summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Pages Active</span>
                        <span className="font-bold text-white font-mono">
                          {site.resourceUsage.pagesCount} / {site.resourceUsage.pagesLimit}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Storage Consumption</span>
                        <span className="font-bold text-white font-mono">
                          {site.resourceUsage.storageUsedMb} MB / {site.resourceUsage.storageLimitMb} MB
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Bandwidth Used</span>
                        <span className="font-bold text-white font-mono">
                          {site.resourceUsage.bandwidthUsedGb} GB / {site.resourceUsage.bandwidthLimitGb} GB
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Updates Used (This Cycle)</span>
                        <span className="font-bold text-white font-mono">
                          {site.resourceUsage.monthlyUpdatesUsed} / {site.resourceUsage.monthlyUpdatesLimit}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {!lifecycle.pendingRequest ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCheckoutPayload({
                              serviceType: 'website_subscription',
                              serviceId: site.id,
                              serviceName: `GoAMAAS Website (${site.fullDomainUrl})`,
                              planTier: site.planName || 'GoAMAAS Website',
                              amount: payableFee,
                              allowWebsiteSelection: false,
                              targetWebsite: site,
                            })
                          }
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>
                            {lifecycle.isExpired
                              ? `Renew to Publish +30 Days (৳${payableFee.toLocaleString()})`
                              : site.paymentStatus === 'paid'
                              ? `Extend +30 Days (৳${payableFee.toLocaleString()})`
                              : lifecycle.stage === 'payment_rejected'
                              ? `Resubmit Payment (৳${payableFee.toLocaleString()})`
                              : `Submit Payment (৳${payableFee.toLocaleString()})`}
                          </span>
                        </button>
                      ) : (
                        <span className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold text-xs inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {lifecycle.stage === 'renewal_pending'
                              ? 'Renewal Payment Under Verification'
                              : 'Payment Under Admin Verification'}
                          </span>
                        </span>
                      )}

                      {latestApprovedSitePayment && (
                        <button
                          type="button"
                          onClick={() => setReceiptTargetRequest(latestApprovedSitePayment)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>View Official Receipt</span>
                        </button>
                      )}

                      {siteTrulyLive && (
                        <a
                          href={getPublicWebsiteHref(site)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Live Website</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/subscribed-website')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>
                          {lifecycle.isExpired
                            ? 'Edit Saved Website & Products'
                            : 'Manage Website & Live Preview'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/create-website')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          Build Another Website (৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}/mo)
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Featured Plan Card */}
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-500 dark:border-emerald-600 shadow-xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 right-8 px-4 py-1 rounded-b-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm">
              ★ {websiteSubscriptionPlan.badge}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Recurring Website Plan
                </span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {websiteSubscriptionPlan.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  {websiteSubscriptionPlan.subtitle}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black font-mono text-slate-900 dark:text-white tabular-nums">
                    ৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                  ৳0 Upfront Development Fee
                </span>
              </div>
            </div>

            {/* Subdomain Notice */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Free Subdomain Included: <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">businessname.amaas.xyz</code>
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Optional custom domain supported (paid separately)
              </span>
            </div>

            {/* Features List */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Included with Your ৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}/Month Subscription:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-300">
                {websiteSubscriptionPlan.features.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Limits */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Resource Limits & Fair Use:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-400 block text-[10px]">Pages:</span>
                  <strong>Up to {websiteSubscriptionPlan.limits.maxPages} Pages</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Storage:</span>
                  <strong>{websiteSubscriptionPlan.limits.maxStorageMb} MB</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Bandwidth:</span>
                  <strong>{websiteSubscriptionPlan.limits.maxBandwidthGb} GB / mo</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Update Requests:</span>
                  <strong>{websiteSubscriptionPlan.limits.monthlyUpdateRequests} / month</strong>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/create-website')}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>Start Your Website Now (৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}/month)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Verified Payment Channels */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Verified Payment Channels
          </h3>
          <span className="text-[11px] text-slate-500">
            Admin-verified settlement for subscriptions & packages
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {paymentGatewayConfigs
            .filter((g) => g.id === 'bkash' || g.id === 'nagad' || g.id === 'bank_transfer')
            .map((gateway) => {
              const isConfigured = gateway.isEnabled && Boolean((gateway.accountNumber || '').trim());
              return (
                <div
                  key={gateway.id}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${
                    isConfigured
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 opacity-70'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white block">
                      {gateway.displayName}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {isConfigured ? 'Available at checkout' : 'Currently unavailable'}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isConfigured
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isConfigured ? 'Active' : 'Disabled'}
                  </span>
                </div>
              );
            })}
        </div>

        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
          <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>
            Paid subscriptions and upgrades activate only after your transaction reference is verified and approved by a platform administrator.
          </span>
        </div>
      </div>

      {/* Manual Payment Submissions & Verification Status */}
      {myPaymentRequests.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Payment Verification Status
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Track submitted bKash, Nagad, and Bank Transfer verification requests
              </p>
            </div>
            <button
              type="button"
              disabled={isPaymentsLoading}
              onClick={() => {
                void refreshPaymentRequests();
                void refreshSubscribedWebsites();
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPaymentsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {myPaymentRequests.map((req) => {
              const matchedSite = findExactUserWebsiteForRequest(req);
              const statusLabel =
                req.status === 'pending'
                  ? 'Payment Under Admin Verification'
                  : req.status === 'approved'
                  ? 'PAID / APPROVED'
                  : 'Payment Rejected — Resubmit Required';
              const hasActivePendingForSameService = myPaymentRequests.some(
                (other) =>
                  other.id !== req.id &&
                  other.serviceType === req.serviceType &&
                  other.serviceId.trim().toLowerCase() === req.serviceId.trim().toLowerCase() &&
                  other.status === 'pending'
              );

              return (
                <div
                  key={req.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {req.serviceName}
                      </span>
                      {matchedSite && (
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                          ({matchedSite.fullDomainUrl})
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          req.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {req.status === 'approved' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : req.status === 'rejected' ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>{statusLabel}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono tabular-nums">
                      <span>{req.paymentMethod}</span>
                      <span>·</span>
                      <span>TrxID: {req.transactionId || req.bankReference || '—'}</span>
                      {req.senderNumber && (
                        <>
                          <span>·</span>
                          <span>Sender: {req.senderNumber}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{new Date(req.createdAt).toLocaleString()}</span>
                    </div>

                    {req.status === 'rejected' && (
                      <div className="mt-1.5 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-[11px]">
                        <strong>Rejection Reason:</strong>{' '}
                        {req.adminNotes || 'Transaction ID or transfer proof could not be verified.'}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 shrink-0">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                      ৳{req.amount.toLocaleString()}
                    </span>

                    {req.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => setReceiptTargetRequest(req)}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>View / Print Receipt</span>
                      </button>
                    )}

                    {req.status === 'rejected' &&
                      !hasActivePendingForSameService &&
                      req.serviceType !== 'dashboard_plan' && (
                        <button
                          type="button"
                          onClick={() =>
                            setCheckoutPayload({
                              serviceType: req.serviceType,
                              serviceId: req.serviceId,
                              serviceName: req.serviceName,
                              planTier: req.planTier,
                              amount: req.amount,
                              targetWebsite: matchedSite,
                            })
                          }
                          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Resubmit Payment
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Official Verified Payment Receipts (strictly approved payments only) */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Official Payment Receipts
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified GoAMAAS / AMAAS Technologies receipts issued after administrator payment approval
            </p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            {verifiedReceiptEntries.length} verified receipt{verifiedReceiptEntries.length === 1 ? '' : 's'}
          </span>
        </div>

        {verifiedReceiptEntries.length === 0 ? (
          <div className="p-8 text-center space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <FileText className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-900 dark:text-white">
              No verified payment receipts yet
            </p>
            <p>
              Official printable receipts are generated automatically once an administrator verifies and approves a submitted payment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Receipt No.</th>
                  <th className="py-3 px-4">Approved Date</th>
                  <th className="py-3 px-4">Service / Subdomain</th>
                  <th className="py-3 px-4">30-Day Period</th>
                  <th className="py-3 px-4 text-right">Amount (৳)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {verifiedReceiptEntries.map(({ req, receipt }) => (
                  <tr
                    key={req.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {receipt.receiptNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {formatSubscriptionDateDisplay(receipt.approvedAtIso)}
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="text-slate-900 dark:text-white font-semibold block">
                        {receipt.websiteName || receipt.planName}
                      </span>
                      {receipt.websiteUrl && (
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                          {receipt.websiteUrl}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                      {receipt.subscriptionStartIso && receipt.subscriptionExpiryIso
                        ? `${formatSubscriptionDateDisplay(receipt.subscriptionStartIso)} → ${formatSubscriptionDateDisplay(receipt.subscriptionExpiryIso)}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      ৳{receipt.amountBdt.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {receipt.statusLabel}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => setReceiptTargetRequest(req)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View / Save PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for AI Automation */}
      {selectedAutoPackage && (() => {
        const selectedAutoState = getAutomationPackageState(selectedAutoPackage);
        const canProceedAuto = selectedAutoState.isAvailable && selectedAutoState.priceBdt !== null && selectedAutoState.priceBdt > 0;
        return (
          <Modal
            isOpen={!!selectedAutoPackage}
            onClose={() => setSelectedAutoPackage(null)}
            title={`Confirm Automation Service — ${selectedAutoState.planTierLabel}`}
            maxWidth="md"
          >
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Billing Type:</span>
                  <span className="font-semibold text-purple-600">Monthly Managed Service Fee</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Service Fee:</span>
                  <span className="font-bold text-base font-mono text-slate-900 dark:text-white">
                    {canProceedAuto && selectedAutoState.priceBdt !== null
                      ? `৳${selectedAutoState.priceBdt.toLocaleString()} / month`
                      : 'Currently Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Setup Fee:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                    {selectedAutoState.isAvailable && selectedAutoState.setupFeeBdt > 0
                      ? `৳${selectedAutoState.setupFeeBdt.toLocaleString()} one-time setup fee`
                      : selectedAutoPackage.setupFeeLabel}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px]">
                Note: WhatsApp Cloud API messaging and Meta platform fees are billed separately by Meta based on conversation volume.
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAutoPackage(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canProceedAuto}
                  onClick={handleConfirmAutomation}
                  className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
                >
                  {canProceedAuto && selectedAutoState.priceBdt !== null
                    ? `Proceed to Payment (৳${selectedAutoState.priceBdt.toLocaleString()})`
                    : 'Package Unavailable'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Manual Payment Verification Modal */}
      {checkoutPayload && (
        <ManualPaymentModal
          isOpen={!!checkoutPayload}
          onClose={() => setCheckoutPayload(null)}
          serviceType={checkoutPayload.serviceType}
          serviceId={checkoutPayload.serviceId}
          serviceName={checkoutPayload.serviceName}
          planTier={checkoutPayload.planTier}
          amount={checkoutPayload.amount}
          allowWebsiteSelection={checkoutPayload.allowWebsiteSelection}
          targetWebsite={checkoutPayload.targetWebsite || null}
          onSuccess={() => {
            showToast(
              `Payment submitted for ${checkoutPayload.serviceName}! Awaiting admin verification.`,
              'success'
            );
          }}
        />
      )}

      {/* Official Verified Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={Boolean(receiptTargetRequest)}
        onClose={() => setReceiptTargetRequest(null)}
        request={receiptTargetRequest}
        website={receiptTargetRequest ? findExactUserWebsiteForRequest(receiptTargetRequest) : null}
      />

      {/* Cancellation Dialog */}
      <ConfirmDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        onConfirm={cancelSubscription}
        title="Cancel Free Trial?"
        message="Are you sure you want to stop your free trial? Your products and orders will remain saved locally."
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep My Trial"
        isDestructive
      />
    </div>
  );
};
