import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Order, OrderStatus, PaymentStatus } from '../../types';
import {
  ShoppingCart,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  FileSpreadsheet,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

export const OrdersPage: React.FC = () => {
  const {
    orders,
    updateOrderStatus,
    updateOrderPaymentStatus,
    updateOrderTracking,
    addOrder,
    products,
    showToast,
  } = useApp();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Tracking update state
  const [trackingCourier, setTrackingCourier] = useState('Steadfast Courier');
  const [trackingCode, setTrackingCode] = useState('');

  // New manual order form state
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderCity, setNewOrderCity] = useState('Dhaka');
  const [newOrderProduct, setNewOrderProduct] = useState(products[0]?.id || '');
  const [newOrderQty, setNewOrderQty] = useState(1);
  const [newOrderPayment, setNewOrderPayment] = useState<'Cash on Delivery (COD)' | 'bKash' | 'Nagad'>('Cash on Delivery (COD)');

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customerName.toLowerCase().includes(search.toLowerCase()) ||
        o.customerPhone.includes(search) ||
        o.city.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        selectedStatus === 'all' || o.status === selectedStatus;
      const matchesPayment =
        selectedPaymentStatus === 'all' || o.paymentStatus === selectedPaymentStatus;
      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [orders, search, selectedStatus, selectedPaymentStatus]);

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
    const headers = ['Order Number', 'Date', 'Customer Name', 'Phone', 'City', 'Status', 'Payment', 'Total (BDT)'];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      o.createdAt.split('T')[0],
      `"${o.customerName}"`,
      `"${o.customerPhone}"`,
      `"${o.city}"`,
      o.status.toUpperCase(),
      o.paymentStatus.toUpperCase(),
      o.total,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GoAMAAS_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Orders exported to CSV file successfully', 'success');
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === newOrderProduct) || products[0];
    if (!prod) return;

    const itemTotal = prod.price * newOrderQty;
    const deliveryFee = newOrderCity.toLowerCase() === 'dhaka' ? 80 : 130;
    const grandTotal = itemTotal + deliveryFee;

    addOrder({
      customerName: newOrderCustomer,
      customerEmail: `${newOrderCustomer.toLowerCase().replace(/\s+/g, '')}@example.com`,
      customerPhone: newOrderPhone,
      items: [
        {
          productId: prod.id,
          name: prod.name,
          price: prod.price,
          quantity: newOrderQty,
          sku: prod.sku,
        },
      ],
      total: grandTotal,
      deliveryFee,
      discount: 0,
      status: 'confirmed',
      paymentStatus: newOrderPayment === 'Cash on Delivery (COD)' ? 'pending' : 'paid',
      paymentMethod: newOrderPayment,
      shippingAddress: newOrderAddress,
      city: newOrderCity,
    });

    setIsCreateModalOpen(false);
    setNewOrderCustomer('');
    setNewOrderPhone('');
    setNewOrderAddress('');
  };

  const handleUpdateTracking = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrder) {
      updateOrderTracking(selectedOrder.id, trackingCourier, trackingCode || `TRK-${Math.floor(100000 + Math.random() * 900000)}`);
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
            Order Fulfillment & Courier Dispatch
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track multi-channel orders, update shipment stages, and generate printable customer invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Manual Order</span>
          </button>
        </div>
      </div>

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
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
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
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by Order ID, customer, phone, or city..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-500">Payment:</span>
          <select
            value={selectedPaymentStatus}
            onChange={(e) => {
              setSelectedPaymentStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">All Payment Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed / Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      {orders.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No orders yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Your orders will show up here as shoppers checkout through your website, landing pages, or when you record an order manually.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Order</span>
            </button>
          </div>
        </div>
      ) : paginatedOrders.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No orders matching filter</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try resetting your status tab or clearing your search query.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Order ID & Date</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4 text-right">Total (৳)</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status & Courier</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    {/* Order ID & Date */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">
                        {o.orderNumber}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {o.customerName}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {o.customerPhone}
                      </span>
                      <span className="text-[10px] text-slate-400">{o.city}</span>
                    </td>

                    {/* Items */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 dark:text-slate-200 font-medium">
                        {o.items[0]?.name}
                        {o.items.length > 1 && (
                          <span className="text-slate-400 font-normal ml-1">
                            +{o.items.length - 1} more
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Qty: {o.items.reduce((acc, i) => acc + i.quantity, 0)} units
                      </span>
                    </td>

                    {/* Total */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      ৳{o.total.toLocaleString()}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        Del: ৳{o.deliveryFee}
                      </span>
                    </td>

                    {/* Payment */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          o.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : o.paymentStatus === 'pending'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[100px]">
                        {o.paymentMethod}
                      </span>
                    </td>

                    {/* Status & Courier */}
                    <td className="py-3.5 px-4">
                      <select
                        value={o.status}
                        onChange={(e) => updateOrderStatus(o.id, e.target.value as OrderStatus)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold uppercase border focus:outline-hidden ${
                          o.status === 'delivered'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                            : o.status === 'shipped'
                            ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 text-blue-700 dark:text-blue-300'
                            : o.status === 'processing'
                            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 text-amber-700 dark:text-amber-300'
                            : o.status === 'confirmed'
                            ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 text-purple-700 dark:text-purple-300'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-300 text-slate-700 dark:text-slate-300'
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
                            setSelectedOrder(o);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="View Order Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOrder(o);
                            setTrackingCourier(o.courierName || 'Steadfast Courier');
                            setTrackingCode(o.trackingCode || '');
                            setIsTrackingModalOpen(true);
                          }}
                          className="p-1 text-blue-500 hover:text-blue-700"
                          title="Assign Courier / Tracking"
                        >
                          <Truck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOrder(o);
                            setIsInvoiceModalOpen(true);
                          }}
                          className="p-1 text-emerald-500 hover:text-emerald-700"
                          title="Print Customer Invoice"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
          <div>
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
            <span className="px-2 font-semibold text-slate-900 dark:text-white font-mono">
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

      {/* 1. Order Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Order Details — ${selectedOrder.orderNumber}`}
          description={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString()}`}
          maxWidth="lg"
        >
          <div className="space-y-5 text-xs">
            {/* Customer & Shipping Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">Customer</h4>
                <p className="font-medium">{selectedOrder.customerName}</p>
                <p className="text-slate-500 font-mono">{selectedOrder.customerPhone}</p>
                <p className="text-slate-500">{selectedOrder.customerEmail}</p>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">Delivery Address</h4>
                <p className="text-slate-700 dark:text-slate-300">{selectedOrder.shippingAddress}</p>
                <p className="text-slate-500 font-semibold">{selectedOrder.city}, Bangladesh</p>
                {selectedOrder.courierName && (
                  <p className="text-blue-600 dark:text-blue-400 mt-1 font-mono">
                    {selectedOrder.courierName} ({selectedOrder.trackingCode})
                  </p>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white mb-2">Ordered Line Items</h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2">SKU</th>
                      <th className="p-2 text-right">Price</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{item.name}</td>
                        <td className="p-2 font-mono text-slate-400">{item.sku}</td>
                        <td className="p-2 text-right font-mono tabular-nums">৳{item.price}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{item.quantity}</td>
                        <td className="p-2 text-right font-mono font-bold tabular-nums">
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
              <div className="w-64 space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Delivery Charge:</span>
                  <span className="font-mono tabular-nums">৳{selectedOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Discount:</span>
                  <span className="font-mono tabular-nums">-৳{selectedOrder.discount}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Grand Total:</span>
                  <span className="font-mono text-sm tabular-nums text-blue-600">
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
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Invoice</span>
              </button>

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Print-Friendly Invoice Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          title={`Tax Invoice — ${selectedOrder.orderNumber}`}
          maxWidth="2xl"
        >
          <div className="p-6 bg-white text-slate-900 space-y-6 print:p-0">
            {/* Header */}
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">GoAMAAS Store Invoice</h2>
                <p className="text-xs text-slate-500">Official Merchant Tax Receipt</p>
                <p className="text-xs text-slate-500 mt-1">Order #{selectedOrder.orderNumber}</p>
              </div>
              <div className="text-right text-xs">
                <span className="font-mono font-bold text-sm block">AMAAS COMMERCE</span>
                <span className="text-slate-500">Date: {new Date(selectedOrder.createdAt).toLocaleDateString()}</span>
                <span className="block text-emerald-600 font-semibold uppercase mt-1">
                  Payment: {selectedOrder.paymentStatus}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-600 uppercase text-[10px] block">Bill To:</span>
                <p className="font-bold">{selectedOrder.customerName}</p>
                <p>{selectedOrder.shippingAddress}</p>
                <p>{selectedOrder.city}, Bangladesh</p>
                <p className="font-mono">{selectedOrder.customerPhone}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-600 uppercase text-[10px] block">Shipping Method:</span>
                <p className="font-semibold">{selectedOrder.courierName || 'Standard Express Courier'}</p>
                {selectedOrder.trackingCode && <p className="font-mono text-blue-600">Tracking: {selectedOrder.trackingCode}</p>}
                <p className="text-slate-500 mt-1">Method: {selectedOrder.paymentMethod}</p>
              </div>
            </div>

            {/* Invoice Items Table */}
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
                    <td className="p-2.5 font-mono text-slate-500">{it.sku}</td>
                    <td className="p-2.5 text-right font-mono">৳{it.price.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono">{it.quantity}</td>
                    <td className="p-2.5 text-right font-mono font-bold">৳{(it.price * it.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total breakdown */}
            <div className="flex justify-end text-xs">
              <div className="w-56 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery Fee:</span>
                  <span className="font-mono">৳{selectedOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-2 border-t">
                  <span>Grand Total:</span>
                  <span className="font-mono text-blue-600">৳{selectedOrder.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t pt-4 text-center text-[10px] text-slate-400">
              Generated via GoAMAAS Commerce Engine · Thank you for your business!
            </div>

            {/* Print Action */}
            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700"
              >
                Close
              </button>
              <button
                onClick={printInvoice}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5"
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
              <option value="Steadfast Courier">Steadfast Courier (Recommended)</option>
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
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Dispatch Parcel
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Create Manual Order Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Manual Order"
        description="Add customer and phone orders received via offline phone or Instagram DM."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Customer Name *
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
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={newOrderPhone}
                onChange={(e) => setNewOrderPhone(e.target.value)}
                placeholder="+880 1700-000000"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Delivery City *
              </label>
              <input
                type="text"
                required
                value={newOrderCity}
                onChange={(e) => setNewOrderCity(e.target.value)}
                placeholder="Dhaka, Chittagong, etc."
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
                <option value="bKash">bKash Mobile Payment</option>
                <option value="Nagad">Nagad Mobile Payment</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Shipping Address *
            </label>
            <input
              type="text"
              required
              value={newOrderAddress}
              onChange={(e) => setNewOrderAddress(e.target.value)}
              placeholder="House, Road, Area, Thana"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Selected Product
              </label>
              <select
                value={newOrderProduct}
                onChange={(e) => setNewOrderProduct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (৳{p.price})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                value={newOrderQty}
                onChange={(e) => setNewOrderQty(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Confirm & Save Order
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
