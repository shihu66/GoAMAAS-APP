import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  ArrowRight,
  Plus,
  Bot,
  Layers,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  ExternalLink,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const DashboardOverviewPage: React.FC = () => {
  const {
    activeStore,
    products,
    orders,
    customers,
  } = useApp();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Computed metrics strictly calculated from actual database/context records
  const totalSales = useMemo(
    () => orders.reduce((acc, o) => (o.status !== 'cancelled' ? acc + o.total : acc), 0),
    [orders]
  );
  const totalOrders = orders.length;
  const totalCustomers = customers.length;
  const lowStockCount = products.filter((p) => p.stock <= p.lowStockThreshold).length;

  // Real chart data computed from authenticated user's actual orders
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

  // Order status breakdown for pie chart (only includes existing counts)
  const statusCounts = useMemo(() => {
    return orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});
  }, [orders]);

  const statusPieData = useMemo(() => {
    return [
      { name: 'Delivered', value: statusCounts['delivered'] || 0, color: '#10B981' },
      { name: 'Shipped', value: statusCounts['shipped'] || 0, color: '#3B82F6' },
      { name: 'Processing', value: statusCounts['processing'] || 0, color: '#F59E0B' },
      { name: 'Confirmed', value: statusCounts['confirmed'] || 0, color: '#8B5CF6' },
      { name: 'Pending', value: statusCounts['pending'] || 0, color: '#64748B' },
    ].filter((s) => s.value > 0);
  }, [statusCounts]);

  // Recent orders
  const recentOrders = useMemo(() => [...orders].slice(0, 5), [orders]);

  // Top products by sales
  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 4);
  }, [products]);

  // Previous-Month vs. Current-Month Sales Comparison (authentic non-cancelled orders only)
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();
    const prevDate = new Date(currYear, currMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();

    const currentMonthLabel = now.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const previousMonthLabel = prevDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

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

  // Business Performance Insights derived strictly from real store records
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
      validOrderCount: validOrders.length,
    };
  }, [orders, totalSales, customers, products.length, lowStockCount]);

  const hasSalesData = orders.length > 0 && totalSales > 0;

  return (
    <div className="space-y-8">
      {/* Welcome & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Store Overview — {activeStore?.name || 'Workspace'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time performance summary and active fulfillment pipeline.
          </p>
        </div>

        {/* Date Filter & Quick Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium">
            <button
              onClick={() => setDateRange('7d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateRange === '7d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateRange === '30d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange('90d')}
              className={`px-3 py-1 rounded-md transition-colors ${
                dateRange === '90d'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              90 Days
            </button>
          </div>

          <Link
            to="/dashboard/products"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      {/* Core Merchant Dashboard — 100% Free Forever Workspace Notice */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white block">
              Core Merchant Dashboard — 100% Free Forever (৳0/month)
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Products, inventory, orders, customers, sales graphs, landing pages, website sync, and courier/payment settings are permanently unlocked. External courier, gateway, domain, and optional Website/AI service fees apply separately.
            </span>
          </div>
        </div>
        <Link
          to="/dashboard/settings"
          className="self-start sm:self-auto px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 whitespace-nowrap"
        >
          <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Courier &amp; Payment Settings</span>
        </Link>
      </div>

      {/* Key Metric Cards (Real values only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Gross Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            ৳{totalSales.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{totalOrders} order{totalOrders !== 1 ? 's' : ''} total</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Orders</span>
            <ShoppingCart className="w-4 h-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalOrders}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            <span>{orders.filter((o) => o.status === 'delivered').length} delivered parcels</span>
          </div>
        </div>

        {/* Total Customers */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Customers Directory</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalCustomers}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>{customers.filter((c) => c.status === 'vip').length} VIP buyers</span>
          </div>
        </div>

        {/* Products in Stock / Low Stock Alert */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Products Catalog</span>
            <Package className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {products.length}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {lowStockCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {lowStockCount} items low in stock
              </span>
            ) : (
              <span className="text-emerald-600 font-medium">All stock levels healthy</span>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section: Revenue Area Chart + Order Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends (2 Cols) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Revenue Growth Trend
              </h3>
              <p className="text-[11px] text-slate-500">
                Gross sales figures in BDT (৳) for selected period
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
              {dateRange.toUpperCase()} View
            </span>
          </div>

          <div className="h-64 w-full">
            {!hasSalesData ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No revenue data yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                  Revenue graphs will populate automatically as you record customer sales.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(val) => `৳${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
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

        {/* Order Status Breakdown */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Order Status Breakdown
            </h3>
            <p className="text-[11px] text-slate-500">Distribution across fulfillment stages</p>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            {statusPieData.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <ShoppingCart className="w-7 h-7 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No active orders</p>
                <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                  Order status distribution will display here once orders are created.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {statusPieData.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
              {statusPieData.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-600 dark:text-slate-400">{s.name}:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Previous-Month vs. Current-Month Sales Graph + Business Performance Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Previous-Month vs. Current-Month Sales
              </h3>
              <p className="text-[11px] text-slate-500">
                Calendar comparison: {monthlyComparison.previousMonthLabel} vs. {monthlyComparison.currentMonthLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
              <span className="text-slate-500">
                Prev: <strong className="text-slate-900 dark:text-white">৳{monthlyComparison.previousTotal.toLocaleString()}</strong> ({monthlyComparison.previousOrderCount})
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                Curr: <strong>৳{monthlyComparison.currentTotal.toLocaleString()}</strong> ({monthlyComparison.currentOrderCount})
              </span>
            </div>
          </div>

          <div className="h-60 w-full">
            {!monthlyComparison.hasMonthlySales ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No current or previous month sales recorded yet
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                  Weekly previous-month and current-month sales bars appear automatically once orders are placed.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparison.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(val) => `৳${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                    formatter={(val: any, name: any) => [
                      `৳${Number(val).toLocaleString()}`,
                      name === 'previousMonth' ? monthlyComparison.previousMonthLabel : monthlyComparison.currentMonthLabel,
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
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Business Performance Insights
            </h3>
            <p className="text-[11px] text-slate-500">
              Live operational benchmarks from your store activity
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

      {/* Lower Grids: Recent Orders & Best Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders (2 cols) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Orders</h3>
              <p className="text-[11px] text-slate-500">Latest customer transactions</p>
            </div>
            <Link
              to="/dashboard/orders"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>View All Orders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No orders yet</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Create a manual order or connect your storefront to start receiving purchases.
              </p>
              <Link
                to="/dashboard/orders"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Order</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2">Order ID</th>
                    <th className="pb-2">Customer</th>
                    <th className="pb-2">Total</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 font-mono font-medium text-blue-600 dark:text-blue-400">
                        <Link to="/dashboard/orders">{ord.orderNumber}</Link>
                      </td>
                      <td className="py-2.5">
                        <span className="font-medium text-slate-900 dark:text-white block truncate max-w-[120px]">
                          {ord.customerName}
                        </span>
                        <span className="text-[10px] text-slate-400">{ord.city}</span>
                      </td>
                      <td className="py-2.5 font-mono font-bold tabular-nums">
                        ৳{ord.total.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            ord.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : ord.status === 'shipped'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400'
                              : ord.status === 'processing'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                              : ord.status === 'confirmed'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`text-[11px] font-medium ${
                            ord.paymentStatus === 'paid'
                              ? 'text-emerald-600'
                              : ord.paymentStatus === 'pending'
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {ord.paymentStatus.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Best-Selling Products */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Products</h3>
              <p className="text-[11px] text-slate-500">By total sales quantity</p>
            </div>
            <Link to="/dashboard/products" className="text-xs text-blue-600 hover:underline">
              Inventory →
            </Link>
          </div>

          {topProducts.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No products yet</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Add items to your catalog to track inventory and best sellers.
              </p>
              <Link
                to="/dashboard/products"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      SKU: {p.sku} · Stock: {p.stock}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                      ৳{p.price.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-600 block font-medium">
                      {p.salesCount} sold
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Launchpad Strip */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Quick Workflows
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button
            onClick={() => navigate('/dashboard/products')}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-2.5 transition-colors group cursor-pointer"
          >
            <Package className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <strong className="block font-semibold text-slate-900 dark:text-white group-hover:text-blue-600">
                Products
              </strong>
              <span className="text-[10px] text-slate-400">Add or adjust stock</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/dashboard/orders')}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-2.5 transition-colors group cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <strong className="block font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600">
                Process Orders
              </strong>
              <span className="text-[10px] text-slate-400">Couriers & Invoices</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/dashboard/landing-pages')}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-2.5 transition-colors group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-600 shrink-0" />
            <div>
              <strong className="block font-semibold text-slate-900 dark:text-white group-hover:text-purple-600">
                Landing Pages
              </strong>
              <span className="text-[10px] text-slate-400">Launch campaign</span>
            </div>
          </button>

          <button
            onClick={() => navigate('/dashboard/automations')}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-2.5 transition-colors group cursor-pointer"
          >
            <Bot className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <strong className="block font-semibold text-slate-900 dark:text-white group-hover:text-amber-600">
                AI Automations
              </strong>
              <span className="text-[10px] text-slate-400">Bots & Abandoned cart</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
