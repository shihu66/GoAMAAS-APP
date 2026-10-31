import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAdminSecurity } from '../../components/auth/AdminProtectedRoute';
import { AdminPWAInstallButton } from '../../components/admin/AdminPWAInstallBanner';
import {
  SubscribedWebsite,
  PaymentGatewayConfig,
  PaymentRequest,
  ApproveAndPublishResult,
} from '../../types';
import {
  isWebsitePaymentService,
  isWebsiteTrulyLive,
} from '../../lib/paymentWorkflow';
import {
  AdminSessionAuditEntry,
  getAdminSessionEvents,
  recordAdminSessionEvent,
  revalidateAdminBeforeAction,
  startAdminTotpEnrollment,
  subscribeAdminSessionEvents,
  unenrollAdminTotpFactor,
  verifyAdminTotpChallenge,
} from '../../lib/adminSecurity';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import {
  CreditCard,
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
  KeyRound,
  ArrowRight,
  Lock,
} from 'lucide-react';

type AdminSection = 'overview' | 'payments' | 'websites' | 'customers' | 'gateways' | 'audit';

const QUICK_REJECTION_REASONS = [
  'Transaction ID was not found in our statement.',
  'Transferred amount does not match the payable subscription fee.',
  'Sender phone number could not be matched to the transfer.',
  'Duplicate or unreadable transfer reference submitted.',
];

function resolveSectionFromPathname(pathname: string): AdminSection {
  if (pathname.startsWith('/admin/payments')) return 'payments';
  if (pathname.startsWith('/admin/websites')) return 'websites';
  if (pathname.startsWith('/admin/customers') || pathname.startsWith('/admin/requests')) {
    return 'customers';
  }
  if (pathname.startsWith('/admin/gateways')) return 'gateways';
  if (pathname.startsWith('/admin/audit') || pathname.startsWith('/admin/security')) {
    return 'audit';
  }
  return 'overview';
}

