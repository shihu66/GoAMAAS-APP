import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Download,
  Clock,
  Sparkles,
  ArrowRight,
  Shield,
  X,
  Globe,
  Globe2,
  Bot,
  Info,
  Layers,
} from 'lucide-react';
import {
  DASHBOARD_SUBSCRIPTION_PLANS,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  DashboardPlanConfig,
  AutomationPackageConfig,
  WebsitePackageConfig,
} from '../../data/pricingConfig';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
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
  } = useApp();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'automations' | 'websites' | 'webSubscription'>('dashboard');

  const myWebsite = subscribedWebsites.find((w) => w.storeId === activeStore?.id) || subscribedWebsites[0];

  // Confirmation dialogs
  const [selectedDashboardPlan, setSelectedDashboardPlan] = useState<DashboardPlanConfig | null>(null);
  const [selectedAutoPackage, setSelectedAutoPackage] = useState<AutomationPackageConfig | null>(null);
  const [selectedWebPackage, setSelectedWebPackage] = useState<WebsitePackageConfig | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Card'>('bKash');

  const handleConfirmPlanChange = () => {
    if (selectedDashboardPlan) {
      updatePlan(selectedDashboardPlan.id);
      setSelectedDashboardPlan(null);
    }
  };

  const handleConfirmAutomation = () => {
    if (selectedAutoPackage) {
      showToast(`Automation request recorded for ${selectedAutoPackage.name}. Monthly service fee: ৳${selectedAutoPackage.priceMonthly.toLocaleString()}/mo.`, 'success');
      setSelectedAutoPackage(null);
    }
  };

  const handleDownloadInvoice = (invNum: string) => {
    showToast(`Generating tax invoice document for ${invNum}...`, 'info');
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

      {/* Independent 7-Day Free Trial Hub */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Independent 7-Day Free Trials for Every Service
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Eligible services (Dashboard Plans, AI Automations, Landing Page Builder) have independent 7-day free trials. Due to server provisioning, Website Service has NO free trial.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400 font-bold">
              {serviceTrials.filter((t) => {
                const diff = new Date(t.expiresAt).getTime() - Date.now();
                return diff > 0 && t.status === 'active';
              }).length}
            </span>
            <span>Active Service Trials (Dashboard & AI)</span>
          </div>
        </div>

        {/* 4 Core Services Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Service 1: Dashboard Plan */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Core SaaS</span>
                <span className="text-xs font-bold text-blue-600">৳599/mo</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Dashboard & Commerce</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Multi-channel order fulfillment, stock management & Courier APIs.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <TrialStatusBadge
                serviceId="dashboard_business"
                serviceName="Dashboard Business Tier"
                category="dashboard"
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* Service 2: AI Automations */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Messaging</span>
                <span className="text-xs font-bold text-purple-600">৳999/mo</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">AI Automation Suite</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                24/7 Messenger & WhatsApp bots, cart recovery & automated notifications.
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
                <span className="text-xs font-bold text-blue-600">Pro Feature</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Landing Page Builder</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                High-converting campaign landing pages with 1-click Cash on Delivery forms.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <TrialStatusBadge
                serviceId="landing_page_builder"
                serviceName="Landing Page Visual Builder"
                category="landing_pages"
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* Service 4: Business Website Lite */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Managed Web</span>
                <span className="text-xs font-bold text-emerald-600">৳600/mo</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Business Website Lite</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Custom branded website with hosting, subdomain & monthly update requests.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => navigate('/create-website')}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Build Website (No Free Trial)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs for Billing Panel */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'dashboard'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Dashboard Plans (Monthly Subscription)</span>
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
          <span>Website Subscription (৳600/mo Lite)</span>
        </button>
      </div>

      {/* TAB 1: Dashboard Plans */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {DASHBOARD_SUBSCRIPTION_PLANS.map((p) => {
              const isCurrent = currentPlan === p.id;

              return (
                <div
                  key={p.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                    isCurrent
                      ? 'bg-slate-900 text-white border-2 border-emerald-500 shadow-lg relative'
                      : p.isPopular
                      ? 'bg-white dark:bg-slate-900 border-2 border-blue-500 text-slate-900 dark:text-white shadow-md relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                  }`}
                >
                  {isCurrent ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white font-semibold text-[10px] uppercase tracking-wider">
                      Current Active Plan
                    </div>
                  ) : p.isPopular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white font-semibold text-[10px] uppercase tracking-wider">
                      Most Popular
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-base">{p.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.subtitle}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold font-mono tabular-nums">
                        ৳{p.priceMonthly.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      {p.features.map((f, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              isCurrent ? 'text-emerald-400' : 'text-blue-600'
                            }`}
                          />
                          <span className={isCurrent ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      disabled={isCurrent}
                      onClick={() => setSelectedDashboardPlan(p)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                        isCurrent
                          ? 'bg-emerald-600 text-white cursor-default'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white'
                      }`}
                    >
                      {isCurrent ? 'Active Plan' : `Switch to ${p.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              <strong>Note on Third-Party Integrations:</strong> Courier APIs (Steadfast, Pathao, RedX) and WhatsApp notifications function after you enter valid API credentials in Settings. They do not operate prior to configuration.
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: AI Automation Packages */}
      {activeTab === 'automations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {AI_AUTOMATION_PACKAGES.map((auto) => (
              <div
                key={auto.id}
                className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                  auto.isPopular
                    ? 'bg-slate-900 text-white border-2 border-purple-500 shadow-md relative'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-xs'
                }`}
              >
                {auto.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-600 text-white font-semibold text-[10px] uppercase tracking-wider">
                    Recommended
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-base">{auto.name}</h4>
                    <p className={`text-xs mt-1 ${auto.isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                      {auto.description}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold font-mono tabular-nums">
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

                  <div className={`space-y-2 pt-3 border-t text-xs ${auto.isPopular ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                    {auto.features.map((f, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            auto.isPopular ? 'text-purple-400' : 'text-blue-600'
                          }`}
                        />
                        <span className={auto.isPopular ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={() => setSelectedAutoPackage(auto)}
                    className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors ${
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
            {WEBSITE_DEVELOPMENT_PACKAGES.map((web) => (
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
                    <h4 className="font-bold text-base">{web.name}</h4>
                    <p className={`text-xs mt-1 ${web.isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                      {web.description}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold font-mono tabular-nums">
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
                  <a
                    href="/dashboard/website-requests"
                    className={`block w-full py-2.5 text-center rounded-lg text-xs font-semibold transition-colors ${
                      web.isPopular
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white'
                    }`}
                  >
                    {web.ctaLabel}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Website Subscription (AMAAS Website Lite - ৳600/month) */}
      {activeTab === 'webSubscription' && (
        <div className="space-y-6">
          {/* Active Subscribed Website Status if user has one */}
          {myWebsite ? (
            <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-slate-900 border-2 border-blue-600 text-white shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold uppercase tracking-wider">
                      Active Website Subscription
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        myWebsite.subscriptionStatus === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                      }`}
                    >
                      {myWebsite.subscriptionStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mt-1">
                    {myWebsite.businessName} Website
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-blue-300 font-mono mt-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="font-semibold">{myWebsite.fullDomainUrl}</span>
                    <span className="text-slate-400 font-sans text-[11px]">(Subdomain under AMAAS)</span>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
                  <div className="text-2xl font-black font-mono text-white">
                    ৳{myWebsite.monthlyFee.toLocaleString()}<span className="text-xs text-slate-400 font-sans font-normal"> / month</span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    Next Renewal: <strong className="text-white font-mono">{myWebsite.nextBillingDate}</strong>
                  </div>
                </div>
              </div>

              {/* Resource consumption summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Pages Active</span>
                  <span className="font-bold text-white font-mono">{myWebsite.resourceUsage.pagesCount} / {myWebsite.resourceUsage.pagesLimit}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Storage Consumption</span>
                  <span className="font-bold text-white font-mono">{myWebsite.resourceUsage.storageUsedMb} MB / {myWebsite.resourceUsage.storageLimitMb} MB</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Bandwidth Used</span>
                  <span className="font-bold text-white font-mono">{myWebsite.resourceUsage.bandwidthUsedGb} GB / {myWebsite.resourceUsage.bandwidthLimitGb} GB</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Updates Used (This Month)</span>
                  <span className="font-bold text-white font-mono">{myWebsite.resourceUsage.monthlyUpdatesUsed} / {myWebsite.resourceUsage.monthlyUpdatesLimit}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={() => navigate('/dashboard/subscribed-website')}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Manage Website & Live Preview</span>
                </button>
                <button
                  onClick={() => navigate('/create-website')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Build Another Website (৳600/mo)</span>
                </button>
              </div>
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
                  Free Subdomain Included: <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">yourbusiness.amaas.xyz</code>
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Custom domain (.com) not included
              </span>
            </div>

            {/* Features List */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Included with Your ৳600/Month Subscription:
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
                <span>Start Your Website Now (৳600/month)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Method Preferences */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Payment Method for Renewal
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
              paymentMethod === 'bKash'
                ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 font-semibold'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <input
              type="radio"
              name="payMethod"
              checked={paymentMethod === 'bKash'}
              onChange={() => setPaymentMethod('bKash')}
            />
            <span>bKash Auto-Debit / Merchant</span>
          </label>

          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
              paymentMethod === 'Nagad'
                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 font-semibold'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <input
              type="radio"
              name="payMethod"
              checked={paymentMethod === 'Nagad'}
              onChange={() => setPaymentMethod('Nagad')}
            />
            <span>Nagad Direct Wallet</span>
          </label>

          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
              paymentMethod === 'Card'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 font-semibold'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <input
              type="radio"
              name="payMethod"
              checked={paymentMethod === 'Card'}
              onChange={() => setPaymentMethod('Card')}
            />
            <span>Visa / Mastercard / Amex</span>
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>Demo billing flow. No actual charges will be deducted from your wallet.</span>
        </div>
      </div>

      {/* Billing Invoices List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Billing History & Tax Receipts
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Past monthly subscription statement receipts
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice ID</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4 text-right">Amount (৳)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">{inv.date}</td>
                  <td className="py-3.5 px-4 font-sans text-slate-900 dark:text-white font-medium">
                    {inv.planName}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                    ৳{inv.amount.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 font-sans">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-sans">
                    <button
                      onClick={() => handleDownloadInvoice(inv.invoiceNumber)}
                      className="p-1 text-slate-500 hover:text-blue-600 transition-colors"
                      title="Download Invoice PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade / Plan Change Confirmation Dialog */}
      {selectedDashboardPlan && (
        <Modal
          isOpen={!!selectedDashboardPlan}
          onClose={() => setSelectedDashboardPlan(null)}
          title={`Confirm Subscription Change — ${selectedDashboardPlan.name}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Billing Type:</span>
                <span className="font-semibold text-slate-900 dark:text-white">Monthly Subscription</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Subscription Fee:</span>
                <span className="font-bold text-base font-mono text-blue-600">
                  ৳{selectedDashboardPlan.priceMonthly.toLocaleString()} / month
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Included Limits:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedDashboardPlan.subtitle}
                </span>
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
                onClick={handleConfirmPlanChange}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Switch to {selectedDashboardPlan.name}
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
          title={`Confirm Automation Service — ${selectedAutoPackage.name}`}
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
                onClick={handleConfirmAutomation}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                Activate Service
              </button>
            </div>
          </div>
        </Modal>
      )}

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
