import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  WebsiteRequest,
  SubscribedWebsite,
  PaymentGatewayConfig,
  PaymentRequest,
  ApproveAndPublishResult,
} from '../../types';
import {
  isWebsitePaymentService,
  isWebsiteTrulyLive,
} from '../../lib/paymentWorkflow';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import {
  CreditCard,
  Globe2,
  Globe,
  CheckCircle2,
  Clock,
  Search,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Eye,
  Settings,
  Sparkles,
  AlertTriangle,
  Smartphone,
  Monitor,
  Loader2,
  Trash2,
  FileText,
  Save,
  Store,
  Copy,
  X,
  XCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';

const QUICK_REJECTION_REASONS = [
  'Transaction ID was not found in our statement.',
  'Transferred amount does not match the payable subscription fee.',
  'Sender phone number could not be matched to the transfer.',
  'Duplicate or unreadable transfer reference submitted.',
];

export const AdminDashboardPage: React.FC = () => {
  const {
    user,
    role,
    stores,
    websiteRequests,
    updateWebsiteRequestStatus,
    subscribedWebsites,
    isWebsitesLoading,
    refreshSubscribedWebsites,
    websiteSubscriptionPlan,
    updateWebsiteSubscriptionPlanConfig,
    suspendSubscribedWebsite,
    reactivateSubscribedWebsite,
    renewSubscribedWebsite,
    adminDeleteSubscribedWebsite,
    websiteLifecycleAuditLogs,
    refreshWebsiteLifecycleAuditLogs,
    automations,
    invoices,
    paymentRequests,
    isPaymentsLoading,
    refreshPaymentRequests,
    adminApproveAndPublishPayment,
    adminRetryPublishForPayment,
    adminRejectPayment,
    paymentGatewayConfigs,
    updatePaymentGatewayConfig,
    showToast,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<
    'payments' | 'websiteSubscriptions' | 'requests' | 'tenants' | 'gateways' | 'transactions'
  >('payments');
  const [paymentFilter, setPaymentFilter] = useState<
    'pending' | 'needs_publish' | 'approved' | 'rejected' | 'all'
  >('pending');
  const [paymentSearch, setPaymentSearch] = useState('');

  // Confirmation modal targets (never execute approve/reject without explicit confirmation)
  const [approvalModalTarget, setApprovalModalTarget] = useState<{
    request: PaymentRequest;
    mode: 'approve_and_publish' | 'retry_publish';
  } | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  const [rejectionModalId, setRejectionModalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Per-request concurrency lock & step feedback
  const inFlightPaymentIdsRef = useRef<Set<string>>(new Set());
  const [processingPaymentIds, setProcessingPaymentIds] = useState<Record<string, 'approving' | 'publishing' | 'rejecting'>>({});
  const [workflowFeedback, setWorkflowFeedback] = useState<{
    requestId: string;
    tone: 'success' | 'warning' | 'error';
    title: string;
    detail: string;
    canRetryPublish?: boolean;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [requestSearch, setRequestSearch] = useState('');
  const [websiteSearch, setWebsiteSearch] = useState('');

  // Website Preview & Audited Lifecycle Action State in Admin
  const [previewingWebsite, setPreviewingWebsite] = useState<SubscribedWebsite | null>(null);
  const [adminPreviewDevice, setAdminPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [lifecycleModal, setLifecycleModal] = useState<{
    site: SubscribedWebsite;
    action: 'suspend' | 'reactivate' | 'renew';
  } | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [websiteToDelete, setWebsiteToDelete] = useState<SubscribedWebsite | null>(null);

  // Plan Settings Form State
  const [isPlanSettingsModalOpen, setIsPlanSettingsModalOpen] = useState(false);
  const [planPrice, setPlanPrice] = useState(websiteSubscriptionPlan.priceMonthly);
  const [planGraceDays, setPlanGraceDays] = useState(websiteSubscriptionPlan.limits.gracePeriodDays);
  const [planMaxPages, setPlanMaxPages] = useState(websiteSubscriptionPlan.limits.maxPages);
  const [planMaxStorage, setPlanMaxStorage] = useState(websiteSubscriptionPlan.limits.maxStorageMb);
  const [planMaxBandwidth, setPlanMaxBandwidth] = useState(websiteSubscriptionPlan.limits.maxBandwidthGb);
  const [planMaxUpdates, setPlanMaxUpdates] = useState(websiteSubscriptionPlan.limits.monthlyUpdateRequests);
  const [planIsVisible, setPlanIsVisible] = useState(websiteSubscriptionPlan.isVisible);

  // Controlled drafts for Gateway Accounts & WhatsApp Config (prevents per-keystroke RPC spam)
  const [gatewayDrafts, setGatewayDrafts] = useState<Record<string, PaymentGatewayConfig>>(() =>
    Object.fromEntries(paymentGatewayConfigs.map((gw) => [gw.id, { ...gw }]))
  );
  const [savingGatewayId, setSavingGatewayId] = useState<string | null>(null);

  useEffect(() => {
    setGatewayDrafts(Object.fromEntries(paymentGatewayConfigs.map((gw) => [gw.id, { ...gw }])));
  }, [paymentGatewayConfigs]);

  const updateGatewayDraft = (gatewayId: string, patch: Partial<PaymentGatewayConfig>) => {
    setGatewayDrafts((prev) => {
      const base = prev[gatewayId] || paymentGatewayConfigs.find((g) => g.id === gatewayId);
      if (!base) return prev;
      return {
        ...prev,
        [gatewayId]: { ...base, ...patch },
      };
    });
  };

  // Real platform aggregates (strictly verified paid subscriptions for revenue/paying counts)
  const payingWebsites = subscribedWebsites.filter(
    (s) =>
      s.paymentStatus === 'paid' &&
      (s.subscriptionStatus === 'active' || s.subscriptionStatus === 'grace_period')
  );
  const liveWebsitesCount = subscribedWebsites.filter(
    (s) =>
      s.paymentStatus === 'paid' &&
      s.subscriptionStatus === 'active' &&
      s.deploymentStatus === 'live'
  ).length;

  const platformStats = {
    totalTenants: stores.length,
    activeSubscribers: payingWebsites.length,
    monthlyRecurringRevenue: payingWebsites.reduce((sum, s) => sum + s.monthlyFee, 0),
    activeAutomations: automations.filter((a) => a.status === 'active').length,
  };

  const filteredRequests = websiteRequests.filter(
    (r) =>
      r.businessName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.contactName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.budgetTier.toLowerCase().includes(requestSearch.toLowerCase())
  );

  // Strict exact website resolver for a payment request (never matches sibling websites)
  const findExactWebsiteForRequest = (req: PaymentRequest): SubscribedWebsite | undefined => {
    if (!isWebsitePaymentService(req.serviceType)) return undefined;
    const cleanId = (req.serviceId || '').trim().toLowerCase();
    if (!cleanId) return undefined;
    const site = subscribedWebsites.find((w) => w.id.trim().toLowerCase() === cleanId);
    if (!site) return undefined;
    if (site.userId && req.userId && site.userId !== req.userId) return undefined;
    return site;
  };

  const doesRequestNeedPublishRecovery = (req: PaymentRequest): boolean => {
    if (req.status !== 'approved' || !isWebsitePaymentService(req.serviceType)) return false;
    const exactSite = findExactWebsiteForRequest(req);
    if (!exactSite) return true;
    if (
      exactSite.subscriptionStatus === 'suspended' ||
      exactSite.subscriptionStatus === 'cancelled'
    ) {
      return false;
    }
    return !isWebsiteTrulyLive(exactSite);
  };

  const pendingPaymentsCount = useMemo(
    () => paymentRequests.filter((p) => p.status === 'pending').length,
    [paymentRequests]
  );
  const needsPublishCount = useMemo(
    () => paymentRequests.filter((p) => doesRequestNeedPublishRecovery(p)).length,
    [paymentRequests, subscribedWebsites]
  );
  const approvedPaymentsCount = useMemo(
    () => paymentRequests.filter((p) => p.status === 'approved').length,
    [paymentRequests]
  );
  const rejectedPaymentsCount = useMemo(
    () => paymentRequests.filter((p) => p.status === 'rejected').length,
    [paymentRequests]
  );

  const filteredPaymentRequests = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    return paymentRequests.filter((req) => {
      if (paymentFilter === 'pending' && req.status !== 'pending') return false;
      if (paymentFilter === 'approved' && req.status !== 'approved') return false;
      if (paymentFilter === 'rejected' && req.status !== 'rejected') return false;
      if (paymentFilter === 'needs_publish' && !doesRequestNeedPublishRecovery(req)) return false;

      if (!q) return true;
      const exactSite = findExactWebsiteForRequest(req);
      const trx = (req.transactionId || '').toLowerCase();
      const bankRef = (req.bankReference || '').toLowerCase();
      const sender = (req.senderNumber || '').toLowerCase();
      const custName = (req.customerName || '').toLowerCase();
      const custPhone = (req.customerPhone || '').toLowerCase();
      const serviceName = (req.serviceName || '').toLowerCase();
      const subdomain = (exactSite?.subdomain || '').toLowerCase();
      const fullDomain = (exactSite?.fullDomainUrl || '').toLowerCase();
      const bizName = (exactSite?.businessName || '').toLowerCase();

      return (
        trx.includes(q) ||
        bankRef.includes(q) ||
        sender.includes(q) ||
        custName.includes(q) ||
        custPhone.includes(q) ||
        serviceName.includes(q) ||
        subdomain.includes(q) ||
        fullDomain.includes(q) ||
        bizName.includes(q)
      );
    });
  }, [paymentRequests, paymentFilter, paymentSearch, subscribedWebsites]);

  const handleCopyValue = (val: string, tokenKey: string, label: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedToken(tokenKey);
    showToast(`${label} copied`, 'info');
    window.setTimeout(() => {
      setCopiedToken((prev) => (prev === tokenKey ? null : prev));
    }, 1800);
  };

  const handleConfirmApproveOrRetry = async () => {
    if (!approvalModalTarget) return;
    const { request, mode } = approvalModalTarget;
    if (inFlightPaymentIdsRef.current.has(request.id)) return;

    inFlightPaymentIdsRef.current.add(request.id);
    setProcessingPaymentIds((prev) => ({
      ...prev,
      [request.id]: mode === 'retry_publish' ? 'publishing' : 'approving',
    }));

    try {
      let res: ApproveAndPublishResult;
      if (mode === 'retry_publish') {
        res = await adminRetryPublishForPayment(request.id);
      } else {
        const cleanNote = approvalNotes.trim() || undefined;
        res = await adminApproveAndPublishPayment(request.id, cleanNote);
      }

      if (res.success) {
        setWorkflowFeedback({
          requestId: request.id,
          tone: res.suspendedHold ? 'warning' : 'success',
          title: res.isWebsiteService
            ? res.websitePublished
              ? 'Payment Approved & Website Published Live'
              : 'Payment Approved (Suspended Hold)'
            : 'Payment Approved & Plan Activated',
          detail: res.message,
        });
        setApprovalModalTarget(null);
        setApprovalNotes('');
      } else if (res.partialFailure) {
        setWorkflowFeedback({
          requestId: request.id,
          tone: 'warning',
          title: 'Payment Approved — Website Publishing Needs Retry',
          detail: res.message,
          canRetryPublish: true,
        });
        setApprovalModalTarget(null);
        setApprovalNotes('');
      } else {
        setWorkflowFeedback({
          requestId: request.id,
          tone: 'error',
          title: mode === 'retry_publish' ? 'Website Publish Failed' : 'Approval Failed',
          detail: res.message,
          canRetryPublish: res.paymentApproved && res.isWebsiteService,
        });
      }
    } finally {
      inFlightPaymentIdsRef.current.delete(request.id);
      setProcessingPaymentIds((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    }
  };

  const rejectionTargetRequest = useMemo(
    () => (rejectionModalId ? paymentRequests.find((r) => r.id === rejectionModalId) || null : null),
    [rejectionModalId, paymentRequests]
  );

  const handleConfirmReject = async () => {
    if (!rejectionModalId) return;
    const cleanReason = rejectionReason.trim();
    if (!cleanReason) {
      setRejectionError('Please enter a clear rejection reason for the merchant.');
      return;
    }
    if (inFlightPaymentIdsRef.current.has(rejectionModalId)) return;

    inFlightPaymentIdsRef.current.add(rejectionModalId);
    setProcessingPaymentIds((prev) => ({ ...prev, [rejectionModalId]: 'rejecting' }));
    setRejectionError(null);

    try {
      const res = await adminRejectPayment(rejectionModalId, cleanReason);
      if (res.success) {
        setWorkflowFeedback({
          requestId: rejectionModalId,
          tone: 'warning',
          title: 'Payment Request Rejected',
          detail: `Reason recorded: "${cleanReason}"`,
        });
        setRejectionModalId(null);
        setRejectionReason('');
      } else {
        setRejectionError(res.message || 'Failed to reject payment request.');
      }
    } finally {
      inFlightPaymentIdsRef.current.delete(rejectionModalId);
      setProcessingPaymentIds((prev) => {
        const next = { ...prev };
        delete next[rejectionModalId];
        return next;
      });
    }
  };

  const isAuthorizedAdmin =
    role === 'admin' && (!isSupabaseConfigured || user?.role === 'admin');

  if (!isAuthorizedAdmin) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2 max-w-lg mx-auto">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-base font-bold text-white">Administrator Access Required</h2>
        <p className="text-xs text-slate-400">
          Only verified platform administrators can review manual payments or publish merchant websites.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Admin Payment &amp; Publishing Console
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Verify bKash, Nagad, and Bank Transfer payments and publish eligible merchant websites live.
          </p>
        </div>

        <button
          type="button"
          disabled={isPaymentsLoading || isWebsitesLoading}
          onClick={() => {
            void refreshPaymentRequests();
            void refreshSubscribedWebsites();
            showToast('Refreshed payment queue and website statuses.', 'info');
          }}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
        >
          <RefreshCw
            className={`w-4 h-4 text-emerald-400 ${
              isPaymentsLoading || isWebsitesLoading ? 'animate-spin' : ''
            }`}
          />
          <span>Sync Queue</span>
        </button>
      </div>

      {/* 4 Compact Platform Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium block">Pending Verifications</span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {pendingPaymentsCount}
          </p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            {needsPublishCount > 0 ? `${needsPublishCount} awaiting publish` : 'Ready for review'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium block">Paying Subscriptions</span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold text-blue-400 font-mono tabular-nums">
            {platformStats.activeSubscribers}
          </p>
          <span className="text-[11px] text-slate-500 mt-0.5 block tabular-nums">
            {liveWebsitesCount} live on .amaas.xyz
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium block">Monthly SaaS MRR</span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            ৳{platformStats.monthlyRecurringRevenue.toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Verified active plans</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 font-medium block">Registered Stores</span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold text-white font-mono tabular-nums">
            {platformStats.totalTenants}
          </p>
          <span className="text-[11px] text-slate-500 mt-0.5 block tabular-nums">
            {subscribedWebsites.length} total websites
          </span>
        </div>
      </div>

      {/* Scrollable Mobile-Friendly Admin Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 text-xs font-semibold overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveAdminTab('payments')}
          className={`min-h-[44px] px-3.5 py-2 rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeAdminTab === 'payments'
              ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="tabular-nums">Payments ({pendingPaymentsCount} Pending)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('websiteSubscriptions')}
          className={`min-h-[44px] px-3.5 py-2 rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeAdminTab === 'websiteSubscriptions'
              ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="tabular-nums">Websites ({subscribedWebsites.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('gateways')}
          className={`min-h-[44px] px-3.5 py-2 rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeAdminTab === 'gateways'
              ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Payment Gateways</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('tenants')}
          className={`min-h-[44px] px-3.5 py-2 rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeAdminTab === 'tenants'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store className="w-3.5 h-3.5 shrink-0" />
          <span>Tenant Stores</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('requests')}
          className={`min-h-[44px] px-3.5 py-2 rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            activeAdminTab === 'requests'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5 shrink-0" />
          <span className="tabular-nums">Custom Requests ({websiteRequests.length})</span>
        </button>
      </div>

      {/* TAB: Manual Payments Queue (Android Mobile Cards + Desktop Table) */}
      {activeAdminTab === 'payments' && (
        <div className="space-y-4">
          {/* Workflow Outcome Feedback Banner */}
          {workflowFeedback && (
            <div
              role="status"
              className={`p-4 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                workflowFeedback.tone === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                  : workflowFeedback.tone === 'warning'
                  ? 'bg-amber-950/60 border-amber-800 text-amber-200'
                  : 'bg-rose-950/60 border-rose-800 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {workflowFeedback.tone === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : workflowFeedback.tone === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="font-bold text-white block">{workflowFeedback.title}</strong>
                  <p className="text-[11px] mt-0.5 leading-relaxed">{workflowFeedback.detail}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {workflowFeedback.canRetryPublish && (() => {
                  const failedReq = paymentRequests.find((r) => r.id === workflowFeedback.requestId);
                  if (!failedReq) return null;
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setApprovalModalTarget({
                          request: failedReq,
                          mode: 'retry_publish',
                        })
                      }
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Retry Publish
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => setWorkflowFeedback(null)}
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg hover:bg-slate-800/70 text-slate-300 cursor-pointer"
                  aria-label="Dismiss message"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Search & Status Filter Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Transaction ID / Sender / Subdomain Search */}
            <div className="relative w-full lg:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                placeholder="Search Transaction ID, sender phone, client, or subdomain..."
                aria-label="Search payment requests by Transaction ID"
                className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-hidden text-white text-xs placeholder:text-slate-500"
              />
              {paymentSearch && (
                <button
                  type="button"
                  onClick={() => setPaymentSearch('')}
                  className="min-h-[40px] min-w-[40px] absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 -mx-3 px-3 sm:mx-0 sm:px-0 text-xs">
              {(
                [
                  { id: 'pending', label: `Pending (${pendingPaymentsCount})` },
                  ...(needsPublishCount > 0
                    ? [{ id: 'needs_publish', label: `Needs Publish (${needsPublishCount})` }]
                    : []),
                  { id: 'approved', label: `Approved (${approvedPaymentsCount})` },
                  { id: 'rejected', label: `Rejected (${rejectedPaymentsCount})` },
                  { id: 'all', label: `All (${paymentRequests.length})` },
                ] as { id: typeof paymentFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPaymentFilter(tab.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    paymentFilter === tab.id
                      ? tab.id === 'needs_publish'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-emerald-600 text-white font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {filteredPaymentRequests.length === 0 ? (
            <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
              <CreditCard className="w-7 h-7 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-white">
                {paymentSearch.trim()
                  ? `No payment requests match "${paymentSearch.trim()}"`
                  : `No ${paymentFilter.replace('_', ' ')} payment requests`}
              </p>
              <p className="text-xs text-slate-400">
                {paymentSearch.trim()
                  ? 'Clear your search or switch status tabs to inspect all submissions.'
                  : 'Incoming bKash, Nagad, and Bank Transfer submissions appear here automatically.'}
              </p>
            </div>
          ) : (
            <>
              {/* =============================================================== */}
              {/* ANDROID / MOBILE CARD QUEUE (< 1024px)                          */}
              {/* =============================================================== */}
              <div className="lg:hidden space-y-3">
                {filteredPaymentRequests.map((req) => {
                  const exactSite = findExactWebsiteForRequest(req);
                  const isWebsiteReq = isWebsitePaymentService(req.serviceType);
                  const siteTrulyLive = isWebsiteTrulyLive(exactSite);
                  const needsPublish = doesRequestNeedPublishRecovery(req);
                  const activeStep = processingPaymentIds[req.id];
                  const isRowBusy = Boolean(activeStep);
                  const displayTrx = req.transactionId || req.bankReference || '—';

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5 shadow-sm"
                    >
                      {/* Top Row: Method + Exact Amount + Submission Timestamp */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                                req.paymentMethod === 'bKash'
                                  ? 'bg-pink-950/80 text-pink-300 border border-pink-800/70'
                                  : req.paymentMethod === 'Nagad'
                                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/70'
                                  : 'bg-blue-950/80 text-blue-300 border border-blue-800/70'
                              }`}
                            >
                              {req.paymentMethod}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {new Date(req.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-white">
                            {exactSite ? exactSite.businessName : req.serviceName}
                          </div>
                          {isWebsiteReq ? (
                            <div className="text-xs font-mono text-blue-400 flex items-center gap-1.5 break-all">
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {exactSite
                                  ? exactSite.fullDomainUrl
                                  : `Website ID: ${req.serviceId}`}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">{req.planTier}</div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                            Amount
                          </span>
                          <span className="text-xl font-black font-mono text-emerald-400 tabular-nums">
                            ৳{req.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Transaction ID & Sender Phone Strip (One-Tap Copy for Android Verification) */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">
                              Transaction ID
                            </span>
                            <span className="font-mono font-bold text-sm text-white break-all">
                              {displayTrx}
                            </span>
                          </div>
                          {displayTrx !== '—' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyValue(displayTrx, `trx-${req.id}`, 'Transaction ID')
                              }
                              className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                            >
                              {copiedToken === `trx-${req.id}` ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedToken === `trx-${req.id}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">
                              Sender Number
                            </span>
                            <span className="font-mono text-xs text-slate-200 tabular-nums">
                              {req.senderNumber || 'Not provided'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">
                              Client &amp; Phone
                            </span>
                            <span className="text-xs font-semibold text-white block truncate">
                              {req.customerName}
                            </span>
                            <a
                              href={`tel:${req.customerPhone}`}
                              className="font-mono text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 tabular-nums"
                            >
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{req.customerPhone}</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Separate Payment Status & Website Publishing Status */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {/* 1. Payment Status */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold ${
                            activeStep === 'approving'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : req.status === 'approved'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : req.status === 'rejected'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {activeStep === 'approving' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : req.status === 'approved' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : req.status === 'rejected' ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>
                            {activeStep === 'approving'
                              ? 'Approving Payment...'
                              : req.status === 'approved'
                              ? 'Payment Approved'
                              : req.status === 'rejected'
                              ? 'Payment Rejected'
                              : 'Pending Verification'}
                          </span>
                        </span>

                        {/* 2. Separate Website Publishing Status */}
                        {isWebsiteReq && (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold ${
                              activeStep === 'publishing'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : siteTrulyLive
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : needsPublish
                                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                : exactSite?.subscriptionStatus === 'suspended'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <Globe className="w-3 h-3" />
                            <span>
                              {activeStep === 'publishing'
                                ? 'Publishing Website...'
                                : siteTrulyLive
                                ? 'Website Live'
                                : needsPublish
                                ? 'Not Published — Retry Needed'
                                : exactSite?.subscriptionStatus === 'suspended'
                                ? 'Suspended Hold'
                                : req.status === 'pending'
                                ? 'Publishes on Approval'
                                : 'Offline'}
                            </span>
                          </span>
                        )}
                      </div>

                      {req.adminNotes && (
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                          <strong className="text-slate-400">
                            {req.status === 'rejected' ? 'Rejection Reason:' : 'Admin Note:'}
                          </strong>{' '}
                          {req.adminNotes}
                        </div>
                      )}

                      {/* Thumb-Friendly Mobile Action Buttons */}
                      {req.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => {
                              setApprovalNotes('');
                              setApprovalModalTarget({
                                request: req,
                                mode: 'approve_and_publish',
                              });
                            }}
                            className="min-h-[48px] px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {isRowBusy && activeStep !== 'rejecting' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                            )}
                            <span>{isWebsiteReq ? 'Approve & Publish' : 'Approve Plan'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => {
                              setRejectionError(null);
                              setRejectionReason('');
                              setRejectionModalId(req.id);
                            }}
                            className="min-h-[48px] px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-800 disabled:opacity-50 text-rose-300 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {activeStep === 'rejecting' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4 shrink-0" />
                            )}
                            <span>Reject</span>
                          </button>
                        </div>
                      )}

                      {needsPublish && (
                        <div className="pt-1">
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => {
                              setApprovalNotes('');
                              setApprovalModalTarget({
                                request: req,
                                mode: 'retry_publish',
                              });
                            }}
                            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {isRowBusy ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Globe className="w-4 h-4 shrink-0" />
                            )}
                            <span>Retry Website Publish</span>
                          </button>
                        </div>
                      )}

                      {siteTrulyLive && exactSite && (
                        <div className="pt-1">
                          <a
                            href={`/sites/${exactSite.subdomain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-emerald-300 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View Live Site ({exactSite.fullDomainUrl})</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* =============================================================== */}
              {/* DESKTOP HIGH-DENSITY VERIFICATION TABLE (>= 1024px)             */}
              {/* =============================================================== */}
              <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-4">Client &amp; Phone</th>
                        <th className="p-4">Website / Subdomain</th>
                        <th className="p-4 text-right">Amount</th>
                        <th className="p-4">Method, Sender &amp; TrxID</th>
                        <th className="p-4">Payment &amp; Publish Status</th>
                        <th className="p-4">Submitted</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {filteredPaymentRequests.map((req) => {
                        const exactSite = findExactWebsiteForRequest(req);
                        const isWebsiteReq = isWebsitePaymentService(req.serviceType);
                        const siteTrulyLive = isWebsiteTrulyLive(exactSite);
                        const needsPublish = doesRequestNeedPublishRecovery(req);
                        const activeStep = processingPaymentIds[req.id];
                        const isRowBusy = Boolean(activeStep);
                        const displayTrx = req.transactionId || req.bankReference || '—';

                        return (
                          <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-4 align-top">
                              <span className="font-bold text-white block">{req.customerName}</span>
                              <span className="text-[11px] text-slate-300 font-mono tabular-nums block mt-0.5">
                                {req.customerPhone}
                              </span>
                              <span className="text-[10px] text-slate-500 block">{req.customerEmail}</span>
                            </td>

                            <td className="p-4 align-top">
                              <span className="font-semibold text-white block">
                                {exactSite ? exactSite.businessName : req.serviceName}
                              </span>
                              {isWebsiteReq ? (
                                exactSite ? (
                                  <div className="mt-0.5 space-y-0.5">
                                    <span className="font-mono text-[11px] text-blue-400 block">
                                      {exactSite.fullDomainUrl}
                                    </span>
                                    {siteTrulyLive && (
                                      <a
                                        href={`/sites/${exactSite.subdomain}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline font-semibold"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Open Live</span>
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] font-mono text-rose-400 block mt-0.5">
                                    ID: {req.serviceId}
                                  </span>
                                )
                              ) : (
                                <span className="text-[11px] text-slate-400">{req.planTier}</span>
                              )}
                            </td>

                            <td className="p-4 align-top text-right font-mono font-bold text-sm text-emerald-400 tabular-nums whitespace-nowrap">
                              ৳{req.amount.toLocaleString()}
                            </td>

                            <td className="p-4 align-top">
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-white mb-1">
                                {req.paymentMethod}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-white font-bold">
                                  {displayTrx}
                                </span>
                                {displayTrx !== '—' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyValue(displayTrx, `trx-${req.id}`, 'Transaction ID')
                                    }
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                                    title="Copy Transaction ID"
                                  >
                                    {copiedToken === `trx-${req.id}` ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono tabular-nums block mt-0.5">
                                Sender: {req.senderNumber || '—'}
                              </span>
                            </td>

                            <td className="p-4 align-top space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    req.status === 'approved'
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : req.status === 'rejected'
                                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {req.status === 'approved'
                                    ? 'Payment Approved'
                                    : req.status === 'rejected'
                                    ? 'Rejected'
                                    : 'Pending Verification'}
                                </span>

                                {isWebsiteReq && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                      siteTrulyLive
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : needsPublish
                                        ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                        : exactSite?.subscriptionStatus === 'suspended'
                                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    {siteTrulyLive
                                      ? 'Live'
                                      : needsPublish
                                      ? 'Needs Publish'
                                      : exactSite?.subscriptionStatus === 'suspended'
                                      ? 'Suspended Hold'
                                      : 'Draft'}
                                  </span>
                                )}
                              </div>
                              {req.adminNotes && (
                                <p className="text-[11px] text-slate-400 max-w-xs leading-snug">
                                  {req.adminNotes}
                                </p>
                              )}
                            </td>

                            <td className="p-4 align-top text-slate-400 text-[11px] font-mono tabular-nums whitespace-nowrap">
                              <span className="block">{new Date(req.createdAt).toLocaleDateString()}</span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(req.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>

                            <td className="p-4 align-top text-right">
                              {req.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={isRowBusy}
                                    onClick={() => {
                                      setApprovalNotes('');
                                      setApprovalModalTarget({
                                        request: req,
                                        mode: 'approve_and_publish',
                                      });
                                    }}
                                    className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    {isRowBusy && activeStep !== 'rejecting' && (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    )}
                                    <span>{isWebsiteReq ? 'Approve & Publish' : 'Approve'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isRowBusy}
                                    onClick={() => {
                                      setRejectionError(null);
                                      setRejectionReason('');
                                      setRejectionModalId(req.id);
                                    }}
                                    className="min-h-[40px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 disabled:opacity-50 text-slate-300 hover:text-rose-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : needsPublish ? (
                                <button
                                  type="button"
                                  disabled={isRowBusy}
                                  onClick={() => {
                                    setApprovalNotes('');
                                    setApprovalModalTarget({
                                      request: req,
                                      mode: 'retry_publish',
                                    });
                                  }}
                                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  {isRowBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  <span>Retry Publish</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                                  {req.reviewedAt
                                    ? new Date(req.reviewedAt).toLocaleDateString()
                                    : 'Settled'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: Gateway Accounts & WhatsApp Configuration */}
      {activeAdminTab === 'gateways' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Payment Gateways & Contact Configuration</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure receiving numbers and bank details displayed to customers during manual checkout, then save each gateway atomically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paymentGatewayConfigs.map((gw) => {
              const draft = gatewayDrafts[gw.id] || gw;
              const isDirty =
                Boolean(draft.isEnabled) !== Boolean(gw.isEnabled) ||
                (draft.accountNumber ?? '') !== (gw.accountNumber ?? '') ||
                (draft.accountName ?? '') !== (gw.accountName ?? '') ||
                (draft.bankName ?? '') !== (gw.bankName ?? '') ||
                (draft.branchName ?? '') !== (gw.branchName ?? '') ||
                (draft.routingNumber ?? '') !== (gw.routingNumber ?? '') ||
                (draft.instructions ?? '') !== (gw.instructions ?? '');
              const isSaving = savingGatewayId === gw.id;

              const handleSaveGateway = async () => {
                if (savingGatewayId) return;
                if (draft.isEnabled && gw.id !== 'whatsapp_support' && !(draft.accountNumber || '').trim()) {
                  showToast('Please enter a receiving account number before saving an enabled gateway.', 'warning');
                  return;
                }
                setSavingGatewayId(gw.id);
                try {
                  await updatePaymentGatewayConfig(gw.id, {
                    displayName: draft.displayName,
                    isEnabled: draft.isEnabled,
                    accountNumber: (draft.accountNumber ?? '').trim(),
                    accountName: (draft.accountName ?? '').trim(),
                    bankName: (draft.bankName ?? '').trim(),
                    branchName: (draft.branchName ?? '').trim(),
                    routingNumber: (draft.routingNumber ?? '').trim(),
                    instructions: (draft.instructions ?? '').trim(),
                  });
                } finally {
                  setSavingGatewayId(null);
                }
              };

              return (
                <div key={gw.id} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm">{gw.displayName}</span>
                    <button
                      type="button"
                      onClick={() => updateGatewayDraft(gw.id, { isEnabled: !draft.isEnabled })}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                        draft.isEnabled
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {draft.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                        Account / WhatsApp Number
                      </label>
                      <input
                        type="text"
                        value={draft.accountNumber ?? ''}
                        onChange={(e) => updateGatewayDraft(gw.id, { accountNumber: e.target.value })}
                        placeholder={gw.id === 'whatsapp_support' ? '+8801XXXXXXXXX' : 'Enter receiving number'}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                      />
                    </div>

                    {gw.id !== 'whatsapp_support' && (
                      <div>
                        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                          Account Holder / Merchant Name
                        </label>
                        <input
                          type="text"
                          value={draft.accountName ?? ''}
                          onChange={(e) => updateGatewayDraft(gw.id, { accountName: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                        />
                      </div>
                    )}

                    {gw.id === 'bank_transfer' && (
                      <>
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Bank Name</label>
                          <input
                            type="text"
                            value={draft.bankName ?? ''}
                            onChange={(e) => updateGatewayDraft(gw.id, { bankName: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Branch Name</label>
                            <input
                              type="text"
                              value={draft.branchName ?? ''}
                              onChange={(e) => updateGatewayDraft(gw.id, { branchName: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Routing Number</label>
                            <input
                              type="text"
                              value={draft.routingNumber ?? ''}
                              onChange={(e) => updateGatewayDraft(gw.id, { routingNumber: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                        Customer Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={draft.instructions ?? ''}
                        onChange={(e) => updateGatewayDraft(gw.id, { instructions: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white leading-relaxed"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800/70">
                      <span className="text-[11px] text-slate-400">
                        {isDirty ? 'Unsaved changes' : 'Synced with gateway config'}
                      </span>
                      <button
                        type="button"
                        disabled={isSaving || !isDirty}
                        onClick={() => void handleSaveGateway()}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save Gateway Settings</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm Approve & Publish / Retry Publish Modal */}
      {approvalModalTarget && (() => {
        const req = approvalModalTarget.request;
        const isRetry = approvalModalTarget.mode === 'retry_publish';
        const isWeb = isWebsitePaymentService(req.serviceType);
        const exactSite = findExactWebsiteForRequest(req);
        const isBusy = Boolean(processingPaymentIds[req.id]);

        return (
          <Modal
            isOpen={!!approvalModalTarget}
            onClose={() => {
              if (!isBusy) {
                setApprovalModalTarget(null);
                setApprovalNotes('');
              }
            }}
            title={
              isRetry
                ? 'Confirm Website Publishing Retry'
                : isWeb
                ? 'Confirm Payment Approval & Website Publishing'
                : 'Confirm Manual Payment Approval'
            }
            description={
              isRetry
                ? 'This payment request is already approved. Confirming will publish ONLY the exact associated website without re-charging or extending billing again.'
                : 'Verify that the Transaction ID, sender phone number, and exact BDT amount match your statement before confirming.'
            }
            maxWidth="md"
          >
            <div className="space-y-4 text-xs text-slate-800 dark:text-slate-200">
              {/* Verification Summary Card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Exact Verified Amount</span>
                  <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ৳{req.amount.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Payment Method</span>
                  <span className="font-bold text-slate-900 dark:text-white">{req.paymentMethod}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Transaction ID</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                    {req.transactionId || req.bankReference || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Sender Phone</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    {req.senderNumber || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Client</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-right">
                    {req.customerName} ({req.customerPhone})
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">
                    {isWeb ? 'Target Website' : 'Target Plan'}
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {exactSite ? exactSite.businessName : req.serviceName}
                    </span>
                    {isWeb && (
                      <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 block">
                        {exactSite ? `https://${exactSite.fullDomainUrl}` : `ID: ${req.serviceId}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isWeb && !exactSite && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Warning: The target website record could not be matched locally. The server will verify exact ownership before approving.
                  </span>
                </div>
              )}

              {!isRetry && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Verification Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="e.g. Verified in bKash statement"
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (!isBusy) {
                      setApprovalModalTarget(null);
                      setApprovalNotes('');
                    }
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleConfirmApproveOrRetry()}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>
                    {isRetry
                      ? 'Confirm & Publish Website'
                      : isWeb
                      ? 'Confirm Approve & Publish'
                      : 'Confirm Payment Approval'}
                  </span>
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Confirm Reject Payment Request Modal */}
      <Modal
        isOpen={!!rejectionModalId}
        onClose={() => {
          if (rejectionModalId && !processingPaymentIds[rejectionModalId]) {
            setRejectionModalId(null);
            setRejectionError(null);
          }
        }}
        title="Confirm Payment Rejection"
        description="Enter the reason why this payment could not be verified. The merchant will see this reason on their dashboard so they can resubmit accurately."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-800 dark:text-slate-200">
          {rejectionTargetRequest && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  {rejectionTargetRequest.customerName} · {rejectionTargetRequest.paymentMethod}
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  TrxID: {rejectionTargetRequest.transactionId || rejectionTargetRequest.bankReference || '—'}
                </span>
              </div>
              <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                ৳{rejectionTargetRequest.amount.toLocaleString()}
              </span>
            </div>
          )}

          {/* Quick-Fill Reason Chips for Fast Mobile Entry */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
              Quick Reasons:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REJECTION_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRejectionReason(preset);
                    setRejectionError(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-rose-400 text-[11px] text-slate-700 dark:text-slate-200 text-left cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Rejection Reason *
            </label>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value);
                if (rejectionError) setRejectionError(null);
              }}
              placeholder="Explain why this payment request is being rejected..."
              className="w-full px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
            />
            {rejectionError && (
              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1 block">
                {rejectionError}
              </span>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={Boolean(rejectionModalId && processingPaymentIds[rejectionModalId])}
              onClick={() => {
                if (rejectionModalId && !processingPaymentIds[rejectionModalId]) {
                  setRejectionModalId(null);
                  setRejectionError(null);
                }
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                !rejectionReason.trim() ||
                Boolean(rejectionModalId && processingPaymentIds[rejectionModalId])
              }
              onClick={() => void handleConfirmReject()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {rejectionModalId && processingPaymentIds[rejectionModalId] && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>Confirm Rejection</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* TAB 0: Website Subscriptions Management (Lite ৳600/month Plan) */}
      {activeAdminTab === 'websiteSubscriptions' && (
        <div className="space-y-6">
          {/* Top Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-72 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={websiteSearch}
                  onChange={(e) => setWebsiteSearch(e.target.value)}
                  placeholder="Filter by business, owner, subdomain..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-hidden text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPlanPrice(websiteSubscriptionPlan.priceMonthly);
                  setPlanGraceDays(websiteSubscriptionPlan.limits.gracePeriodDays);
                  setPlanMaxPages(websiteSubscriptionPlan.limits.maxPages);
                  setPlanMaxStorage(websiteSubscriptionPlan.limits.maxStorageMb);
                  setPlanMaxBandwidth(websiteSubscriptionPlan.limits.maxBandwidthGb);
                  setPlanMaxUpdates(websiteSubscriptionPlan.limits.monthlyUpdateRequests);
                  setPlanIsVisible(websiteSubscriptionPlan.isVisible);
                  setIsPlanSettingsModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Plan Settings & Rules (No Code)</span>
              </button>
            </div>
          </div>

          {/* 4 Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Subscribed Websites</span>
              <p className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
                {subscribedWebsites.length}
              </p>
              <span className="text-[11px] text-blue-400 mt-0.5 block">{websiteSubscriptionPlan.name}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Active & Live</span>
              <p className="mt-1 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {liveWebsitesCount}
              </p>
              <span className="text-[11px] text-emerald-400 mt-0.5 block">Paid & published live</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">In Grace Period</span>
              <p className="mt-1 text-2xl font-bold text-amber-400 font-mono tabular-nums">
                {subscribedWebsites.filter((s) => s.subscriptionStatus === 'grace_period').length}
              </p>
              <span className="text-[11px] text-amber-400 mt-0.5 block">Data preserved safely</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Subscription MRR</span>
              <p className="mt-1 text-2xl font-bold text-blue-400 font-mono tabular-nums">
                ৳{platformStats.monthlyRecurringRevenue.toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Verified paid subscriptions</span>
            </div>
          </div>

          {/* Subscribed Websites Management Table */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Business & Owner</th>
                  <th className="py-3 px-4">Assigned Subdomain</th>
                  <th className="py-3 px-4">Niche & Template</th>
                  <th className="py-3 px-4">Subscription</th>
                  <th className="py-3 px-4">Hosting Status</th>
                  <th className="py-3 px-4">Resource Limits</th>
                  <th className="py-3 px-4">Next Billing</th>
                  <th className="py-3 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {subscribedWebsites
                  .filter(
                    (s) =>
                      s.businessName.toLowerCase().includes(websiteSearch.toLowerCase()) ||
                      s.ownerName.toLowerCase().includes(websiteSearch.toLowerCase()) ||
                      s.subdomain.toLowerCase().includes(websiteSearch.toLowerCase())
                  )
                  .map((site) => {
                    const isGrace = site.subscriptionStatus === 'grace_period';
                    const isSuspended = site.subscriptionStatus === 'suspended';
                    const isCancelledOrDraft =
                      site.subscriptionStatus === 'cancelled' || site.subscriptionStatus === 'draft';
                    const hasPaymentHistory = paymentRequests.some(
                      (r) =>
                        (r.serviceType === 'website_subscription' || r.serviceType === 'website_package') &&
                        r.serviceId === site.id
                    );

                    return (
                      <tr key={site.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-white block">{site.businessName}</span>
                          <span className="text-[11px] text-slate-400">
                            {site.ownerName} • {site.phone}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400 font-bold">{site.fullDomainUrl}</span>
                            <button
                              onClick={() => setPreviewingWebsite(site)}
                              className="text-slate-400 hover:text-white cursor-pointer"
                              title="Preview website"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {site.customDomain && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              Custom: {site.customDomain}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          <span className="font-medium block capitalize">{site.nicheLabel}</span>
                          <span className="text-[11px] text-slate-400">{site.templateName}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              site.subscriptionStatus === 'active'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : isGrace
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : isCancelledOrDraft
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {site.subscriptionStatus.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          {(() => {
                            const hasPendingReq = paymentRequests.some(
                              (r) =>
                                r.serviceType === 'website_subscription' &&
                                r.serviceId === site.id &&
                                r.status === 'pending'
                            );
                            const diagnostic =
                              site.deploymentStatus === 'live' &&
                              site.paymentStatus === 'paid' &&
                              site.subscriptionStatus === 'active'
                                ? { label: 'Live on *.amaas.xyz', tone: 'text-emerald-400' }
                                : site.deploymentStatus === 'live' &&
                                  site.paymentStatus === 'paid' &&
                                  isGrace
                                ? { label: 'Live (7-Day Grace Window)', tone: 'text-amber-400' }
                                : isSuspended
                                ? { label: 'Offline: Suspended by Admin', tone: 'text-rose-400' }
                                : site.subscriptionStatus === 'cancelled'
                                ? { label: 'Offline: Cancelled by Merchant', tone: 'text-slate-400' }
                                : hasPendingReq || site.paymentStatus === 'pending_review'
                                ? { label: 'Offline: Pending Payment Review', tone: 'text-amber-400' }
                                : site.paymentStatus === 'failed'
                                ? { label: 'Offline: Payment Rejected', tone: 'text-rose-400' }
                                : site.paymentStatus !== 'paid'
                                ? { label: 'Offline: Awaiting ৳600 Payment', tone: 'text-amber-400' }
                                : { label: 'Offline: Paid — Unpublished', tone: 'text-blue-400' };

                            return (
                              <div className="space-y-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    site.deploymentStatus === 'live'
                                      ? 'bg-blue-950 text-blue-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {site.deploymentStatus.toUpperCase()}
                                </span>
                                <span className={`block text-[10px] font-medium ${diagnostic.tone}`}>
                                  {diagnostic.label}
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          <div>Pages: {site.resourceUsage.pagesCount}/{site.resourceUsage.pagesLimit}</div>
                          <div className="text-slate-400">
                            Storage: {site.resourceUsage.storageUsedMb}MB / {site.resourceUsage.storageLimitMb}MB
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          <div>{site.nextBillingDate}</div>
                          {site.gracePeriodEndsAt && (
                            <span className="text-amber-400 text-[10px] block">
                              Grace ends: {site.gracePeriodEndsAt}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewingWebsite(site)}
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title="Live website preview"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </button>

                            {isSuspended ? (
                              <button
                                disabled={site.paymentStatus !== 'paid'}
                                onClick={() => {
                                  if (site.paymentStatus !== 'paid') return;
                                  setLifecycleReason('');
                                  setLifecycleModal({ site, action: 'reactivate' });
                                }}
                                className="px-2.5 py-1 rounded-md bg-emerald-900/60 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title={
                                  site.paymentStatus === 'paid'
                                    ? 'Reactivate website (requires audit reason)'
                                    : 'Requires an approved payment request before activation'
                                }
                              >
                                <PlayCircle className="w-3 h-3" />
                                <span>Activate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setLifecycleReason('');
                                  setLifecycleModal({ site, action: 'suspend' });
                                }}
                                className="px-2.5 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800 text-amber-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Suspend website (requires audit reason)"
                              >
                                <PauseCircle className="w-3 h-3" />
                                <span>Suspend</span>
                              </button>
                            )}

                            <button
                              disabled={site.paymentStatus !== 'paid'}
                              onClick={() => {
                                if (site.paymentStatus !== 'paid') return;
                                setLifecycleReason('');
                                setLifecycleModal({ site, action: 'renew' });
                              }}
                              className="px-2.5 py-1 rounded-md bg-blue-900/60 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-blue-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title={
                                site.paymentStatus === 'paid'
                                  ? 'Extend verified paid subscription 30 days (requires audit reason)'
                                  : 'Requires an approved payment request before renewal'
                              }
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Renew</span>
                            </button>

                            <button
                              disabled={hasPaymentHistory}
                              onClick={() => {
                                if (hasPaymentHistory) return;
                                setWebsiteToDelete(site);
                              }}
                              className="px-2 py-1 rounded-md bg-rose-950/60 hover:bg-rose-900 disabled:opacity-30 disabled:cursor-not-allowed text-rose-300 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title={
                                hasPaymentHistory
                                  ? 'Cannot delete website with payment history; suspend instead to preserve financial audit records'
                                  : 'Permanently delete unpaid draft website'
                              }
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Immutable Website Lifecycle Audit Trail */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Immutable Website Lifecycle Audit Log</h3>
                  <p className="text-[11px] text-slate-400">
                    Append-only PostgreSQL audit trail of administrative suspend, reactivate, and verified renewal actions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshWebsiteLifecycleAuditLogs()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Audit Log</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Website</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Status Transition</th>
                    <th className="py-2.5 px-4">Verified Payment</th>
                    <th className="py-2.5 px-4">Admin</th>
                    <th className="py-2.5 px-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {websiteLifecycleAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        No lifecycle audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    websiteLifecycleAuditLogs.map((log) => {
                      const matchedSite = subscribedWebsites.find((w) => w.id === log.websiteId);
                      return (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-white block">
                              {matchedSite?.businessName || `${log.websiteId.slice(0, 8)}...`}
                            </span>
                            {matchedSite && (
                              <span className="text-[10px] font-mono text-blue-400">{matchedSite.fullDomainUrl}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                log.action === 'suspend'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : log.action === 'reactivate'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-blue-950 text-blue-300 border border-blue-800'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                            {(log.previousStatus || '—')} → {(log.newStatus || '—')}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {log.verifiedPaymentRequestId
                              ? `${log.verifiedPaymentRequestId.slice(0, 8)}...`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {log.adminId.slice(0, 8)}...
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={log.reason}>
                            {log.reason}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Website Requests Triage Pipeline */}
      {activeAdminTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-72 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                placeholder="Search requests by business or tier..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-hidden text-xs"
              />
            </div>
            <span className="text-xs text-slate-400">
              Change status dropdown directly to advance project pipeline.
            </span>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Business & Client</th>
                  <th className="py-3 px-4">Type / Scope</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4">Admin Status Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white block">{req.businessName}</span>
                      <span className="text-[11px] text-slate-400">
                        {req.contactName} ({req.phone})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="font-medium block">{req.desiredType}</span>
                      <span className="text-[10px] text-slate-500 line-clamp-1">{req.description}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {req.budgetTier}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {req.createdAt}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={req.status}
                        onChange={(e) => updateWebsiteRequestStatus(req.id, e.target.value as any)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border bg-slate-950 focus:outline-hidden ${
                          req.status === 'Completed'
                            ? 'border-emerald-600 text-emerald-400'
                            : req.status === 'In Progress'
                            ? 'border-blue-600 text-blue-400'
                            : req.status === 'Reviewing'
                            ? 'border-amber-600 text-amber-400'
                            : 'border-slate-700 text-slate-300'
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Reviewing">Reviewing</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Tenants Table */}
      {activeAdminTab === 'tenants' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
              <tr>
                <th className="py-3 px-4">Store Brand</th>
                <th className="py-3 px-4">Contact Phone</th>
                <th className="py-3 px-4">Store Category</th>
                <th className="py-3 px-4 text-right">Currency</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No registered merchant tenant stores found.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {s.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {s.phone || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {s.category}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums">
                      {s.currency}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Active
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-[11px] font-mono">
                      {s.createdAt}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Transactions */}
      {activeAdminTab === 'transactions' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Subscription Description</th>
                <th className="py-3 px-4 text-right">Amount (৳)</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No billing transactions recorded yet.
                  </td>
                </tr>
              ) : (
                invoices.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-blue-400 font-bold">{tx.invoiceNumber}</td>
                    <td className="py-3.5 px-4 font-sans text-white font-medium">{tx.planName}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-white tabular-nums">৳{tx.amount.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-slate-300 font-sans">Automated Billing</td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">{tx.date}</td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: Admin Plan Settings & Limits Editor (No-Code Config) */}
      <Modal
        isOpen={isPlanSettingsModalOpen}
        onClose={() => setIsPlanSettingsModalOpen(false)}
        title="Website Subscription Plan Configuration"
        description="Configure pricing, resource limits, renewal grace periods, and visibility without writing code."
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateWebsiteSubscriptionPlanConfig({
              priceMonthly: Number(planPrice),
              isVisible: planIsVisible,
              limits: {
                maxPages: Number(planMaxPages),
                maxStorageMb: Number(planMaxStorage),
                maxBandwidthGb: Number(planMaxBandwidth),
                monthlyUpdateRequests: Number(planMaxUpdates),
                gracePeriodDays: Number(planGraceDays),
              },
            });
            setIsPlanSettingsModalOpen(false);
          }}
          className="space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Monthly Subscription Fee (BDT ৳) *
              </label>
              <input
                type="number"
                min={100}
                required
                value={planPrice}
                onChange={(e) => setPlanPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Standard default: ৳600 / month
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Grace Period Policy (Days) *
              </label>
              <input
                type="number"
                min={1}
                max={30}
                required
                value={planGraceDays}
                onChange={(e) => setPlanGraceDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Site stays live and data preserved during grace window.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Max Pages Limit
              </label>
              <input
                type="number"
                min={1}
                value={planMaxPages}
                onChange={(e) => setPlanMaxPages(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Storage Limit (MB)
              </label>
              <input
                type="number"
                min={100}
                value={planMaxStorage}
                onChange={(e) => setPlanMaxStorage(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bandwidth (GB)
              </label>
              <input
                type="number"
                min={5}
                value={planMaxBandwidth}
                onChange={(e) => setPlanMaxBandwidth(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Monthly Updates
              </label>
              <input
                type="number"
                min={0}
                value={planMaxUpdates}
                onChange={(e) => setPlanMaxUpdates(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planIsVisible}
                onChange={(e) => setPlanIsVisible(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Plan Visible in Public Pricing Page & Store Dashboard
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsPlanSettingsModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Admin Website Live Preview */}
      {previewingWebsite && (
        <Modal
          isOpen={!!previewingWebsite}
          onClose={() => setPreviewingWebsite(null)}
          title={`Website Preview: ${previewingWebsite.businessName}`}
          description={`GoAMAAS Website (৳${previewingWebsite.monthlyFee}/mo) • Subdomain: ${previewingWebsite.fullDomainUrl}${previewingWebsite.customDomain ? ` • Custom Domain: ${previewingWebsite.customDomain}` : ''} • Status: ${previewingWebsite.subscriptionStatus.toUpperCase()}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">
                https://{previewingWebsite.fullDomainUrl}
              </span>
              <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  onClick={() => setAdminPreviewDevice('desktop')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                    adminPreviewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => setAdminPreviewDevice('mobile')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                    adminPreviewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-200/50 dark:bg-slate-950/50 rounded-2xl border border-slate-300 dark:border-slate-800 flex justify-center max-h-[600px] overflow-y-auto">
              <WebsitePreviewRenderer site={previewingWebsite} viewMode={adminPreviewDevice} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewingWebsite(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: Audited Website Lifecycle Action Confirmation */}
      <Modal
        isOpen={!!lifecycleModal}
        onClose={() => {
          setLifecycleModal(null);
          setLifecycleReason('');
        }}
        title={
          lifecycleModal?.action === 'suspend'
            ? 'Suspend Subscribed Website'
            : lifecycleModal?.action === 'reactivate'
            ? 'Reactivate Subscribed Website'
            : 'Renew Verified Website Subscription'
        }
        description={
          lifecycleModal
            ? `${lifecycleModal.site.businessName} (${lifecycleModal.site.fullDomainUrl}) • Action is recorded in the immutable admin lifecycle audit log.`
            : undefined
        }
        maxWidth="md"
      >
        {lifecycleModal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cleanReason = lifecycleReason.trim();
              if (!cleanReason) {
                showToast('Please provide an administrative reason for the audit log.', 'warning');
                return;
              }
              const { site, action } = lifecycleModal;
              setLifecycleModal(null);
              setLifecycleReason('');
              if (action === 'suspend') {
                suspendSubscribedWebsite(site.id, cleanReason);
              } else if (action === 'reactivate') {
                reactivateSubscribedWebsite(site.id, cleanReason);
              } else {
                renewSubscribedWebsite(site.id, cleanReason);
              }
            }}
            className="space-y-4 text-xs"
          >
            <p className="text-slate-400 leading-relaxed">
              Provide a clear administrative reason for this{' '}
              <strong className="text-white uppercase">{lifecycleModal.action}</strong> action. Your administrator ID,
              target website, action, reason, and timestamp will be recorded permanently.
            </p>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Audit Reason *</label>
              <textarea
                rows={3}
                required
                value={lifecycleReason}
                onChange={(e) => setLifecycleReason(e.target.value)}
                placeholder={
                  lifecycleModal.action === 'suspend'
                    ? 'e.g. Policy compliance review or billing hold...'
                    : lifecycleModal.action === 'reactivate'
                    ? 'e.g. Compliance review cleared; verified payment on file...'
                    : 'e.g. Verified 30-day cycle extension against approved payment...'
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setLifecycleModal(null);
                  setLifecycleReason('');
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!lifecycleReason.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
              >
                Confirm & Log Action
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!websiteToDelete}
        onClose={() => setWebsiteToDelete(null)}
        onConfirm={() => {
          if (!websiteToDelete) return;
          const targetId = websiteToDelete.id;
          void adminDeleteSubscribedWebsite(targetId);
        }}
        title="Delete Unpaid Website Record"
        message={
          websiteToDelete
            ? `Are you sure you want to permanently delete "${websiteToDelete.businessName}" (${websiteToDelete.fullDomainUrl})? Websites with payment history cannot be deleted.`
            : ''
        }
        confirmLabel="Delete Website"
        isDestructive
      />
    </div>
  );
};
