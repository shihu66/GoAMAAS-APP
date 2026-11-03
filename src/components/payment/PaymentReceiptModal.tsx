import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  Globe,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PaymentRequest, SubscribedWebsite } from '../../types';
import {
  buildVerifiedPaymentReceipt,
  formatSubscriptionDateDisplay,
  getPublicWebsiteHref,
} from '../../lib/paymentWorkflow';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: PaymentRequest | null | undefined;
  website?: SubscribedWebsite | null;
  isLatestApprovedForWebsite?: boolean;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  request,
  website,
  isLatestApprovedForWebsite = true,
}) => {
  const [copiedReceiptNo, setCopiedReceiptNo] = useState(false);

  const receipt = buildVerifiedPaymentReceipt(
    request,
    website,
    isLatestApprovedForWebsite
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('printing-goamaas-receipt');
    };
  }, [isOpen, onClose]);

  if (!isOpen || !receipt || typeof document === 'undefined') {
    return null;
  }

  const handlePrint = () => {
    document.body.classList.add('printing-goamaas-receipt');
    const cleanup = () => {
      document.body.classList.remove('printing-goamaas-receipt');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1500);
  };

  const handleCopyReceiptNumber = () => {
    navigator.clipboard.writeText(receipt.receiptNumber);
    setCopiedReceiptNo(true);
    window.setTimeout(() => setCopiedReceiptNo(false), 2000);
  };

  const publicHref = website
    ? getPublicWebsiteHref(website)
    : receipt.subdomain
    ? getPublicWebsiteHref({
        subdomain: receipt.subdomain,
        fullDomainUrl: `${receipt.subdomain}.amaas.xyz`,
      })
    : undefined;

  return createPortal(
    <div
      id="goamaas-receipt-print-portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goamaas-receipt-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="goamaas-printable-receipt"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto"
      >
        {/* Top Action Bar (Hidden in Print) */}
        <div className="no-print flex items-center justify-between px-6 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Official Verified Payment Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Document Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header Branding & Status */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm tracking-tight">
                  GA
                </div>
                <div>
                  <h2
                    id="goamaas-receipt-heading"
                    className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white"
                  >
                    {receipt.platformName} Payment Receipt
                  </h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Issued by {receipt.companyName}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5">
              <span className="inline-flex items-center gap-1.5 self-start sm:self-end px-3 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold tracking-wider uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {receipt.statusLabel}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-mono">
                <span className="text-slate-400 dark:text-slate-500 font-sans">Receipt No:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {receipt.receiptNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopyReceiptNumber}
                  title="Copy receipt number"
                  className="no-print p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {copiedReceiptNo ? (
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Approved: {formatSubscriptionDateDisplay(receipt.approvedAtIso, true)}
              </p>
            </div>
          </div>

          {/* Client & Website Information Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Billed To (Client)
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {receipt.businessName}
              </p>
              {receipt.clientName && receipt.clientName !== receipt.businessName && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Account Holder: {receipt.clientName}
                </p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300 break-all">
                {receipt.clientEmail}
              </p>
              {receipt.clientPhone && receipt.clientPhone !== 'Not provided' && (
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {receipt.clientPhone}
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Subscribed Website & Domain
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {receipt.websiteName}
              </p>
              {receipt.subdomain && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-blue-700 dark:text-blue-400">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>{receipt.subdomain}.amaas.xyz</span>
                </div>
              )}
              {receipt.websiteUrl && (
                <div className="pt-0.5">
                  {publicHref ? (
                    <a
                      href={publicHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                      <span>{receipt.websiteUrl}</span>
                      <ExternalLink className="no-print w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all">
                      {receipt.websiteUrl}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Line Item & Subscription Period Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/70 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Service & 30-Day Subscription Period</span>
              <span>Amount (BDT)</span>
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {receipt.planName}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Active Period:{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatSubscriptionDateDisplay(receipt.subscriptionStartIso, true)}
                  </span>{' '}
                  —{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatSubscriptionDateDisplay(receipt.subscriptionExpiryIso, true)}
                  </span>{' '}
                  (30 Days)
                </p>
              </div>
              <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {receipt.currency}
                {receipt.amountBdt.toLocaleString()}{' '}
                <span className="text-xs font-semibold text-slate-500">BDT</span>
              </div>
            </div>
            <div className="bg-slate-50/80 dark:bg-slate-900/80 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Total Verified & Paid
              </span>
              <span className="text-base font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {receipt.currency}
                {receipt.amountBdt.toLocaleString()} BDT
              </span>
            </div>
          </div>

          {/* Payment Verification Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Payment Method</p>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                {receipt.paymentMethod}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Transaction ID</p>
              <p className="font-bold font-mono text-slate-900 dark:text-white mt-0.5 break-all">
                {receipt.transactionId}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Sender Account</p>
              <p className="font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {receipt.senderNumber || '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Approval Date</p>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                {formatSubscriptionDateDisplay(receipt.approvedAtIso, false)}
              </p>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Computer-generated receipt verified by {receipt.companyName} ({receipt.platformName}).
            </span>
            <span className="font-mono">Ref: {receipt.requestId.slice(0, 12)}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
