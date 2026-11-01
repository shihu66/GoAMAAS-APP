import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { PaymentMethodType } from '../../types';
import {
  hasDuplicateActiveTransactionReference,
  isWebsitePaymentService,
  normalizeTransactionReference,
  validateManualPaymentSubmissionInput,
} from '../../lib/paymentWorkflow';
import { getNagadManualSteps } from '../../data/paymentGatewaysConfig';
import { Modal } from '../ui/Modal';
import {
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Globe,
  ShieldCheck,
  Clock,
  XCircle,
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
  const { lang, t } = useLanguage();
  const pm = t.paymentModal;

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
        (site) =>
          (!user?.id || !site.userId || site.userId === user.id) &&
          site.subscriptionStatus !== 'cancelled'
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

  const formattedAmount = `৳${effectiveAmount.toLocaleString()}`;

  const bkashConfig = paymentGatewayConfigs.find((c) => c.id === 'bkash');
  const nagadConfig = paymentGatewayConfigs.find((c) => c.id === 'nagad');
  const bankConfig = paymentGatewayConfigs.find((c) => c.id === 'bank_transfer');
  const whatsappConfig = paymentGatewayConfigs.find((c) => c.id === 'whatsapp_support');

  const isBkashReady = Boolean(bkashConfig?.isEnabled && bkashConfig?.accountNumber?.trim());
  const isNagadReady = Boolean(nagadConfig?.isEnabled && nagadConfig?.accountNumber?.trim());
  const isBankReady = Boolean(bankConfig?.isEnabled && bankConfig?.accountNumber?.trim());

  // Read recipient number strictly from dynamic gateway configuration (no hardcoded fallback)
  const nagadRecipientNumber = nagadConfig?.accountNumber?.trim() || '';
  const nagadSteps = useMemo(
    () => (nagadRecipientNumber ? getNagadManualSteps(lang, formattedAmount, nagadRecipientNumber) : []),
    [lang, formattedAmount, nagadRecipientNumber]
  );

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

  const matchingTargetRequests = useMemo(() => {
    if (!user?.id || !effectiveServiceId) return [];
    const targetKey = effectiveServiceId.trim().toLowerCase();
    return paymentRequests
      .filter(
        (r) =>
          r.userId === user.id &&
          r.serviceType === serviceType &&
          r.serviceId.trim().toLowerCase() === targetKey
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [paymentRequests, user?.id, serviceType, effectiveServiceId]);

  const latestTargetRequest = matchingTargetRequests[0];
  const hasExistingPendingForTarget = matchingTargetRequests.some((r) => r.status === 'pending');

  const handleClose = () => {
    if (loading || submittingRef.current) return;
    setSubmitError(null);
    onClose();
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(pm.copiedToast, 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isValidAmount = Number.isFinite(effectiveAmount) && effectiveAmount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submittingRef.current) return;
    setSubmitError(null);

    if (!isValidAmount) {
      const msg = pm.errors.invalidPrice;
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (paymentMethod === 'bKash' && !isBkashReady) {
      const msg = pm.errors.bkashUnavailable;
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (paymentMethod === 'Nagad' && !isNagadReady) {
      const msg = pm.errors.nagadUnavailable;
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (paymentMethod === 'Bank Transfer' && !isBankReady) {
      const msg = pm.errors.bankUnavailable;
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
      const msg = validation.error || pm.errors.requiredFields;
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (hasDuplicateActiveTransactionReference(paymentRequests, validation.normalizedReference)) {
      const msg = pm.errors.duplicateTrx(validation.normalizedReference);
      setSubmitError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (hasExistingPendingForTarget) {
      const msg = pm.errors.alreadyPending;
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
        setSubmitError(res.message || pm.errors.submitFailed);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : pm.errors.submitFailed;
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
      title={pm.title}
      description={pm.description}
      maxWidth="xl"
    >
      <div className="space-y-5 text-slate-800 dark:text-slate-200 text-xs">
        {/* Related Website Subscription / Service Plan Selector & Exact Payable Summary */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 space-y-3">
          {allowWebsiteSelection && serviceType === 'website_subscription' && userWebsites.length > 1 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {pm.targetWebsiteLabel}
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
                {isWebsiteService ? pm.websiteSubscriptionLabel : pm.selectedPlanLabel}
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
                {pm.exactPayableLabel}
              </span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                {formattedAmount}
              </span>
            </div>
          </div>
        </div>

        {/* Current Payment Status Display: Pending Verification / Approved / Rejected (+ reason & resubmission) */}
        {hasExistingPendingForTarget ? (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-bold">{pm.pendingAlreadyTitle}</strong>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {pm.statusPendingBadge}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">{pm.pendingAlreadyBody}</p>
            </div>
          </div>
        ) : latestTargetRequest?.status === 'rejected' ? (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
            <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-bold">
                  {pm.statusLabel}: {pm.statusRejectedBadge}
                </strong>
                {latestTargetRequest.transactionId && (
                  <span className="font-mono text-[11px] text-rose-700 dark:text-rose-300">
                    TrxID: {latestTargetRequest.transactionId}
                  </span>
                )}
              </div>
              {latestTargetRequest.adminNotes && (
                <p className="text-[11px] leading-relaxed font-medium">
                  <strong>{pm.statusRejectedReasonLabel}</strong> {latestTargetRequest.adminNotes}
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                {pm.statusRejectedResubmitHint}
              </p>
            </div>
          </div>
        ) : latestTargetRequest?.status === 'approved' ? (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-bold">
                  {pm.statusLabel}: {pm.statusApprovedBadge}
                </strong>
                {latestTargetRequest.transactionId && (
                  <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                    TrxID: {latestTargetRequest.transactionId}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed">{pm.statusApprovedBody}</p>
            </div>
          </div>
        ) : null}

        {/* Payment Method Selector */}
        <div>
          <label className="font-semibold block mb-2 text-slate-700 dark:text-slate-300">
            {pm.step1ChooseMethod}
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
                {isBkashReady ? pm.sendMoney : pm.unavailable}
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
                {isNagadReady ? `${pm.sendMoney} · Personal` : pm.unavailable}
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
                {isBankReady ? bankConfig?.bankName?.trim() || pm.bankAc : pm.unavailable}
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
                    <span className="font-bold block">{pm.bkashUnavailableTitle}</span>
                    <p className="text-[11px] mt-0.5">{pm.bkashUnavailableBody}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block">
                        {pm.recipientBkashLabel}
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
                      <span>{copiedKey === 'bkash' ? pm.copied : pm.copyNumber}</span>
                    </button>
                  </div>
                  {copiedKey === 'bkash' && bkashConfig?.accountNumber && (
                    <p
                      role="status"
                      className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      {pm.copiedAccountSuccess(bkashConfig.accountNumber)}
                    </p>
                  )}
                  <p className="text-[11px] text-pink-900 dark:text-pink-200 leading-relaxed">
                    {bkashConfig?.instructions?.trim() || pm.bkashDefaultInstruction(formattedAmount)}
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
                    <span className="font-bold block">{pm.nagadUnavailableTitle}</span>
                    <p className="text-[11px] mt-0.5">{pm.nagadUnavailableBody}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                          {pm.recipientNagadLabel}
                        </span>
                        <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200">
                          · {nagadConfig?.accountName?.trim() || pm.nagadAccountTypeBadge}
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white mt-1 block tabular-nums">
                        {nagadRecipientNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(nagadRecipientNumber, 'nagad')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      {copiedKey === 'nagad' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'nagad' ? pm.copied : pm.copyNumber}</span>
                    </button>
                  </div>

                  {copiedKey === 'nagad' && nagadRecipientNumber && (
                    <p
                      role="status"
                      className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      {pm.copiedAccountSuccess(nagadRecipientNumber)}
                    </p>
                  )}

                  <div className="pt-2 border-t border-amber-200/70 dark:border-amber-900/60 space-y-1.5">
                    <span className="block font-bold text-[11px] text-amber-900 dark:text-amber-200">
                      {pm.nagadStepsTitle}
                    </span>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-950 dark:text-amber-100 leading-relaxed">
                      {nagadSteps.map((stepText, idx) => (
                        <li key={idx}>{stepText}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{pm.nagadManualOnlyNote}</span>
                  </div>
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
                    <span className="font-bold block">{pm.bankUnavailableTitle}</span>
                    <p className="text-[11px] mt-0.5">{pm.bankUnavailableBody}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        {pm.bankNameLabel}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {bankConfig?.bankName?.trim() || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        {pm.accountNameLabel}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {bankConfig?.accountName?.trim() || '—'}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                          {pm.recipientAcNumberLabel}
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
                        <span>{copiedKey === 'bank' ? pm.copied : pm.copyAc}</span>
                      </button>
                    </div>
                    {copiedKey === 'bank' && bankConfig?.accountNumber && (
                      <p
                        role="status"
                        className="col-span-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                      >
                        {pm.copiedAccountSuccess(bankConfig.accountNumber)}
                      </p>
                    )}
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        {pm.branchLabel}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">
                        {bankConfig?.branchName?.trim() || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">
                        {pm.routingLabel}
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
                      <strong>{pm.depositSlipSupportLabel}</strong> {pm.depositSlipSupportBody}{' '}
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
              {pm.step2ProofTitle}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {paymentMethod === 'Bank Transfer' ? pm.trxIdBankLabel : pm.trxIdWalletLabel}
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
                    paymentMethod === 'Bank Transfer'
                      ? pm.trxPlaceholderBank
                      : paymentMethod === 'Nagad'
                      ? pm.trxPlaceholderNagad
                      : pm.trxPlaceholderBkash
                  }
                  className={`w-full min-h-[44px] px-3 py-2.5 rounded-lg border bg-white dark:bg-slate-800 font-mono text-xs uppercase text-slate-900 dark:text-white ${
                    isDuplicateTypedTrx
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {isDuplicateTypedTrx && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1 block">
                    {pm.duplicateTrxWarning}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {paymentMethod === 'Bank Transfer'
                    ? pm.senderPhoneBankLabel
                    : pm.senderPhoneWalletLabel(paymentMethod)}
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
                  placeholder="017XXXXXXXX"
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {pm.payableAmountInputLabel}
                </label>
                <input
                  type="text"
                  readOnly
                  value={formattedAmount}
                  aria-label="Exact Payable Amount"
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 font-mono font-bold text-xs text-slate-900 dark:text-white tabular-nums cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {pm.relatedPlanInputLabel}
                </label>
                <input
                  type="text"
                  readOnly
                  value={
                    boundWebsite
                      ? `${boundWebsite.businessName} (${boundWebsite.subdomain}.amaas.xyz)`
                      : effectiveServiceName
                  }
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 truncate cursor-not-allowed"
                />
              </div>

              {paymentMethod === 'Bank Transfer' && (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      {pm.senderBankOptional}
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="BRAC Bank / City Bank"
                      className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      {pm.senderHolderOptional}
                    </label>
                    <input
                      type="text"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="Account Holder Name"
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
              {pm.cancel}
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
              <span>{pm.submitVerificationBtn(formattedAmount)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
          {pm.statusFooterNote}
        </p>
      </div>
    </Modal>
  );
};
