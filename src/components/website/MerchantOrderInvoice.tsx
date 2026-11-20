import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Order, Store, SubscribedWebsite } from '../../types';
import { resolveOrderBranding, StorefrontLang } from '../../lib/customerPortal';
import { sanitizeImageUrl } from '../../lib/security';
import { Download, FileDown, Printer, X, MapPin, Phone, Mail, Globe, Truck } from 'lucide-react';

interface MerchantOrderInvoiceProps {
  order: Order;
  site?: Partial<SubscribedWebsite> | null;
  websites?: SubscribedWebsite[];
  stores?: Store[];
  lang?: StorefrontLang;
  onClose: () => void;
}

const LABELS = {
  en: {
    invoiceBadge: 'OFFICIAL ORDER INVOICE',
    orderRef: 'Order Reference',
    orderDate: 'Order Date',
    orderStatus: 'Order Status',
    paymentStatus: 'Payment Status',
    paymentMethod: 'Payment Method',
    billTo: 'Customer & Delivery Address',
    merchantContact: 'Merchant Business Details',
    fulfillment: 'Delivery & Fulfillment',
    courier: 'Courier',
    tracking: 'Tracking Code',
    deliveryMethod: 'Delivery Option',
    deliveryNotes: 'Instructions',
    orderNotes: 'Order Note',
    itemCol: 'Item',
    skuCol: 'SKU',
    priceCol: 'Unit Price',
    qtyCol: 'Qty',
    totalCol: 'Total',
    subtotal: 'Items Subtotal',
    deliveryFee: 'Delivery Charge',
    discount: 'Product Savings',
    grandTotal: 'Grand Total',
    thankYou: 'Thank you for shopping with',
    footerNote: 'This invoice preserves the exact merchant branding and pricing snapshot at the time of order.',
    printBtn: 'Print Invoice',
    pdfBtn: 'Download PDF',
    htmlBtn: 'Save Receipt',
    closeBtn: 'Close',
    free: 'Free',
    statuses: {
      pending: 'Order Placed',
      confirmed: 'Confirmed',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    },
    payStatuses: {
      paid: 'Paid',
      pending: 'Pending',
      failed: 'Failed',
      refunded: 'Refunded',
    },
  },
  bn: {
    invoiceBadge: 'অফিসিয়াল অর্ডার ইনভয়েস',
    orderRef: 'অর্ডার নম্বর',
    orderDate: 'অর্ডারের তারিখ',
    orderStatus: 'অর্ডার স্ট্যাটাস',
    paymentStatus: 'পেমেন্ট স্ট্যাটাস',
    paymentMethod: 'পেমেন্ট মাধ্যম',
    billTo: 'গ্রাহক ও ডেলিভারি ঠিকানা',
    merchantContact: 'দোকানের তথ্য',
    fulfillment: 'ডেলিভারি ও কুরিয়ার তথ্য',
    courier: 'কুরিয়ার',
    tracking: 'ট্র্যাকিং কোড',
    deliveryMethod: 'ডেলিভারি মাধ্যম',
    deliveryNotes: 'নির্দেশনা',
    orderNotes: 'অর্ডার নোট',
    itemCol: 'পণ্য',
    skuCol: 'SKU',
    priceCol: 'একক মূল্য',
    qtyCol: 'পরিমাণ',
    totalCol: 'মোট',
    subtotal: 'পণ্যের মোট মূল্য',
    deliveryFee: 'ডেলিভারি চার্জ',
    discount: 'ডিসকাউন্ট সাশ্রয়',
    grandTotal: 'সর্বমোট মূল্য',
    thankYou: 'কেনাকাটার জন্য ধন্যবাদ —',
    footerNote: 'অর্ডারের সময়কার নির্ধারিত মূল্য ও দোকানের ব্র্যান্ডিং অনুযায়ী এই ইনভয়েসটি সংরক্ষিত।',
    printBtn: 'প্রিন্ট করুন',
    pdfBtn: 'PDF ডাউনলোড',
    htmlBtn: 'রিসিট সেভ',
    closeBtn: 'বন্ধ করুন',
    free: 'ফ্রি',
    statuses: {
      pending: 'অর্ডার গৃহীত',
      confirmed: 'নিশ্চিত হয়েছে',
      processing: 'প্রস্তুত হচ্ছে',
      shipped: 'পাঠানো হয়েছে',
      delivered: 'ডেলিভারি সম্পন্ন',
      cancelled: 'বাতিল হয়েছে',
    },
    payStatuses: {
      paid: 'পরিশোধিত',
      pending: 'বাকি / পেন্ডিং',
      failed: 'ব্যর্থ',
      refunded: 'রিফান্ড',
    },
  },
};

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeCssHexColor(color?: string | null): string {
  const raw = String(color || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw) ? raw : '#2563EB';
}

