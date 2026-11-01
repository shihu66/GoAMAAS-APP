import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  DollarSign,
  Users,
  ShoppingCart,
  Percent,
  ArrowUpRight,
  Package,
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
  Legend,
} from 'recharts';

import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';
import { TrialGateBanner } from '../../components/ui/TrialGateBanner';

export const AnalyticsPage: React.FC = () => {
  const { orders, products, customers, showToast, getServiceAccess } = useApp();
  const serviceAccess = getServiceAccess('dashboard_business', 'Dashboard Business Tier', 'dashboard');
  const [dateFilter, setDateFilter] = useState<'7d' | '30d' | '90d' | '12m'>('30d');

  const productLookup = useMemo(() => {
    const byId = new Map<string, number>();
    const bySku = new Map<string, number>();
    products.forEach((p) => {
      if (p.costPrice > 0) {
        byId.set(p.id, p.costPrice);
        if (p.sku) bySku.set(p.sku.toLowerCase(), p.costPrice);
      }
    });
    return { byId, bySku };
  }, [products]);

  const computeOrderNetProfit = useMemo(() => {
    return (o: (typeof orders)[number]): number => {
      if (!o.items || o.items.length === 0) {
        return Math.round(o.total * 0.35);
      }
      let itemMarginSum = 0;
      for (const item of o.items) {
        const unitCost =
          productLookup.byId.get(item.productId) ??
          (item.sku ? productLookup.bySku.get(item.sku.toLowerCase()) : undefined) ??
          Math.round(item.price * 0.65);
        itemMarginSum += (item.price - unitCost) * item.quantity;
      }
      return Math.max(0, Math.round(itemMarginSum - (o.discount || 0)));
    };
  }, [productLookup]);

  // Real Multi-period sales trend data computed strictly from orders & item COGS
  const revenueData = useMemo(() => {
    const now = new Date();
    const buckets: { period: string; revenue: number; netProfit: number; orders: number }[] = [];

    if (dateFilter === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });

        const dayOrders = orders.filter(
          (o) => o.createdAt.startsWith(dateStr) && o.status !== 'cancelled'
        );
        const rev = dayOrders.reduce((sum, o) => sum + o.total, 0);
        const profit = dayOrders.reduce((sum, o) => sum + computeOrderNetProfit(o), 0);
        buckets.push({ period: dayLabel, revenue: rev, netProfit: profit, orders: dayOrders.length });
      }
    } else if (dateFilter === '30d') {
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
        const profit = weekOrders.reduce((sum, o) => sum + computeOrderNetProfit(o), 0);
        buckets.push({ period: weekLabel, revenue: rev, netProfit: profit, orders: weekOrders.length });
      }
    } else if (dateFilter === '90d') {
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
        const profit = monthOrders.reduce((sum, o) => sum + computeOrderNetProfit(o), 0);
        buckets.push({ period: monthLabel, revenue: rev, netProfit: profit, orders: monthOrders.length });
      }
    } else {
      // 12 months - 4 quarters
      for (let q = 3; q >= 0; q--) {
        const qLabel = `Q${4 - q}`;
        const end = new Date(now);
        end.setMonth(end.getMonth() - q * 3);
        const start = new Date(end);
        start.setMonth(start.getMonth() - 3);

        const qOrders = orders.filter((o) => {
          const od = new Date(o.createdAt);
          return od >= start && od <= end && o.status !== 'cancelled';
        });
        const rev = qOrders.reduce((sum, o) => sum + o.total, 0);
        const profit = qOrders.reduce((sum, o) => sum + computeOrderNetProfit(o), 0);
        buckets.push({ period: qLabel, revenue: rev, netProfit: profit, orders: qOrders.length });
      }
    }

    return buckets;
  }, [orders, dateFilter, computeOrderNetProfit]);

  // Real acquisition channels from authentic orders
  const channelData = useMemo(() => {
    const counts: Record<string, { orders: number; revenue: number }> = {};

    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const src = o.source || 'Online Store';
      if (!counts[src]) {
        counts[src] = { orders: 0, revenue: 0 };
      }
      counts[src].orders += 1;
      counts[src].revenue += o.total;
    });

    return Object.entries(counts).map(([channel, data]) => ({
      channel,
      orders: data.orders,
      revenue: data.revenue,
    }));
  }, [orders]);

  // Real financial metrics
  const totalGrossSales = useMemo(
    () => orders.reduce((acc, o) => (o.status !== 'cancelled' ? acc + o.total : acc), 0),
    [orders]
  );
  const totalNetProfit = useMemo(
    () => orders.reduce((acc, o) => (o.status !== 'cancelled' ? acc + computeOrderNetProfit(o) : acc), 0),
    [orders, computeOrderNetProfit]
  );
  const realizedMarginPct = useMemo(
    () => (totalGrossSales > 0 ? ((totalNetProfit / totalGrossSales) * 100).toFixed(1) : '0.0'),
    [totalGrossSales, totalNetProfit]
  );
  const validOrderCount = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled').length,
    [orders]
  );
  const aov = validOrderCount > 0 ? Math.round(totalGrossSales / validOrderCount) : 0;
  const repeatCustomerRate =
    customers.length > 0
      ? ((customers.filter((c) => c.ordersCount > 1).length / customers.length) * 100).toFixed(1)
      : '0.0';

  const hasData = validOrderCount > 0;

  const handleExportReport = () => {
    if (!hasData) {
      showToast('No transaction records available to export.', 'info');
      return;
    }
    const csvContent =
      'data:text/csv;charset=utf-8,Period,Gross Revenue (BDT),Net Profit (BDT),Order Count\n' +
      revenueData.map((d) => `${d.period},${d.revenue},${d.netProfit},${d.orders}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GoAMAAS_Analytics_Report_${dateFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Analytics summary report downloaded', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Title & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Financial Analytics & Growth Reports
            </h1>
            <TrialStatusBadge
              serviceId="dashboard_business"
              serviceName="Dashboard Business Tier"
              category="dashboard"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Examine gross revenue, SKU-level COGS net margins, order acquisition velocity, and retention.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium">
            <button
              onClick={() => setDateFilter('7d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateFilter === '7d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7D
            </button>
            <button
              onClick={() => setDateFilter('30d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateFilter === '30d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              30D
            </button>
            <button
              onClick={() => setDateFilter('90d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateFilter === '90d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              90D
            </button>
            <button
              onClick={() => setDateFilter('12m')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateFilter === '12m'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              12M
            </button>
          </div>

          <button
            onClick={handleExportReport}
            disabled={!hasData || !serviceAccess.hasAccess}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {!serviceAccess.hasAccess ? (
        <TrialGateBanner
          serviceId="dashboard_business"
          serviceName="Dashboard Business Tier"
          category="dashboard"
          serviceDescription="Unlock revenue & COGS profit trajectory charts, acquisition channel breakdowns, and CSV financial report exports with a 7-day free Dashboard trial."
          features={[
            'Gross Sales & SKU-Level COGS Net Profit Tracking',
            '7D, 30D, 90D & 12M Interactive Trend Charts',
            'Acquisition Channel Revenue Breakdown',
            'Repeat Buyer Retention & AOV Benchmarks',
            '1-Click Accounting CSV Export',
            'Multi-Store Workspace Filtering',
          ]}
          subscribePath="/dashboard/billing"
          subscribePriceLabel="From ৳299/mo"
        />
      ) : (
        <>
          {/* 4 Financial Metric Cards (Real values) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Gross Sales</span>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                ৳{totalGrossSales.toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                {validOrderCount} transaction{validOrderCount !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Estimated Net Profit</span>
              <p className="mt-2 text-2xl font-bold text-emerald-600 font-mono tabular-nums">
                ৳{totalNetProfit.toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {hasData ? `${realizedMarginPct}% net margin (COGS-adjusted)` : '0% margin'}
              </span>
            </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Average Order Value (AOV)</span>
          <p className="mt-2 text-2xl font-bold text-blue-600 font-mono tabular-nums">
            ৳{aov.toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {hasData ? 'Per validated checkout' : 'No checkouts yet'}
          </span>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Repeat Customer Rate</span>
          <p className="mt-2 text-2xl font-bold text-purple-600 font-mono tabular-nums">
            {repeatCustomerRate}%
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {customers.length} total customer record{customers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Revenue & Profit Area Chart */}
      <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Revenue & Net Profit Trajectory
            </h3>
            <p className="text-[11px] text-slate-500">
              Comparative breakdown for {dateFilter.toUpperCase()} window
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Gross Revenue
            </span>
            <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Est. Profit
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          {!hasData ? (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
              <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No sales transactions yet</p>
              <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                Financial performance and profit trajectory curves will render automatically as orders are fulfilled.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="areaProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(val) => `৳${val}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                  formatter={(val: any) => [`৳${Number(val).toLocaleString()}`]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#areaRev)"
                  name="Gross Revenue"
                />
                <Area
                  type="monotone"
                  dataKey="netProfit"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#areaProf)"
                  name="Net Profit"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Channel Breakdown & Order Velocity Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Acquisition Channel */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Revenue by Sales Channel
            </h3>
            <p className="text-[11px] text-slate-500">
              Contribution from Storefront, WhatsApp, Messenger, and Landing Pages
            </p>
          </div>

          {channelData.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No channel data recorded</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Orders will be categorized by acquisition channel once transactions occur.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {channelData.map((ch) => {
                const pct = totalGrossSales > 0 ? Math.round((ch.revenue / totalGrossSales) * 100) : 0;
                return (
                  <div key={ch.channel} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ch.channel}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">
                          {ch.orders} orders
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                          ৳{ch.revenue.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order Volume per Period */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Order Fulfillment Volume
            </h3>
            <p className="text-[11px] text-slate-500">
              Total transaction volume across selected intervals
            </p>
          </div>

          <div className="h-56 w-full">
            {!hasData ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <BarChart3 className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No order volume to display</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748B" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="orders" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
