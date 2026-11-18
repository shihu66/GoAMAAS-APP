import React, { useEffect, useState, useCallback } from 'react';
import { Order, OrderStatus, SubscribedWebsite } from '../../types';
import { supabase, isSupabaseConfigured, UUID_REGEX } from '../../lib/supabase';
import {
  buildOrderStatusHistory,
  fetchCustomerOrderDetailFromPortal,
  resolveOrderBranding,
  StorefrontLang,
} from '../../lib/customerPortal';
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  XCircle,
  RefreshCw,
  FileText,
  Phone,
  MapPin,
  Mail,
} from 'lucide-react';

interface CustomerOrderTrackerProps {
  order: Order;
  subdomain: string;
  accessToken?: string | null;
  site?: Partial<SubscribedWebsite> | null;
  lang?: StorefrontLang;
  onOrderRefreshed?: (updated: Order) => void;
  onOpenInvoice?: (order: Order) => void;
}

const ORDERED_STAGES: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
];

const TRACKER_TEXT = {
  en: {
    title: 'Live Order Tracking',
    orderRef: 'Order',
    placedOn: 'Placed on',
    refresh: 'Refresh Status',
    refreshing: 'Refreshing...',
    invoice: 'View / Download Invoice',
    liveSync: 'Live sync active',
    cancelledBanner: 'This order has been cancelled.',
    courierInfo: 'Delivery & Courier',
    courier: 'Courier Service',
    trackingCode: 'Tracking Reference',
    addressTitle: 'Delivery Address',
    paymentTitle: 'Payment Summary',
    itemsTitle: 'Ordered Items',
    supportTitle: 'Merchant Contact',
    total: 'Total Payable',
    deliveryFee: 'Delivery Charge',
    discount: 'Savings',
    notRecordedYet: 'Pending update',
    stages: {
      pending: 'Order Placed',
      confirmed: 'Confirmed',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    },
    stageDescriptions: {
      pending: 'Your order has been received by the store.',
      confirmed: 'The merchant confirmed your order details.',
      processing: 'Items are being packed and prepared for dispatch.',
      shipped: 'Package handed over for delivery.',
      delivered: 'Order delivered to your address.',
      cancelled: 'Order was cancelled and stock restored.',
    },
  },
  bn: {
    title: 'লাইভ অর্ডার ট্র্যাকিং',
    orderRef: 'অর্ডার',
    placedOn: 'অর্ডারের সময়',
    refresh: 'স্ট্যাটাস রিফ্রেশ',
    refreshing: 'আপডেট হচ্ছে...',
    invoice: 'ইনভয়েস দেখুন / ডাউনলোড',
    liveSync: 'লাইভ সিঙ্ক চালু আছে',
    cancelledBanner: 'এই অর্ডারটি বাতিল করা হয়েছে।',
    courierInfo: 'ডেলিভারি ও কুরিয়ার',
    courier: 'কুরিয়ার সার্ভিস',
    trackingCode: 'ট্র্যাকিং নম্বর',
    addressTitle: 'ডেলিভারি ঠিকানা',
    paymentTitle: 'পেমেন্ট তথ্য',
    itemsTitle: 'অর্ডারকৃত পণ্যসমূহ',
    supportTitle: 'দোকানের যোগাযোগ',
    total: 'সর্বমোট মূল্য',
    deliveryFee: 'ডেলিভারি চার্জ',
    discount: 'ডিসকাউন্ট সাশ্রয়',
    notRecordedYet: 'আপডেটের অপেক্ষায়',
    stages: {
      pending: 'অর্ডার গৃহীত',
      confirmed: 'নিশ্চিত হয়েছে',
      processing: 'প্যাকিং ও প্রস্তুত',
      shipped: 'পাঠানো হয়েছে',
      delivered: 'ডেলিভারি সম্পন্ন',
      cancelled: 'বাতিল হয়েছে',
    },
    stageDescriptions: {
      pending: 'আপনার অর্ডারটি দোকানে পৌঁছেছে।',
      confirmed: 'দোকানদার আপনার অর্ডার নিশ্চিত করেছেন।',
      processing: 'আপনার পণ্য প্যাক করা হচ্ছে।',
      shipped: 'ডেলিভারির জন্য কুরিয়ারে পাঠানো হয়েছে।',
      delivered: 'পণ্য আপনার ঠিকানায় পৌঁছে গেছে।',
      cancelled: 'অর্ডারটি বাতিল করা হয়েছে।',
    },
  },
};

