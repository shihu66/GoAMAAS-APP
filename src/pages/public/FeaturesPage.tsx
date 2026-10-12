import React from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  ShoppingCart,
  Boxes,
  Layers,
  Bot,
  BarChart3,
  Globe2,
  Truck,
  CheckCircle2,
  ArrowRight,
  Shield,
  Smartphone,
  Zap,
} from 'lucide-react';

export const FeaturesPage: React.FC = () => {
  const featureList = [
    {
      icon: ShoppingCart,
      title: 'Unified Multi-Channel Order Hub',
      desc: 'Seamlessly capture orders coming from your online store, Facebook Messenger, WhatsApp catalog, and landing pages. Filter by delivery stage, print professional invoices in 1 click, and trigger status SMS updates automatically.',
      highlights: [
        'Instant order status pipeline (Pending -> Confirmed -> Shipped -> Delivered)',
        'One-click parcel creation for Steadfast, Pathao & RedX',
        'Customer purchase history & fraudulent COD detection',
        'Bulk CSV & Excel export for accounting and warehouses',
      ],
    },
    {
      icon: Boxes,
      title: 'Real-Time Inventory & Stock Audit',
      desc: 'Full visibility across warehouse shelves. Low-stock threshold alarms prevent embarrassing stockouts, while historical movement logs track every restock and sale with timestamp and operator accountability.',
      highlights: [
        'Customizable low-stock threshold triggers',
        'Detailed audit trail of stock adjustments with recorded reasons',
        'Multi-location & branch support for Enterprise users',
        'Quick stock increment/decrement shortcuts directly in the table',
      ],
    },
    {
      icon: Layers,
      title: 'Visual Landing Page Builder',
      desc: 'Create high-converting, mobile-optimized single-product landing pages in minutes without writing code. Choose from polished pre-designed layouts, customize color palettes, and embed direct COD checkout forms.',
      highlights: [
        'Responsive split preview for desktop and mobile viewports',
        'Direct checkout form to maximize customer conversion rate',
        'Section visibility controls (Hero, Features, Reviews, FAQ)',
        'Built-in analytics for visitor count and conversion rate',
      ],
    },
    {
      icon: Bot,
      title: 'Omnichannel AI Automation Center',
      desc: 'Put customer communication on autopilot. Smart AI chatbots for Facebook Messenger and WhatsApp answer product queries, share catalogs, check order tracking codes, and recover abandoned carts 24/7.',
      highlights: [
        'Messenger & WhatsApp conversational AI assistants',
        'Abandoned cart recovery triggers after 30 minutes of inactivity',
        'Lead qualification and phone number extraction',
        'Visual workflow editor with trigger, condition, and action mapping',
      ],
    },
    {
      icon: BarChart3,
      title: 'Executive Analytics & Profit Tracking',
      desc: 'Turn raw transactions into actionable growth insights. Monitor gross revenue, net profit margins, top-selling categories, repeat customer retention rates, and courier delivery success ratios.',
      highlights: [
        'Interactive revenue area charts with flexible date-range filtering',
        'Order status breakdown charts to identify fulfillment bottlenecks',
        'Customer acquisition velocity and lifetime value metrics',
        'Downloadable financial summary reports for business owners',
      ],
    },
    {
      icon: Globe2,
      title: 'Bespoke Website Engineering by AMAAS',
      desc: 'Need a complete, custom web application or brand flagship store? Our in-house development studio builds lightning-fast websites starting at ৳8,000, including free 1st year domain and cloud hosting.',
      highlights: [
        'Custom designs optimized for maximum mobile speed',
        '1st Year Domain (.com) + High-Speed Hosting 100% Free',
        'Pre-integrated bKash, Nagad, and local payment gateways',
        'Direct project tracking pipeline inside your GoAMAAS dashboard',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
            Platform Capabilities
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Designed for Speed, Scale, and Higher Profit Margins
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Every feature in GoAMAAS is built from ground-up feedback by active merchants, replacing fragmented spreadsheets and lost messages with an enterprise-grade engine.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureList.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-xs hover:border-blue-500/50 transition-all"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {f.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {f.desc}
                  </p>
                  <div className="pt-2 space-y-2">
                    {f.highlights.map((h, hIdx) => (
                      <div key={hIdx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Bar */}
        <div className="mt-16 p-8 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-6 border border-slate-800">
          <div>
            <h3 className="text-xl font-bold">Experience the full platform in action</h3>
            <p className="text-xs text-slate-400 mt-1">
              Start your 7-day free trial now or test our interactive demo portal.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              to="/dashboard"
              className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-200 transition-colors"
            >
              Launch Demo Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
