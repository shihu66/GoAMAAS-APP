import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  CheckCircle2,
  X,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Globe2,
  Bot,
  Zap,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import {
  DASHBOARD_SUBSCRIPTION_PLANS,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  THIRD_PARTY_DISCLOSURES,
  SUBSCRIPTION_VS_ONETIME_COMPARISON,
  DashboardPlanConfig,
  AutomationPackageConfig,
  WebsitePackageConfig,
} from '../../data/pricingConfig';
import { Modal } from '../../components/ui/Modal';

export const PricingPage: React.FC = () => {
  const { currentPlan, updatePlan, isAuthenticated, showToast, websiteSubscriptionPlan } = useApp();
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState<'dashboard' | 'automations' | 'webSubscription' | 'website'>('dashboard');

  // Confirmation modal state for choosing packages
  const [selectedDashboardPlan, setSelectedDashboardPlan] = useState<DashboardPlanConfig | null>(null);
  const [selectedAutoPackage, setSelectedAutoPackage] = useState<AutomationPackageConfig | null>(null);
  const [selectedWebPackage, setSelectedWebPackage] = useState<WebsitePackageConfig | null>(null);

  // FAQ Accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const pricingFaqs = [
    {
      q: 'How does the 7-day free trial for Dashboard plans work?',
      a: 'All four GoAMAAS dashboard plans (Starter, Business, Pro, Enterprise) come with an unrestricted 7-day free trial. You can test order workflows, inventory tracking, and page building without entering a credit card upfront.',
    },
    {
      q: 'Are AI Automation fees monthly or one-time?',
      a: 'AI Automation packages are recurring monthly service management fees for maintaining workflows, conversational bots, and CRM triggers. Separate one-time setup fees apply where indicated.',
    },
    {
      q: 'Why are Meta and WhatsApp API costs billed separately?',
      a: 'Meta charges per-conversation fees directly for official WhatsApp Business Cloud API interactions and boosted Messenger ad click-to-chat messaging. GoAMAAS charges for the software orchestration layer, keeping our pricing transparent and unbundled.',
    },
    {
      q: 'Is the first-year domain and hosting really 100% free with websites?',
      a: 'Yes. Every website package (Starter ৳8,000, Business ৳15,000, and Advanced ৳25,000) includes a standard top-level domain (.com) registration and 12 months of high-speed SSD cloud hosting at zero additional charge.',
    },
    {
      q: 'When do Courier API and WhatsApp integrations start working?',
      a: 'These integrations work once configured with your active merchant credentials (e.g. Steadfast API key, Pathao client secret, or WhatsApp Business account). They do not transmit live parcel orders until you enter your valid gateway keys in Settings.',
    },
  ];

  const handleConfirmDashboardPlan = () => {
    if (!selectedDashboardPlan) return;
    if (isAuthenticated) {
      updatePlan(selectedDashboardPlan.id);
      setSelectedDashboardPlan(null);
      navigate('/dashboard/billing');
    } else {
      setSelectedDashboardPlan(null);
      navigate('/register');
    }
  };

  const handleConfirmAutomation = () => {
    if (!selectedAutoPackage) return;
    showToast(`Requested setup for ${selectedAutoPackage.name}. Our automation engineers will reach out to verify API access.`, 'success');
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clear, Honest Pricing in Bangladeshi Taka (৳)</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Transparent Pricing for Growing Businesses
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Choose from flexible monthly SaaS dashboard tiers, managed AI automation workflows, or one-time custom website engineering by AMAAS.
          </p>

          {/* Four Category Tabs */}
          <div className="inline-flex p-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 text-xs font-semibold mt-4 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveCategory('dashboard')}
              className={`px-4 sm:px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeCategory === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Dashboard Plans</span>
            </button>

            <button
              onClick={() => setActiveCategory('automations')}
              className={`px-4 sm:px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeCategory === 'automations'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>2. AI Automation</span>
            </button>

            <button
              onClick={() => setActiveCategory('webSubscription')}
              className={`px-4 sm:px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeCategory === 'webSubscription'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>3. Website Subscription (৳600/mo) ★</span>
            </button>

            <button
              onClick={() => setActiveCategory('website')}
              className={`px-4 sm:px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeCategory === 'website'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>4. Custom Dev (One-Time)</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            CATEGORY 1: DASHBOARD SUBSCRIPTION PLANS
           ========================================================================= */}
        {activeCategory === 'dashboard' && (
          <div className="space-y-12">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                Recurring Software Subscription
              </span>
              <p className="text-xs text-slate-500">
                All plans include a full 7-day free trial. Cancel or change anytime.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {DASHBOARD_SUBSCRIPTION_PLANS.map((plan) => {
                const isCurrent = currentPlan === plan.id;

                return (
                  <div
                    key={plan.id}
                    className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                      plan.isPopular
                        ? 'bg-slate-900 text-white border-2 border-blue-500 shadow-xl relative'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                    }`}
                  >
                    {plan.isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white font-semibold text-[10px] uppercase tracking-wider shadow-sm">
                        Most Popular
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold tracking-tight">{plan.name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              plan.isPopular
                                ? 'bg-blue-900/60 text-blue-300 border border-blue-700'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            7-Day Free Trial
                          </span>
                        </div>
                        <p className={`text-xs mt-1 ${plan.isPopular ? 'text-blue-300 font-medium' : 'text-slate-500 font-medium'}`}>
                          {plan.subtitle}
                        </p>
                        <p className={`text-[11px] mt-1 ${plan.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                          {plan.description}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-1 pt-1">
                        <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                          ৳{plan.priceMonthly.toLocaleString()}
                        </span>
                        <span className={`text-xs ${plan.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                          / month
                        </span>
                      </div>

                      <div className={`pt-4 space-y-2 text-xs border-t ${plan.isPopular ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                        {plan.features.map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-2">
                            <CheckCircle2
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                plan.isPopular ? 'text-blue-400' : 'text-blue-600'
                              }`}
                            />
                            <span className={plan.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                              {feat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        onClick={() => setSelectedDashboardPlan(plan)}
                        className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
                          isCurrent
                            ? 'bg-emerald-600 text-white cursor-default'
                            : plan.isPopular
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                        }`}
                      >
                        {isCurrent ? 'Current Active Plan' : plan.ctaLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                <strong>Integration Note:</strong> Courier APIs and WhatsApp notification modules require active merchant credentials with Steadfast, Pathao, RedX, or Meta before live data transmits. They do not operate prior to account configuration.
              </span>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 2: AI AUTOMATION PACKAGES
           ========================================================================= */}
        {activeCategory === 'automations' && (
          <div className="space-y-12">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                Monthly Managed Automation Services
              </span>
              <p className="text-xs text-slate-500">
                Separate from Dashboard subscriptions. Managed monthly fees for conversational workflows and bots.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {AI_AUTOMATION_PACKAGES.map((auto) => (
                <div
                  key={auto.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                    auto.isPopular
                      ? 'bg-slate-900 text-white border-2 border-purple-500 shadow-xl relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                  }`}
                >
                  {auto.isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-600 text-white font-semibold text-[10px] uppercase tracking-wider shadow-sm">
                      Recommended
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-bold tracking-tight">{auto.name}</h3>
                      <p className={`text-xs mt-1 ${auto.isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                        {auto.description}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                          ৳{auto.priceMonthly.toLocaleString()}
                        </span>
                        <span className={`text-xs ${auto.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                          / month
                        </span>
                      </div>
                      <span className={`block text-[11px] font-mono mt-1 ${auto.isPopular ? 'text-purple-300' : 'text-slate-500'}`}>
                        {auto.setupFeeLabel}
                      </span>
                    </div>

                    <div className={`pt-4 space-y-2 text-xs border-t ${auto.isPopular ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                      {auto.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              auto.isPopular ? 'text-purple-400' : 'text-blue-600'
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
                      onClick={() => setSelectedAutoPackage(auto)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
                        auto.isPopular
                          ? 'bg-purple-600 hover:bg-purple-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white'
                      }`}
                    >
                      {auto.ctaLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Third-Party Disclosure Callout */}
            <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Important Third-Party Billing & Usage Disclosure</span>
              </div>
              <p className="leading-relaxed">
                WhatsApp Business Cloud API conversations (Meta charges per marketing, utility, or authentication thread), Facebook Messenger platform charges, external SMS gateways, and LLM model compute costs are billed directly by third-party providers. GoAMAAS service fees cover workflow setup, prompt logic maintenance, and orchestration. Unlimited AI consumption is never promised.
              </p>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 3: WEBSITE SUBSCRIPTION PLAN (AMAAS Website Lite - ৳600/month)
           ========================================================================= */}
        {activeCategory === 'webSubscription' && (
          <div className="space-y-16">
            {/* Category Header */}
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                Recurring Turnkey Website Subscription
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Get a Complete Business Website for ৳600 / Month
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                No separate website development fee. Custom-designed, mobile-responsive online presence with hosting included on your own <code className="font-mono text-blue-600 font-semibold">*.amaas.xyz</code> subdomain.
              </p>
            </div>

            {/* Featured Pricing Card */}
            <div className="max-w-3xl mx-auto">
              <div className="p-8 sm:p-10 rounded-3xl bg-slate-900 text-white border-2 border-blue-500 shadow-2xl relative overflow-hidden">
                {/* Best for Small Businesses Badge */}
                <div className="absolute top-0 right-8 -translate-y-0 px-4 py-1 rounded-b-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-md">
                  ★ Best for Small Businesses
                </div>

                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-blue-400 tracking-wider uppercase">
                      Website Subscription Plan
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">
                      {websiteSubscriptionPlan.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
                      {websiteSubscriptionPlan.subtitle}
                    </p>
                  </div>

                  {/* Price Block */}
                  <div className="flex flex-wrap items-baseline gap-3 pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white tabular-nums">
                        ৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}
                      </span>
                      <span className="text-sm text-slate-400">/ month</span>
                    </div>

                    <div className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold">
                      ৳0 Upfront Development Fee
                    </div>
                  </div>

                  {/* Free Subdomain Callout */}
                  <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-slate-200">
                      <Globe2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Free Subdomain Included:{' '}
                        <code className="font-mono text-emerald-400 font-bold bg-slate-900 px-2 py-0.5 rounded">
                          yourbusiness.amaas.xyz
                        </code>
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Managed under AMAAS network
                    </span>
                  </div>

                  {/* Included Features Grid */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Everything Included in Your ৳600/Month Subscription:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-200">
                      {websiteSubscriptionPlan.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Configured Limits Box */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Plan Resource Limits & Fair Usage:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Pages:</span>
                        <strong className="text-white">Up to {websiteSubscriptionPlan.limits.maxPages} Pages</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Media Storage:</span>
                        <strong className="text-white">{websiteSubscriptionPlan.limits.maxStorageMb} MB (1 GB)</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Monthly Bandwidth:</span>
                        <strong className="text-white">{websiteSubscriptionPlan.limits.maxBandwidthGb} GB / month</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Content Updates:</span>
                        <strong className="text-white">{websiteSubscriptionPlan.limits.monthlyUpdateRequests} Requests / mo</strong>
                      </div>
                    </div>
                  </div>

                  {/* Primary CTA */}
                  <div className="pt-4">
                    <button
                      onClick={() => navigate('/create-website')}
                      className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition-all shadow-lg flex items-center justify-center gap-2 group cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Start Your Website — ৳600/month</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <p className="text-center text-[11px] text-slate-400 mt-2">
                      Zero upfront development fee • Instant preview • 7-day grace period on lapsed payments
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works (3 Steps) */}
            <div className="space-y-8">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                  Simple 3-Step Process
                </span>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  How It Works
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base">
                    1
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Choose Your Plan
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Select the AMAAS Website Lite subscription at ৳600/month with zero upfront development fees and managed SSD cloud hosting included.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base">
                    2
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Customize Your Website
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Enter your business details, niche, brand colors, contact info, and catalog items. Select a design template and test your real-time draft.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base">
                    3
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Publish Your Business Online
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Claim your available <code className="font-mono text-blue-600">businessname.amaas.xyz</code> subdomain and launch live with direct WhatsApp customer ordering.
                  </p>
                </div>
              </div>
            </div>

            {/* Comparison Table: Subscription vs One-Time Development */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-1">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                  Transparent Comparison
                </span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Website Subscription vs. One-Time Web Development
                </h3>
                <p className="text-xs text-slate-500">
                  Compare our monthly subscription model against custom bespoke agency packages.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Feature / Aspect</th>
                      <th className="py-3 px-4 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-950/30">
                        AMAAS Website Lite (৳600/mo)
                      </th>
                      <th className="py-3 px-4">One-Time Web Development (৳8,000+)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {SUBSCRIPTION_VS_ONETIME_COMPARISON.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {row.feature}
                        </td>
                        <td className="py-3 px-4 font-medium text-blue-700 dark:text-blue-300 bg-blue-50/30 dark:bg-blue-950/20">
                          {row.subscriptionPlan}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {row.oneTimePackages}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subdomain & Grace Period Disclosures */}
            <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Important Subscription Terms & Infrastructure Transparency</span>
              </div>
              <ul className="space-y-1.5 list-disc pl-5 leading-relaxed text-[11px]">
                {websiteSubscriptionPlan.disclosures.map((d, dIdx) => (
                  <li key={dIdx}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* =========================================================================
            CATEGORY 4: WEBSITE DEVELOPMENT PACKAGES (ONE-TIME)
           ========================================================================= */}
        {activeCategory === 'website' && (
          <div className="space-y-12">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                One-Time Project Engagements
              </span>
              <p className="text-xs text-slate-500">
                Turnkey web engineering by AMAAS. Not a monthly subscription.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {WEBSITE_DEVELOPMENT_PACKAGES.map((web) => (
                <div
                  key={web.id}
                  className={`p-8 rounded-2xl flex flex-col justify-between transition-all ${
                    web.isPopular
                      ? 'bg-slate-900 text-white border-2 border-blue-500 shadow-xl relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                  }`}
                >
                  {web.isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white font-semibold text-[10px] uppercase tracking-wider shadow-sm">
                      Most Popular
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">{web.name}</h3>
                      <p className={`text-xs mt-1 ${web.isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                        {web.description}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums">
                          ৳{web.priceOneTime.toLocaleString()}
                        </span>
                        <span className={`text-xs ${web.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                          one-time project fee
                        </span>
                      </div>
                      <span className={`block text-[11px] font-mono mt-1 ${web.isPopular ? 'text-blue-300' : 'text-slate-500'}`}>
                        {web.estimatedTimeline}
                      </span>
                    </div>

                    {/* Prominent Free Domain & Hosting Badge */}
                    <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                      web.isPopular
                        ? 'bg-blue-950/80 border-blue-700 text-blue-200'
                        : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-300'
                    }`}>
                      <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>{web.domainHostingBenefit}</span>
                    </div>

                    <div className={`pt-4 space-y-2 text-xs border-t ${web.isPopular ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                      {web.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              web.isPopular ? 'text-blue-400' : 'text-blue-600'
                            }`}
                          />
                          <span className={web.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                            {feat}
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
                      onClick={() => setSelectedWebPackage(web)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
                        web.isPopular
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white'
                      }`}
                    >
                      {web.ctaLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            PLAN COMPARISON SECTION
           ========================================================================= */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Dashboard Plan Comparison Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Clear limits and capabilities across all four SaaS tiers.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Feature / Capability</th>
                  <th className="py-3 px-4">Starter (৳299)</th>
                  <th className="py-3 px-4 text-blue-600 dark:text-blue-400">Business (৳599) ★</th>
                  <th className="py-3 px-4">Pro (৳999)</th>
                  <th className="py-3 px-4">Enterprise (৳1,999)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Monthly Order Volume</td>
                  <td className="py-3 px-4 font-mono">300 orders</td>
                  <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">Unlimited</td>
                  <td className="py-3 px-4 font-mono font-bold">Unlimited</td>
                  <td className="py-3 px-4 font-mono font-bold">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Staff User Accounts</td>
                  <td className="py-3 px-4 font-mono">1 User</td>
                  <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">3 Users</td>
                  <td className="py-3 px-4 font-mono">10 Users</td>
                  <td className="py-3 px-4 font-mono">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Inventory & Stock Tracking</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">Included</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">Included</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Courier Management</td>
                  <td className="py-3 px-4 text-slate-400">Manual tracking</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">Included</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">API Sync (when configured)</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">API Sync (when configured)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Multiple Stores / Branches</td>
                  <td className="py-3 px-4 text-slate-400">Single store</td>
                  <td className="py-3 px-4 text-slate-400">Single store</td>
                  <td className="py-3 px-4 text-blue-600 font-bold">Multiple stores</td>
                  <td className="py-3 px-4 text-blue-600 font-bold">Multiple branches & outlets</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">WhatsApp & SMS Integration</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">When configured</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">When configured</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">AI Assistant & Automation</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-slate-400">—</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">Included</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Free Trial Period</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">7 Days Free</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">7 Days Free</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">7 Days Free</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">7 Days Free</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* =========================================================================
            THIRD-PARTY DISCLOSURES FOOTER SECTION
           ========================================================================= */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <ShieldAlert className="w-4 h-4 text-blue-600" />
            <span>General Commercial Disclosures & Service Boundaries</span>
          </div>
          <ul className="space-y-1.5 list-disc pl-5">
            {THIRD_PARTY_DISCLOSURES.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* =========================================================================
            FAQ SECTION
           ========================================================================= */}
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Pricing & Billing FAQ
            </h2>
            <p className="text-xs text-slate-500">
              Clear answers on billing cadences, free trial, and third-party platform policies.
            </p>
          </div>

          <div className="space-y-3">
            {pricingFaqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 text-left font-semibold text-xs text-slate-900 dark:text-white flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="text-slate-400 ml-2">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Dashboard Plan */}
      {selectedDashboardPlan && (
        <Modal
          isOpen={!!selectedDashboardPlan}
          onClose={() => setSelectedDashboardPlan(null)}
          title={`Confirm Plan Selection — ${selectedDashboardPlan.name}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Billing Type:</span>
                <span className="font-semibold text-slate-900 dark:text-white">Monthly Subscription</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Subscription Price:</span>
                <span className="font-bold text-base font-mono text-blue-600">
                  ৳{selectedDashboardPlan.priceMonthly.toLocaleString()} / month
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Trial Period:</span>
                <span className="font-semibold text-emerald-600">7-Day Free Trial</span>
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-1">
                Included Features:
              </span>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {selectedDashboardPlan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedDashboardPlan(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDashboardPlan}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {isAuthenticated ? 'Confirm & Apply Plan' : 'Proceed to Free Trial Sign Up'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for AI Automation */}
      {selectedAutoPackage && (
        <Modal
          isOpen={!!selectedAutoPackage}
          onClose={() => setSelectedAutoPackage(null)}
          title={`Confirm Automation Request — ${selectedAutoPackage.name}`}
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
                  ৳{selectedAutoPackage.priceMonthly.toLocaleString()} / month
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Setup Fee:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                  {selectedAutoPackage.setupFeeLabel}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-[11px]">
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
                onClick={handleConfirmAutomation}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                Submit Setup Request
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Website Package */}
      {selectedWebPackage && (
        <Modal
          isOpen={!!selectedWebPackage}
          onClose={() => setSelectedWebPackage(null)}
          title={`Website Development Brief — ${selectedWebPackage.name}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Billing Type:</span>
                <span className="font-semibold text-blue-600">One-Time Project Fee</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total Project Price:</span>
                <span className="font-bold text-base font-mono text-slate-900 dark:text-white">
                  ৳{selectedWebPackage.priceOneTime.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Domain & Hosting:</span>
                <span className="font-bold text-emerald-600">First-year domain + hosting FREE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Timeline:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                  {selectedWebPackage.estimatedTimeline}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Clicking below will direct you to our Website Requirements Specification Form to choose pages and integrations.
            </p>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedWebPackage(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWebsite}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Proceed to Requirements Form &rarr;
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
