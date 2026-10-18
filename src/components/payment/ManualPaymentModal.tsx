import React, { useState } from 'react';
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const bkashConfig = paymentGatewayConfigs.find((c) => c.id === 'bkash');
  const nagadConfig = paymentGatewayConfigs.find((c) => c.id === 'nagad');
  const bankConfig = paymentGatewayConfigs.find((c) => c.id === 'bank_transfer');
  const whatsappConfig = paymentGatewayConfigs.find((c) => c.id === 'whatsapp_support');

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'bKash') {
      if (!transactionId.trim()) {
        showToast('Please enter the bKash Transaction ID (TrxID).', 'warning');
        return;
      }
    } else if (paymentMethod === 'Nagad') {
      if (!nagadConfig?.isEnabled || !nagadConfig?.accountNumber) {
        showToast('Nagad payment channel is currently unavailable. Please choose bKash or Bank Transfer.', 'warning');
        return;
      }
      if (!transactionId.trim()) {
        showToast('Please enter the Nagad Transaction ID.', 'warning');
        return;
      }
    } else if (paymentMethod === 'Bank Transfer') {
      if (!bankReference.trim() && !transactionId.trim()) {
        showToast('Please provide your bank deposit slip number or reference code.', 'warning');
        return;
      }
    }

    setLoading(true);
    const res = await submitPaymentRequest({
      serviceType,
      serviceId,
      serviceName,
      planTier,
      amount,
      paymentMethod,
      transactionId: transactionId.trim() || undefined,
      senderNumber: senderNumber.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankAccountName: bankAccountName.trim() || undefined,
      bankReference: bankReference.trim() || undefined,
    });
    setLoading(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Service Subscription Payment" maxWidth="xl">
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
              }`}
            >
              <div className="font-bold text-xs">bKash</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Personal (Send Money)</div>
            </button>

            {/* Nagad */}
            <button
              type="button"
              onClick={() => setPaymentMethod('Nagad')}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                paymentMethod === 'Nagad'
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              } ${!nagadConfig?.isEnabled ? 'opacity-50' : ''}`}
            >
              <div className="font-bold text-xs">Nagad</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{nagadConfig?.isEnabled ? 'Send Money' : 'Unavailable'}</div>
            </button>

            {/* Bank Transfer */}
            <button
              type="button"
              onClick={() => setPaymentMethod('Bank Transfer')}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                paymentMethod === 'Bank Transfer'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 font-bold'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="font-bold text-xs">Bank Transfer</div>
              <div className="text-[10px] text-slate-400 mt-0.5">City Bank PLC</div>
            </button>
          </div>
        </div>

        {/* Channel Details & Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* BKASH INSTRUCTIONS */}
          {paymentMethod === 'bKash' && (
            <div className="p-4 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block">Receiving bKash Personal Number</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">{bkashConfig?.accountNumber || '+8801822332020'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(bkashConfig?.accountNumber || '+8801822332020', 'bkash')}
                  className="px-2.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-medium text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'bkash' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'bkash' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-pink-800 dark:text-pink-300 leading-relaxed">
                Open your bKash app $\to$ Select <strong>Send Money</strong> $\to$ Send exactly <strong className="font-mono">৳{amount.toLocaleString()}</strong> to the number above. Then paste the 10-character Transaction ID (TrxID) below.
              </p>
            </div>
          )}

          {/* NAGAD INSTRUCTIONS */}
          {paymentMethod === 'Nagad' && (
            <div>
              {!nagadConfig?.isEnabled ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Nagad Channel Under Maintenance</span>
                      <p className="text-[11px] mt-0.5">
                        Nagad receiving number is not configured at this moment. Please use bKash or Bank Transfer for immediate verification.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">Receiving Nagad Number</span>
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">{nagadConfig?.accountNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(nagadConfig.accountNumber!, 'nagad')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'nagad' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'nagad' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BANK TRANSFER INSTRUCTIONS */}
          {paymentMethod === 'Bank Transfer' && (
            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Bank Name</span>
                  <span className="font-bold text-slate-900 dark:text-white">{bankConfig?.bankName || 'City Bank PLC'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Account Name</span>
                  <span className="font-bold text-slate-900 dark:text-white">{bankConfig?.accountName || 'AMAAS TECHNOLOGIES'}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Account Number</span>
                    <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">{bankConfig?.accountNumber || '1503892019001'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(bankConfig?.accountNumber || '1503892019001', 'bank')}
                    className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'bank' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'bank' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Branch</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">{bankConfig?.branchName || 'Gulshan Avenue Branch'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Routing Number</span>
                  <span className="text-slate-800 dark:text-slate-200 font-mono">{bankConfig?.routingNumber || '225261783'}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                <strong>Manual WhatsApp Verification:</strong> For Bank Transfers, please send a photo/screenshot of your deposit slip or BEFTN receipt directly to our verified AMAAS WhatsApp: <strong>{whatsappConfig?.accountNumber || '+8801822332020'}</strong>.
              </div>
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
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder={paymentMethod === 'bKash' ? 'e.g. BKA79X2910' : 'e.g. DEP-910284'}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Sender Mobile / Account Number
              </label>
              <input
                type="text"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                placeholder="e.g. 017XXXXXXXX"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (paymentMethod === 'Nagad' && !nagadConfig?.isEnabled)}
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
