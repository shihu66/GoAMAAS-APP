import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { isWebsiteTrulyLive } from '../../lib/paymentWorkflow';
import { extractOrderMetadataFromItems } from '../../lib/storefrontSync';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  ArrowRight,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Paintbrush,
  Copy,
  Eye,
  Circle,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export const DashboardOverviewPage: React.FC = () => {
  const {
    user,
    activeStore,
    products,
    orders,
    customers,
    subscribedWebsites,
    showToast,
  } = useApp();
  const { t, lang } = useLanguage();
  const ov = t.workspace.overview;
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  const connectedWebsite = useMemo(() => {
    if (!subscribedWebsites || subscribedWebsites.length === 0) return null;
    if (activeStore) {
      const match = subscribedWebsites.find((w) => w.storeId === activeStore.id);
      if (match) return match;
    }
    return subscribedWebsites[0];
  }, [subscribedWebsites, activeStore]);

  const isWebsiteLive = connectedWebsite ? isWebsiteTrulyLive(connectedWebsite) : false;

  const totalSales = useMemo(
    () => orders.reduce((acc, o) => (o.status !== 'cancelled' ? acc + o.total : acc), 0),
    [orders]
  );
  const totalOrders = orders.length;
  const pendingOrdersCount = useMemo(
    () =>
      orders.filter(
        (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'processing'
      ).length,
    [orders]
  );
  const lowStockCount = products.filter((p) => p.stock <= p.lowStockThreshold).length;

  // Interactive 5-Step Getting Started Checklist computed from real workspace state
  const checklistItems = useMemo(() => {
    const hasDesign = Boolean(connectedWebsite);
    const hasLogo = Boolean(connectedWebsite?.logoUrl);
    const hasProduct =
      products.length > 0 || (connectedWebsite?.servicesOrProducts?.length ?? 0) > 0;
    const hasContact = Boolean(
      connectedWebsite?.phone ||
        connectedWebsite?.whatsappNumber ||
        activeStore?.phone
    );
    const isLive = isWebsiteLive;

    const specs = [
      { done: hasDesign, path: connectedWebsite ? '/dashboard/subscribed-website' : '/create-website' },
      { done: hasLogo, path: connectedWebsite ? '/dashboard/subscribed-website?tab=design' : '/create-website' },
      { done: hasProduct, path: '/dashboard/products?action=add' },
      { done: hasContact, path: connectedWebsite ? '/dashboard/subscribed-website?tab=settings' : '/dashboard/settings' },
      { done: isLive, path: connectedWebsite ? '/dashboard/subscribed-website?tab=settings' : '/create-website' },
    ];

    return ov.checklistSteps.map((stepMeta, idx) => ({
      ...stepMeta,
      done: specs[idx]?.done ?? false,
      path: specs[idx]?.path ?? '/dashboard',
    }));
  }, [connectedWebsite, products.length, activeStore?.phone, isWebsiteLive, ov.checklistSteps]);

  const completedChecklistCount = checklistItems.filter((item) => item.done).length;
  const allChecklistDone = completedChecklistCount === checklistItems.length;

  // Sales trend chart data
  const salesTrendData = useMemo(() => {
    const now = new Date();
    const buckets: { date: string; revenue: number; orders: number }[] = [];

    if (dateRange === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
        const dayOrders = orders.filter(
          (o) => o.createdAt.startsWith(dateStr) && o.status !== 'cancelled'
        );
        const rev = dayOrders.reduce((sum, o) => sum + o.total, 0);
        buckets.push({ date: dayLabel, revenue: rev, orders: dayOrders.length });
      }
    } else if (dateRange === '30d') {
      for (let i = 3; i >= 0; i--) {
        const weekLabel = `Week ${4 - i}`;
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        const weekOrders = orders.filter((o) => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= start && orderDate <= end && o.status !== 'cancelled';
        });
        const rev = weekOrders.reduce((sum, o) => sum + o.total, 0);
        buckets.push({ date: weekLabel, revenue: rev, orders: weekOrders.length });
      }
    } else {
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });
        const year = d.getFullYear();
        const month = d.getMonth();
        const monthOrders = orders.filter((o) => {
          const od = new Date(o.createdAt);
          return od.getFullYear() === year && od.getMonth() === month && o.status !== 'cancelled';
        });
        const rev = monthOrders.reduce((sum, o) => sum + o.total, 0);
        buckets.push({ date: monthLabel, revenue: rev, orders: monthOrders.length });
      }
    }
    return buckets;
  }, [orders, dateRange]);

  // Previous-Month vs. Current-Month Sales Comparison (preserved contract)
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();
    const prevDate = new Date(currYear, currMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();

    const currentMonthLabel = now.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const previousMonthLabel = prevDate.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });

    const ranges = [
      { bucket: 'Days 1–7', min: 1, max: 7 },
      { bucket: 'Days 8–14', min: 8, max: 14 },
      { bucket: 'Days 15–21', min: 15, max: 21 },
      { bucket: 'Days 22–28', min: 22, max: 28 },
      { bucket: 'Days 29–31', min: 29, max: 31 },
    ];

    let previousTotal = 0;
    let currentTotal = 0;
    let previousOrderCount = 0;
    let currentOrderCount = 0;

    const series = ranges.map((r) => {
      let prevBucketSum = 0;
      let currBucketSum = 0;

      for (const o of orders) {
        if (o.status === 'cancelled') continue;
        const od = new Date(o.createdAt);
        const day = od.getDate();
        if (day < r.min || day > r.max) continue;

        if (od.getFullYear() === prevYear && od.getMonth() === prevMonth) {
          prevBucketSum += o.total;
        } else if (od.getFullYear() === currYear && od.getMonth() === currMonth) {
          currBucketSum += o.total;
        }
      }

      previousTotal += prevBucketSum;
      currentTotal += currBucketSum;
      return {
        bucket: r.bucket,
        previousMonth: prevBucketSum,
        currentMonth: currBucketSum,
      };
    });

    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const od = new Date(o.createdAt);
      if (od.getFullYear() === prevYear && od.getMonth() === prevMonth) {
        previousOrderCount += 1;
      } else if (od.getFullYear() === currYear && od.getMonth() === currMonth) {
        currentOrderCount += 1;
      }
    }

    const momDeltaPct =
      previousTotal > 0
        ? (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1)
        : currentTotal > 0
        ? '100.0'
        : '0.0';

    return {
      currentMonthLabel,
      previousMonthLabel,
      previousTotal,
      currentTotal,
      previousOrderCount,
      currentOrderCount,
      momDeltaPct,
      hasMonthlySales: previousTotal > 0 || currentTotal > 0,
      series,
    };
  }, [orders]);

  // Business Performance Insights (preserved contract)
  const performanceInsights = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'cancelled');
    const deliveredOrders = validOrders.filter((o) => o.status === 'delivered');
    const aov = validOrders.length > 0 ? Math.round(totalSales / validOrders.length) : 0;
    const deliveryRate =
      validOrders.length > 0 ? Math.round((deliveredOrders.length / validOrders.length) * 100) : 0;
    const repeatBuyers = customers.filter((c) => c.ordersCount > 1).length;
    const repeatRate =
      customers.length > 0 ? Math.round((repeatBuyers / customers.length) * 100) : 0;
    const healthyStockPct =
      products.length > 0
        ? Math.round(((products.length - lowStockCount) / products.length) * 100)
        : 100;

    return {
      aov,
      deliveryRate,
      repeatRate,
      repeatBuyers,
      healthyStockPct,
    };
  }, [orders, totalSales, customers, products.length, lowStockCount]);

  const recentOrders = useMemo(() => [...orders].slice(0, 5), [orders]);
  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.salesCount - a.salesCount).slice(0, 4),
    [products]
  );

  const hasSalesData = orders.length > 0 && totalSales > 0;
  const greetingName = user?.name || activeStore?.name || 'Merchant';

  const handleCopyWebsiteLink = async () => {
    if (!connectedWebsite) return;
    const url = `https://${connectedWebsite.fullDomainUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(ov.linkCopiedToast, 'success');
    } catch {
      showToast(url, 'info');
    }
  };

  const quickActions = [
    {
      title: ov.actionEditSite,
      desc: ov.actionEditSiteDesc,
      icon: Paintbrush,
      to: connectedWebsite ? '/dashboard/subscribed-website' : '/create-website',
      color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
    },
    {
      title: ov.actionAddProduct,
      desc: ov.actionAddProductDesc,
      icon: Plus,
      to: '/dashboard/products?action=add',
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
    },
    {
      title: ov.actionViewOrders,
      desc: ov.actionViewOrdersDesc,
      icon: ShoppingCart,
      to: '/dashboard/orders',
      color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60',
    },
    {
      title: ov.actionViewSite,
      desc: ov.actionViewSiteDesc,
      icon: Eye,
      to: connectedWebsite ? `/s/${connectedWebsite.subdomain}` : '/create-website',
      external: Boolean(connectedWebsite),
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Welcome & Primary CTA Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {ov.welcomeHeading(greetingName)}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {ov.welcomeSubheading}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs font-medium">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dateRange === range
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {range === '7d' ? '7D' : range === '30d' ? '30D' : '90D'}
              </button>
            ))}
          </div>

          <Link
            to="/dashboard/products?action=add"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{ov.actionAddProduct}</span>
          </Link>
        </div>
      </div>

      {/* 2. Website Overview Card + Interactive Getting Started Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Website Card (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden flex flex-col justify-between">
          {connectedWebsite ? (
            <>
              <div>
                {/* Subtle Brand Accent Header Preview Strip */}
                <div
                  className="h-2.5 w-full"
                  style={{ backgroundColor: connectedWebsite.brandColor || '#2563EB' }}
                />
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                        {connectedWebsite.logoUrl ? (
                          <img
                            src={connectedWebsite.logoUrl}
                            alt={connectedWebsite.businessName}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                            {connectedWebsite.businessName}
                          </h2>
                          <StatusBadge
                            tone={
                              isWebsiteLive
                                ? 'live'
                                : connectedWebsite.subscriptionStatus === 'suspended'
                                ? 'suspended'
                                : 'draft'
                            }
                            label={
                              isWebsiteLive
                                ? t.workspace.nav.websiteStatusLive
                                : connectedWebsite.subscriptionStatus === 'suspended'
                                ? 'Suspended'
                                : t.workspace.nav.websiteStatusDraft
                            }
                          />
                        </div>
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                          https://{connectedWebsite.fullDomainUrl}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Template</span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate block mt-0.5">
                        {connectedWebsite.templateName || 'Modern'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Products</span>
                      <span className="font-semibold text-slate-900 dark:text-white tabular-nums block mt-0.5">
                        {(connectedWebsite.servicesOrProducts || []).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Updated</span>
                      <span className="font-semibold text-slate-900 dark:text-white tabular-nums block mt-0.5">
                        {connectedWebsite.createdAt?.slice(0, 10) || 'Today'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 flex flex-wrap items-center gap-2.5">
                <Link
                  to="/dashboard/subscribed-website"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors"
                >
                  <Paintbrush className="w-3.5 h-3.5" />
                  <span>{ov.editWebsiteBtn}</span>
                </Link>
                <a
                  href={`/s/${connectedWebsite.subdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors"
                >
                  <span>{isWebsiteLive ? ov.openLiveSiteBtn : ov.previewSiteBtn}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyWebsiteLink()}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{ov.copyLinkBtn}</span>
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Globe}
              title={ov.websiteCardEmptyTitle}
              description={ov.websiteCardEmptyDesc}
              primaryAction={{
                label: ov.websiteCardCreateBtn,
                onClick: () => navigate('/create-website'),
                icon: Sparkles,
              }}
              className="border-0 h-full"
            />
          )}
        </div>

        {/* Interactive Getting Started Checklist (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {allChecklistDone ? ov.checklistDoneTitle : ov.checklistTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {allChecklistDone ? ov.checklistDoneSubtitle : ov.checklistSubtitle}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                {completedChecklistCount}/{checklistItems.length}
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((completedChecklistCount / checklistItems.length) * 100)}%`,
                }}
              />
            </div>

            {!allChecklistDone ? (
              <div className="space-y-2 pt-1">
                {checklistItems.map((item, idx) => (
                  <Link
                    key={idx}
                    to={item.path}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs transition-colors ${
                      item.done
                        ? 'border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`font-semibold truncate ${
                            item.done
                              ? 'text-slate-500 dark:text-slate-400 line-through'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                      </div>
                    </div>
                    {!item.done && (
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        {item.cta} →
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5 pt-1 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  1. {ov.nextActionShare}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  2. {ov.nextActionCatalog}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  3. {ov.nextActionOrders}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. 4 Quick Action Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {quickActions.map((qa) => {
          const Icon = qa.icon;
          const cardContent = (
            <div className="h-full p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-colors flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qa.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {qa.title}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {qa.desc}
                </p>
              </div>
            </div>
          );

          if (qa.external) {
            return (
              <a
                key={qa.title}
                href={qa.to}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-h-[44px]"
              >
                {cardContent}
              </a>
            );
          }

          return (
            <Link key={qa.title} to={qa.to} className="block min-h-[44px]">
              {cardContent}
            </Link>
          );
        })}
      </div>

      {/* 4. 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Total Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            ৳{totalSales.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {customers.length} customer(s)
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>{ov.kpiTotalOrders}</span>
            <ShoppingCart className="w-4 h-4 text-blue-500" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalOrders}
          </p>
          <Link
            to="/dashboard/orders"
            className="mt-1.5 inline-block text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {ov.actionViewOrders} →
          </Link>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>{ov.kpiPendingOrders}</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {pendingOrdersCount}
          </p>
          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            {pendingOrdersCount > 0 ? 'Needs review' : 'All caught up'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>{ov.kpiTotalProducts}</span>
            <Package className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {products.length}
          </p>
          <div className="mt-1.5 text-[11px]">
            {lowStockCount > 0 ? (
              <Link
                to="/dashboard/inventory"
                className="text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1 hover:underline"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>{lowStockCount} low stock</span>
              </Link>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {lang === 'bn' ? 'স্টক স্বাভাবিক' : 'Stock healthy'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5. Revenue Trend + Previous-Month vs. Current-Month Sales + Business Performance Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Previous-Month vs. Current-Month Sales
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {monthlyComparison.previousMonthLabel} vs. {monthlyComparison.currentMonthLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
              <span className="text-slate-500 dark:text-slate-400">
                Prev: <strong className="text-slate-900 dark:text-white">৳{monthlyComparison.previousTotal.toLocaleString()}</strong>
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                Curr: <strong>৳{monthlyComparison.currentTotal.toLocaleString()}</strong>
              </span>
            </div>
          </div>

          <div className="h-60 w-full">
            {!monthlyComparison.hasMonthlySales ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No monthly sales recorded yet
                </p>
                <p className="text-xs text-slate-500 max-w-xs mt-0.5">
                  Sales comparison bars appear automatically once orders are placed.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyComparison.series}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(val) => `৳${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                    formatter={(val: any, name: any) => [
                      `৳${Number(val).toLocaleString()}`,
                      name === 'previousMonth'
                        ? monthlyComparison.previousMonthLabel
                        : monthlyComparison.currentMonthLabel,
                    ]}
                  />
                  <Bar
                    dataKey="previousMonth"
                    name="previousMonth"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="currentMonth"
                    name="currentMonth"
                    fill="#2563EB"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Business Performance Insights */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Business Performance Insights
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live store activity benchmarks
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Month-over-Month Growth</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  Number(monthlyComparison.momDeltaPct) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {Number(monthlyComparison.momDeltaPct) > 0 ? '+' : ''}
                {monthlyComparison.momDeltaPct}%
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Average Order Value</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                ৳{performanceInsights.aov.toLocaleString()}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Fulfillment Completion</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {performanceInsights.deliveryRate}%
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Repeat Customer Share</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {performanceInsights.repeatRate}% ({performanceInsights.repeatBuyers})
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Healthy Catalog Stock</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {performanceInsights.healthyStockPct}%
              </span>
            </div>
          </div>

          <Link
            to="/dashboard/analytics"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Open Detailed Analytics</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Revenue Trend Graph */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Revenue Growth Trend
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gross revenue in BDT (৳)
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
            {dateRange.toUpperCase()}
          </span>
        </div>

        <div className="h-56 w-full">
          {!hasSalesData ? (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
              <TrendingUp className="w-7 h-7 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No revenue data yet
              </p>
              <p className="text-xs text-slate-500 max-w-xs mt-0.5">
                Revenue graphs populate automatically as orders come in.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(val) => `৳${val}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                  formatter={(val: any) => [`৳${Number(val).toLocaleString()}`, 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 6. Recent Orders & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Orders</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Latest customer orders</p>
            </div>
            <Link
              to="/dashboard/orders"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t.workspace.orders.emptyTitle}
              description={t.workspace.orders.emptyDesc}
              primaryAction={{
                label: t.workspace.orders.emptyCta,
                onClick: () => navigate('/dashboard/orders'),
                icon: Plus,
              }}
              className="border border-dashed py-8"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2.5">Order ID</th>
                    <th className="pb-2.5">Customer</th>
                    <th className="pb-2.5">Total</th>
                    <th className="pb-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOrders.map((ord) => {
                    const meta = extractOrderMetadataFromItems(ord.items);
                    const sub = ord.websiteSubdomain || meta.websiteSubdomain;
                    return (
                      <tr
                        key={ord.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 font-mono font-medium text-blue-600 dark:text-blue-400">
                          <Link to="/dashboard/orders" className="hover:underline">
                            {ord.orderNumber}
                          </Link>
                          <span className="block text-[10px] font-sans text-slate-400">
                            {sub ? `${sub}.amaas.xyz` : 'Dashboard'}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="font-medium text-slate-900 dark:text-white block truncate max-w-[140px]">
                            {ord.customerName}
                          </span>
                          <span className="text-[11px] text-slate-400">{ord.city}</span>
                        </td>
                        <td className="py-3 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          ৳{ord.total.toLocaleString()}
                        </td>
                        <td className="py-3">
                          <StatusBadge
                            tone={
                              ord.status === 'delivered'
                                ? 'delivered'
                                : ord.status === 'shipped'
                                ? 'shipped'
                                : ord.status === 'processing' || ord.status === 'confirmed'
                                ? 'processing'
                                : ord.status === 'cancelled'
                                ? 'cancelled'
                                : 'pending'
                            }
                            label={ord.status}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Products</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">By units sold</p>
            </div>
            <Link
              to="/dashboard/products"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Manage →
            </Link>
          </div>

          {topProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t.workspace.products.emptyTitle}
              description={t.workspace.products.emptyDesc}
              primaryAction={{
                label: t.workspace.products.emptyCta,
                onClick: () => navigate('/dashboard/products?action=add'),
                icon: Plus,
              }}
              className="border border-dashed py-8"
            />
          ) : (
            <div className="space-y-2.5">
              {topProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      Stock: {p.stock}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                      ৳{p.price.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-medium">
                      {p.salesCount} sold
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
