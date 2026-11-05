import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Order, OrderStatus, PaymentStatus } from '../../types';
import {
  extractOrderMetadataFromItems,
  getEffectiveProductUnitPrice,
} from '../../lib/storefrontSync';
import {
  ShoppingCart,
  Search,
  Download,
  Printer,
  Eye,
  Truck,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertCircle,
  Globe,
  Loader2,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  inside_dhaka: 'Inside Dhaka Courier',
  outside_dhaka: 'Outside Dhaka Nationwide',
  store_pickup: 'Store Pickup',
};

export const OrdersPage: React.FC = () => {
  const {
    orders,
    isOrdersLoading,
    ordersLoadError,
    refreshStoreOrders,
    updateOrderStatus,
    updateOrderPaymentStatus,
    updateOrderTracking,
    addOrder,
    products,
    showToast,
  } = useApp();
  const { lang } = useLanguage();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [selectedSource, setSelectedSource] = useState<'all' | 'website' | 'manual'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const itemsPerPage = 8;

  // Modals
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Derive selectedOrder live from `orders` so status/payment edits update modal immediately
  const selectedOrder = useMemo<Order | null>(
    () => (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) || null : null),
    [orders, selectedOrderId]
  );

  // Tracking update state
  const [trackingCourier, setTrackingCourier] = useState('Steadfast Courier');
  const [trackingCode, setTrackingCode] = useState('');

  // Available products with stock > 0 for manual order creation
  const orderableProducts = useMemo(
    () => products.filter((p) => p.status === 'active' && p.stock > 0),
    [products]
  );

  // New manual order form state
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderEmail, setNewOrderEmail] = useState('');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderArea, setNewOrderArea] = useState('');
  const [newOrderCity, setNewOrderCity] = useState('Dhaka');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderProduct, setNewOrderProduct] = useState('');
  const [newOrderQty, setNewOrderQty] = useState(1);
  const [newOrderPayment, setNewOrderPayment] = useState<
    'Cash on Delivery (COD)' | 'bKash' | 'Nagad' | 'Bank Transfer'
  >('Cash on Delivery (COD)');

  const selectedManualProduct = useMemo(
    () =>
      orderableProducts.find((p) => p.id === newOrderProduct) || orderableProducts[0] || null,
    [orderableProducts, newOrderProduct]
  );

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshStoreOrders();
      showToast('Orders synchronized with server.', 'info');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const q = search.trim().toLowerCase();

    return orders.filter((o) => {
      const meta = extractOrderMetadataFromItems(o.items);
      const isWebsiteOrder =
        meta.orderSource === 'public_website' || Boolean(o.websiteSubdomain || meta.websiteSubdomain);

      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        (o.deliveryArea || meta.deliveryArea || '').toLowerCase().includes(q);

      const matchesStatus = selectedStatus === 'all' || o.status === selectedStatus;
      const matchesPayment =
        selectedPaymentStatus === 'all' || o.paymentStatus === selectedPaymentStatus;
      const matchesSource =
        selectedSource === 'all' ||
        (selectedSource === 'website' && isWebsiteOrder) ||
        (selectedSource === 'manual' && !isWebsiteOrder);

      let matchesDate = true;
      if (selectedDateRange !== 'all') {
        const createdMs = new Date(o.createdAt).getTime();
        if (Number.isFinite(createdMs)) {
          if (selectedDateRange === 'today') {
            matchesDate = createdMs >= startOfToday.getTime();
          } else if (selectedDateRange === '7d') {
            matchesDate = now - createdMs <= 7 * 24 * 60 * 60 * 1000;
          } else if (selectedDateRange === '30d') {
            matchesDate = now - createdMs <= 30 * 24 * 60 * 60 * 1000;
          }
        }
      }

      return matchesSearch && matchesStatus && matchesPayment && matchesSource && matchesDate;
    });
  }, [orders, search, selectedStatus, selectedPaymentStatus, selectedSource, selectedDateRange]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Status counts for overview tabs
  const counts = useMemo(() => {
    return {
      all: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      confirmed: orders.filter((o) => o.status === 'confirmed').length,
      processing: orders.filter((o) => o.status === 'processing').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    };
  }, [orders]);

  // Export CSV function
  const handleExportCSV = () => {
    const headers = [
      'Order Number',
      'Date',
      'Source',
      'Customer Name',
      'Phone',
      'City',
      'Area',
      'Status',
      'Payment Method',
      'Payment Status',
      'Total (BDT)',
    ];
    const rows = filteredOrders.map((o) => {
      const meta = extractOrderMetadataFromItems(o.items);
      const sourceLabel =
        o.websiteSubdomain || meta.websiteSubdomain
          ? `${o.websiteSubdomain || meta.websiteSubdomain}.amaas.xyz`
          : 'Dashboard';
      return [
        o.orderNumber,
        o.createdAt.split('T')[0],
        `"${sourceLabel}"`,
        `"${o.customerName.replace(/"/g, '""')}"`,
        `"${o.customerPhone}"`,
        `"${o.city}"`,
        `"${o.deliveryArea || meta.deliveryArea || ''}"`,
        o.status.toUpperCase(),
        `"${o.paymentMethod}"`,
        o.paymentStatus.toUpperCase(),
        o.total,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GoAMAAS_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Orders exported to CSV file successfully.', 'success');
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = selectedManualProduct;
    if (!prod) {
      showToast('No in-stock active product selected.', 'error');
      return;
    }
    if (newOrderQty < 1 || newOrderQty > prod.stock) {
      showToast(
        `Insufficient stock for "${prod.name}". Maximum available: ${prod.stock}.`,
        'error'
      );
      return;
    }

    const { unitPrice, hasDiscount, originalPrice } = getEffectiveProductUnitPrice(prod);
    const itemSubtotal = unitPrice * newOrderQty;
    const deliveryFee = newOrderCity.trim().toLowerCase() === 'dhaka' ? 70 : 130;
    const grandTotal = itemSubtotal + deliveryFee;

    addOrder({
      customerName: newOrderCustomer.trim(),
      customerEmail: newOrderEmail.trim(),
      customerPhone: newOrderPhone.trim(),
      items: [
        {
          productId: prod.id,
          name: prod.name,
          price: unitPrice,
          originalPrice: hasDiscount ? originalPrice : undefined,
          quantity: newOrderQty,
          sku: prod.sku,
          imageUrl: prod.image,
          category: prod.category,
          orderMeta: {
            orderSource: 'manual_dashboard',
            deliveryArea: newOrderArea.trim() || undefined,
            deliveryMethod:
              newOrderCity.trim().toLowerCase() === 'dhaka' ? 'inside_dhaka' : 'outside_dhaka',
          },
        },
      ],
      subtotal: itemSubtotal,
      total: grandTotal,
      deliveryFee,
      discount: hasDiscount && originalPrice ? (originalPrice - unitPrice) * newOrderQty : 0,
      status: 'confirmed',
      paymentStatus: newOrderPayment === 'Cash on Delivery (COD)' ? 'pending' : 'paid',
      paymentMethod: newOrderPayment,
      shippingAddress: newOrderAddress.trim(),
      city: newOrderCity.trim(),
      deliveryArea: newOrderArea.trim() || undefined,
      notes: newOrderNotes.trim() || undefined,
    });

    setIsCreateModalOpen(false);
    setNewOrderCustomer('');
    setNewOrderPhone('');
    setNewOrderEmail('');
    setNewOrderAddress('');
    setNewOrderArea('');
    setNewOrderNotes('');
    setNewOrderQty(1);
  };

  const handleUpdateTracking = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrder) {
      updateOrderTracking(
        selectedOrder.id,
        trackingCourier,
        trackingCode || `TRK-${Math.floor(100000 + Math.random() * 900000)}`
      );
    }
    setIsTrackingModalOpen(false);
  };

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {lang === 'bn'
              ? 'অর্ডার ব্যবস্থাপনা ও ডেলিভারি'
              : 'Orders & Customer Fulfillment'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'bn'
              ? 'আপনার পাবলিক ওয়েবসাইট এবং ড্যাশবোর্ড থেকে আসা সকল অর্ডার পরিচালনা করুন।'
              : 'Receive live customer orders from your public website, manage fulfillment status, and print invoices.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing || isOrdersLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Refresh orders from server"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing || isOrdersLoading ? 'animate-spin' : ''}`}
            />
            <span>{lang === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              if (orderableProducts[0] && !newOrderProduct) {
                setNewOrderProduct(orderableProducts[0].id);
              }
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'ম্যানুয়াল অর্ডার' : 'Create Manual Order'}</span>
          </button>
        </div>
      </div>

      {/* Error State Banner */}
      {ordersLoadError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Unable to load latest orders: {ordersLoadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold whitespace-nowrap cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status Segmented Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {[
          { key: 'all', label: 'All Orders', count: counts.all },
          { key: 'pending', label: 'Pending', count: counts.pending },
          { key: 'confirmed', label: 'Confirmed', count: counts.confirmed },
          { key: 'processing', label: 'Processing', count: counts.processing },
          { key: 'shipped', label: 'Shipped', count: counts.shipped },
          { key: 'delivered', label: 'Delivered', count: counts.delivered },
          { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setSelectedStatus(tab.key);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer ${
              selectedStatus === tab.key
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            <span className="font-mono text-[10px] tabular-nums opacity-80">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        <div className="relative w-full lg:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search Order ID, phone, customer, or city..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Date:</span>
            <select
              value={selectedDateRange}
              onChange={(e) => {
                setSelectedDateRange(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Channel:</span>
            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">All Channels</option>
              <option value="website">Public Website</option>
              <option value="manual">Manual / Dashboard</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Payment:</span>
            <select
              value={selectedPaymentStatus}
              onChange={(e) => {
                setSelectedPaymentStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed / Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table / Loading / Empty */}
      {isOrdersLoading && orders.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Loading store orders from server...</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No orders yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Customer orders placed on your published GoAMAAS Website appear here automatically, or you can record phone/DM orders manually.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Manual Order</span>
            </button>
          </div>
        </div>
      ) : paginatedOrders.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No orders matching filter
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try resetting your status tab, date range, or search query.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Order ID &amp; Source</th>
                  <th className="py-3 px-4">Customer &amp; Destination</th>
                  <th className="py-3 px-4">Ordered Items</th>
                  <th className="py-3 px-4 text-right">Total (৳)</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Fulfillment Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedOrders.map((o) => {
                  const meta = extractOrderMetadataFromItems(o.items);
                  const siteSubdomain = o.websiteSubdomain || meta.websiteSubdomain;
                  const isWebsiteOrder =
                    meta.orderSource === 'public_website' || Boolean(siteSubdomain);
                  const areaLabel = o.deliveryArea || meta.deliveryArea;

                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Order ID & Date */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrderId(o.id);
                            setIsDetailModalOpen(true);
                          }}
                          className="font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline block cursor-pointer text-left"
                        >
                          {o.orderNumber}
                        </button>
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums block">
                          {new Date(o.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mt-0.5">
                          {isWebsiteOrder && <Globe className="w-3 h-3 text-emerald-600 shrink-0" />}
                          <span>
                            {siteSubdomain ? `${siteSubdomain}.amaas.xyz` : isWebsiteOrder ? 'Website' : 'Dashboard'}
                          </span>
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          {o.customerName}
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums block">
                          {o.customerPhone}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                          {areaLabel ? `${areaLabel}, ${o.city}` : o.city}
                        </span>
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {o.items[0]?.name || 'Order Item'}
                          {o.items.length > 1 && (
                            <span className="text-slate-400 font-normal ml-1">
                              +{o.items.length - 1} more
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                          {o.items.reduce((acc, i) => acc + i.quantity, 0)} unit(s)
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        ৳{o.total.toLocaleString()}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          Shipping ৳{o.deliveryFee}
                        </span>
                      </td>

                      {/* Payment */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[11px] font-semibold uppercase block ${
                            o.paymentStatus === 'paid'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : o.paymentStatus === 'pending'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {o.paymentStatus}
                        </span>
                        <span className="block text-[10px] text-slate-400 truncate max-w-[120px]">
                          {o.paymentMethod}
                        </span>
                      </td>

                      {/* Status & Courier */}
                      <td className="py-3.5 px-4">
                        <select
                          value={o.status}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value as OrderStatus)}
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold uppercase border focus:outline-hidden cursor-pointer ${
                            o.status === 'delivered'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              : o.status === 'shipped'
                              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                              : o.status === 'processing'
                              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                              : o.status === 'confirmed'
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                              : o.status === 'cancelled'
                              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        {o.courierName && (
                          <span className="block text-[10px] text-blue-600 dark:text-blue-400 mt-1 font-mono">
                            {o.courierName}: {o.trackingCode}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                            title="View Full Order Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setTrackingCourier(o.courierName || 'Steadfast Courier');
                              setTrackingCode(o.trackingCode || '');
                              setIsTrackingModalOpen(true);
                            }}
                            className="p-1.5 text-blue-500 hover:text-blue-700 cursor-pointer"
                            title="Assign Courier / Tracking"
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setIsInvoiceModalOpen(true);
                            }}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            title="Print Customer Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
          <div className="font-mono tabular-nums">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of{' '}
            {filteredOrders.length} orders
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 1. Order Detail Modal — Complete Customer, Delivery, Payment & Snapshot View */}
      {selectedOrder && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Order Details — ${selectedOrder.orderNumber}`}
          description={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString()}`}
          maxWidth="lg"
        >
          {(() => {
            const meta = extractOrderMetadataFromItems(selectedOrder.items);
            const deliveryArea = selectedOrder.deliveryArea || meta.deliveryArea;
            const deliveryMethodCode = selectedOrder.deliveryMethod || meta.deliveryMethod;
            const deliveryMethodLabel = deliveryMethodCode
              ? DELIVERY_METHOD_LABELS[deliveryMethodCode] || deliveryMethodCode
              : 'Standard Delivery';
            const deliveryInstructions =
              selectedOrder.deliveryInstructions || meta.deliveryInstructions;
            const siteSub = selectedOrder.websiteSubdomain || meta.websiteSubdomain;
            const computedSubtotal =
              selectedOrder.subtotal ??
              selectedOrder.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

            return (
              <div className="space-y-5 text-xs">
                {/* Status & Payment Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Order Fulfillment Status
                    </label>
                    <select
                      value={selectedOrder.status}
                      onChange={(e) =>
                        updateOrderStatus(selectedOrder.id, e.target.value as OrderStatus)
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold uppercase"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled (Restores Stock)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Payment Status ({selectedOrder.paymentMethod})
                    </label>
                    <select
                      value={selectedOrder.paymentStatus}
                      onChange={(e) =>
                        updateOrderPaymentStatus(
                          selectedOrder.id,
                          e.target.value as PaymentStatus
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold uppercase"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </div>

                {/* Customer & Shipping Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                      Customer Information
                    </h4>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {selectedOrder.customerName}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                      Mobile: {selectedOrder.customerPhone}
                    </p>
                    {selectedOrder.customerEmail && (
                      <p className="text-slate-500">Email: {selectedOrder.customerEmail}</p>
                    )}
                    <p className="text-slate-500 pt-1">
                      Channel:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {siteSub ? `Public Website (${siteSub}.amaas.xyz)` : 'Dashboard / Manual'}
                      </strong>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                      Delivery &amp; Logistics
                    </h4>
                    <p className="text-slate-800 dark:text-slate-200">
                      {selectedOrder.shippingAddress}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">
                      {deliveryArea ? `${deliveryArea}, ` : ''}
                      {selectedOrder.city}
                    </p>
                    <p className="text-slate-500">
                      Delivery Method:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {deliveryMethodLabel}
                      </strong>
                    </p>
                    {selectedOrder.courierName && (
                      <p className="text-blue-600 dark:text-blue-400 font-mono">
                        Courier: {selectedOrder.courierName} ({selectedOrder.trackingCode})
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Notes & Delivery Instructions */}
                {(deliveryInstructions || selectedOrder.notes) && (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    {deliveryInstructions && (
                      <p className="text-slate-700 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">
                          Delivery Instructions:{' '}
                        </strong>
                        {deliveryInstructions}
                      </p>
                    )}
                    {selectedOrder.notes && (
                      <p className="text-slate-700 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">Order Notes: </strong>
                        {selectedOrder.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Immutable Line Items Snapshot Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-slate-900 dark:text-white">
                      Ordered Products Snapshot
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Prices locked at time of purchase
                    </span>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                        <tr>
                          <th className="p-2.5">Product</th>
                          <th className="p-2.5">SKU</th>
                          <th className="p-2.5 text-right">Unit Price</th>
                          <th className="p-2.5 text-right">Qty</th>
                          <th className="p-2.5 text-right">Line Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedOrder.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-medium text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    referrerPolicy="no-referrer"
                                    className="w-7 h-7 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                  />
                                )}
                                <span>{item.name}</span>
                              </div>
                            </td>
                            <td className="p-2.5 font-mono text-slate-400">{item.sku || '—'}</td>
                            <td className="p-2.5 text-right font-mono tabular-nums">
                              ৳{item.price.toLocaleString()}
                              {item.originalPrice && item.originalPrice > item.price && (
                                <span className="block text-[10px] text-slate-400 line-through">
                                  ৳{item.originalPrice.toLocaleString()}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                              ৳{(item.price * item.quantity).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-1.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Items Subtotal:</span>
                      <span className="font-mono tabular-nums">
                        ৳{computedSubtotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Delivery Charge:</span>
                      <span className="font-mono tabular-nums">
                        ৳{selectedOrder.deliveryFee.toLocaleString()}
                      </span>
                    </div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Product Savings:</span>
                        <span className="font-mono tabular-nums">
                          -৳{selectedOrder.discount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700">
                      <span>Grand Total:</span>
                      <span className="font-mono text-sm tabular-nums text-blue-600 dark:text-blue-400">
                        ৳{selectedOrder.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      setIsInvoiceModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Invoice</span>
                  </button>

                  <button
                    onClick={() => setIsDetailModalOpen(false)}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 2. Print-Friendly Invoice Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          title={`Customer Invoice — ${selectedOrder.orderNumber}`}
          maxWidth="2xl"
        >
          <div className="p-6 bg-white text-slate-900 space-y-6 print:p-0">
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">GoAMAAS Order Invoice</h2>
                <p className="text-xs text-slate-500">Customer Purchase Receipt</p>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  Order #{selectedOrder.orderNumber}
                </p>
              </div>
              <div className="text-right text-xs">
                <span className="font-mono font-bold text-sm block">AMAAS COMMERCE</span>
                <span className="text-slate-500">
                  Date: {new Date(selectedOrder.createdAt).toLocaleDateString()}
                </span>
                <span className="block text-emerald-600 font-semibold uppercase mt-1">
                  Payment: {selectedOrder.paymentStatus} ({selectedOrder.paymentMethod})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-600 uppercase text-[10px] block">
                  Deliver To:
                </span>
                <p className="font-bold">{selectedOrder.customerName}</p>
                <p>{selectedOrder.shippingAddress}</p>
                <p>
                  {selectedOrder.deliveryArea ? `${selectedOrder.deliveryArea}, ` : ''}
                  {selectedOrder.city}
                </p>
                <p className="font-mono">{selectedOrder.customerPhone}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-600 uppercase text-[10px] block">
                  Fulfillment:
                </span>
                <p className="font-semibold">
                  {selectedOrder.courierName || 'Standard Courier Delivery'}
                </p>
                {selectedOrder.trackingCode && (
                  <p className="font-mono text-blue-600">Tracking: {selectedOrder.trackingCode}</p>
                )}
              </div>
            </div>

            <table className="w-full text-left text-xs border">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-2.5">Item Description</th>
                  <th className="p-2.5 font-mono">SKU</th>
                  <th className="p-2.5 text-right font-mono">Unit Price</th>
                  <th className="p-2.5 text-right font-mono">Qty</th>
                  <th className="p-2.5 text-right font-mono">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedOrder.items.map((it, i) => (
                  <tr key={i}>
                    <td className="p-2.5 font-medium">{it.name}</td>
                    <td className="p-2.5 font-mono text-slate-500">{it.sku || '—'}</td>
                    <td className="p-2.5 text-right font-mono tabular-nums">
                      ৳{it.price.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums">{it.quantity}</td>
                    <td className="p-2.5 text-right font-mono font-bold tabular-nums">
                      ৳{(it.price * it.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end text-xs">
              <div className="w-56 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery Fee:</span>
                  <span className="font-mono tabular-nums">৳{selectedOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-2 border-t">
                  <span>Grand Total:</span>
                  <span className="font-mono tabular-nums text-blue-600">
                    ৳{selectedOrder.total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 text-center text-[10px] text-slate-400">
              Thank you for your purchase!
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={printInvoice}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Assign Courier Tracking Modal */}
      <Modal
        isOpen={isTrackingModalOpen}
        onClose={() => setIsTrackingModalOpen(false)}
        title={`Courier Dispatch — ${selectedOrder?.orderNumber}`}
        maxWidth="sm"
      >
        <form onSubmit={handleUpdateTracking} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Courier Provider
            </label>
            <select
              value={trackingCourier}
              onChange={(e) => setTrackingCourier(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="Steadfast Courier">Steadfast Courier</option>
              <option value="Pathao Courier">Pathao Courier</option>
              <option value="RedX Logistics">RedX Logistics</option>
              <option value="eCourier BD">eCourier BD</option>
              <option value="Paperfly">Paperfly</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Consignment Tracking Code / Waybill
            </label>
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="e.g. STF-849102"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsTrackingModalOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
            >
              Dispatch Parcel
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Create Manual Order Modal (with strict stock validation) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Manual Order"
        description="Record phone, WhatsApp, or social DM orders with real-time stock validation."
        maxWidth="lg"
      >
        {orderableProducts.length === 0 ? (
          <div className="p-6 text-center space-y-2 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              No active products in stock
            </p>
            <p className="text-slate-500">
              Add a product or restock existing inventory before recording an order.
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newOrderCustomer}
                  onChange={(e) => setNewOrderCustomer(e.target.value)}
                  placeholder="e.g. Shakil Chowdhury"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={newOrderPhone}
                  onChange={(e) => setNewOrderPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  District / City *
                </label>
                <input
                  type="text"
                  required
                  value={newOrderCity}
                  onChange={(e) => setNewOrderCity(e.target.value)}
                  placeholder="Dhaka, Chattogram..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Area / Thana
                </label>
                <input
                  type="text"
                  value={newOrderArea}
                  onChange={(e) => setNewOrderArea(e.target.value)}
                  placeholder="Dhanmondi, Uttara..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={newOrderPayment}
                  onChange={(e) => setNewOrderPayment(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Cash on Delivery (COD)">Cash on Delivery (COD)</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Delivery Address *
                </label>
                <input
                  type="text"
                  required
                  value={newOrderAddress}
                  onChange={(e) => setNewOrderAddress(e.target.value)}
                  placeholder="House, Road, Block"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Email (Optional)
                </label>
                <input
                  type="email"
                  value={newOrderEmail}
                  onChange={(e) => setNewOrderEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Product (In Stock Only)
                </label>
                <select
                  value={selectedManualProduct?.id || ''}
                  onChange={(e) => {
                    setNewOrderProduct(e.target.value);
                    setNewOrderQty(1);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {orderableProducts.map((p) => {
                    const eff = getEffectiveProductUnitPrice(p).unitPrice;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} — ৳{eff.toLocaleString()} ({p.stock} in stock)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity (Max {selectedManualProduct?.stock ?? 1})
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedManualProduct?.stock ?? 1}
                  value={newOrderQty}
                  onChange={(e) =>
                    setNewOrderQty(
                      Math.min(
                        selectedManualProduct?.stock ?? 1,
                        Math.max(1, Math.trunc(Number(e.target.value) || 1))
                      )
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Order Notes (Optional)
              </label>
              <input
                type="text"
                value={newOrderNotes}
                onChange={(e) => setNewOrderNotes(e.target.value)}
                placeholder="Special packaging or delivery timing..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
              >
                Confirm &amp; Save Order
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
