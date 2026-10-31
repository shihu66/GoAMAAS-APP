import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PaymentMethodType } from '../../types';
import {
  hasDuplicateActiveTransactionReference,
  isWebsitePaymentService,
  normalizeTransactionReference,
  validateManualPaymentSubmissionInput,
} from '../../lib/paymentWorkflow';
import { Modal } from '../ui/Modal';
import {
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Globe,
} from 'lucide-react';

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceId: string;
  serviceName: string;
  planTier: string;
  amount: number;
  allowWebsiteSelection?: boolean;
  onSuccess?: () => void;
}

export const ManualPaymentModal: React.FC<ManualPaymentModalProps> = ({
  isOpen,
  onClose,
  serviceType,
  serviceId,
  serviceName,
  planTier,
  amount,
  allowWebsiteSelection = false,
  onSuccess,
}) => {
  const {
    user,
    subscribedWebsites,
    websiteSubscriptionPlan,
    paymentRequests,
    paymentGatewayConfigs,
    submitPaymentRequest,
    showToast,
  } = useApp();

  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>(serviceId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('bKash');
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedWebsiteId(serviceId);
      setSubmitError(null);
    }
  }, [isOpen, serviceId]);

  const userWebsites = useMemo(
    () =>
      subscribedWebsites.filter(
        (site) => (!user?.id || !site.userId || site.userId === user.id) && site.subscriptionStatus !== 'cancelled'
      ),
    [subscribedWebsites, user?.id]
  );

  const isWebsiteService = isWebsitePaymentService(serviceType);
  const boundWebsite = useMemo(() => {
    if (!isWebsiteService) return undefined;
    const targetId = allowWebsiteSelection ? selectedWebsiteId : serviceId;
    return subscribedWebsites.find((w) => w.id === targetId);
  }, [isWebsiteService, allowWebsiteSelection, selectedWebsiteId, serviceId, subscribedWebsites]);

  const effectiveServiceId = isWebsiteService && boundWebsite ? boundWebsite.id : serviceId;
  const effectiveServiceName =
    isWebsiteService && boundWebsite
      ? `${boundWebsite.planName || 'GoAMAAS Website'} (${boundWebsite.fullDomainUrl})`
      : serviceName;
  const effectivePlanTier =
    isWebsiteService && boundWebsite
      ? boundWebsite.planName || planTier || 'GoAMAAS Website'
      : planTier;
  const effectiveAmount =
    serviceType === 'website_subscription' && boundWebsite
      ? boundWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly || amount
      : amount;

  const bkashConfig = paymentGatewayConfigs.find((c) => c.id === 'bkash');
  const nagadConfig = paymentGatewayConfigs.find((c) => c.id === 'nagad');
  const bankConfig = paymentGatewayConfigs.find((c) => c.id === 'bank_transfer');
  const whatsappConfig = paymentGatewayConfigs.find((c) => c.id === 'whatsapp_support');

  const isBkashReady = Boolean(bkashConfig?.isEnabled && bkashConfig?.accountNumber?.trim());
  const isNagadReady = Boolean(nagadConfig?.isEnabled && nagadConfig?.accountNumber?.trim());
  const isBankReady = Boolean(bankConfig?.isEnabled && bankConfig?.accountNumber?.trim());

  useEffect(() => {
    if (!isOpen) return;
    if (paymentMethod === 'bKash' && !isBkashReady) {
      if (isNagadReady) setPaymentMethod('Nagad');
      else if (isBankReady) setPaymentMethod('Bank Transfer');
    } else if (paymentMethod === 'Nagad' && !isNagadReady) {
      if (isBkashReady) setPaymentMethod('bKash');
      else if (isBankReady) setPaymentMethod('Bank Transfer');
    } else if (paymentMethod === 'Bank Transfer' && !isBankReady) {
      if (isBkashReady) setPaymentMethod('bKash');
      else if (isNagadReady) setPaymentMethod('Nagad');
    }
  }, [isOpen, paymentMethod, isBkashReady, isNagadReady, isBankReady]);

  const normalizedTypedTrx = normalizeTransactionReference(transactionId);
  const isDuplicateTypedTrx =
    normalizedTypedTrx.length >= 4 &&
    hasDuplicateActiveTransactionReference(paymentRequests, normalizedTypedTrx);

  const hasExistingPendingForTarget = useMemo(() => {
    if (!user?.id || !effectiveServiceId) return false;
    return paymentRequests.some(
      (r) =>
        r.userId === user.id &&
        r.serviceType === serviceType &&
        r.serviceId.trim().toLowerCase() === effectiveServiceId.trim().toLowerCase() &&
        r.status === 'pending'
    );
  }, [paymentRequests, user?.id, serviceType, effectiveServiceId]);

  const handleClose = () => {
    if (loading || submittingRef.current) return;
    setSubmitError(null);
    onClose();
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isValidAmount = Number.isFinite(effectiveAmount) && effectiveAmount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submittingRef.current) return;
    setSubmitError(null);

    if (!isValidAmount) {
      const msg = 'This plan or service does not currently have a valid active price.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (paymentMethod === 'bKash' && !isBkashReady) {
      const msg = 'bKash payment channel is currently unavailable. Please choose an active payment method.';
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (paymentMethod === 'Nagad' && !isNagadReady) {
      const msg = 'Nagad payment channel is currently unavailable. Please choose bKash or Bank Transfer.';
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (paymentMethod === 'Bank Transfer' && !isBankReady) {
      const msg = 'Bank Transfer channel is currently unavailable. Please choose an active payment method.';
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    const validation = validateManualPaymentSubmissionInput({
      paymentMethod,
      transactionId,
      bankReference: paymentMethod === 'Bank Transfer' ? transactionId : undefined,
      senderNumber,
      amount: effectiveAmount,
      serviceId: effectiveServiceId,
    });

    if (!validation.valid) {
      const msg = validation.error || 'Please fill in all required payment fields.';
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (hasDuplicateActiveTransactionReference(paymentRequests, validation.normalizedReference)) {
      const msg = `Transaction ID "${validation.normalizedReference}" has already been submitted and is pending or approved.`;
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (hasExistingPendingForTarget) {
      const msg = 'A payment request for this subscription is already pending admin verification.';
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const isBank = paymentMethod === 'Bank Transfer';
      const res = await submitPaymentRequest({
        serviceType,
        serviceId: effectiveServiceId,
        serviceName: effectiveServiceName,
        planTier: effectivePlanTier,
        amount: effectiveAmount,
        paymentMethod,
        transactionId: validation.normalizedReference,
        senderNumber: validation.normalizedSender,
        bankName: isBank ? bankName.trim() || undefined : undefined,
        bankAccountName: isBank ? bankAccountName.trim() || undefined : undefined,
        bankReference: isBank ? validation.normalizedReference : undefined,
      });

      if (res.success) {
        setTransactionId('');
        setSenderNumber('');
        setBankName('');
        setBankAccountName('');
        setSubmitError(null);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setSubmitError(res.message || 'Failed to submit payment request. Please try again.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to submit payment request. Please try again.';
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Submit Manual Payment Verification"
      description="Transfer the exact payable amount to a verified GoAMAAS account, then submit your Transaction ID and sender phone number."
      maxWidth="xl"
    >
      <div className="space-y-5 text-slate-800 dark:text-slate-200 text-xs">
        {/* Related Website Subscription / Service Plan Selector & Exact Payable Summary */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 space-y-3">
          {allowWebsiteSelection && serviceType === 'website_subscription' && userWebsites.length > 1 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Target Website Subscription *
              </label>
              <select
                value={effectiveServiceId}
                onChange={(e) => setSelectedWebsiteId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs"
              >
                {userWebsites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.businessName} — {site.fullDomainUrl} (৳{site.monthlyFee}/mo)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                {isWebsiteService ? 'Website Subscription' : 'Selected Plan'}
              </span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white block mt-0.5 truncate">
                {boundWebsite ? boundWebsite.businessName : effectiveServiceName}
              </span>
              {boundWebsite ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  <Globe className="w-3 h-3 shrink-0" />
                  <span>https://{boundWebsite.fullDomainUrl}</span>
                  <span className="font-sans text-slate-400">· {effectivePlanTier}</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">{effectivePlanTier}</span>
              )}
            </div>

            <div className="sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                Exact Payable Amount
              </span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                ৳{effectiveAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {hasExistingPendingForTarget && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Pending Verification Already Submitted</strong>
              <span className="text-[11px] leading-relaxed block mt-0.5">
                A payment request for this subscription is already awaiting admin verification. Once reviewed, your dashboard will update automatically.
              </span>
            </div>
          </div>
        )}

        {/* Payment Method Selector */}
        <div>
          <label className="font-semibold block mb-2 text-slate-700 dark:text-slate-300">
            1. Choose Payment Method *
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('bKash')}
              className={`min-h-[52px] px-2.5 py-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                paymentMethod === 'bKash'
                  ? 'border-pink-500 bg-pink-50/70 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 ring-2 ring-pink-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              } ${!isBkashReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs whitespace-nowrap">bKash</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {isBkashReady ? 'Send Money' : 'Unavailable'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('Nagad')}
              className={`min-h-[52px] px-2.5 py-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                paymentMethod === 'Nagad'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              } ${!isNagadReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs whitespace-nowrap">Nagad</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {isNagadReady ? 'Send Money' : 'Unavailable'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('Bank Transfer')}
              className={`min-h-[52px] px-2.5 py-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                paymentMethod === 'Bank Transfer'
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              } ${!isBankReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs whitespace-nowrap">Bank Transfer</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {isBankReady ? bankConfig?.bankName?.trim() || 'Bank A/C' : 'Unavailable'}
              </div>
            </button>
          </div>
        </div>

        {/* Recipient Account Instructions + Verification Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {paymentMethod === 'bKash' && (
            <div>
              {!isBkashReady ? (
                <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 text-pink-800 dark:text-pink-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">bKash Channel Unavailable</span>
                    <p className="text-[11px] mt-0.5">
                      bKash recipient details are currently disabled. Please select an active payment method above.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block">
                        Recipient bKash Number
                        {bkashConfig?.accountName?.trim() ? ` · ${bkashConfig.accountName.trim()}` : ''}
                      </span>
                      <span className="font-mono font-bold text-base text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                        {bkashConfig?.accountNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bkashConfig?.accountNumber ?? '', 'bkash')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      {copiedKey === 'bkash' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'bkash' ? 'Copied' : 'Copy Number'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-pink-900 dark:text-pink-200 leading-relaxed">
                    {bkashConfig?.instructions?.trim() ||
                      `Send exactly ৳${effectiveAmount.toLocaleString()} to the bKash number above, then enter your TrxID and sender wallet number below.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'Nagad' && (
            <div>
              {!isNagadReady ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Nagad Channel Unavailable</span>
                    <p className="text-[11px] mt-0.5">
                      Nagad recipient details are not active right now. Please choose bKash or Bank Transfer.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                        Recipient Nagad Number
                        {nagadConfig?.accountName?.trim() ? ` · ${nagadConfig.accountName.trim()}` : ''}
                      </span>
                      <span className="font-mono font-bold text-base text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                        {nagadConfig?.accountNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(nagadConfig?.accountNumber ?? '', 'nagad')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      {copiedKey === 'nagad' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'nagad' ? 'Copied' : 'Copy Number'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                    {nagadConfig?.instructions?.trim() ||
                      `Send exactly ৳${effectiveAmount.toLocaleString()} to the Nagad number above, then enter your TrxID and sender wallet number below.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'Bank Transfer' && (
            <div>
              {!isBankReady ? (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Bank Transfer Channel Unavailable</span>
                    <p className="text-[11px] mt-0.5">
                      Bank recipient account details are currently disabled. Please select another active payment method.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Bank Name
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {bankConfig?.bankName?.trim() || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Account Name
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {bankConfig?.accountName?.trim() || '—'}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                          Recipient Account Number
                        </span>
                        <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 tabular-nums">
                          {bankConfig?.accountNumber}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(bankConfig?.accountNumber ?? '', 'bank')}
                        className="min-h-[44px] px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        {copiedKey === 'bank' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'bank' ? 'Copied' : 'Copy A/C'}</span>
                      </button>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Branch
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">
                        {bankConfig?.branchName?.trim() || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        Routing Number
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                        {bankConfig?.routingNumber?.trim() || '—'}
                      </span>
                    </div>
                  </div>

                  {bankConfig?.instructions?.trim() && (
                    <p className="text-[11px] text-blue-900 dark:text-blue-200 leading-relaxed">
                      {bankConfig.instructions.trim()}
                    </p>
                  )}

                  {whatsappConfig?.isEnabled && whatsappConfig?.accountNumber?.trim() && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                      <strong>Deposit Slip Support:</strong> You may also share your transfer receipt via WhatsApp at{' '}
                      <strong className="font-mono">{whatsappConfig.accountNumber.trim()}</strong>.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Verification Inputs */}
          <div className="space-y-3 pt-1">
            <span className="font-semibold block text-slate-700 dark:text-slate-300">
              2. Enter Transfer Proof *
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {paymentMethod === 'Bank Transfer'
                    ? 'Transaction ID / Bank Reference *'
                    : 'Transaction ID (TrxID) *'}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={transactionId}
                  onChange={(e) => {
                    setTransactionId(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  placeholder={
                    paymentMethod === 'Bank Transfer' ? 'e.g. NPSB-91028471' : 'e.g. BKA79X2910'
                  }
                  className={`w-full min-h-[44px] px-3 py-2.5 rounded-lg border bg-white dark:bg-slate-800 font-mono text-xs uppercase text-slate-900 dark:text-white ${
                    isDuplicateTypedTrx
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {isDuplicateTypedTrx && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1 block">
                    This Transaction ID has already been submitted and is pending or approved.
                  </span>
                )}
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {paymentMethod === 'Bank Transfer'
                    ? 'Sender Phone Number *'
                    : `Sender ${paymentMethod} Phone Number *`}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={senderNumber}
                  onChange={(e) => {
                    setSenderNumber(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  placeholder="e.g. 017XXXXXXXX"
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Payable Amount (BDT ৳) *
                </label>
                <input
                  type="text"
                  readOnly
                  value={`৳${effectiveAmount.toLocaleString()}`}
                  aria-label="Exact Payable Amount"
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 font-mono font-bold text-xs text-slate-900 dark:text-white tabular-nums cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Related Plan / Website
                </label>
                <input
                  type="text"
                  readOnly
                  value={boundWebsite ? `${boundWebsite.businessName} (${boundWebsite.subdomain}.amaas.xyz)` : effectiveServiceName}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 truncate cursor-not-allowed"
                />
              </div>

              {paymentMethod === 'Bank Transfer' && (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Sender Bank Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. BRAC Bank / City Bank"
                      className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Sender Account Holder Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="e.g. Account Holder Name"
                      className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {submitError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={loading}
              onClick={handleClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !isValidAmount ||
                isDuplicateTypedTrx ||
                hasExistingPendingForTarget ||
                (paymentMethod === 'bKash' && !isBkashReady) ||
                (paymentMethod === 'Nagad' && !isNagadReady) ||
                (paymentMethod === 'Bank Transfer' && !isBankReady)
              }
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Submit ৳{effectiveAmount.toLocaleString()} for Verification</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
          Status starts as <strong>Pending Verification</strong>. Once verified by an administrator, your subscription activates and eligible websites publish immediately.
        </p>
      </div>
    </Modal>
  );
};