export const AdminDashboardPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = resolveSectionFromPathname(location.pathname);

  const {
    theme,
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

  const { verifiedAdmin, mfa, isOnline, refreshVerification } = useAdminSecurity();

  // Payment Queue Filter & Search
  const [paymentFilter, setPaymentFilter] = useState<
    'pending' | 'needs_publish' | 'approved' | 'rejected' | 'all'
  >('pending');
  const [paymentSearch, setPaymentSearch] = useState('');

  // Customers Sub-View Filter
  const [customerSubTab, setCustomerSubTab] = useState<'stores' | 'requests' | 'invoices'>(
    location.pathname.startsWith('/admin/requests') ? 'requests' : 'stores'
  );
  const [customerSearch, setCustomerSearch] = useState('');

  // Audit Sub-View Filter
  const [auditSubTab, setAuditSubTab] = useState<'payments' | 'lifecycle' | 'session'>('payments');
  const [sessionEvents, setSessionEvents] = useState<AdminSessionAuditEntry[]>(() =>
    getAdminSessionEvents()
  );

  useEffect(() => {
    return subscribeAdminSessionEvents(() => {
      setSessionEvents(getAdminSessionEvents());
    });
  }, []);

  // MFA Enrollment State (in Security & Audit view)
  const [enrollingMfa, setEnrollingMfa] = useState<{
    factorId: string;
    qrCodeSvgDataUri: string;
    secret: string;
  } | null>(null);
  const [mfaEnrollCode, setMfaEnrollCode] = useState('');
  const [mfaActionBusy, setMfaActionBusy] = useState(false);
  const [mfaActionFeedback, setMfaActionFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [factorIdToRemove, setFactorIdToRemove] = useState<string | null>(null);

  // Payment Confirmation Modals
  const [approvalModalTarget, setApprovalModalTarget] = useState<{
    request: PaymentRequest;
    mode: 'approve_and_publish' | 'retry_publish';
  } | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  const [rejectionModalId, setRejectionModalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Concurrency locks & step status
  const inFlightPaymentIdsRef = useRef<Set<string>>(new Set());
  const [processingPaymentIds, setProcessingPaymentIds] = useState<
    Record<string, 'approving' | 'publishing' | 'rejecting'>
  >({});
  const [workflowFeedback, setWorkflowFeedback] = useState<{
    requestId: string;
    tone: 'success' | 'warning' | 'error';
    title: string;
    detail: string;
    canRetryPublish?: boolean;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Websites Search, Preview & Lifecycle State
  const [websiteSearch, setWebsiteSearch] = useState('');
  const [previewingWebsite, setPreviewingWebsite] = useState<SubscribedWebsite | null>(null);
  const [adminPreviewDevice, setAdminPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [lifecycleModal, setLifecycleModal] = useState<{
    site: SubscribedWebsite;
    action: 'suspend' | 'reactivate' | 'renew';
  } | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [isLifecycleSubmitting, setIsLifecycleSubmitting] = useState(false);
  const [websiteToDelete, setWebsiteToDelete] = useState<SubscribedWebsite | null>(null);

  // Plan Settings Modal State
  const [isPlanSettingsModalOpen, setIsPlanSettingsModalOpen] = useState(false);
  const [planPrice, setPlanPrice] = useState(websiteSubscriptionPlan.priceMonthly);
  const [planGraceDays, setPlanGraceDays] = useState(websiteSubscriptionPlan.limits.gracePeriodDays);
  const [planMaxPages, setPlanMaxPages] = useState(websiteSubscriptionPlan.limits.maxPages);
  const [planMaxStorage, setPlanMaxStorage] = useState(websiteSubscriptionPlan.limits.maxStorageMb);
  const [planMaxBandwidth, setPlanMaxBandwidth] = useState(
    websiteSubscriptionPlan.limits.maxBandwidthGb
  );
  const [planMaxUpdates, setPlanMaxUpdates] = useState(
    websiteSubscriptionPlan.limits.monthlyUpdateRequests
  );
  const [planIsVisible, setPlanIsVisible] = useState(websiteSubscriptionPlan.isVisible);

  // Controlled Gateway Drafts
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

  // Exact Website Resolver (strictly matches serviceId + userId; never matches sibling websites)
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

  // Platform Aggregates
  const payingWebsites = useMemo(
    () =>
      subscribedWebsites.filter(
        (s) =>
          s.paymentStatus === 'paid' &&
          (s.subscriptionStatus === 'active' || s.subscriptionStatus === 'grace_period')
      ),
    [subscribedWebsites]
  );

  const liveWebsitesCount = useMemo(
    () =>
      subscribedWebsites.filter(
        (s) =>
          s.paymentStatus === 'paid' &&
          s.subscriptionStatus === 'active' &&
          s.deploymentStatus === 'live'
      ).length,
    [subscribedWebsites]
  );

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

  const monthlyRecurringRevenue = useMemo(
    () => payingWebsites.reduce((sum, s) => sum + s.monthlyFee, 0),
    [payingWebsites]
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

  const urgentOverviewPayments = useMemo(
    () =>
      paymentRequests
        .filter((r) => r.status === 'pending' || doesRequestNeedPublishRecovery(r))
        .slice(0, 6),
    [paymentRequests, subscribedWebsites]
  );

  const filteredWebsites = useMemo(() => {
    const q = websiteSearch.trim().toLowerCase();
    if (!q) return subscribedWebsites;
    return subscribedWebsites.filter(
      (s) =>
        s.businessName.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q) ||
        s.subdomain.toLowerCase().includes(q) ||
        s.fullDomainUrl.toLowerCase().includes(q)
    );
  }, [subscribedWebsites, websiteSearch]);

  const filteredStores = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [stores, customerSearch]);

  const filteredBespokeRequests = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return websiteRequests;
    return websiteRequests.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        r.contactName.toLowerCase().includes(q) ||
        r.budgetTier.toLowerCase().includes(q)
    );
  }, [websiteRequests, customerSearch]);

  const settledPaymentAuditRows = useMemo(
    () => paymentRequests.filter((r) => r.status === 'approved' || r.status === 'rejected'),
    [paymentRequests]
  );

  const handleCopyValue = (val: string, tokenKey: string, label: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedToken(tokenKey);
    showToast(`${label} copied`, 'info');
    window.setTimeout(() => {
      setCopiedToken((prev) => (prev === tokenKey ? null : prev));
    }, 1800);
  };

  const handleSyncAll = async () => {
    if (!isOnline) {
      showToast('Device is offline. Reconnect to sync data.', 'warning');
      return;
    }
    await Promise.all([
      refreshVerification(),
      refreshPaymentRequests(),
      refreshSubscribedWebsites(),
      refreshWebsiteLifecycleAuditLogs(),
    ]);
    showToast('Synchronized live admin queues.', 'info');
  };

  // Sensitive Action 1: Approve & Publish / Retry Publish (with server revalidation)
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
      const recheck = await revalidateAdminBeforeAction({
        action: mode === 'retry_publish' ? 'retry_website_publish' : 'approve_and_publish_payment',
        targetType: 'payment_request',
        targetId: request.id,
      });

      if (!recheck.allowed) {
        const msg = recheck.errorMessage || 'Session verification failed.';
        showToast(msg, 'error');
        await refreshVerification();
        return;
      }

      let res: ApproveAndPublishResult;
      if (mode === 'retry_publish') {
        res = await adminRetryPublishForPayment(request.id);
      } else {
        const cleanNote = approvalNotes.trim() || undefined;
        res = await adminApproveAndPublishPayment(request.id, cleanNote);
      }

      recordAdminSessionEvent({
        adminId: verifiedAdmin.id,
        action: mode === 'retry_publish' ? 'retry_website_publish' : 'approve_payment_request',
        targetType: 'payment_request',
        targetId: request.id,
        outcome: res.success ? 'success' : 'failed',
        summary: res.message,
      });

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

  // Sensitive Action 2: Reject Payment Request (with server revalidation)
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
      const recheck = await revalidateAdminBeforeAction({
        action: 'reject_payment_request',
        targetType: 'payment_request',
        targetId: rejectionModalId,
      });

      if (!recheck.allowed) {
        const msg = recheck.errorMessage || 'Session verification failed.';
        setRejectionError(msg);
        await refreshVerification();
        return;
      }

      const res = await adminRejectPayment(rejectionModalId, cleanReason);
      recordAdminSessionEvent({
        adminId: verifiedAdmin.id,
        action: 'reject_payment_request',
        targetType: 'payment_request',
        targetId: rejectionModalId,
        outcome: res.success ? 'success' : 'failed',
        summary: res.success ? 'Payment request rejected with reason.' : res.message,
      });

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

  // Sensitive Action 3: Website Lifecycle Update (with server revalidation)
  const handleConfirmLifecycleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lifecycleModal || isLifecycleSubmitting) return;
    const cleanReason = lifecycleReason.trim();
    if (!cleanReason) {
      showToast('Please provide an administrative reason for the audit log.', 'warning');
      return;
    }

    setIsLifecycleSubmitting(true);
    try {
      const { site, action } = lifecycleModal;
      const recheck = await revalidateAdminBeforeAction({
        action: `website_${action}`,
        targetType: 'website',
        targetId: site.id,
      });

      if (!recheck.allowed) {
        showToast(recheck.errorMessage || 'Session verification failed.', 'error');
        await refreshVerification();
        return;
      }

      setLifecycleModal(null);
      setLifecycleReason('');

      if (action === 'suspend') {
        suspendSubscribedWebsite(site.id, cleanReason);
      } else if (action === 'reactivate') {
        reactivateSubscribedWebsite(site.id, cleanReason);
      } else {
        renewSubscribedWebsite(site.id, cleanReason);
      }

      recordAdminSessionEvent({
        adminId: verifiedAdmin.id,
        action: `website_${action}`,
        targetType: 'website',
        targetId: site.id,
        outcome: 'success',
        summary: `Website ${action} dispatched (${site.subdomain}.amaas.xyz).`,
      });
    } finally {
      setIsLifecycleSubmitting(false);
    }
  };

  // Sensitive Action 4: Delete Unpaid Website (with server revalidation)
  const handleConfirmDeleteWebsite = async () => {
    if (!websiteToDelete) return;
    const target = websiteToDelete;
    const recheck = await revalidateAdminBeforeAction({
      action: 'delete_unpaid_website',
      targetType: 'website',
      targetId: target.id,
    });
    if (!recheck.allowed) {
      showToast(recheck.errorMessage || 'Session verification failed.', 'error');
      await refreshVerification();
      return;
    }
    const res = await adminDeleteSubscribedWebsite(target.id);
    recordAdminSessionEvent({
      adminId: verifiedAdmin.id,
      action: 'delete_unpaid_website',
      targetType: 'website',
      targetId: target.id,
      outcome: res.success ? 'success' : 'failed',
      summary: res.message,
    });
  };

  // MFA Enrollment Handlers
  const handleStartMfaEnroll = async () => {
    if (mfaActionBusy) return;
    setMfaActionBusy(true);
    setMfaActionFeedback(null);
    try {
      const res = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator');
      if (res.error || !res.factorId || !res.qrCodeSvgDataUri || !res.secret) {
        setMfaActionFeedback({
          tone: 'warning',
          text: res.error || 'Unable to start authenticator enrollment.',
        });
        return;
      }
      setEnrollingMfa({
        factorId: res.factorId,
        qrCodeSvgDataUri: res.qrCodeSvgDataUri,
        secret: res.secret,
      });
      setMfaEnrollCode('');
    } finally {
      setMfaActionBusy(false);
    }
  };

  const handleConfirmMfaEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollingMfa || mfaActionBusy) return;
    setMfaActionBusy(true);
    setMfaActionFeedback(null);
    try {
      const res = await verifyAdminTotpChallenge(enrollingMfa.factorId, mfaEnrollCode);
      if (!res.success) {
        setMfaActionFeedback({
          tone: 'error',
          text: res.error || 'Invalid 6-digit verification code.',
        });
        return;
      }
      recordAdminSessionEvent({
        adminId: verifiedAdmin.id,
        action: 'mfa_totp_enrolled',
        targetType: 'mfa',
        targetId: enrollingMfa.factorId,
        outcome: 'success',
        summary: 'Enrolled and verified TOTP authenticator factor.',
      });
      setEnrollingMfa(null);
      setMfaEnrollCode('');
      await refreshVerification();
      setMfaActionFeedback({
        tone: 'success',
        text: 'Two-factor authentication is now active on your administrator account.',
      });
    } finally {
      setMfaActionBusy(false);
    }
  };

  const handleConfirmRemoveMfa = async () => {
    if (!factorIdToRemove) return;
    const targetFactorId = factorIdToRemove;
    setFactorIdToRemove(null);
    setMfaActionBusy(true);
    setMfaActionFeedback(null);
    try {
      const res = await unenrollAdminTotpFactor(targetFactorId);
      if (!res.success) {
        setMfaActionFeedback({
          tone: 'error',
          text: res.error || 'Could not remove authenticator factor.',
        });
        return;
      }
      recordAdminSessionEvent({
        adminId: verifiedAdmin.id,
        action: 'mfa_totp_removed',
        targetType: 'mfa',
        targetId: targetFactorId,
        outcome: 'success',
        summary: 'Removed TOTP authenticator factor.',
      });
      await refreshVerification();
      setMfaActionFeedback({
        tone: 'warning',
        text: 'Authenticator factor removed.',
      });
    } finally {
      setMfaActionBusy(false);
    }
  };

  // Shared Mobile Payment Card Renderer (used in Overview urgent queue & Payments queue)
  const renderMobilePaymentCard = (req: PaymentRequest) => {
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
        className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-900 dark:text-white">
                {req.paymentMethod}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono tabular-nums">
                {new Date(req.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {exactSite ? exactSite.businessName : req.serviceName}
            </div>
            {isWebsiteReq ? (
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400 flex items-center gap-1.5 break-all">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {exactSite ? exactSite.fullDomainUrl : `Website ID: ${req.serviceId}`}
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{req.planTier}</div>
            )}
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Amount</span>
            <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              ৳{req.amount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Transaction ID & Sender Phone Strip */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/90 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Transaction ID
              </span>
              <span className="font-mono font-bold text-sm text-slate-900 dark:text-white break-all">
                {displayTrx}
              </span>
            </div>
            {displayTrx !== '—' && (
              <button
                type="button"
                onClick={() => handleCopyValue(displayTrx, `trx-${req.id}`, 'Transaction ID')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
              >
                {copiedToken === `trx-${req.id}` ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedToken === `trx-${req.id}` ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Sender Number
              </span>
              <span className="font-mono text-xs text-slate-900 dark:text-slate-200 tabular-nums">
                {req.senderNumber || 'Not provided'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Client &amp; Phone
              </span>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block truncate">
                {req.customerName}
              </span>
              <a
                href={`tel:${req.customerPhone}`}
                className="font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 tabular-nums"
              >
                <Phone className="w-3 h-3 shrink-0" />
                <span>{req.customerPhone}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Clean Unboxed Status Pair with Icons (Payment Status + Website Publishing Status) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              activeStep === 'approving'
                ? 'text-blue-600 dark:text-blue-400'
                : req.status === 'approved'
                ? 'text-emerald-600 dark:text-emerald-400'
                : req.status === 'rejected'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {activeStep === 'approving' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : req.status === 'approved' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : req.status === 'rejected' ? (
              <XCircle className="w-3.5 h-3.5" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
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

          {isWebsiteReq && (
            <>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                &middot;
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  activeStep === 'publishing'
                    ? 'text-blue-600 dark:text-blue-400'
                    : siteTrulyLive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : needsPublish
                    ? 'text-amber-600 dark:text-amber-400'
                    : exactSite?.subscriptionStatus === 'suspended'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>
                  {activeStep === 'publishing'
                    ? 'Publishing Website...'
                    : siteTrulyLive
                    ? 'Website Live'
                    : needsPublish
                    ? 'Needs Publish Retry'
                    : exactSite?.subscriptionStatus === 'suspended'
                    ? 'Suspended Hold'
                    : req.status === 'pending'
                    ? 'Publishes on Approval'
                    : 'Offline'}
                </span>
              </span>
            </>
          )}
        </div>

        {req.adminNotes && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">
              {req.status === 'rejected' ? 'Rejection Reason:' : 'Admin Note:'}
            </strong>{' '}
            {req.adminNotes}
          </div>
        )}

        {/* Action Buttons (>= 48px touch hitboxes) */}
        {req.status === 'pending' && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={isRowBusy || !isOnline}
              onClick={() => {
                setApprovalNotes('');
                setApprovalModalTarget({
                  request: req,
                  mode: 'approve_and_publish',
                });
              }}
              className="min-h-[48px] px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
              disabled={isRowBusy || !isOnline}
              onClick={() => {
                setRejectionError(null);
                setRejectionReason('');
                setRejectionModalId(req.id);
              }}
              className="min-h-[48px] px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 disabled:opacity-50 text-rose-700 dark:text-rose-300 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
              disabled={isRowBusy || !isOnline}
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
              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Live Site ({exactSite.fullDomainUrl})</span>
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Workflow Outcome Banner (visible across Overview & Payments when an action completes) */}
      {workflowFeedback && (activeSection === 'overview' || activeSection === 'payments') && (
        <div
          role="status"
          className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            workflowFeedback.tone === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : workflowFeedback.tone === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {workflowFeedback.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : workflowFeedback.tone === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <strong className="font-bold text-slate-900 dark:text-white block">
                {workflowFeedback.title}
              </strong>
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
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  Retry Publish
                </button>
              );
            })()}
            <button
              type="button"
              onClick={() => setWorkflowFeedback(null)}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Dismiss feedback"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 1: OVERVIEW (/admin)                                          */}
      {/* ===================================================================== */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Operations Overview
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Signed in as {verifiedAdmin.name} &middot; Live payment verification and website publishing control
              </p>
            </div>

            <button
              type="button"
              disabled={isPaymentsLoading || isWebsitesLoading || !isOnline}
              onClick={() => void handleSyncAll()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-blue-600 dark:text-blue-400 ${
                  isPaymentsLoading || isWebsitesLoading ? 'animate-spin' : ''
                }`}
              />
              <span>Sync Queues</span>
            </button>
          </div>

          {/* 4 Executive Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => {
                setPaymentFilter('pending');
                navigate('/admin/payments');
              }}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-colors cursor-pointer"
            >
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                Pending Payments
              </span>
              <p className="mt-1.5 text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                {pendingPaymentsCount}
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 block tabular-nums">
                {needsPublishCount > 0
                  ? `${needsPublishCount} awaiting publish retry`
                  : `${approvedPaymentsCount} approved · ${rejectedPaymentsCount} rejected`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/websites')}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-colors cursor-pointer"
            >
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                Published Websites
              </span>
              <p className="mt-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                {liveWebsitesCount}
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 block tabular-nums">
                {subscribedWebsites.length} total websites &middot; {payingWebsites.length} paid
              </span>
            </button>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                Verified Monthly MRR
              </span>
              <p className="mt-1.5 text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                ৳{monthlyRecurringRevenue.toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 block">
                Active paid website plans
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/admin/customers')}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-colors cursor-pointer"
            >
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">
                Registered Stores
              </span>
              <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {stores.length}
              </p>
              <span className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 block tabular-nums">
                {websiteRequests.length} bespoke inquiries
              </span>
            </button>
          </div>

          {/* Mobile App Install Card (auto-shows installed confirmation when running standalone) */}
          <AdminPWAInstallButton theme={theme} variant="card" />

          {/* Urgent Pending / Needs-Publish Queue right on Overview for 1-Tap Action */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Action Queue ({urgentOverviewPayments.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Payments awaiting manual verification or website publishing recovery
                </p>
              </div>
              <Link
                to="/admin/payments"
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>Open Full Queue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {urgentOverviewPayments.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  All payment requests are verified
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  New bKash, Nagad, and Bank Transfer submissions will appear here immediately.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {urgentOverviewPayments.map((req) => renderMobilePaymentCard(req))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: PAYMENT VERIFICATION & PUBLISHING (/admin/payments)        */}
      {/* ===================================================================== */}
      {activeSection === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Payment Verification Queue
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Verify bKash, Nagad, and Bank Transfer submissions and publish eligible websites automatically.
              </p>
            </div>

            <button
              type="button"
              disabled={isPaymentsLoading || isWebsitesLoading || !isOnline}
              onClick={() => void handleSyncAll()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-blue-600 dark:text-blue-400 ${
                  isPaymentsLoading || isWebsitesLoading ? 'animate-spin' : ''
                }`}
              />
              <span>Refresh</span>
            </button>
          </div>

          {/* Search & Interactive Status Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative w-full lg:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                placeholder="Search Transaction ID, sender phone, client, or subdomain..."
                aria-label="Search payment requests"
                className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:outline-hidden text-slate-900 dark:text-white text-xs placeholder:text-slate-400"
              />
              {paymentSearch && (
                <button
                  type="button"
                  onClick={() => setPaymentSearch('')}
                  className="min-h-[40px] min-w-[40px] absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

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
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    paymentFilter === tab.id
                      ? tab.id === 'needs_publish'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-blue-600 text-white font-semibold'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredPaymentRequests.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <CreditCard className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {paymentSearch.trim()
                  ? `No payment requests match "${paymentSearch.trim()}"`
                  : `No ${paymentFilter.replace('_', ' ')} payment requests`}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {paymentSearch.trim()
                  ? 'Clear your search query or select All to view every submission.'
                  : 'Incoming bKash, Nagad, and Bank Transfer submissions appear here automatically.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< 1024px) */}
              <div className="lg:hidden space-y-3">
                {filteredPaymentRequests.map((req) => renderMobilePaymentCard(req))}
              </div>

              {/* Desktop Table (>= 1024px) */}
              <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4">Client &amp; Phone</th>
                        <th className="py-3.5 px-4">Website / Service</th>
                        <th className="py-3.5 px-4 text-right">Amount</th>
                        <th className="py-3.5 px-4">Method, TrxID &amp; Sender</th>
                        <th className="py-3.5 px-4">Payment &amp; Publish Status</th>
                        <th className="py-3.5 px-4">Submitted</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70 text-slate-700 dark:text-slate-300">
                      {filteredPaymentRequests.map((req) => {
                        const exactSite = findExactWebsiteForRequest(req);
                        const isWebsiteReq = isWebsitePaymentService(req.serviceType);
                        const siteTrulyLive = isWebsiteTrulyLive(exactSite);
                        const needsPublish = doesRequestNeedPublishRecovery(req);
                        const activeStep = processingPaymentIds[req.id];
                        const isRowBusy = Boolean(activeStep);
                        const displayTrx = req.transactionId || req.bankReference || '—';

                        return (
                          <tr
                            key={req.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="p-4 align-top">
                              <span className="font-semibold text-slate-900 dark:text-white block">
                                {req.customerName}
                              </span>
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums block mt-0.5">
                                {req.customerPhone}
                              </span>
                              <span className="text-[11px] text-slate-400 block">
                                {req.customerEmail}
                              </span>
                            </td>

                            <td className="p-4 align-top">
                              <span className="font-semibold text-slate-900 dark:text-white block">
                                {exactSite ? exactSite.businessName : req.serviceName}
                              </span>
                              {isWebsiteReq ? (
                                exactSite ? (
                                  <div className="mt-0.5 space-y-0.5">
                                    <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 block">
                                      {exactSite.fullDomainUrl}
                                    </span>
                                    {siteTrulyLive && (
                                      <a
                                        href={`/sites/${exactSite.subdomain}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Open Live</span>
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 block mt-0.5">
                                    ID: {req.serviceId}
                                  </span>
                                )
                              ) : (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {req.planTier}
                                </span>
                              )}
                            </td>

                            <td className="p-4 align-top text-right font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                              ৳{req.amount.toLocaleString()}
                            </td>

                            <td className="p-4 align-top">
                              <span className="text-[11px] font-bold text-slate-900 dark:text-white block">
                                {req.paymentMethod}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-xs text-slate-900 dark:text-white font-bold">
                                  {displayTrx}
                                </span>
                                {displayTrx !== '—' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyValue(displayTrx, `trx-${req.id}`, 'Transaction ID')
                                    }
                                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                                    title="Copy Transaction ID"
                                  >
                                    {copiedToken === `trx-${req.id}` ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums block mt-0.5">
                                Sender: {req.senderNumber || '—'}
                              </span>
                            </td>

                            <td className="p-4 align-top space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span
                                  className={`font-semibold ${
                                    req.status === 'approved'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : req.status === 'rejected'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {req.status === 'approved'
                                    ? 'Payment Approved'
                                    : req.status === 'rejected'
                                    ? 'Rejected'
                                    : 'Pending Verification'}
                                </span>

                                {isWebsiteReq && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-700">&middot;</span>
                                    <span
                                      className={`font-semibold ${
                                        siteTrulyLive
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : needsPublish
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : exactSite?.subscriptionStatus === 'suspended'
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      {siteTrulyLive
                                        ? 'Website Live'
                                        : needsPublish
                                        ? 'Needs Publish'
                                        : exactSite?.subscriptionStatus === 'suspended'
                                        ? 'Suspended Hold'
                                        : 'Draft'}
                                    </span>
                                  </>
                                )}
                              </div>
                              {req.adminNotes && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs leading-snug">
                                  {req.adminNotes}
                                </p>
                              )}
                            </td>

                            <td className="p-4 align-top text-slate-500 dark:text-slate-400 text-[11px] font-mono tabular-nums whitespace-nowrap">
                              <span className="block">
                                {new Date(req.createdAt).toLocaleDateString()}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
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
                                    disabled={isRowBusy || !isOnline}
                                    onClick={() => {
                                      setApprovalNotes('');
                                      setApprovalModalTarget({
                                        request: req,
                                        mode: 'approve_and_publish',
                                      });
                                    }}
                                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    {isRowBusy && activeStep !== 'rejecting' && (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    )}
                                    <span>{isWebsiteReq ? 'Approve & Publish' : 'Approve'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isRowBusy || !isOnline}
                                    onClick={() => {
                                      setRejectionError(null);
                                      setRejectionReason('');
                                      setRejectionModalId(req.id);
                                    }}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/60 disabled:opacity-50 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : needsPublish ? (
                                <button
                                  type="button"
                                  disabled={isRowBusy || !isOnline}
                                  onClick={() => {
                                    setApprovalNotes('');
                                    setApprovalModalTarget({
                                      request: req,
                                      mode: 'retry_publish',
                                    });
                                  }}
                                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  {isRowBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  <span>Retry Publish</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono tabular-nums">
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

      {/* ===================================================================== */}
      {/* SECTION 3: WEBSITES MANAGEMENT (/admin/websites)                      */}
      {/* ===================================================================== */}
      {activeSection === 'websites' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Website Subscriptions ({subscribedWebsites.length})
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect merchant storefronts, preview live designs, and manage audited subscription lifecycles.
              </p>
            </div>

            <button
              type="button"
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
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Plan Rules</span>
            </button>
          </div>

          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={websiteSearch}
              onChange={(e) => setWebsiteSearch(e.target.value)}
              placeholder="Filter by business name, owner, or subdomain..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600"
            />
          </div>

          {filteredWebsites.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <Globe className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No websites match your filter
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Website Cards (< 1024px) */}
              <div className="lg:hidden space-y-3">
                {filteredWebsites.map((site) => {
                  const isSuspended = site.subscriptionStatus === 'suspended';
                  const trulyLive = isWebsiteTrulyLive(site);
                  const hasPaymentHistory = paymentRequests.some(
                    (r) =>
                      isWebsitePaymentService(r.serviceType) && r.serviceId === site.id
                  );

                  return (
                    <div
                      key={site.id}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {site.businessName}
                          </h3>
                          <p className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all mt-0.5">
                            {site.fullDomainUrl}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            {site.ownerName} &middot; {site.phone || 'No phone'}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-semibold block ${
                              trulyLive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isSuspended
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {trulyLive
                              ? 'Published Live'
                              : isSuspended
                              ? 'Suspended'
                              : site.paymentStatus === 'paid'
                              ? 'Paid · Unpublished'
                              : 'Unpaid Draft'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums block mt-0.5">
                            Next: {site.nextBillingDate || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPreviewingWebsite(site)}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>

                        {isSuspended ? (
                          <button
                            type="button"
                            disabled={site.paymentStatus !== 'paid' || !isOnline}
                            onClick={() => {
                              setLifecycleReason('');
                              setLifecycleModal({ site, action: 'reactivate' });
                            }}
                            className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Activate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!isOnline}
                            onClick={() => {
                              setLifecycleReason('');
                              setLifecycleModal({ site, action: 'suspend' });
                            }}
                            className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500/15 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 disabled:opacity-40 text-amber-800 dark:text-amber-300 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={site.paymentStatus !== 'paid' || !isOnline}
                          onClick={() => {
                            setLifecycleReason('');
                            setLifecycleModal({ site, action: 'renew' });
                          }}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 disabled:opacity-40 text-blue-700 dark:text-blue-300 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Renew</span>
                        </button>

                        <button
                          type="button"
                          disabled={hasPaymentHistory || !isOnline}
                          onClick={() => setWebsiteToDelete(site)}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 disabled:opacity-30 text-rose-700 dark:text-rose-300 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Websites Table (>= 1024px) */}
              <div className="hidden lg:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3.5 px-4">Business &amp; Owner</th>
                      <th className="py-3.5 px-4">Assigned Subdomain</th>
                      <th className="py-3.5 px-4">Template</th>
                      <th className="py-3.5 px-4">Subscription &amp; Hosting</th>
                      <th className="py-3.5 px-4">Next Billing</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredWebsites.map((site) => {
                      const isSuspended = site.subscriptionStatus === 'suspended';
                      const trulyLive = isWebsiteTrulyLive(site);
                      const hasPaymentHistory = paymentRequests.some(
                        (r) =>
                          isWebsitePaymentService(r.serviceType) && r.serviceId === site.id
                      );

                      return (
                        <tr
                          key={site.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {site.businessName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {site.ownerName} &middot; {site.phone || '—'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600 dark:text-blue-400 font-bold">
                                {site.fullDomainUrl}
                              </span>
                              {trulyLive && (
                                <a
                                  href={`/sites/${site.subdomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                                  title="Open live website"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-medium text-slate-900 dark:text-white block capitalize">
                              {site.nicheLabel}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {site.templateName}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`font-semibold block ${
                                trulyLive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isSuspended
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {trulyLive
                                ? 'Active · Live'
                                : isSuspended
                                ? 'Suspended · Offline'
                                : `${site.subscriptionStatus.replace('_', ' ')} · ${site.paymentStatus}`}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px] tabular-nums">
                            <div>{site.nextBillingDate || '—'}</div>
                            {site.gracePeriodEndsAt && (
                              <span className="text-amber-600 dark:text-amber-400 text-[10px] block">
                                Grace: {site.gracePeriodEndsAt.slice(0, 10)}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewingWebsite(site)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Preview</span>
                              </button>

                              {isSuspended ? (
                                <button
                                  type="button"
                                  disabled={site.paymentStatus !== 'paid' || !isOnline}
                                  onClick={() => {
                                    setLifecycleReason('');
                                    setLifecycleModal({ site, action: 'reactivate' });
                                  }}
                                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" />
                                  <span>Activate</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!isOnline}
                                  onClick={() => {
                                    setLifecycleReason('');
                                    setLifecycleModal({ site, action: 'suspend' });
                                  }}
                                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-amber-500/15 dark:bg-amber-900/50 hover:bg-amber-500/25 disabled:opacity-40 text-amber-800 dark:text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                  <span>Suspend</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={site.paymentStatus !== 'paid' || !isOnline}
                                onClick={() => {
                                  setLifecycleReason('');
                                  setLifecycleModal({ site, action: 'renew' });
                                }}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-800 disabled:opacity-40 text-blue-700 dark:text-blue-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Renew</span>
                              </button>

                              <button
                                type="button"
                                disabled={hasPaymentHistory || !isOnline}
                                onClick={() => setWebsiteToDelete(site)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 disabled:opacity-30 text-rose-700 dark:text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title={
                                  hasPaymentHistory
                                    ? 'Websites with payment history cannot be deleted'
                                    : 'Delete unpaid draft website'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: CUSTOMERS, STORES & BESPOKE REQUESTS (/admin/customers)     */}
      {/* ===================================================================== */}
      {activeSection === 'customers' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Customers &amp; Service Requests
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Registered merchant stores, custom engineering inquiries, and subscription invoices.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start text-xs">
              <button
                type="button"
                onClick={() => setCustomerSubTab('stores')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  customerSubTab === 'stores'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Stores ({stores.length})
              </button>
              <button
                type="button"
                onClick={() => setCustomerSubTab('requests')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  customerSubTab === 'requests'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Custom Requests ({websiteRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setCustomerSubTab('invoices')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  customerSubTab === 'invoices'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Invoices ({invoices.length})
              </button>
            </div>

            {customerSubTab !== 'invoices' && (
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Filter by store, contact, or phone..."
                  className="w-full min-h-[42px] pl-10 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600"
                />
              </div>
            )}
          </div>

          {customerSubTab === 'stores' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
              {filteredStores.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  <Store className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                  No registered merchant stores found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3.5 px-4">Store Brand</th>
                        <th className="py-3.5 px-4">Contact Phone</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4 text-right">Currency</th>
                        <th className="py-3.5 px-4 text-right">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {filteredStores.map((s) => (
                        <tr
                          key={s.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                            {s.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums">
                            {s.phone || '—'}
                          </td>
                          <td className="py-3.5 px-4 text-blue-600 dark:text-blue-400 font-medium">
                            {s.category}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                            {s.currency}
                          </td>
                          <td className="py-3.5 px-4 text-right text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums">
                            {s.createdAt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {customerSubTab === 'requests' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
              {filteredBespokeRequests.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  No bespoke website development inquiries recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3.5 px-4">Business &amp; Contact</th>
                        <th className="py-3.5 px-4">Scope</th>
                        <th className="py-3.5 px-4">Budget Tier</th>
                        <th className="py-3.5 px-4">Submitted</th>
                        <th className="py-3.5 px-4">Pipeline Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {filteredBespokeRequests.map((req) => (
                        <tr
                          key={req.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {req.businessName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {req.contactName} &middot; {req.phone}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-slate-900 dark:text-white block">
                              {req.desiredType}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                              {req.description}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {req.budgetTier}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums">
                            {req.createdAt}
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={req.status}
                              onChange={(e) =>
                                updateWebsiteRequestStatus(req.id, e.target.value as any)
                              }
                              className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden"
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
              )}
            </div>
          )}

          {customerSubTab === 'invoices' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
              {invoices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  No subscription invoices recorded in this session.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3.5 px-4">Invoice #</th>
                        <th className="py-3.5 px-4">Description</th>
                        <th className="py-3.5 px-4 text-right">Amount</th>
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {invoices.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {tx.invoiceNumber}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                            {tx.planName}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                            ৳{tx.amount.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] tabular-nums">
                            {tx.date}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                            {tx.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 5: PAYMENT GATEWAYS (/admin/gateways)                         */}
      {/* ===================================================================== */}
      {activeSection === 'gateways' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Payment Gateways &amp; Recipient Accounts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure the bKash, Nagad, Bank Transfer, and WhatsApp channels shown to merchants during manual payment submission.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                if (
                  draft.isEnabled &&
                  gw.id !== 'whatsapp_support' &&
                  !(draft.accountNumber || '').trim()
                ) {
                  showToast(
                    'Enter a receiving account number before saving an enabled gateway.',
                    'warning'
                  );
                  return;
                }

                setSavingGatewayId(gw.id);
                try {
                  const recheck = await revalidateAdminBeforeAction({
                    action: 'update_payment_gateway',
                    targetType: 'gateway',
                    targetId: gw.id,
                  });
                  if (!recheck.allowed) {
                    showToast(recheck.errorMessage || 'Session verification failed.', 'error');
                    await refreshVerification();
                    return;
                  }

                  const ok = await updatePaymentGatewayConfig(gw.id, {
                    displayName: draft.displayName,
                    isEnabled: draft.isEnabled,
                    accountNumber: (draft.accountNumber ?? '').trim(),
                    accountName: (draft.accountName ?? '').trim(),
                    bankName: (draft.bankName ?? '').trim(),
                    branchName: (draft.branchName ?? '').trim(),
                    routingNumber: (draft.routingNumber ?? '').trim(),
                    instructions: (draft.instructions ?? '').trim(),
                  });

                  recordAdminSessionEvent({
                    adminId: verifiedAdmin.id,
                    action: 'update_payment_gateway',
                    targetType: 'gateway',
                    targetId: gw.id,
                    outcome: ok ? 'success' : 'failed',
                    summary: ok
                      ? `Updated ${gw.displayName} (${draft.isEnabled ? 'enabled' : 'disabled'}).`
                      : `Failed updating ${gw.displayName}.`,
                  });
                } finally {
                  setSavingGatewayId(null);
                }
              };

              return (
                <div
                  key={gw.id}
                  className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {gw.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateGatewayDraft(gw.id, { isEnabled: !draft.isEnabled })}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        draft.isEnabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {draft.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                        Account / WhatsApp Number
                      </label>
                      <input
                        type="text"
                        value={draft.accountNumber ?? ''}
                        onChange={(e) =>
                          updateGatewayDraft(gw.id, { accountNumber: e.target.value })
                        }
                        placeholder={
                          gw.id === 'whatsapp_support' ? '+8801XXXXXXXXX' : 'Enter receiving number'
                        }
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    {gw.id !== 'whatsapp_support' && (
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                          Account Holder / Merchant Name
                        </label>
                        <input
                          type="text"
                          value={draft.accountName ?? ''}
                          onChange={(e) =>
                            updateGatewayDraft(gw.id, { accountName: e.target.value })
                          }
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    {gw.id === 'bank_transfer' && (
                      <>
                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                            Bank Name
                          </label>
                          <input
                            type="text"
                            value={draft.bankName ?? ''}
                            onChange={(e) =>
                              updateGatewayDraft(gw.id, { bankName: e.target.value })
                            }
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                              Branch Name
                            </label>
                            <input
                              type="text"
                              value={draft.branchName ?? ''}
                              onChange={(e) =>
                                updateGatewayDraft(gw.id, { branchName: e.target.value })
                              }
                              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                              Routing Number
                            </label>
                            <input
                              type="text"
                              value={draft.routingNumber ?? ''}
                              onChange={(e) =>
                                updateGatewayDraft(gw.id, { routingNumber: e.target.value })
                              }
                              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                        Customer Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={draft.instructions ?? ''}
                        onChange={(e) =>
                          updateGatewayDraft(gw.id, { instructions: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white leading-relaxed"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isDirty ? 'Unsaved changes' : 'Saved'}
                      </span>
                      <button
                        type="button"
                        disabled={isSaving || !isDirty || !isOnline}
                        onClick={() => void handleSaveGateway()}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Save Gateway</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 6: SECURITY, MFA & AUDIT TRAIL (/admin/audit)                 */}
      {/* ===================================================================== */}
      {activeSection === 'audit' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Security, MFA &amp; Audit Logs
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage two-factor authentication, mobile app installation, and immutable administrative audit records.
            </p>
          </div>

          {/* Card 1: Mobile PWA Installation */}
          <AdminPWAInstallButton theme={theme} variant="card" />

          {/* Card 2: Administrator Identity & TOTP Two-Factor Authentication */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Two-Factor Authentication (TOTP)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Account: <span className="font-mono">{verifiedAdmin.email}</span> &middot; Assurance Level:{' '}
                    <strong className="font-mono uppercase text-slate-900 dark:text-white">
                      {mfa.currentLevel || 'aal1'}
                    </strong>
                  </p>
                </div>
              </div>

              {!mfa.isMfaEnrolled && !enrollingMfa && (
                <button
                  type="button"
                  disabled={mfaActionBusy || !isOnline}
                  onClick={() => void handleStartMfaEnroll()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  {mfaActionBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>Set Up Authenticator App</span>
                </button>
              )}
            </div>

            {mfaActionFeedback && (
              <div
                className={`p-3.5 rounded-xl border leading-relaxed ${
                  mfaActionFeedback.tone === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : mfaActionFeedback.tone === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                {mfaActionFeedback.text}
              </div>
            )}

            {mfa.isMfaEnrolled && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                {mfa.verifiedTotpFactors.map((factor) => (
                  <div
                    key={factor.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {factor.friendlyName}
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Verified TOTP Factor &middot; Enforced on sign-in and sensitive actions
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => setFactorIdToRemove(factor.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-semibold text-xs cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {enrollingMfa && (
              <form
                onSubmit={(e) => void handleConfirmMfaEnroll(e)}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  Scan this QR code in Google Authenticator, 1Password, or Authy, then enter the 6-digit code below to activate AAL2 step-up enforcement.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-3 rounded-xl bg-white border border-slate-200 shrink-0">
                    <img
                      src={enrollingMfa.qrCodeSvgDataUri}
                      alt="TOTP Authenticator QR Code"
                      referrerPolicy="no-referrer"
                      className="w-36 h-36"
                    />
                  </div>
                  <div className="space-y-2 w-full min-w-0">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Manual setup key:
                    </span>
                    <code className="block p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all text-slate-900 dark:text-white">
                      {enrollingMfa.secret}
                    </code>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        6-Digit Verification Code
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={mfaEnrollCode}
                        onChange={(e) =>
                          setMfaEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="000000"
                        className="w-full sm:w-48 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-base tracking-widest tabular-nums text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={mfaActionBusy || mfaEnrollCode.length !== 6}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
                  >
                    Activate Authenticator
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrollingMfa(null)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Audit Log Sub-Navigation */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start text-xs overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => setAuditSubTab('payments')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    auditSubTab === 'payments'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Payment Decisions ({settledPaymentAuditRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditSubTab('lifecycle')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    auditSubTab === 'lifecycle'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Website Lifecycle ({websiteLifecycleAuditLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditSubTab('session')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    auditSubTab === 'session'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Session Events ({sessionEvents.length})
                </button>
              </div>

              <button
                type="button"
                disabled={!isOnline}
                onClick={() => void handleSyncAll()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Logs</span>
              </button>
            </div>

            {auditSubTab === 'payments' && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Reviewed At</th>
                        <th className="py-3 px-4">Decision</th>
                        <th className="py-3 px-4">Target Service</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4">TrxID</th>
                        <th className="py-3 px-4">Admin ID</th>
                        <th className="py-3 px-4">Notes / Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {settledPaymentAuditRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No reviewed payment requests recorded yet.
                          </td>
                        </tr>
                      ) : (
                        settledPaymentAuditRows.map((row) => (
                          <tr key={row.id}>
                            <td className="py-3 px-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                              {row.reviewedAt
                                ? new Date(row.reviewedAt).toLocaleString()
                                : new Date(row.updatedAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-semibold ${
                                  row.status === 'approved'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {row.status === 'approved' ? 'Approved' : 'Rejected'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                              {row.serviceName}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                              ৳{row.amount.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px]">
                              {row.transactionId || row.bankReference || '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {row.reviewedBy ? `${row.reviewedBy.slice(0, 8)}...` : '—'}
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate" title={row.adminNotes}>
                              {row.adminNotes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {auditSubTab === 'lifecycle' && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Website</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Status Transition</th>
                        <th className="py-3 px-4">Admin ID</th>
                        <th className="py-3 px-4">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {websiteLifecycleAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No website lifecycle audit events recorded yet.
                          </td>
                        </tr>
                      ) : (
                        websiteLifecycleAuditLogs.map((log) => {
                          const matchedSite = subscribedWebsites.find(
                            (w) => w.id === log.websiteId
                          );
                          return (
                            <tr key={log.id}>
                              <td className="py-3 px-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-semibold text-slate-900 dark:text-white block">
                                  {matchedSite?.businessName || `${log.websiteId.slice(0, 8)}...`}
                                </span>
                                {matchedSite && (
                                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                                    {matchedSite.fullDomainUrl}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-semibold uppercase text-[11px]">
                                {log.action}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px]">
                                {(log.previousStatus || '—')} &rarr; {(log.newStatus || '—')}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                                {log.adminId.slice(0, 8)}...
                              </td>
                              <td className="py-3 px-4 max-w-xs truncate" title={log.reason}>
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
            )}

            {auditSubTab === 'session' && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Target</th>
                        <th className="py-3 px-4">Outcome</th>
                        <th className="py-3 px-4">Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {sessionEvents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            <FileText className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
                            Session actions performed during your current login appear here.
                          </td>
                        </tr>
                      ) : (
                        sessionEvents.map((evt) => (
                          <tr key={evt.id}>
                            <td className="py-3 px-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                              {new Date(evt.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                              {evt.action}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {evt.targetType}:{evt.targetId.slice(0, 12)}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-semibold ${
                                  evt.outcome === 'success'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {evt.outcome}
                              </span>
                            </td>
                            <td className="py-3 px-4">{evt.summary}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SHARED CONFIRMATION MODALS                                            */}
      {/* ===================================================================== */}

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
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Exact Verified Amount</span>
                  <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ৳{req.amount.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Payment Method</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {req.paymentMethod}
                  </span>
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
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
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
                  disabled={isBusy || !isOnline}
                  onClick={() => void handleConfirmApproveOrRetry()}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
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
                  {rejectionTargetRequest.customerName} &middot; {rejectionTargetRequest.paymentMethod}
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
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
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
                !isOnline ||
                Boolean(rejectionModalId && processingPaymentIds[rejectionModalId])
              }
              onClick={() => void handleConfirmReject()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {rejectionModalId && processingPaymentIds[rejectionModalId] && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>Confirm Rejection</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Plan Settings Modal */}
      <Modal
        isOpen={isPlanSettingsModalOpen}
        onClose={() => setIsPlanSettingsModalOpen(false)}
        title="Website Subscription Plan Configuration"
        description="Configure resource limits, renewal grace periods, and visibility."
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
            recordAdminSessionEvent({
              adminId: verifiedAdmin.id,
              action: 'update_plan_rules',
              targetType: 'plan',
              targetId: 'website_lite',
              outcome: 'success',
              summary: 'Updated website subscription plan configuration.',
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
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
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
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Max Pages
              </label>
              <input
                type="number"
                min={1}
                value={planMaxPages}
                onChange={(e) => setPlanMaxPages(Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Storage (MB)
              </label>
              <input
                type="number"
                min={100}
                value={planMaxStorage}
                onChange={(e) => setPlanMaxStorage(Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
                Plan Visible in Public Pricing Page &amp; Merchant Dashboard
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsPlanSettingsModalOpen(false)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </Modal>

      {/* Live Website Preview Modal */}
      {previewingWebsite && (
        <Modal
          isOpen={!!previewingWebsite}
          onClose={() => setPreviewingWebsite(null)}
          title={`Website Preview: ${previewingWebsite.businessName}`}
          description={`${previewingWebsite.fullDomainUrl} · Status: ${previewingWebsite.subscriptionStatus.toUpperCase()}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">
                https://{previewingWebsite.fullDomainUrl}
              </span>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setAdminPreviewDevice('desktop')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                    adminPreviewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdminPreviewDevice('mobile')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                    adminPreviewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex justify-center max-h-[600px] overflow-y-auto">
              <WebsitePreviewRenderer site={previewingWebsite} viewMode={adminPreviewDevice} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewingWebsite(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Audited Website Lifecycle Action Confirmation */}
      <Modal
        isOpen={!!lifecycleModal}
        onClose={() => {
          if (!isLifecycleSubmitting) {
            setLifecycleModal(null);
            setLifecycleReason('');
          }
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
            ? `${lifecycleModal.site.businessName} (${lifecycleModal.site.fullDomainUrl}) · Recorded permanently in the PostgreSQL audit log.`
            : undefined
        }
        maxWidth="md"
      >
        {lifecycleModal && (
          <form onSubmit={(e) => void handleConfirmLifecycleAction(e)} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Provide a clear administrative reason for this{' '}
              <strong className="text-slate-900 dark:text-white uppercase">
                {lifecycleModal.action}
              </strong>{' '}
              action.
            </p>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Audit Reason *
              </label>
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
                className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isLifecycleSubmitting}
                onClick={() => {
                  setLifecycleModal(null);
                  setLifecycleReason('');
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!lifecycleReason.trim() || isLifecycleSubmitting || !isOnline}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                {isLifecycleSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm &amp; Log Action</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Delete Unpaid Website */}
      <ConfirmDialog
        isOpen={!!websiteToDelete}
        onClose={() => setWebsiteToDelete(null)}
        onConfirm={() => {
          void handleConfirmDeleteWebsite();
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

      {/* Confirm Remove MFA Factor */}
      <ConfirmDialog
        isOpen={!!factorIdToRemove}
        onClose={() => setFactorIdToRemove(null)}
        onConfirm={() => {
          void handleConfirmRemoveMfa();
        }}
        title="Remove Two-Factor Authenticator?"
        message="Removing your authenticator app lowers sign-in assurance to single-factor password verification. Are you sure you want to continue?"
        confirmLabel="Remove Authenticator"
        isDestructive
      />
    </div>
  );
};