export const CustomerOrderTracker: React.FC<CustomerOrderTrackerProps> = ({
  order: initialOrder,
  subdomain,
  accessToken,
  site,
  lang = 'en',
  onOrderRefreshed,
  onOpenInvoice,
}) => {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const t = TRACKER_TEXT[lang];

  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  const branding = resolveOrderBranding(order, [], [], site);
  const accent = branding.brandColor || '#2563EB';

  const refreshOrder = useCallback(
    async (silent = false) => {
      if (!accessToken || !subdomain || !order.id) return;
      if (!silent) setIsRefreshing(true);
      try {
        const res = await fetchCustomerOrderDetailFromPortal(
          subdomain,
          order.id,
          accessToken
        );
        if (res.order) {
          setOrder(res.order);
          setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          onOrderRefreshed?.(res.order);
        }
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [accessToken, subdomain, order.id, onOrderRefreshed]
  );

  // Supabase Realtime Broadcast subscription + safe 20s polling fallback for customer live status sync
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(order.id)) return;
    const sbClient = supabase;
    const ch = sbClient
      .channel(`storefront-order-${order.id}`)
      .on('broadcast', { event: 'order_status_updated' }, () => {
        void refreshOrder(true);
      })
      .subscribe();

    const pollId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (order.status === 'delivered' || order.status === 'cancelled') return;
      void refreshOrder(true);
    }, 20000);

    return () => {
      window.clearInterval(pollId);
      void sbClient.removeChannel(ch);
    };
  }, [order.id, order.status, refreshOrder]);

  const history = buildOrderStatusHistory(order);
  const historyTimestampMap = new Map<OrderStatus, string>();
  for (const h of history) {
    if (!historyTimestampMap.has(h.status)) {
      historyTimestampMap.set(h.status, h.at);
    }
  }

  const currentStageIndex =
    order.status === 'cancelled'
      ? -1
      : Math.max(0, ORDERED_STAGES.indexOf(order.status));

  const stageIcons: Record<OrderStatus, React.ReactNode> = {
    pending: <Clock className="w-4 h-4" />,
    confirmed: <CheckCircle2 className="w-4 h-4" />,
    processing: <Package className="w-4 h-4" />,
    shipped: <Truck className="w-4 h-4" />,
    delivered: <CheckCircle2 className="w-4 h-4" />,
    cancelled: <XCircle className="w-4 h-4" />,
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Header Summary */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t.title}
          </div>
          <div className="text-base font-extrabold font-mono text-slate-900 mt-0.5">
            {t.orderRef} #{order.orderNumber}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {t.placedOn}: {new Date(order.createdAt).toLocaleString()}
            {lastSyncedAt && <span className="ml-2 font-mono">· {lastSyncedAt}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {accessToken && (
            <button
              type="button"
              onClick={() => void refreshOrder(false)}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? t.refreshing : t.refresh}</span>
            </button>
          )}
          {onOpenInvoice && (
            <button
              type="button"
              onClick={() => onOpenInvoice(order)}
              className="px-3.5 py-1.5 rounded-lg text-white font-semibold inline-flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: accent }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t.invoice}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cancelled Alert if cancelled */}
      {order.status === 'cancelled' && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">{t.stages.cancelled}</p>
              <p className="text-[11px] text-rose-700">{t.cancelledBanner}</p>
            </div>
          </div>
          {historyTimestampMap.get('cancelled') && (
            <span className="font-mono text-[11px] text-rose-700 shrink-0">
              {new Date(historyTimestampMap.get('cancelled')!).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Chronological Visual Stage Timeline */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 space-y-4">
        <div className="space-y-4">
          {ORDERED_STAGES.map((stage, idx) => {
            const recordedTimestamp = historyTimestampMap.get(stage);
            const isCompleted =
              order.status !== 'cancelled' &&
              (idx < currentStageIndex || Boolean(recordedTimestamp));
            const isCurrent = order.status === stage;

            return (
              <div key={stage} className="flex items-start gap-3.5 relative">
                {idx < ORDERED_STAGES.length - 1 && (
                  <div
                    className="absolute left-[15px] top-8 bottom-[-16px] w-0.5"
                    style={{
                      backgroundColor: idx < currentStageIndex ? accent : '#E2E8F0',
                    }}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                    isCurrent || isCompleted
                      ? 'text-white border-transparent'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                  style={
                    isCurrent || isCompleted ? { backgroundColor: accent } : undefined
                  }
                >
                  {stageIcons[stage]}
                </div>
                <div className="flex-1 pt-0.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-bold ${
                        isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {t.stages[stage]}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {recordedTimestamp
                        ? new Date(recordedTimestamp).toLocaleString()
                        : isCurrent && stage === 'pending'
                        ? new Date(order.createdAt).toLocaleString()
                        : t.notRecordedYet}
                    </span>
                  </div>
                  <p
                    className={`text-[11px] mt-0.5 ${
                      isCurrent || isCompleted ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {t.stageDescriptions[stage]}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivery, Payment & Courier Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
          <div className="font-bold text-slate-900">{t.addressTitle}</div>
          <p className="font-semibold text-slate-800">{order.customerName}</p>
          <p className="font-mono tabular-nums text-slate-600">{order.customerPhone}</p>
          <p className="text-slate-600 leading-relaxed">
            {order.shippingAddress}
            {order.city ? `, ${order.city}` : ''}
          </p>
          {(order.courierName || order.trackingCode || order.deliveryMethod) && (
            <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
              {order.deliveryMethod && (
                <div className="text-slate-600">
                  Delivery: <strong className="text-slate-800">{order.deliveryMethod}</strong>
                </div>
              )}
              {order.courierName && (
                <div className="text-slate-600">
                  {t.courier}: <strong className="text-slate-900">{order.courierName}</strong>
                </div>
              )}
              {order.trackingCode && (
                <div className="text-slate-600">
                  {t.trackingCode}:{' '}
                  <strong className="font-mono text-slate-900">{order.trackingCode}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
          <div className="font-bold text-slate-900">{t.paymentTitle}</div>
          <div className="flex justify-between text-slate-600">
            <span>Method</span>
            <span className="font-semibold text-slate-900">{order.paymentMethod}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Status</span>
            <span className="font-bold uppercase text-slate-900">{order.paymentStatus}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{t.deliveryFee}</span>
            <span className="font-mono tabular-nums">
              ৳{Number(order.deliveryFee || 0).toLocaleString()}
            </span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>{t.discount}</span>
              <span className="font-mono tabular-nums">
                -৳{Number(order.discount).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-100 font-extrabold text-sm text-slate-900">
            <span>{t.total}</span>
            <span className="font-mono tabular-nums" style={{ color: accent }}>
              ৳{Number(order.total || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Ordered Items */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
        <div className="font-bold text-slate-900">{t.itemsTitle}</div>
        <div className="divide-y divide-slate-100">
          {order.items.map((it, i) => (
            <div
              key={`${it.productId}-${i}`}
              className="py-2 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {it.imageUrl && (
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{it.name}</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    ৳{Number(it.price || 0).toLocaleString()} × {it.quantity}
                  </p>
                </div>
              </div>
              <span className="font-mono font-bold tabular-nums text-slate-900 shrink-0">
                ৳{(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Merchant Contact Info */}
      {(branding.phone || branding.email || branding.address) && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="font-bold text-slate-900">
            {t.supportTitle} — {branding.businessName}
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-600">
            {branding.phone && (
              <a
                href={`tel:${branding.phone}`}
                className="inline-flex items-center gap-1.5 hover:text-slate-900 font-mono"
              >
                <Phone className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{branding.phone}</span>
              </a>
            )}
            {branding.email && (
              <a
                href={`mailto:${branding.email}`}
                className="inline-flex items-center gap-1.5 hover:text-slate-900"
              >
                <Mail className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{branding.email}</span>
              </a>
            )}
            {branding.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{branding.address}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
