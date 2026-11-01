import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { DASHBOARD_SUBSCRIPTION_PLANS } from '../../data/pricingConfig';
import { Reveal, StaggerGroup, StaggerItem } from '../../components/ui/MotionPrimitives';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Globe,
  Layers,
  LayoutDashboard,
  Lock,
  Monitor,
  Package,
  ShoppingBag,
  Smartphone,
  CreditCard,
  Boxes,
  Bot,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { websiteSubscriptionPlan } = useApp();
  const { t } = useLanguage();
  const h = t.home;
  const prefersReducedMotion = useReducedMotion();

  usePageSeo({
    title: h.seoTitle,
    description: h.seoDescription,
  });

  // Hero interactive surface switcher
  const [heroSurface, setHeroSurface] = useState<'dashboard' | 'storefront'>('dashboard');

  // Section 4: Feature Showcase Tabs
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);

  // Section 5: Interactive Storefront Preview
  const [selectedNicheIdx, setSelectedNicheIdx] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Section 8: FAQ Accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const activeFeature = h.featureShowcase.tabs[activeFeatureIdx] || h.featureShowcase.tabs[0];
  const activeNiche = h.storefrontPreview.niches[selectedNicheIdx] || h.storefrontPreview.niches[0];
  const websitePrice = websiteSubscriptionPlan?.priceMonthly || 600;

  return (
    <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* =========================================================================
          SECTION 1: HERO & PRIMARY CTA + REAL DUAL-SURFACE PRODUCT UI
         ========================================================================= */}
      <section className="relative pt-10 pb-20 sm:pt-14 sm:pb-28 lg:pt-20 lg:pb-32 border-b border-slate-200/70 dark:border-slate-800/80 overflow-hidden">
        {/* Doob-inspired subtle top-corner atmospheric wash + crisp architectural grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(238,242,255,0.85)_0%,transparent_56%),radial-gradient(90%_90%_at_0%_100%,rgba(239,246,255,0.7)_0%,transparent_52%)] dark:bg-[radial-gradient(120%_120%_at_100%_0%,rgba(30,58,138,0.22)_0%,transparent_55%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-35 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_20%,#000_50%,transparent_100%)]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-12 items-center">
            {/* Editorial Copy Column (centered on mobile, left-aligned on lg+ like modern SaaS benchmarks) */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
              <Reveal y={14}>
                <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
                  {h.hero.eyebrow}
                </p>
              </Reveal>

              <Reveal delay={0.05} y={16}>
                <h1 className="text-3xl sm:text-5xl lg:text-[50px] font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.12] text-balance">
                  <span>{h.hero.headline} </span>
                  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                    {h.hero.headlineAccent}
                  </span>
                </h1>
              </Reveal>

              <Reveal delay={0.1} y={16}>
                <p className="text-sm sm:text-base lg:text-[17px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    {h.hero.leadBold}
                  </strong>{' '}
                  {h.hero.subheadline}
                </p>
              </Reveal>

              {/* Primary & Secondary CTAs */}
              <Reveal delay={0.14} y={16}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 pt-1">
                  <Link
                    to="/create-website"
                    className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-sm transition-all group"
                  >
                    <span>{h.hero.primaryCta}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link
                    to="/features"
                    className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 font-semibold text-sm transition-colors"
                  >
                    <span>{h.hero.secondaryCta}</span>
                  </Link>
                </div>
              </Reveal>

              {/* Honest Pricing & Subdomain Micro-Copy */}
              <Reveal delay={0.18} y={14}>
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {h.hero.pricingTeaserPrefix}:
                    </span>
                    <span className="font-mono font-extrabold text-sm text-slate-950 dark:text-white tabular-nums">
                      {h.hero.pricingTeaserHighlight}
                    </span>
                    <span>· {h.hero.pricingTeaserSubdomain}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {h.hero.pricingTeaserCustomDomain}
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Elevated Product UI Frame: Interactive Merchant Dashboard + Mobile Storefront */}
            <div className="lg:col-span-6">
              <Reveal delay={0.12} y={20}>
                <div className="relative pb-4 sm:pb-8">
                  {/* Surface Mode Switcher */}
                  <div className="mb-3 flex items-center justify-center lg:justify-end">
                    <div className="inline-flex p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setHeroSurface('dashboard')}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          heroSurface === 'dashboard'
                            ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        <span>{h.hero.mockup.viewDashboardTab}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeroSurface('storefront')}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          heroSurface === 'storefront'
                            ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>{h.hero.mockup.viewStorefrontTab}</span>
                      </button>
                    </div>
                  </div>

                  {/* Primary Elevated Product Frame */}
                  <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-[0_28px_80px_-20px_rgba(15,23,42,0.16)] dark:shadow-black/60 overflow-hidden">
                    {/* Browser Chrome */}
                    <div className="px-4 py-3 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
                        <span className="ml-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {heroSurface === 'dashboard'
                            ? h.hero.mockup.dashboardTitle
                            : h.hero.mockup.storefrontName}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        <Lock className="w-2.5 h-2.5" />
                        <span>{h.hero.mockup.liveBadge}</span>
                      </span>
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {heroSurface === 'dashboard' ? (
                        <motion.div
                          key="hero-dashboard"
                          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="grid grid-cols-12"
                        >
                          {/* Mini Sidebar */}
                          <div className="hidden sm:flex sm:col-span-3 flex-col justify-between p-3 bg-slate-50/60 dark:bg-slate-950/50 border-r border-slate-200/70 dark:border-slate-800/80 text-[11px]">
                            <div className="space-y-1">
                              <div className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-2">
                                <LayoutDashboard className="w-3 h-3 shrink-0" />
                                <span className="truncate">{h.hero.mockup.navOverview}</span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <Package className="w-3 h-3 shrink-0" />
                                <span className="truncate">{h.hero.mockup.navProducts}</span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <ShoppingBag className="w-3 h-3 shrink-0" />
                                <span className="truncate">{h.hero.mockup.navOrders}</span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <Globe className="w-3 h-3 shrink-0" />
                                <span className="truncate">{h.hero.mockup.navWebsite}</span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <CreditCard className="w-3 h-3 shrink-0" />
                                <span className="truncate">{h.hero.mockup.navBilling}</span>
                              </div>
                            </div>
                          </div>

                          {/* Main Workspace Metrics & Orders */}
                          <div className="col-span-12 sm:col-span-9 p-4 space-y-4">
                            <div className="grid grid-cols-3 gap-2.5">
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                  {h.hero.mockup.kpiStoreStatusLabel}
                                </span>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block truncate">
                                  {h.hero.mockup.kpiStoreStatusValue}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                  {h.hero.mockup.kpiOrdersLabel}
                                </span>
                                <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                                  {h.hero.mockup.kpiOrdersValue}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                  {h.hero.mockup.kpiCatalogLabel}
                                </span>
                                <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block truncate">
                                  {h.hero.mockup.kpiCatalogValue}
                                </span>
                              </div>
                            </div>

                            {/* Live Orders Table */}
                            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                              <div className="px-3 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {h.hero.mockup.recentOrdersTitle}
                                </span>
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                  {h.hero.mockup.recentOrdersSync}
                                </span>
                              </div>
                              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-[11px]">
                                {[
                                  {
                                    id: '#GA-4821',
                                    item: h.hero.mockup.product1Name,
                                    price: '৳2,450',
                                    channel: h.hero.mockup.channelWebsite,
                                    status: h.hero.mockup.statusConfirmed,
                                    dot: 'bg-emerald-500',
                                  },
                                  {
                                    id: '#GA-4820',
                                    item: h.hero.mockup.product2Name,
                                    price: '৳1,450',
                                    channel: h.hero.mockup.channelWhatsapp,
                                    status: h.hero.mockup.statusDispatched,
                                    dot: 'bg-blue-500',
                                  },
                                  {
                                    id: '#GA-4819',
                                    item: h.hero.mockup.product3Name,
                                    price: '৳1,850',
                                    channel: h.hero.mockup.channelCod,
                                    status: h.hero.mockup.statusPending,
                                    dot: 'bg-amber-500',
                                  },
                                ].map((row) => (
                                  <div
                                    key={row.id}
                                    className="px-3 py-2 flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 truncate">
                                      <span className="font-mono font-bold text-slate-900 dark:text-white mr-2 tabular-nums">
                                        {row.id}
                                      </span>
                                      <span className="text-slate-600 dark:text-slate-300">
                                        {row.item}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                                        {row.price}
                                      </span>
                                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                        <span className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                                        <span>{row.status}</span>
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="hero-storefront"
                          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="p-5 sm:p-6 space-y-4"
                        >
                          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                                {h.hero.mockup.storefrontBadge}
                              </span>
                              <span className="text-base font-extrabold text-slate-950 dark:text-white block">
                                {h.hero.mockup.storefrontName}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                                {h.hero.mockup.storefrontTagline}
                              </span>
                            </div>
                            <Link
                              to="/create-website"
                              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                            >
                              {h.hero.mockup.orderNowBtn}
                            </Link>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                              <div className="h-20 rounded-xl bg-gradient-to-br from-blue-100 to-slate-100 dark:from-blue-950/70 dark:to-slate-800 flex items-center justify-center">
                                <ShoppingBag className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                              </div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {h.hero.mockup.product1Name}
                              </p>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                                  ৳2,450
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {h.hero.mockup.product1Tag}
                                </span>
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                              <div className="h-20 rounded-xl bg-gradient-to-br from-emerald-100 to-slate-100 dark:from-emerald-950/70 dark:to-slate-800 flex items-center justify-center">
                                <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {h.hero.mockup.product2Name}
                              </p>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  ৳1,450
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {h.hero.mockup.product2Tag}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Layered Mobile Storefront Companion Card when viewing Dashboard on sm+ */}
                  {heroSurface === 'dashboard' && (
                    <div className="hidden sm:block sm:w-68 sm:ml-auto sm:-mt-14 sm:mr-3 relative z-10 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/90 shadow-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                            {h.hero.mockup.storefrontBadge}
                          </span>
                          <span className="text-xs font-extrabold text-slate-950 dark:text-white block">
                            {h.hero.mockup.storefrontName}
                          </span>
                        </div>
                        <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600 dark:text-slate-300 truncate">
                          {h.hero.mockup.product1Name}
                        </span>
                        <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                          ৳2,450
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {h.hero.mockup.mobileReadyLabel}
                        </span>
                        <Link
                          to="/create-website"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-[10px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                        >
                          {h.hero.mockup.orderNowBtn}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: TRUST / VALUE PROPOSITION
         ========================================================================= */}
      <section className="py-20 sm:py-24 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <Reveal className="max-w-2xl space-y-3">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
              {h.valueProp.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              {h.valueProp.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {h.valueProp.subtitle}
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {h.valueProp.pillars.map((pillar, idx) => (
              <StaggerItem
                key={idx}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3"
              >
                <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                  0{idx + 1}
                </span>
                <h3 className="text-base font-bold text-slate-950 dark:text-white leading-snug">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pillar.desc}
                </p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: HOW GOAMAAS WORKS — SIMPLE 3-STEP PROCESS
         ========================================================================= */}
      <section className="py-20 sm:py-24 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <Reveal className="max-w-2xl space-y-3">
              <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
                {h.howItWorks.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                {h.howItWorks.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {h.howItWorks.subtitle}
              </p>
            </Reveal>

            <Reveal delay={0.08}>
              <Link
                to="/create-website"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors shrink-0"
              >
                <span>{h.howItWorks.cta}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Reveal>
          </div>

          <StaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {h.howItWorks.steps.map((s, idx) => (
              <StaggerItem
                key={idx}
                className="relative p-7 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                    {s.step}
                  </span>
                  <span className="h-px flex-1 ml-4 bg-slate-200 dark:bg-slate-800" />
                </div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white leading-snug">
                  {s.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {s.desc}
                </p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: INTERACTIVE PRODUCT FEATURE SHOWCASE
         ========================================================================= */}
      <section className="py-20 sm:py-24 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <Reveal className="max-w-2xl space-y-3">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
              {h.featureShowcase.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              {h.featureShowcase.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {h.featureShowcase.subtitle}
            </p>
          </Reveal>

          {/* Interactive Module Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {h.featureShowcase.tabs.map((tab, idx) => {
              const Icon =
                tab.id === 'builder'
                  ? Globe
                  : tab.id === 'orders'
                  ? ShoppingBag
                  : tab.id === 'inventory'
                  ? Boxes
                  : Bot;
              const selected = activeFeatureIdx === idx;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFeatureIdx(idx)}
                  className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                    selected
                      ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Feature Panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature.id}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 sm:p-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs"
            >
              <div className="lg:col-span-6 space-y-5">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {activeFeature.kicker}
                </span>
                <h3 className="text-xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                  {activeFeature.heading}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeFeature.description}
                </p>
                <ul className="space-y-2.5 pt-1">
                  {activeFeature.bullets.map((b, bIdx) => (
                    <li
                      key={bIdx}
                      className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Link
                    to={activeFeature.id === 'builder' ? '/create-website' : '/features'}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>
                      {activeFeature.id === 'builder' ? h.hero.primaryCta : h.hero.secondaryCta}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                        {activeFeature.panelTitle}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {activeFeature.panelSubtitle}
                      </p>
                    </div>
                    <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {activeFeature.metrics.map((m, mIdx) => (
                      <div
                        key={mIdx}
                        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800"
                      >
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          {m.label}
                        </span>
                        <span className="text-xs font-bold text-slate-950 dark:text-white mt-1 block">
                          {m.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: INTERACTIVE STOREFRONT PREVIEW (INDUSTRIES & DEVICES)
         ========================================================================= */}
      <section className="py-20 sm:py-24 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <Reveal className="max-w-2xl space-y-3">
              <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
                {h.storefrontPreview.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                {h.storefrontPreview.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {h.storefrontPreview.subtitle}
              </p>
            </Reveal>

            {/* Niche + Device Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {h.storefrontPreview.niches.map((niche, idx) => (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => setSelectedNicheIdx(idx)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedNicheIdx === idx
                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {niche.tabLabel}
                  </button>
                ))}
              </div>

              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{h.storefrontPreview.desktopLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{h.storefrontPreview.mobileLabel}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Browser Frame */}
          <div className="p-4 sm:p-8 rounded-3xl bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
            <div
              className={`mx-auto transition-all duration-300 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden ${
                previewDevice === 'mobile' ? 'max-w-sm' : 'max-w-5xl'
              }`}
            >
              {/* Browser URL Bar */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="px-3 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-blue-600 dark:text-blue-400 truncate">
                  https://{activeNiche.subdomain}
                </div>
                <Link
                  to="/create-website"
                  className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap"
                >
                  {h.storefrontPreview.launchThisStyle} →
                </Link>
              </div>

              {/* Storefront Content */}
              <div className="p-5 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-base font-extrabold text-slate-950 dark:text-white tracking-tight">
                    {activeNiche.storeName}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{h.storefrontPreview.codBadge}</span>
                  </span>
                </div>

                <div className="space-y-2 max-w-xl">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white">
                    {activeNiche.heroTitle}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    {activeNiche.heroSubtitle}
                  </p>
                </div>

                <div
                  className={`grid gap-4 ${
                    previewDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'
                  }`}
                >
                  {activeNiche.products.map((prod, pIdx) => (
                    <div
                      key={pIdx}
                      className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          {prod.meta}
                        </span>
                        <h4 className="text-sm font-bold text-slate-950 dark:text-white">
                          {prod.name}
                        </h4>
                      </div>
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                        <span className="font-mono font-extrabold text-sm text-slate-950 dark:text-white">
                          {prod.price}
                        </span>
                        <Link
                          to="/create-website"
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors"
                        >
                          {h.storefrontPreview.whatsappBtn}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: WEBSITE & BUSINESS MANAGEMENT FEATURES (ASYMMETRIC BENTO)
         ========================================================================= */}
      <section className="py-20 sm:py-24 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <Reveal className="max-w-2xl space-y-3">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
              {h.management.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              {h.management.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {h.management.subtitle}
            </p>
          </Reveal>

          <StaggerGroup className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {h.management.cards.map((card, idx) => {
              const spanClass =
                idx === 0 || idx === 3 ? 'lg:col-span-7' : 'lg:col-span-5';
              return (
                <StaggerItem
                  key={idx}
                  className={`${spanClass} p-7 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-5`}
                >
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      {card.tag}
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-950 dark:text-white">
                      {card.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {card.desc}
                    </p>
                  </div>
                  <p className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    {card.detail}
                  </p>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        </div>
      </section>

      {/* =========================================================================
          SECTION 7: PRICING & PLANS
         ========================================================================= */}
      <section className="py-20 sm:py-24 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <Reveal className="max-w-2xl space-y-3">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
              {h.pricing.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              {h.pricing.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {h.pricing.subtitle}
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Website Subscription Spotlight (৳600/month) */}
            <Reveal className="lg:col-span-5">
              <div className="h-full p-7 sm:p-8 rounded-3xl bg-slate-950 text-white border border-slate-800 shadow-xl flex flex-col justify-between space-y-6">
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                      {h.pricing.websiteCard.planLabel}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-emerald-400">
                      {h.pricing.websiteCard.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-extrabold">{h.pricing.websiteCard.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {h.pricing.websiteCard.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl sm:text-5xl font-extrabold font-mono tabular-nums">
                        ৳{websitePrice.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {h.pricing.websiteCard.priceSuffix}
                      </span>
                    </div>
                    <span className="inline-block text-xs font-semibold text-emerald-400">
                      {h.pricing.websiteCard.zeroUpfront}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1 text-xs">
                    <span className="font-semibold text-slate-200 block">
                      {h.pricing.websiteCard.subdomainBoxLabel}
                    </span>
                    <code className="font-mono text-emerald-400 text-[11px] block">
                      businessname.amaas.xyz
                    </code>
                    <span className="text-[11px] text-slate-400 block">
                      {h.pricing.websiteCard.customDomainNote}
                    </span>
                  </div>

                  <ul className="space-y-2.5 pt-2 border-t border-slate-800 text-xs text-slate-200">
                    {h.pricing.websiteCard.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  to="/create-website"
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition-colors"
                >
                  <span>{h.pricing.websiteCard.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </Reveal>

            {/* 4 Dashboard Subscription Plans */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {h.pricing.dashboardSection.label}
                </h3>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {h.pricing.dashboardSection.trialBadge}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DASHBOARD_SUBSCRIPTION_PLANS.map((plan) => {
                  const localizedPlan = t.pricingPage.dashboardTab.plans[plan.id];
                  return (
                    <div
                      key={plan.id}
                      className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
                        plan.isPopular
                          ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-500/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-bold text-slate-950 dark:text-white">
                            {localizedPlan.name}
                          </span>
                          {plan.isPopular && (
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                              {h.pricing.dashboardSection.popularBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {localizedPlan.subtitle}
                        </p>
                        <div className="flex items-baseline gap-1 pt-1">
                          <span className="text-2xl font-extrabold font-mono text-slate-950 dark:text-white tabular-nums">
                            ৳{plan.priceMonthly.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-500">
                            {h.pricing.dashboardSection.perMonth}
                          </span>
                        </div>
                      </div>

                      <Link
                        to="/register"
                        className="min-h-[42px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold transition-colors"
                      >
                        {h.pricing.dashboardSection.cta}
                      </Link>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2">
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <span>{h.pricing.dashboardSection.compareAllCta}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 8: FREQUENTLY ASKED QUESTIONS
         ========================================================================= */}
      <section className="py-20 sm:py-24 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <Reveal className="text-center space-y-3">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
              {h.faq.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              {h.faq.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{h.faq.subtitle}</p>
          </Reveal>

          <div className="space-y-3">
            {h.faq.items.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full min-h-[54px] px-5 py-4 text-left flex items-center justify-between gap-4 text-xs sm:text-sm font-bold text-slate-950 dark:text-white hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/80">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 9: FINAL CONVERSION CTA
         ========================================================================= */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="p-8 sm:p-14 rounded-3xl bg-slate-950 text-white border border-slate-800 text-center space-y-6 shadow-2xl">
              <p className="text-xs font-bold tracking-widest uppercase text-blue-400">
                {h.finalCta.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight max-w-2xl mx-auto leading-tight">
                {h.finalCta.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
                {h.finalCta.subtitle}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
                <Link
                  to="/create-website"
                  className="min-h-[48px] inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
                >
                  <span>{h.finalCta.primaryCta}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/contact"
                  className="min-h-[48px] inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-sm transition-colors"
                >
                  {h.finalCta.secondaryCta}
                </Link>
              </div>

              <p className="text-[11px] text-slate-400 pt-2">{h.finalCta.footnote}</p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};
