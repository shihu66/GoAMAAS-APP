import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PaymentMethodType } from '../../types';
import { Modal } from '../ui/Modal';
import { CreditCard, Copy, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceId: string;
  serviceName: string;
  planTier: string;
  amount: number;
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
  onSuccess,
}) => {
  const { paymentGatewayConfigs, submitPaymentRequest, showToast } = useApp();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('bKash');
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
    }
  }, [isOpen]);

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
      if (isBankReady) setPaymentMethod('Bank Transfer');
      else if (isNagadReady) setPaymentMethod('Nagad');
    } else if (paymentMethod === 'Nagad' && !isNagadReady) {
      if (isBkashReady) setPaymentMethod('bKash');
      else if (isBankReady) setPaymentMethod('Bank Transfer');
    } else if (paymentMethod === 'Bank Transfer' && !isBankReady) {
      if (isBkashReady) setPaymentMethod('bKash');
      else if (isNagadReady) setPaymentMethod('Nagad');
    }
  }, [isOpen, paymentMethod, isBkashReady, isNagadReady, isBankReady]);

  const handleClose = () => {
    if (loading || submittingRef.current) return;
    setSubmitError(null);
    onClose();
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isValidAmount = Number.isFinite(amount) && amount > 0;

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

    if (paymentMethod === 'bKash') {
      if (!isBkashReady) {
        const msg = 'bKash payment channel is currently unavailable. Please choose an active payment method.';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
      if (!transactionId.trim()) {
        const msg = 'Please enter the bKash Transaction ID (TrxID).';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
    } else if (paymentMethod === 'Nagad') {
      if (!isNagadReady) {
        const msg = 'Nagad payment channel is currently unavailable. Please choose bKash or Bank Transfer.';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
      if (!transactionId.trim()) {
        const msg = 'Please enter the Nagad Transaction ID.';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
    } else if (paymentMethod === 'Bank Transfer') {
      if (!isBankReady) {
        const msg = 'Bank Transfer channel is currently unavailable. Please choose an active payment method.';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
      if (!bankReference.trim()) {
        const msg = 'Please provide your bank deposit slip number or reference code.';
        setSubmitError(msg);
        showToast(msg, 'warning');
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const isBank = paymentMethod === 'Bank Transfer';
      const res = await submitPaymentRequest({
        serviceType,
        serviceId,
        serviceName,
        planTier,
        amount,
        paymentMethod,
        transactionId: !isBank ? transactionId.trim() || undefined : undefined,
        senderNumber: senderNumber.trim() || undefined,
        bankName: isBank ? bankName.trim() || undefined : undefined,
        bankAccountName: isBank ? bankAccountName.trim() || undefined : undefined,
        bankReference: isBank ? bankReference.trim() || undefined : undefined,
      });

      if (res.success) {
        setTransactionId('');
        setSenderNumber('');
        setBankName('');
        setBankAccountName('');
        setBankReference('');
        setSubmitError(null);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setSubmitError(res.message || 'Failed to submit payment request. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit payment request. Please try again.';
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Complete Service Subscription Payment" maxWidth="xl">
      <div className="space-y-6 text-slate-800 dark:text-slate-200 text-xs">
        {/* Order Summary Strip */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Payable Subscription</span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-white block mt-0.5">{serviceName}</span>
            <span className="text-[11px] text-slate-500">{planTier}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Payable</span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums">৳{amount.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment Channel Tabs */}
        <div>
          <label className="font-semibold block mb-2 text-slate-700 dark:text-slate-300">
            Select Payment Method:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* bKash */}
            <button
              type="button"
              onClick={() => setPaymentMethod('bKash')}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                paymentMethod === 'bKash'
                  ? 'border-pink-500 bg-pink-50/50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 ring-2 ring-pink-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${!isBkashReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs">bKash</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{isBkashReady ? 'Personal (Send Money)' : 'Unavailable'}</div>
            </button>

            {/* Nagad */}
            <button
              type="button"
              onClick={() => setPaymentMethod('Nagad')}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                paymentMethod === 'Nagad'
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${!isNagadReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs">Nagad</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{isNagadReady ? 'Send Money' : 'Unavailable'}</div>
            </button>

            {/* Bank Transfer */}
            <button
              type="button"
              onClick={() => setPaymentMethod('Bank Transfer')}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                paymentMethod === 'Bank Transfer'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${!isBankReady ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs">Bank Transfer</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isBankReady ? (bankConfig?.bankName?.trim() || 'Configured Bank') : 'Unavailable'}
              </div>
            </button>
          </div>
        </div>

        {/* Channel Details & Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* BKASH INSTRUCTIONS */}
          {paymentMethod === 'bKash' && (
            <div>
              {!isBkashReady ? (
                <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 text-pink-800 dark:text-pink-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">bKash Channel Unavailable</span>
                      <p className="text-[11px] mt-0.5">
                        bKash receiving account details are not currently enabled. Please select another active payment method.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block">
                        Receiving bKash Number{bkashConfig?.accountName?.trim() ? ` (${bkashConfig.accountName.trim()})` : ''}
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">
                        {bkashConfig?.accountNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bkashConfig?.accountNumber ?? '', 'bkash')}
                      className="px-2.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-medium text-[11px] flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'bkash' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'bkash' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-pink-800 dark:text-pink-300 leading-relaxed">
                    {bkashConfig?.instructions?.trim() ||
                      `Send exactly ৳${amount.toLocaleString()} to the configured bKash number above, then submit your Transaction ID (TrxID) below.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* NAGAD INSTRUCTIONS */}
          {paymentMethod === 'Nagad' && (
            <div>
              {!isNagadReady ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Nagad Channel Under Maintenance</span>
                      <p className="text-[11px] mt-0.5">
                        Nagad receiving number is not configured at this moment. Please use an active payment channel for verification.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                        Receiving Nagad Number{nagadConfig?.accountName?.trim() ? ` (${nagadConfig.accountName.trim()})` : ''}
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">
                        {nagadConfig?.accountNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(nagadConfig?.accountNumber ?? '', 'nagad')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'nagad' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'nagad' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  {nagadConfig?.instructions?.trim() && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                      {nagadConfig.instructions.trim()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BANK TRANSFER INSTRUCTIONS */}
          {paymentMethod === 'Bank Transfer' && (
            <div>
              {!isBankReady ? (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Bank Transfer Channel Unavailable</span>
                      <p className="text-[11px] mt-0.5">
                        Bank receiving account details are not currently enabled. Please select another active payment method.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Bank Name</span>
                      <span className="font-bold text-slate-900 dark:text-white">{bankConfig?.bankName?.trim() || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Account Name</span>
                      <span className="font-bold text-slate-900 dark:text-white">{bankConfig?.accountName?.trim() || '—'}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Account Number</span>
                        <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">{bankConfig?.accountNumber}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(bankConfig?.accountNumber ?? '', 'bank')}
                        className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'bank' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'bank' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Branch</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{bankConfig?.branchName?.trim() || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Routing Number</span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono">{bankConfig?.routingNumber?.trim() || '—'}</span>
                    </div>
                  </div>

                  {bankConfig?.instructions?.trim() && (
                    <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                      {bankConfig.instructions.trim()}
                    </p>
                  )}

                  {whatsappConfig?.isEnabled && whatsappConfig?.accountNumber?.trim() && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                      <strong>Manual WhatsApp Verification:</strong> For Bank Transfers, please send your deposit slip or transfer receipt to our configured support WhatsApp: <strong>{whatsappConfig.accountNumber.trim()}</strong>.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {paymentMethod === 'Bank Transfer' ? 'Deposit / Slip Reference Number *' : 'Transaction ID (TrxID) *'}
              </label>
              <input
                type="text"
                required
                value={paymentMethod === 'Bank Transfer' ? bankReference : transactionId}
                onChange={(e) =>
                  paymentMethod === 'Bank Transfer'
                    ? setBankReference(e.target.value)
                    : setTransactionId(e.target.value)
                }
                placeholder={paymentMethod === 'Bank Transfer' ? 'e.g. DEP-910284' : 'e.g. BKA79X2910'}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {paymentMethod === 'Bank Transfer' ? 'Contact Mobile Number' : 'Sender Mobile Number'}
              </label>
              <input
                type="text"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                placeholder="e.g. 017XXXXXXXX"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
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
                    placeholder="e.g. BRAC Bank / Dutch-Bangla Bank"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {submitError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={loading}
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !isValidAmount ||
                (paymentMethod === 'bKash' && !isBkashReady) ||
                (paymentMethod === 'Nagad' && !isNagadReady) ||
                (paymentMethod === 'Bank Transfer' && !isBankReady)
              }
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit for Verification</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-400 text-center">
          Payments remain in <strong>Pending</strong> status until verified by our billing staff. Approvals activate services immediately.
        </p>
      </div>
    </Modal>
  );
};
