import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shirt,
  Smartphone,
  Apple,
  TrendingUp,
  Building2,
  CheckCircle2,
  ArrowRight,
  Globe,
  Sparkles,
} from 'lucide-react';
import { ASSETS } from '../../assets/images';

export const SolutionsPage: React.FC = () => {
  const industries = [
    {
      icon: Shirt,
      title: 'Fashion, Apparel & Footwear',
      tagline: 'Manage size variations, seasonal lookbooks, and high return rates.',
      points: [
        'Multi-variant product catalog (Sizes, Colors, Inseams)',
        'Exchange & return verification workflow',
        'Visual lookbook landing page templates with instant COD orders',
        'Messenger bot answers sizing queries with measurement charts',
      ],
    },
    {
      icon: Smartphone,
      title: 'Consumer Electronics & Gadgets',
      tagline: 'Track serial numbers, manage warranties, and combat high-value COD risk.',
      points: [
        'SKU and barcode serial tracking on invoices',
        'Customer purchase verification before courier handoff',
        'Technical specification tables on landing pages',
        'Automated WhatsApp follow-up for unboxing instructions',
      ],
    },
    {
      icon: Apple,
      title: 'Organic Groceries & Gourmet Food',
      tagline: 'Batch expiry management, rapid same-day dispatch, and loyal repeat buyers.',
      points: [
        'Freshness batch tracking and inventory shelf-life warnings',
        'Repeat order reminders via SMS 14 days after purchase',
        'Neighborhood delivery route grouping for reduced delivery expense',
        'Bulk wholesale discounts for regular pantry shoppers',
      ],
    },
    {
      icon: TrendingUp,
      title: 'Fast-Scaling Direct-to-Consumer Brands',
      tagline: 'Launch flash drops, run influencer campaigns, and scale ad ROI.',
      points: [
        'High-converting single-product flash landing pages',
        'Real-time traffic and conversion attribution analytics',
        'Abandoned cart WhatsApp recovery within 30 minutes',
        'Unlimited orders per month with Pro and Enterprise plans',
      ],
    },
    {
      icon: Building2,
      title: 'Wholesale B2B & Distributors',
      tagline: 'Tiered wholesale pricing, custom quotations, and bulk invoicing.',
      points: [
        'Minimum order quantity (MOQ) controls per client tier',
        'Credit limit and outstanding payment balance tracking',
        'Print-ready professional B2B invoices with tax/VAT breakdown',
        'Branch warehouse inventory routing and multi-user access',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
            Tailored Industry Solutions
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Built for the Specific Challenges of Your Vertical
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Whether you sell apparel on Facebook, run a boutique gadget shop in Banani, or distribute wholesale across Bangladesh, GoAMAAS fits your workflow.
          </p>
        </div>

        {/* Industry Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {industries.map((ind, i) => {
            const Icon = ind.icon;
            return (
              <div
                key={i}
                className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {ind.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{ind.tagline}</p>
                  </div>
                  <div className="pt-2 space-y-2.5">
                    {ind.points.map((pt, pIdx) => (
                      <div key={pIdx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Website Development Service Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-slate-900 to-slate-950 p-8 sm:p-12 text-white border border-slate-800 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="max-w-xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Full-Service Agency by AMAAS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Need a Custom Engineered Website? Starting at ৳8,000
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every website project includes your first year domain (.com) and lightning-fast cloud hosting <strong>100% free</strong>. Built with modern React and Tailwind, mobile-optimized, and connected to your GoAMAAS dashboard.
            </p>
            <div className="pt-2 flex flex-wrap gap-4">
              <Link
                to="/dashboard/website-requests"
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
              >
                Request a Custom Website
              </Link>
              <Link
                to="/pricing"
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
              >
                Compare Website Tiers
              </Link>
            </div>
          </div>
          <div className="w-full lg:w-96 rounded-xl overflow-hidden border border-slate-800 shadow-lg shrink-0">
            <img
              src={ASSETS.storePreview}
              alt="Custom website store preview"
              className="w-full h-auto object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