function sanitizeHttpUrl(url?: string | null): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const MerchantOrderInvoice: React.FC<MerchantOrderInvoiceProps> = ({
  order,
  site,
  websites = [],
  stores = [],
  lang = 'en',
  onClose,
}) => {
  const [logoBroken, setLogoBroken] = useState(false);
  const t = LABELS[lang];
  const branding = resolveOrderBranding(order, websites, stores, site);
  const accent = sanitizeCssHexColor(branding.brandColor);
  const safeLogoUrl = sanitizeImageUrl(branding.logoUrl) || null;

  const itemsSubtotal =
    typeof order.subtotal === 'number' && Number.isFinite(order.subtotal) && order.subtotal >= 0
      ? order.subtotal
      : order.items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1), 0);
  const deliveryFee = Math.max(0, Number(order.deliveryFee) || 0);
  const discount = Math.max(
    0,
    Number(order.discount ?? order.items?.[0]?.orderMeta?.discountTotal) || 0
  );
  const grandTotal = Math.max(0, Number(order.total) || itemsSubtotal + deliveryFee);

  useEffect(() => {
    setLogoBroken(false);
  }, [branding.logoUrl]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('printing-goamaas-receipt');
    return () => {
      document.body.classList.remove('printing-goamaas-receipt');
    };
  }, []);

  const triggerPrintWithTitle = (isPdfMode: boolean) => {
    if (typeof window === 'undefined') return;
    const prevTitle = document.title;
    const safeShop = branding.businessName.replace(/[^\w\s-]/g, '').trim() || 'Store';
    document.title = `${safeShop} - Invoice ${order.orderNumber}`;
    if (isPdfMode) {
      // Allow browser print dialog so desktop and Android Chrome can pick "Save as PDF" with clean A4 sheet
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.title = prevTitle;
        }, 600);
      }, 40);
    } else {
      window.print();
      setTimeout(() => {
        document.title = prevTitle;
      }, 600);
    }
  };

  const handleDownloadOfflineHtml = () => {
    if (typeof window === 'undefined') return;
    const rowsHtml = order.items
      .map(
        (it) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
              <strong>${escapeHtml(it.name)}</strong>
              ${it.category ? `<div style="font-size:11px;color:#64748b;">${escapeHtml(it.category)}</div>` : ''}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:#64748b;">${escapeHtml(it.sku || '—')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">৳${Number(it.price || 0).toLocaleString()}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${Number(it.quantity || 1)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">৳${(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString()}</td>
          </tr>
        `
      )
      .join('');

    const htmlDoc = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(branding.businessName)} - Invoice ${escapeHtml(order.orderNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Plus Jakarta Sans', 'Hind Siliguri', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; line-height: 1.55; }
    .sheet { max-width: 780px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .topbar { height: 6px; background: ${accent}; }
    .pad { padding: 28px; }
    .flex { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; }
    @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="topbar"></div>
    <div class="pad">
      <div class="flex" style="border-bottom:1px solid #e2e8f0;padding-bottom:18px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          ${
            safeLogoUrl
              ? `<img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(branding.businessName)}" style="width:52px;height:52px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:4px;background:#fff;" />`
              : ''
          }
          <div>
            <h1 style="margin:0;font-size:22px;color:#0f172a;">${escapeHtml(branding.businessName)}</h1>
            ${branding.websiteUrl ? `<div style="font-size:12px;color:#475569;margin-top:4px;">${escapeHtml(branding.websiteUrl)}</div>` : ''}
            ${branding.phone ? `<div style="font-size:12px;color:#475569;">${escapeHtml(branding.phone)}</div>` : ''}
            ${branding.email ? `<div style="font-size:12px;color:#475569;">${escapeHtml(branding.email)}</div>` : ''}
            ${branding.address ? `<div style="font-size:12px;color:#475569;">${escapeHtml(branding.address)}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:${accent};">${escapeHtml(t.invoiceBadge)}</div>
          <div style="font-size:18px;font-weight:800;font-family:monospace;margin-top:4px;">#${escapeHtml(order.orderNumber)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(new Date(order.createdAt).toLocaleString())}</div>
        </div>
      </div>

      <div class="flex" style="margin-top:18px;font-size:13px;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">${escapeHtml(t.billTo)}</div>
          <div style="font-weight:700;margin-top:4px;">${escapeHtml(order.customerName)}</div>
          <div>${escapeHtml(order.customerPhone)}</div>
          ${order.customerEmail ? `<div>${escapeHtml(order.customerEmail)}</div>` : ''}
          <div>${escapeHtml(order.shippingAddress)}${order.city ? `, ${escapeHtml(order.city)}` : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">${escapeHtml(t.paymentMethod)}</div>
          <div style="font-weight:600;margin-top:4px;">${escapeHtml(order.paymentMethod)} (${escapeHtml(t.payStatuses[order.paymentStatus] || order.paymentStatus)})</div>
          ${order.deliveryMethod ? `<div style="color:#475569;margin-top:4px;">${escapeHtml(order.deliveryMethod)}</div>` : ''}
          ${order.courierName ? `<div style="color:#475569;">${escapeHtml(order.courierName)} ${order.trackingCode ? `· ${escapeHtml(order.trackingCode)}` : ''}</div>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t.itemCol)}</th>
            <th>${escapeHtml(t.skuCol)}</th>
            <th style="text-align:right;">${escapeHtml(t.priceCol)}</th>
            <th style="text-align:right;">${escapeHtml(t.qtyCol)}</th>
            <th style="text-align:right;">${escapeHtml(t.totalCol)}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;">
        <div style="width:260px;font-size:13px;">
          <div class="flex" style="margin-bottom:6px;"><span>${escapeHtml(t.subtotal)}</span><span>৳${itemsSubtotal.toLocaleString()}</span></div>
          <div class="flex" style="margin-bottom:6px;"><span>${escapeHtml(t.deliveryFee)}</span><span>${deliveryFee === 0 ? escapeHtml(t.free) : `৳${deliveryFee.toLocaleString()}`}</span></div>
          ${discount > 0 ? `<div class="flex" style="margin-bottom:6px;color:#059669;"><span>${escapeHtml(t.discount)}</span><span>-৳${discount.toLocaleString()}</span></div>` : ''}
          <div class="flex" style="padding-top:8px;border-top:2px solid #0f172a;font-size:15px;font-weight:800;">
            <span>${escapeHtml(t.grandTotal)}</span>
            <span style="color:${accent};">৳${grandTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">
        <strong style="color:#0f172a;">${escapeHtml(t.thankYou)} ${escapeHtml(branding.businessName)}</strong>
        <div style="margin-top:4px;font-size:11px;">${escapeHtml(t.footerNote)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.subdomain || 'store'}-invoice-${order.orderNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="goamaas-order-invoice-print-portal"
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex items-start sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        id="goamaas-printable-order-invoice"
        className="w-full max-w-3xl bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Merchant Brand Accent Top Strip */}
        <div className="h-2 w-full" style={{ backgroundColor: accent }} />

        {/* Screen-only Action Toolbar */}
        <div className="no-print px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700 font-mono">
            #{order.orderNumber}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadOfflineHtml}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.htmlBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => triggerPrintWithTitle(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.pdfBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => triggerPrintWithTitle(false)}
              className="px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: accent }}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.printBtn}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeBtn}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Merchant Invoice Content */}
        <div className="p-5 sm:p-8 space-y-6">
          {/* Merchant Brand Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex items-start gap-3.5 min-w-0">
              {safeLogoUrl && !logoBroken ? (
                <img
                  src={safeLogoUrl}
                  alt={branding.businessName}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoBroken(true)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0"
                />
              ) : (
                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-white font-black text-xl shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  {branding.businessName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="space-y-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 break-words">
                  {branding.businessName}
                </h2>
                <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                  {branding.websiteUrl && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                      <Globe className="w-3 h-3 shrink-0" style={{ color: accent }} />
                      <span>{branding.websiteUrl}</span>
                    </span>
                  )}
                  {branding.phone && (
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <Phone className="w-3 h-3 shrink-0" style={{ color: accent }} />
                      <span>{branding.phone}</span>
                    </span>
                  )}
                  {branding.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3 h-3 shrink-0" style={{ color: accent }} />
                      <span>{branding.email}</span>
                    </span>
                  )}
                  {branding.address && (
                    <span className="inline-flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" style={{ color: accent }} />
                      <span>{branding.address}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1 shrink-0">
              <div
                className="text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {t.invoiceBadge}
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold tabular-nums text-slate-900">
                #{order.orderNumber}
              </div>
              <div className="text-xs text-slate-500">
                {t.orderDate}:{' '}
                <span className="font-medium text-slate-700">
                  {new Date(order.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-slate-600 pt-0.5">
                {t.orderStatus}:{' '}
                <strong className="text-slate-900">
                  {t.statuses[order.status] || order.status}
                </strong>
              </div>
            </div>
          </div>

          {/* Customer & Fulfillment Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                {t.billTo}
              </div>
              <div className="font-bold text-sm text-slate-900">{order.customerName}</div>
              <div className="font-mono tabular-nums text-slate-700">{order.customerPhone}</div>
              {order.customerEmail && (
                <div className="text-slate-600">{order.customerEmail}</div>
              )}
              <div className="text-slate-700 leading-relaxed pt-0.5">
                {order.shippingAddress}
                {order.deliveryArea && !order.shippingAddress.includes(order.deliveryArea)
                  ? `, ${order.deliveryArea}`
                  : ''}
                {order.city ? `, ${order.city}` : ''}
              </div>
              {order.deliveryInstructions && (
                <div className="text-slate-500 pt-1">
                  <strong className="text-slate-700">{t.deliveryNotes}:</strong>{' '}
                  {order.deliveryInstructions}
                </div>
              )}
              {order.notes && (
                <div className="text-slate-500">
                  <strong className="text-slate-700">{t.orderNotes}:</strong> {order.notes}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                {t.fulfillment}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.paymentMethod}:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {order.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t.paymentStatus}:</span>
                <span className="font-bold text-slate-900 text-right">
                  {t.payStatuses[order.paymentStatus] || order.paymentStatus}
                </span>
              </div>
              {order.deliveryMethod && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t.deliveryMethod}:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {order.deliveryMethod}
                  </span>
                </div>
              )}
              {(order.courierName || order.trackingCode) && (
                <div className="pt-1.5 mt-1.5 border-t border-slate-200 space-y-1">
                  {order.courierName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        <span>{t.courier}:</span>
                      </span>
                      <span className="font-semibold text-slate-900">{order.courierName}</span>
                    </div>
                  )}
                  {order.trackingCode && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">{t.tracking}:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {order.trackingCode}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="p-3 font-bold">{t.itemCol}</th>
                  <th className="p-3 font-bold font-mono hidden sm:table-cell">{t.skuCol}</th>
                  <th className="p-3 font-bold text-right font-mono">{t.priceCol}</th>
                  <th className="p-3 font-bold text-right font-mono">{t.qtyCol}</th>
                  <th className="p-3 font-bold text-right font-mono">{t.totalCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <tr key={`${item.productId}-${idx}`}>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-500 sm:hidden font-mono">
                        {item.sku || '—'}
                      </div>
                      {item.originalPrice !== undefined && item.originalPrice > item.price && (
                        <div className="text-[11px] text-slate-400 line-through font-mono">
                          ৳{item.originalPrice.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-slate-500 hidden sm:table-cell">
                      {item.sku || '—'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-700">
                      ৳{Number(item.price || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">
                      {item.quantity}
                    </td>
                    <td className="p-3 text-right font-mono font-bold tabular-nums text-slate-900">
                      ৳{(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financials Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{t.subtotal}</span>
                <span className="font-mono tabular-nums font-medium">
                  ৳{itemsSubtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t.deliveryFee}</span>
                <span className="font-mono tabular-nums font-medium">
                  {deliveryFee === 0 ? t.free : `৳${deliveryFee.toLocaleString()}`}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>{t.discount}</span>
                  <span className="font-mono tabular-nums">-৳{discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-2.5 border-t border-slate-300 text-sm font-extrabold text-slate-900">
                <span>{t.grandTotal}</span>
                <span className="font-mono tabular-nums" style={{ color: accent }}>
                  ৳{grandTotal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Merchant Footer */}
          <div className="pt-4 border-t border-slate-200 text-center space-y-1 text-xs text-slate-500">
            <p className="font-semibold text-slate-800">
              {t.thankYou} {branding.businessName}
            </p>
            <p className="text-[11px] text-slate-400">{t.footerNote}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
