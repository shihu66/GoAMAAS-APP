import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ASSETS } from '../../assets/images';
import {
  ArrowRight,
  CheckCircle2,
  Package,
  ShoppingCart,
  Bot,
  Layers,
  BarChart3,
  Globe2,
  ChevronDown,
  Sparkles,
  Zap,
  Shield,
  Truck,
  MessageSquare,
  Clock,
  Store,
} from 'lucide-react';
import { DASHBOARD_SUBSCRIPTION_PLANS } from '../../data/pricingConfig';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What is GoAMAAS?',
      a: 'GoAMAAS is the unified commerce and growth operating system engineered by AMAAS. It brings together order processing, inventory synchronisation, custom high-converting landing pages, omnichannel AI messaging (WhatsApp & Messenger), and courier logistics into one intuitive dashboard.',
    },
    {
      q: 'How does the 7-day free trial work?',
      a: 'You receive instant, unrestricted access to the GoAMAAS Pro tier for 7 full days. No credit card required upfront. You can manage your products, build landing pages, and test AI workflows immediately.',
    },
    {
      q: 'Are custom website development services included?',
      a: 'Yes! AMAAS offers professional custom website engineering starting at just ৳8,000. Every single website package includes 1 year of high-speed cloud hosting and your custom top-level domain completely free.',
    },
    {
      q: 'Which courier services are integrated for Bangladesh merchants?',
      a: 'GoAMAAS natively connects with top logistics providers including Steadfast Courier, Pathao Courier, RedX, and eCourier with one-click automated parcel generation and real-time tracking webhooks.',
    },
    {
      q: 'Can I connect my Facebook page and WhatsApp Business?',
      a: 'Yes. Our AI Automation Center provides zero-code conversational bots that automatically reply to incoming chats, display product cards, provide live tracking, and convert comments into paying orders.',
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* 1. Hero Section */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 overflow-hidden border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen Commerce Infrastructure by AMAAS</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.1] text-balance">
              The All-in-One Engine for <span className="text-blue-600 dark:text-blue-500">Business Growth</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
              Manage multi-channel orders, automate customer follow-ups on WhatsApp & Messenger, launch high-converting landing pages, and sync courier deliveries in seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg shadow-md hover:shadow-lg transition-all"
              >
                <span>Start 7-Day Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/features"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
              >
                Explore Features
              </Link>
            </div>

            {/* Trust points */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>No credit card required</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Instant 2-minute setup</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Steadfast & Pathao courier ready</span>
              </span>
            </div>
          </div>

          {/* Product Dashboard Preview Visual */}
          <div className="mt-12 md:mt-16 max-w-5xl mx-auto rounded-2xl p-2 bg-gradient-to-b from-blue-500/20 via-slate-200/40 to-transparent dark:from-blue-600/20 dark:via-slate-800/40 border border-slate-200/80 dark:border-slate-800 shadow-2xl">
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <img
                src={ASSETS.heroDashboard}
                alt="GoAMAAS SaaS Dashboard Preview"
                className="w-full h-auto object-cover max-h-[560px]"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Platform Capabilities Bar */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                Multi-Channel
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Consolidated Order Hub</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                Courier APIs
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Steadfast & Pathao Integration</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                Omnichannel AI
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">WhatsApp & Messenger Bots</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400 font-mono">
                ৳600 / Mo
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Website Lite Subscription</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Core Feature Showcase (Asymmetric Bento Grid) */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
            Architected for Growth
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Everything your business needs in one unified workspace
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Stop switching between 6 disjointed tools. Run your storefront, inventory, couriers, and AI bots from GoAMAAS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Multi-Channel Order Hub (Span 2) */}
          <div className="md:col-span-2 p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Multi-Channel Order Fulfillment & Logistics
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Consolidate orders from your online store, Facebook Messenger, WhatsApp, and landing pages. Generate shipping labels, assign parcels to Steadfast or Pathao with one click, and track parcel statuses in real time.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">One-Click Dispatch</span>
                  <span className="text-slate-400">Integrated couriers</span>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">Instant Invoices</span>
                  <span className="text-slate-400">Printable PDF layout</span>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">COD Fraud Shield</span>
                  <span className="text-slate-400">Customer return history</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Smart Inventory */}
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Low-Stock Alerts & Inventory Ledger
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Never oversell an out-of-stock item again. Set automated low-stock warnings, track stock movements with historical operator logs, and adjust quantities in real time.
              </p>
            </div>
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
              <Link to="/features" className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                <span>View Inventory Docs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 3: Visual Landing Page Builder */}
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Drag-and-Drop Landing Page Builder
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Launch high-converting single-product flash campaign pages in 5 minutes. Custom themes, direct checkout forms, live mobile/desktop preview, and built-in conversion tracking.
              </p>
            </div>
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
              <Link to="/features" className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                <span>Explore Page Templates</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 4: Omnichannel AI Automation Center (Span 2) */}
          <div className="md:col-span-2 p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                AI Automation Center & Intelligent Chatbots
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Deploy conversational AI assistants on Facebook Messenger and WhatsApp that respond 24/7. Handle repetitive product queries, recover abandoned carts automatically, and capture warm leads without human intervention.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> WhatsApp Bot API
                </span>
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Messenger Lead Scraper
                </span>
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Abandoned Cart SMS
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Business Automation & Online Store Management Spotlight */}
      <section className="py-20 bg-slate-900 text-white border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700/50 text-blue-300 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" />
                <span>Zero-Latency Operations</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Turn Every Conversation into a Completed Order
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Modern shoppers demand immediate answers on social channels. GoAMAAS synchronizes chat responses, live inventory reserves, and automated courier shipments with seamless efficiency.
              </p>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white">Smart Bot Catalog Carousels:</strong> Display your bestsellers directly inside Messenger and WhatsApp with live price tags.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white">Instant Abandoned Checkout Recovery:</strong> Automated nudges trigger within 30 minutes, recovering up to 24% of lost sales.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-white">Courier Tracking Alerts:</strong> Real-time SMS and WhatsApp notifications sent automatically when parcels are dispatched.
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-xs transition-colors"
                >
                  <span>Build Your First Automation</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
              <img
                src={ASSETS.automationFlow}
                alt="Omnichannel Automation Flow Diagram"
                className="w-full h-auto object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Custom Website Service Highlight (Starting at ৳8,000) */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-2xl bg-gradient-to-br from-blue-900 to-slate-900 text-white border border-blue-800 shadow-xl relative overflow-hidden">
          <div className="max-w-2xl space-y-4 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold">
              <Globe2 className="w-3.5 h-3.5" />
              <span>Full-Stack Web Development by AMAAS</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Need a Custom E-Commerce Website? Starting at just ৳8,000
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Let AMAAS engineers build your bespoke, ultra-fast online store. Every package includes a <strong className="text-blue-300">free custom domain (.com) and 1st year cloud hosting 100% free</strong>, pre-configured with bKash, Nagad, and courier API connections.
            </p>
            <div className="pt-4 flex flex-wrap gap-4">
              <Link
                to="/solutions"
                className="px-5 py-3 rounded-lg bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                View Website Packages
              </Link>
              <Link
                to="/dashboard/website-requests"
                className="px-5 py-3 rounded-lg bg-blue-800/80 hover:bg-blue-800 text-white font-semibold text-xs border border-blue-700 transition-colors"
              >
                Submit Website Requirements
              </Link>
            </div>
          </div>

          <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-96 opacity-30 pointer-events-none">
            <img
              src={ASSETS.storePreview}
              alt="E-commerce Store Showcase"
              className="rounded-l-2xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </section>

      {/* 6. Subscription Plans Preview */}
      <section className="py-20 bg-slate-100/50 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
              Transparent Pricing
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
              Simple, affordable plans built for local business scale
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              All dashboard plans include a 7-day unrestricted free trial. Upgrade or cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {DASHBOARD_SUBSCRIPTION_PLANS.map((plan) => (
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
                    <h3 className="text-base font-bold tracking-tight">{plan.name}</h3>
                    <p className={`text-xs mt-0.5 ${plan.isPopular ? 'text-blue-300' : 'text-slate-500'}`}>
                      {plan.subtitle}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold font-mono tabular-nums">
                      ৳{plan.priceMonthly.toLocaleString()}
                    </span>
                    <span className={`text-xs ${plan.isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                      /month
                    </span>
                  </div>

                  <ul className={`space-y-2 text-xs pt-3 border-t ${plan.isPopular ? 'border-slate-800 text-slate-300' : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
                    {plan.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            plan.isPopular ? 'text-blue-400' : 'text-blue-600'
                          }`}
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  <Link
                    to="/register"
                    className={`w-full block py-2.5 text-center text-xs font-semibold rounded-lg transition-colors shadow-xs ${
                      plan.isPopular
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                    }`}
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Spotlight: AMAAS Website Lite Plan */}
          <div className="mt-8 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-2 border-blue-500 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-3 py-0.5 rounded-full bg-blue-600 text-white font-extrabold text-[11px] uppercase tracking-wider">
                  ★ Best for Small Businesses
                </span>
                <span className="text-xs text-blue-300 font-semibold">New Website Subscription Plan</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                AMAAS Website Lite — ৳600 / month
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Custom-designed, mobile-responsive business website for any niche with hosting included and your free subdomain (<code className="font-mono text-emerald-400">yourbusiness.amaas.xyz</code>). Zero upfront development fee.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
              <Link
                to="/create-website"
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition-colors text-center shadow-md flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Start Website (৳600/mo)</span>
              </Link>
              <Link
                to="/pricing"
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors text-center border border-slate-700"
              >
                View Full Details
              </Link>
            </div>
          </div>

          <div className="mt-6 p-3.5 rounded-xl bg-slate-200/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 text-center">
            Third-party API integrations (such as Courier API and WhatsApp notifications) require your merchant credentials to be configured before functioning.
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Have questions about GoAMAAS? We are here to help.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left font-semibold text-sm text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 8. Final CTA Section */}
      <section className="py-20 bg-blue-600 dark:bg-blue-700 text-white text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to Accelerate Your Business with AMAAS?
          </h2>
          <p className="text-sm sm:text-base text-blue-100 max-w-xl mx-auto leading-relaxed">
            Join hundreds of thriving retail brands scaling their revenue, automating their conversations, and managing orders seamlessly.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-white text-slate-900 font-bold text-xs sm:text-sm hover:bg-slate-100 shadow-md transition-colors"
            >
              Start 7-Day Free Trial Now
            </Link>
            <Link
              to="/contact"
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs sm:text-sm border border-blue-500 transition-colors"
            >
              Talk to Our Team
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
