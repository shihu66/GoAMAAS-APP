import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { Reveal } from '../../components/ui/MotionPrimitives';
import {
  Check,
  ChevronDown,
  ArrowRight,
  Globe2,
  Bot,
  ShieldAlert,
  Info,
  Layers,
  AlertTriangle,
  Code2,
} from 'lucide-react';
import {
  DASHBOARD_SUBSCRIPTION_PLANS,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  DashboardPlanConfig,
  AutomationPackageConfig,
  WebsitePackageConfig,
  resolveCatalogPlanState,
} from '../../data/pricingConfig';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Modal } from '../../components/ui/Modal';

type PricingCategory = 'webSubscription' | 'dashboard' | 'automations' | 'website';

function resolveInitialTab(param: string | null): PricingCategory {
  if (param === 'dashboard' || param === 'automations' || param === 'website' || param === 'webSubscription') {
    return param;
  }
  return 'webSubscription';
}

export const PricingPage: React.FC = () => {
  const {
    currentPlan,
    isAuthenticated,
    showToast,
    websiteSubscriptionPlan,
    servicePricingCatalog,
    isPricingCatalogLoaded,
  } = useApp();
  const { t } = useLanguage();
  const pp = t.pricingPage;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  usePageSeo({
    title: pp.seoTitle,
    description: pp.seoDescription,
  });

  const useLiveCatalog = isAuthenticated && isSupabaseConfigured && isPricingCatalogLoaded;
  const getPlanDisplayState = (plan: DashboardPlanConfig) =>
    resolveCatalogPlanState({
      serviceType: 'dashboard_plan',
      serviceId: plan.id,
      fallbackLabel: pp.dashboardTab.plans[plan.id]?.name || plan.name,
      fallbackPriceBdt: plan.priceMonthly,
      catalog: useLiveCatalog ? servicePricingCatalog : undefined,
      requireCatalog: useLiveCatalog,
    });

  const [activeCategory, setActiveCategory] = useState<PricingCategory>(() =>
    resolveInitialTab(searchParams.get('tab'))
  );

  // Confirmation modal state for choosing packages
  const [selectedDashboardPlan, setSelectedDashboardPlan] = useState<DashboardPlanConfig | null>(null);
  const [selectedAutoPackage, setSelectedAutoPackage] = useState<AutomationPackageConfig | null>(null);
  const [selectedWebPackage, setSelectedWebPackage] = useState<WebsitePackageConfig | null>(null);

  // FAQ Accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleConfirmDashboardPlan = () => {
    if (!selectedDashboardPlan) return;
    const targetPlanId = selectedDashboardPlan.id;
    setSelectedDashboardPlan(null);
    if (isAuthenticated) {
      navigate(`/dashboard/billing?plan=${encodeURIComponent(targetPlanId)}`);
    } else {
      navigate('/register');
    }
  };

  const handleConfirmAutomation = () => {
    if (!selectedAutoPackage) return;
    const localizedName = pp.automationsTab.packages[selectedAutoPackage.id]?.name || selectedAutoPackage.name;
    showToast(pp.modals.autoToastSuccess(localizedName), 'success');
    setSelectedAutoPackage(null);
    if (isAuthenticated) {
      navigate('/dashboard/automations');
    } else {
      navigate('/contact');
    }
  };

  const handleConfirmWebsite = () => {
    if (!selectedWebPackage) return;
    setSelectedWebPackage(null);
    navigate('/dashboard/website-requests');
  };

  const websitePrice = websiteSubscriptionPlan?.priceMonthly || 600;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header & Segmented Category Tabs */}
      <section className="relative pt-14 pb-12 sm:pt-20 sm:pb-16 border-b border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,#000_50%,transparent_100%)]"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5">
          <Reveal y={12}>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              {pp.eyebrow}
            </p>
          </Reveal>

          <Reveal delay={0.05} y={16}>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.12] max-w-3xl mx-auto text-balance">
              {pp.title}
            </h1>
          </Reveal>

          <Reveal delay={0.1} y={16}>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
              {pp.subtitle}
            </p>
          </Reveal>

          {/* Four Interactive Segmented Category Tabs */}
          <Reveal delay={0.14} y={14}>
            <div
              role="tablist"
              aria-label={pp.title}
              className="inline-flex p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-xs font-semibold mt-3 overflow-x-auto max-w-full gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'webSubscription'}
                onClick={() => setActiveCategory('webSubscription')}
                className={`min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === 'webSubscription'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Globe2 className="w-3.5 h-3.5 shrink-0" />
                <span>{pp.tabs.websiteSub}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'dashboard'}
                onClick={() => setActiveCategory('dashboard')}
                className={`min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === 'dashboard'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>{pp.tabs.dashboard}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'automations'}
                onClick={() => setActiveCategory('automations')}
                className={`min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === 'automations'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>{pp.tabs.automations}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'website'}
                onClick={() => setActiveCategory('website')}
                className={`min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === 'website'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 shrink-0" />
                <span>{pp.tabs.customWeb}</span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-20">
        {/* =========================================================================
            CATEGORY 1: WEBSITE SUBSCRIPTION PLAN (GoAMAAS Website - ৳600/month)
           ========================================================================= */}
        {activeCategory === 'webSubscription' && (
          <div className="space-y-16">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {pp.webSubTab.kicker}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight text-balance">
                {pp.webSubTab.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {pp.webSubTab.subtitlePrefix}{' '}
                <code className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                  businessname.amaas.xyz
                </code>{' '}
                {pp.webSubTab.subtitleSuffix}
              </p>
            </div>

            {/* Featured Flagship Plan Card */}
            <div className="max-w-3xl mx-auto">
              <div className="p-8 sm:p-10 rounded-2xl bg-slate-950 dark:bg-slate-900 text-white border border-slate-800 space-y-7">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-400 font-semibold">
                  <span>{pp.webSubTab.planTypeLabel}</span>
                  <span className="text-emerald-400">{pp.webSubTab.bestBadge}</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {websiteSubscriptionPlan.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                    {pp.webSubTab.planSubtitle}
                  </p>
                </div>

                {/* Price Row */}
                <div className="flex flex-wrap items-baseline justify-between gap-4 pt-2 pb-6 border-b border-slate-800">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white tabular-nums">
                      ৳{websitePrice.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-400">{pp.common.perMonth}</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400">
                    {pp.webSubTab.zeroUpfront}
                  </span>
                </div>

                {/* Honest Subdomain & Custom Domain Row */}
                <div className="p-4 rounded-xl bg-slate-900 dark:bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-slate-200">
                    <Globe2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      {pp.webSubTab.freeSubdomainLabel}{' '}
                      <code className="font-mono text-emerald-400 font-bold">
                        businessname.amaas.xyz
                      </code>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {pp.webSubTab.customDomainSeparate}
                  </span>
                </div>

                {/* Included Features */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-300">
                    {pp.webSubTab.includedHeading}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-200">
                    {pp.webSubTab.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resource Allowances */}
                <div className="pt-5 border-t border-slate-800 space-y-3 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    {pp.webSubTab.limitsHeading}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[11px]">{pp.webSubTab.limitPages}</span>
                      <strong className="text-white font-mono tabular-nums">
                        {pp.webSubTab.limitPagesVal(websiteSubscriptionPlan.limits.maxPages)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">{pp.webSubTab.limitStorage}</span>
                      <strong className="text-white font-mono tabular-nums">
                        {pp.webSubTab.limitStorageVal(websiteSubscriptionPlan.limits.maxStorageMb)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">{pp.webSubTab.limitBandwidth}</span>
                      <strong className="text-white font-mono tabular-nums">
                        {pp.webSubTab.limitBandwidthVal(websiteSubscriptionPlan.limits.maxBandwidthGb)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">{pp.webSubTab.limitUpdates}</span>
                      <strong className="text-white">
                        {pp.webSubTab.limitUpdatesVal(websiteSubscriptionPlan.limits.monthlyUpdateRequests)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Primary CTA */}
                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => navigate('/create-website')}
                    className="w-full min-h-[48px] py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    <span>{pp.webSubTab.startCta(websitePrice)}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <p className="text-center text-[11px] text-slate-400">
                    {pp.webSubTab.startSubnote}
                  </p>
                </div>
              </div>
            </div>

            {/* 3-Step Launch Workflow */}
            <div className="space-y-8">
              <div className="text-center space-y-1.5">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {pp.webSubTab.howKicker}
                </p>
                <h3 className="text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
                  {pp.webSubTab.howTitle}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {pp.webSubTab.howSteps.map((stepItem, sIdx) => (
                  <div
                    key={sIdx}
                    className="p-7 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-3"
                  >
                    <h4 className="font-bold text-sm sm:text-base text-slate-950 dark:text-white">
                      {stepItem.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {stepItem.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparison Table: Subscription vs One-Time Development */}
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-1">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {pp.webSubTab.compKicker}
                </p>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                  {pp.webSubTab.compTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pp.webSubTab.compSubtitle}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px]">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="py-3 px-4">{pp.webSubTab.compColFeature}</th>
                      <th className="py-3 px-4 text-blue-600 dark:text-blue-400 font-bold">
                        {pp.webSubTab.compColSub}
                      </th>
                      <th className="py-3 px-4">{pp.webSubTab.compColOneTime}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {pp.webSubTab.compRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/60 dark:hover:bg-slate-900/80">
                        <td className="py-3.5 px-4 font-semibold text-slate-950 dark:text-white">
                          {row.feature}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-blue-700 dark:text-blue-300">
                          {row.subscriptionPlan}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                          {row.oneTimePackages}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subscription Terms & Disclosures */}
            <div className="p-6 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
                <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{pp.webSubTab.termsHeading}</span>
              </div>
              <ul className="space-y-1.5 list-disc pl-5 leading-relaxed">
                {pp.webSubTab.disclosures.map((d, dIdx) => (
                  <li key={dIdx}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 2: DASHBOARD SUBSCRIPTION PLANS
           ========================================================================= */}
        {activeCategory === 'dashboard' && (
          <div className="space-y-12">
            <div className="text-center space-y-1.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {pp.dashboardTab.kicker}
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {pp.dashboardTab.subnote}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {DASHBOARD_SUBSCRIPTION_PLANS.map((plan) => {
                const isCurrent = isAuthenticated && currentPlan === plan.id;
                const planState = getPlanDisplayState(plan);
                const isUnavailable = useLiveCatalog && (!planState.isAvailable || planState.priceBdt === null);
                const localized = pp.dashboardTab.plans[plan.id];

                return (
                  <div
                    key={plan.id}
                    className={`p-6 sm:p-7 rounded-2xl flex flex-col justify-between transition-colors ${
                      plan.isPopular && !isUnavailable
                        ? 'bg-slate-950 dark:bg-slate-900 text-white border-2 border-blue-600'
                        : 'bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white'
                    } ${isUnavailable ? 'opacity-70' : ''}`}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold mb-1.5">
                          <span className={plan.isPopular && !isUnavailable ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}>
                            {pp.common.freeTrialBadge}
                          </span>
                          {plan.isPopular && !isUnavailable && (
                            <span className="text-blue-400">{pp.common.mostPopular}</span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold tracking-tight">
                          {useLiveCatalog ? planState.planTierLabel : localized?.name || plan.name}
                        </h3>
                        <p className={`text-xs mt-1 font-medium ${plan.isPopular && !isUnavailable ? 'text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                          {localized?.subtitle || plan.subtitle}
                        </p>
                        <p className={`text-xs mt-1.5 leading-relaxed ${plan.isPopular && !isUnavailable ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {localized?.description || plan.description}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-1 pt-1">
                        {planState.priceBdt !== null ? (
                          <>
                            <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                              ৳{planState.priceBdt.toLocaleString()}
                            </span>
                            <span className={`text-xs ${plan.isPopular && !isUnavailable ? 'text-slate-400' : 'text-slate-500'}`}>
                              {pp.common.perMonth}
                            </span>
                          </>
                        ) : (
                          <span className="text-base font-bold text-slate-400">
                            {pp.common.currentlyUnavailable}
                          </span>
                        )}
                      </div>

                      <div className={`pt-4 space-y-2.5 text-xs border-t ${plan.isPopular && !isUnavailable ? 'border-slate-800' : 'border-slate-200/80 dark:border-slate-800'}`}>
                        {(localized?.features || plan.features).map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-2">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                plan.isPopular && !isUnavailable ? 'text-blue-400' : 'text-blue-600 dark:text-blue-400'
                              }`}
                            />
                            <span className={plan.isPopular && !isUnavailable ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                              {feat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        type="button"
                        disabled={isCurrent || isUnavailable}
                        onClick={() => {
                          if (!isUnavailable) setSelectedDashboardPlan(plan);
                        }}
                        className={`w-full min-h-[44px] py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'bg-emerald-600 text-white cursor-default'
                            : isUnavailable
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                            : plan.isPopular
                            ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white cursor-pointer'
                        }`}
                      >
                        {isCurrent
                          ? pp.common.currentActivePlan
                          : isUnavailable
                          ? pp.common.currentlyUnavailable
                          : localized?.ctaLabel || plan.ctaLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5 leading-relaxed">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900 dark:text-white">{pp.dashboardTab.integrationNoteLabel}</strong>{' '}
                {pp.dashboardTab.integrationNoteBody}
              </span>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 3: AI AUTOMATION PACKAGES
           ========================================================================= */}
        {activeCategory === 'automations' && (
          <div className="space-y-12">
            <div className="text-center space-y-1.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {pp.automationsTab.kicker}
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {pp.automationsTab.subnote}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {AI_AUTOMATION_PACKAGES.map((auto) => {
                const localized = pp.automationsTab.packages[auto.id];
                return (
                  <div
                    key={auto.id}
                    className={`p-6 sm:p-7 rounded-2xl flex flex-col justify-between transition-colors ${
                      auto.isPopular
                        ? 'bg-slate-950 dark:bg-slate-900 text-white border-2 border-blue-600'
                        : 'bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white'
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        {auto.isPopular && (
                          <p className="text-[11px] font-semibold text-blue-400 mb-1">
                            {pp.common.recommended}
                          </p>
                        )}
                        <h3 className="text-lg font-bold tracking-tight">
                          {localized?.name || auto.name}
                        </h3>
                        <p className={`text-xs mt-1.5 leading-relaxed ${auto.isPopular ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}>
                          {localized?.description || auto.description}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                            ৳{auto.priceMonthly.toLocaleString()}
                          </span>
                          <span className={`text-xs ${auto.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                            {pp.common.perMonth}
                          </span>
                        </div>
                        <span className={`block text-[11px] font-mono mt-1 ${auto.isPopular ? 'text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {localized?.setupFeeLabel || auto.setupFeeLabel}
                        </span>
                      </div>

                      <div className={`pt-4 space-y-2.5 text-xs border-t ${auto.isPopular ? 'border-slate-800' : 'border-slate-200/80 dark:border-slate-800'}`}>
                        {(localized?.features || auto.features).map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-2">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                auto.isPopular ? 'text-blue-400' : 'text-blue-600 dark:text-blue-400'
                              }`}
                            />
                            <span className={auto.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                              {feat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        type="button"
                        onClick={() => setSelectedAutoPackage(auto)}
                        className={`w-full min-h-[44px] py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          auto.isPopular
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-slate-900 dark:text-white'
                        }`}
                      >
                        {localized?.ctaLabel || auto.ctaLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{pp.automationsTab.disclosureTitle}</span>
              </div>
              <p className="leading-relaxed">{pp.automationsTab.disclosureBody}</p>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 4: CUSTOM WEBSITE DEVELOPMENT PACKAGES (ONE-TIME)
           ========================================================================= */}
        {activeCategory === 'website' && (
          <div className="space-y-12">
            <div className="text-center space-y-1.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {pp.customWebTab.kicker}
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {pp.customWebTab.subnote}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {WEBSITE_DEVELOPMENT_PACKAGES.map((web) => {
                const localized = pp.customWebTab.packages[web.id];
                return (
                  <div
                    key={web.id}
                    className={`p-7 sm:p-8 rounded-2xl flex flex-col justify-between transition-colors ${
                      web.isPopular
                        ? 'bg-slate-950 dark:bg-slate-900 text-white border-2 border-blue-600'
                        : 'bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white'
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        {web.isPopular && (
                          <p className="text-[11px] font-semibold text-blue-400 mb-1">
                            {pp.common.mostPopular}
                          </p>
                        )}
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight">
                          {localized?.name || web.name}
                        </h3>
                        <p className={`text-xs mt-1.5 leading-relaxed ${web.isPopular ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}>
                          {localized?.description || web.description}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                            ৳{web.priceOneTime.toLocaleString()}
                          </span>
                          <span className={`text-xs ${web.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                            {pp.customWebTab.oneTimeFeeLabel}
                          </span>
                        </div>
                        <span className={`block text-[11px] font-mono mt-1 ${web.isPopular ? 'text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {localized?.estimatedTimeline || web.estimatedTimeline}
                        </span>
                      </div>

                      <p
                        className={`text-xs font-medium pt-3 border-t ${
                          web.isPopular
                            ? 'border-slate-800 text-blue-300'
                            : 'border-slate-200/80 dark:border-slate-800 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {localized?.domainHostingBenefit || web.domainHostingBenefit}
                      </p>

                      <div className={`pt-3 space-y-2.5 text-xs border-t ${web.isPopular ? 'border-slate-800' : 'border-slate-200/80 dark:border-slate-800'}`}>
                        {(localized?.features || web.features).map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-2">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                web.isPopular ? 'text-blue-400' : 'text-blue-600 dark:text-blue-400'
                              }`}
                            />
                            <span className={web.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                              {feat}
                            </span>
                          </div>
                        ))}
                      </div>

                      {(localized?.scopeNote || web.scopeNote) && (
                        <p
                          className={`text-[11px] leading-relaxed pt-3 border-t ${
                            web.isPopular
                              ? 'text-slate-400 border-slate-800'
                              : 'text-slate-500 dark:text-slate-400 border-slate-200/80 dark:border-slate-800'
                          }`}
                        >
                          {localized?.scopeNote || web.scopeNote}
                        </p>
                      )}
                    </div>

                    <div className="pt-6">
                      <button
                        type="button"
                        onClick={() => setSelectedWebPackage(web)}
                        className={`w-full min-h-[44px] py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          web.isPopular
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-slate-900 dark:text-white'
                        }`}
                      >
                        {localized?.ctaLabel || web.ctaLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            DASHBOARD PLAN COMPARISON MATRIX
           ========================================================================= */}
        <div className="rounded-2xl bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
              {pp.matrix.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {pp.matrix.subtitle}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-[13px]">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">{pp.matrix.colCapability}</th>
                  <th className="py-3 px-4 font-mono tabular-nums">Starter (৳299)</th>
                  <th className="py-3 px-4 font-mono tabular-nums text-blue-600 dark:text-blue-400">
                    Business (৳599)
                  </th>
                  <th className="py-3 px-4 font-mono tabular-nums">Pro (৳999)</th>
                  <th className="py-3 px-4 font-mono tabular-nums">Enterprise (৳1,999)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {pp.matrix.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/60 dark:hover:bg-slate-900/80">
                    <td className="py-3.5 px-4 font-semibold text-slate-950 dark:text-white">
                      {row.label}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                      {row.starter}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                      {row.business}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                      {row.pro}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                      {row.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* =========================================================================
            COMMERCIAL DISCLOSURES
           ========================================================================= */}
        <div className="p-6 sm:p-7 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
            <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{pp.commercialDisclosuresTitle}</span>
          </div>
          <ul className="space-y-1.5 list-disc pl-5 leading-relaxed">
            {pp.commercialDisclosures.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        {/* =========================================================================
            PRICING & BILLING FAQ
           ========================================================================= */}
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
              {pp.faqTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {pp.faqSubtitle}
            </p>
          </div>

          <div className="space-y-3">
            {pp.faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full min-h-[52px] px-5 py-4 text-left font-semibold text-xs sm:text-sm text-slate-950 dark:text-white flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        className="px-5 pb-4 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 leading-relaxed"
                      >
                        {faq.a}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Dashboard Plan */}
      {selectedDashboardPlan &&
        (() => {
          const selectedState = getPlanDisplayState(selectedDashboardPlan);
          const localized = pp.dashboardTab.plans[selectedDashboardPlan.id];
          const displayLabel = useLiveCatalog
            ? selectedState.planTierLabel
            : localized?.name || selectedDashboardPlan.name;

          return (
            <Modal
              isOpen={!!selectedDashboardPlan}
              onClose={() => setSelectedDashboardPlan(null)}
              title={pp.modals.confirmPlanTitle(displayLabel)}
              maxWidth="md"
            >
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.billingType}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {pp.modals.monthlySubscription}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.subscriptionPrice}</span>
                    <span className="font-bold text-base font-mono tabular-nums text-blue-600 dark:text-blue-400">
                      {selectedState.priceBdt !== null
                        ? `৳${selectedState.priceBdt.toLocaleString()} ${pp.common.perMonth}`
                        : pp.common.currentlyUnavailable}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.trialPeriod}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {pp.common.freeTrialBadge}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="font-bold text-slate-900 dark:text-white block mb-1.5">
                    {pp.modals.includedFeatures}
                  </span>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                    {(localized?.features || selectedDashboardPlan.features).map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDashboardPlan(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                  >
                    {pp.common.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={
                      useLiveCatalog && (!selectedState.isAvailable || selectedState.priceBdt === null)
                    }
                    onClick={handleConfirmDashboardPlan}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
                  >
                    {isAuthenticated ? pp.modals.confirmApplyPlan : pp.modals.proceedTrialSignup}
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}

      {/* Confirmation Modal for AI Automation */}
      {selectedAutoPackage &&
        (() => {
          const localized = pp.automationsTab.packages[selectedAutoPackage.id];
          const displayName = localized?.name || selectedAutoPackage.name;

          return (
            <Modal
              isOpen={!!selectedAutoPackage}
              onClose={() => setSelectedAutoPackage(null)}
              title={pp.modals.confirmAutoTitle(displayName)}
              maxWidth="md"
            >
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.billingType}</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {pp.modals.monthlyManagedFee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.serviceFee}</span>
                    <span className="font-bold text-base font-mono tabular-nums text-slate-900 dark:text-white">
                      ৳{selectedAutoPackage.priceMonthly.toLocaleString()} {pp.common.perMonth}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.setupFee}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                      {localized?.setupFeeLabel || selectedAutoPackage.setupFeeLabel}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                  {pp.modals.metaBillingNote}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAutoPackage(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                  >
                    {pp.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAutomation}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
                  >
                    {pp.modals.submitSetupRequest}
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}

      {/* Confirmation Modal for Custom Website Package */}
      {selectedWebPackage &&
        (() => {
          const localized = pp.customWebTab.packages[selectedWebPackage.id];
          const displayName = localized?.name || selectedWebPackage.name;

          return (
            <Modal
              isOpen={!!selectedWebPackage}
              onClose={() => setSelectedWebPackage(null)}
              title={pp.modals.webBriefTitle(displayName)}
              maxWidth="md"
            >
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.billingType}</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {pp.modals.oneTimeProjectFee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.totalProjectPrice}</span>
                    <span className="font-bold text-base font-mono tabular-nums text-slate-900 dark:text-white">
                      ৳{selectedWebPackage.priceOneTime.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.hostingAndDomain}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                      {pp.modals.hostingSetupIncluded}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-500">{pp.modals.timeline}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                      {localized?.estimatedTimeline || selectedWebPackage.estimatedTimeline}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {pp.modals.webBriefHelper}
                </p>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWebPackage(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                  >
                    {pp.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmWebsite}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
                  >
                    {pp.modals.proceedRequirements}
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}
    </div>
  );
};
