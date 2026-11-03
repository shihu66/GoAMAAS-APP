import {
  AdminPaymentApprovalRpcResult,
  ApproveAndPublishResult,
  ClientWebsiteStatusDescriptor,
  PaymentMethodType,
  PaymentRequest,
  SubscribedWebsite,
  UserRole,
  VerifiedPaymentReceipt,
} from '../types';

const UUID_FORMAT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeTransactionReference(raw?: string | null): string {
  return (raw || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeSenderPhoneNumber(raw?: string | null): string {
  return (raw || '').trim();
}

export function isValidSenderPhoneNumber(raw?: string | null): boolean {
  const trimmed = normalizeSenderPhoneNumber(raw);
  if (!trimmed) return false;
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 10 && digitsOnly.length <= 15 && /^[+\d][\d\s()-]{8,19}$/.test(trimmed);
}

export function isValidTransactionReference(raw?: string | null): boolean {
  const normalized = normalizeTransactionReference(raw);
  if (normalized.length < 4 || normalized.length > 64) return false;
  return /^[A-Z0-9][A-Z0-9\-_/.# ]*[A-Z0-9]$/.test(normalized);
}

export function isWebsitePaymentService(
  serviceType: PaymentRequest['serviceType']
): boolean {
  return serviceType === 'website_subscription' || serviceType === 'website_package';
}

/**
 * Resolves the authoritative UTC expiry timestamp (ms) for a website's 30-day subscription period.
 * Returns `null` if the website has never had an active subscription period assigned.
 */
export function getWebsiteSubscriptionExpiryMs(
  site?: Pick<
    SubscribedWebsite,
    'currentPeriodEnd' | 'nextBillingDate' | 'paymentStatus' | 'subscriptionStatus'
  > | null
): number | null {
  if (!site) return null;

  if (site.currentPeriodEnd) {
    const parsed = Date.parse(site.currentPeriodEnd);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  // Fallback when only date-string nextBillingDate is available on a paid/activated record
  if (
    site.nextBillingDate &&
    (site.paymentStatus === 'paid' ||
      site.subscriptionStatus === 'grace_period' ||
      site.subscriptionStatus === 'past_due')
  ) {
    const raw = site.nextBillingDate.trim();
    const parsed = raw.includes('T')
      ? Date.parse(raw)
      : Date.parse(`${raw}T23:59:59.999Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Returns `true` when a previously activated website subscription has reached or passed
 * its 30-day expiry cutoff (including database `grace_period` / `past_due` states).
 * Never returns `true` for a brand-new unpaid draft website.
 */
export function isWebsiteSubscriptionExpired(
  site?: SubscribedWebsite | null,
  nowMs: number = Date.now()
): boolean {
  if (!site) return false;

  if (
    site.subscriptionStatus === 'grace_period' ||
    site.subscriptionStatus === 'past_due'
  ) {
    return true;
  }

  const expiryMs = getWebsiteSubscriptionExpiryMs(site);
  if (expiryMs !== null && expiryMs <= nowMs) {
    return true;
  }

  return false;
}

/**
 * Strict public-access & live-status predicate (Issues 6 & 9):
 * A website is publicly accessible ONLY when:
 * - paymentStatus === 'paid'
 * - subscriptionStatus === 'active' (blocks 'grace_period', 'past_due', 'suspended', 'cancelled', 'draft')
 * - deploymentStatus === 'live'
 * - 30-day subscription period has not expired (`nowMs < currentPeriodEnd`)
 */
export function isWebsiteTrulyLive(
  site?: SubscribedWebsite | null,
  nowMs: number = Date.now()
): boolean {
  if (!site) return false;
  if (site.paymentStatus !== 'paid') return false;
  if (site.subscriptionStatus !== 'active') return false;
  if (site.deploymentStatus !== 'live') return false;
  if (isWebsiteSubscriptionExpired(site, nowMs)) return false;
  return true;
}

/**
 * Formats an ISO or YYYY-MM-DD date string cleanly in the viewer's local timezone.
 */
export function formatSubscriptionDateDisplay(
  isoOrDate?: string | null,
  includeTime = false
): string {
  if (!isoOrDate) return '—';
  const raw = isoOrDate.trim();
  if (!raw) return '—';
  const parsed = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  if (includeTime && raw.includes('T')) {
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Resolves the exact client-facing website lifecycle status (Issue 8), along with
 * independent payment status, publication status, start/expiry dates, and renewal flags.
 */
export function resolveClientWebsiteLifecycleState(
  site: SubscribedWebsite,
  allPaymentRequests: PaymentRequest[],
  nowMs: number = Date.now()
): ClientWebsiteStatusDescriptor {
  const cleanSiteId = (site.id || '').trim();
  const siteRequests = allPaymentRequests
    .filter(
      (r) =>
        isWebsitePaymentService(r.serviceType) &&
        (r.serviceId || '').trim() === cleanSiteId
    )
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));

  const pendingRequest = siteRequests.find((r) => r.status === 'pending');
  const approvedRequests = siteRequests.filter((r) => r.status === 'approved');
  const latestApprovedRequest = approvedRequests[0];
  const latestRequest = siteRequests[0];
  const latestRejectedRequest =
    latestRequest?.status === 'rejected' ? latestRequest : undefined;

  const expiryMs = getWebsiteSubscriptionExpiryMs(site);
  const subscriptionExpiryIso =
    site.currentPeriodEnd ||
    (expiryMs !== null ? new Date(expiryMs).toISOString() : undefined);

  const subscriptionStartIso =
    expiryMs !== null
      ? new Date(expiryMs - THIRTY_DAYS_MS).toISOString()
      : site.subscribedAt || latestApprovedRequest?.reviewedAt || undefined;

  const expired = isWebsiteSubscriptionExpired(site, nowMs);
  const wasPreviouslyActivated =
    approvedRequests.length > 0 ||
    site.paymentStatus === 'paid' ||
    Boolean(site.subscribedAt) ||
    Boolean(site.currentPeriodEnd) ||
    site.subscriptionStatus === 'grace_period' ||
    site.subscriptionStatus === 'past_due';

  // 1. Cancelled or Admin-Suspended states
  if (site.subscriptionStatus === 'cancelled') {
    return {
      stage: 'cancelled',
      label: 'Subscription Cancelled',
      paymentStatusLabel: site.paymentStatus === 'paid' ? 'Paid / Approved' : 'Unpaid',
      publicationStatusLabel: 'Private — Not Published',
      description:
        'This website subscription was cancelled and is offline. Your saved content and history remain preserved.',
      isPubliclyAccessible: false,
      isExpired: expired,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: false,
      hasPendingRenewalWhileLive: false,
      pendingRequest,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  if (site.subscriptionStatus === 'suspended') {
    return {
      stage: 'suspended',
      label: 'Suspended by Administrator',
      paymentStatusLabel: site.paymentStatus === 'paid' ? 'Paid / Approved' : 'Unpaid',
      publicationStatusLabel: 'Offline — Suspended',
      description:
        'Public access is currently suspended by platform administration. Please contact support for assistance.',
      isPubliclyAccessible: false,
      isExpired: expired,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: false,
      hasPendingRenewalWhileLive: false,
      pendingRequest,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  // 2. Active, Paid, Unexpired, and Live on Subdomain
  if (isWebsiteTrulyLive(site, nowMs)) {
    return {
      stage: 'live',
      label: 'Live & Public',
      paymentStatusLabel: 'Paid / Approved',
      publicationStatusLabel: 'Live & Public',
      description: pendingRequest
        ? `Your website is publicly live at https://${site.fullDomainUrl}. An early 30-day renewal payment (${pendingRequest.transactionId || 'Pending'}) is awaiting admin verification.`
        : `Your website is publicly live at https://${site.fullDomainUrl} through ${formatSubscriptionDateDisplay(subscriptionExpiryIso, true)}.`,
      isPubliclyAccessible: true,
      isExpired: false,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: !pendingRequest,
      hasPendingRenewalWhileLive: Boolean(pendingRequest),
      pendingRequest,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  // 3. Expired 30-Day Subscription (Saved & Renewable on Exact Same Website ID)
  if (expired || (wasPreviouslyActivated && site.paymentStatus !== 'paid' && approvedRequests.length > 0)) {
    if (pendingRequest) {
      return {
        stage: 'renewal_pending',
        label: 'Renewal Payment Under Verification',
        paymentStatusLabel: 'Pending Admin Verification',
        publicationStatusLabel: 'Offline — Subscription Expired',
        description: `Your renewal payment (${pendingRequest.paymentMethod} • TrxID: ${pendingRequest.transactionId || pendingRequest.bankReference || 'Submitted'}) is awaiting manual admin verification. Once approved, https://${site.fullDomainUrl} will be republished for 30 days.`,
        isPubliclyAccessible: false,
        isExpired: true,
        canSubmitInitialPayment: false,
        canSubmitRenewalPayment: false,
        hasPendingRenewalWhileLive: false,
        pendingRequest,
        latestApprovedRequest,
        latestRejectedRequest,
        subscriptionStartIso,
        subscriptionExpiryIso,
      };
    }

    if (
      latestRejectedRequest &&
      (!latestApprovedRequest ||
        Date.parse(latestRejectedRequest.createdAt || '') >=
          Date.parse(latestApprovedRequest.createdAt || ''))
    ) {
      return {
        stage: 'payment_rejected',
        label: 'Payment Rejected — Resubmit Required',
        paymentStatusLabel: 'Rejected',
        publicationStatusLabel: 'Offline — Subscription Expired',
        description: latestRejectedRequest.adminNotes
          ? `Your renewal payment was rejected: "${latestRejectedRequest.adminNotes}". All website content is safely preserved — please submit a valid renewal payment to republish.`
          : 'Your renewal payment could not be verified. All website content is safely preserved — please submit a valid renewal payment to republish.',
        isPubliclyAccessible: false,
        isExpired: true,
        canSubmitInitialPayment: false,
        canSubmitRenewalPayment: true,
        hasPendingRenewalWhileLive: false,
        pendingRequest: undefined,
        latestApprovedRequest,
        latestRejectedRequest,
        subscriptionStartIso,
        subscriptionExpiryIso,
      };
    }

    return {
      stage: 'expired',
      label: 'Expired — Renew to Publish',
      paymentStatusLabel: 'Unpaid',
      publicationStatusLabel: 'Offline — Subscription Expired',
      description: `Your 30-day website subscription expired on ${formatSubscriptionDateDisplay(subscriptionExpiryIso, true)}. Public access is paused, while your subdomain (${site.fullDomainUrl}), design, products, and settings remain 100% saved. Renew to republish immediately upon approval.`,
      isPubliclyAccessible: false,
      isExpired: true,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: true,
      hasPendingRenewalWhileLive: false,
      pendingRequest: undefined,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  // 4. Paid & Unexpired, but not currently deployed to live (e.g. unpublished by owner or awaiting publish retry)
  if (site.paymentStatus === 'paid' && !expired) {
    return {
      stage: 'approved_unpublished',
      label: 'Payment Approved — Ready to Publish',
      paymentStatusLabel: 'Paid / Approved',
      publicationStatusLabel: 'Offline — Ready to Publish',
      description:
        'Your 30-day subscription payment is verified and active. Publish your website to make it publicly accessible on your subdomain.',
      isPubliclyAccessible: false,
      isExpired: false,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: false,
      hasPendingRenewalWhileLive: false,
      pendingRequest,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  // 5. Initial Website (Never Activated Yet)
  if (pendingRequest || site.paymentStatus === 'pending_review') {
    return {
      stage: 'payment_pending',
      label: 'Payment Under Admin Verification',
      paymentStatusLabel: 'Pending Admin Verification',
      publicationStatusLabel: 'Private — Not Published',
      description: pendingRequest
        ? `Your ${pendingRequest.paymentMethod} payment (TrxID: ${pendingRequest.transactionId || pendingRequest.bankReference || 'Submitted'}) has been received and is awaiting manual admin verification. Your website remains private until approved.`
        : 'Your payment request is awaiting manual admin verification. Your website remains private until approved.',
      isPubliclyAccessible: false,
      isExpired: false,
      canSubmitInitialPayment: false,
      canSubmitRenewalPayment: false,
      hasPendingRenewalWhileLive: false,
      pendingRequest,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  if (latestRejectedRequest || site.paymentStatus === 'failed') {
    return {
      stage: 'payment_rejected',
      label: 'Payment Rejected — Resubmit Required',
      paymentStatusLabel: 'Rejected',
      publicationStatusLabel: 'Private — Not Published',
      description: latestRejectedRequest?.adminNotes
        ? `Admin review note: "${latestRejectedRequest.adminNotes}". Please submit a valid payment and Transaction ID to activate and publish your website.`
        : 'Your previous payment submission could not be verified. Please submit a valid payment and Transaction ID to activate and publish your website.',
      isPubliclyAccessible: false,
      isExpired: false,
      canSubmitInitialPayment: true,
      canSubmitRenewalPayment: false,
      hasPendingRenewalWhileLive: false,
      pendingRequest: undefined,
      latestApprovedRequest,
      latestRejectedRequest,
      subscriptionStartIso,
      subscriptionExpiryIso,
    };
  }

  return {
    stage: 'draft_awaiting_payment',
    label: 'Draft — Awaiting Payment',
    paymentStatusLabel: 'Unpaid',
    publicationStatusLabel: 'Private — Not Published',
    description: `Your website draft for ${site.fullDomainUrl} is saved privately. Complete your ৳${site.monthlyFee} subscription payment and submit the Transaction ID for admin approval and publishing.`,
    isPubliclyAccessible: false,
    isExpired: false,
    canSubmitInitialPayment: true,
    canSubmitRenewalPayment: false,
    hasPendingRenewalWhileLive: false,
    pendingRequest: undefined,
    latestApprovedRequest,
    latestRejectedRequest,
    subscriptionStartIso,
    subscriptionExpiryIso,
  };
}

/**
 * Generates an official GoAMAAS / AMAAS Technologies Payment Receipt strictly from a
 * server-confirmed `approved` PaymentRequest record (Issue 5).
 * Returns `null` for `pending`, `rejected`, or missing payment requests.
 */
export function buildVerifiedPaymentReceipt(
  request: PaymentRequest | null | undefined,
  website?: SubscribedWebsite | null,
  isLatestApprovedForWebsite = true
): VerifiedPaymentReceipt | null {
  if (!request || request.status !== 'approved') {
    return null;
  }

  const approvalTimestampRaw =
    request.reviewedAt || request.updatedAt || request.createdAt || new Date().toISOString();
  const approvedMs = Date.parse(approvalTimestampRaw);
  const safeApprovedMs = Number.isFinite(approvedMs) ? approvedMs : Date.now();
  const approvedAtIso = new Date(safeApprovedMs).toISOString();

  const datePart = approvedAtIso.slice(0, 10).replace(/-/g, '');
  const idToken =
    (request.id || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase() || 'VERIFIED';
  const receiptNumber = `RCPT-${datePart}-${idToken}`;

  let subscriptionStartIso = approvedAtIso;
  let subscriptionExpiryIso = new Date(safeApprovedMs + THIRTY_DAYS_MS).toISOString();

  if (isLatestApprovedForWebsite && website) {
    const websiteExpiryMs = getWebsiteSubscriptionExpiryMs(website);
    if (websiteExpiryMs !== null && websiteExpiryMs >= safeApprovedMs) {
      subscriptionExpiryIso = new Date(websiteExpiryMs).toISOString();
      subscriptionStartIso = new Date(websiteExpiryMs - THIRTY_DAYS_MS).toISOString();
    }
  }

  const cleanSubdomain = (website?.subdomain || '').trim().toLowerCase();
  const canonicalDomain = cleanSubdomain
    ? `${cleanSubdomain}.amaas.xyz`
    : website?.fullDomainUrl
    ? website.fullDomainUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    : undefined;

  return {
    receiptNumber,
    requestId: request.id,
    platformName: 'GoAMAAS',
    companyName: 'AMAAS Technologies',
    clientName: request.customerName || website?.ownerName || 'Merchant',
    businessName: website?.businessName || request.customerName || 'Merchant Business',
    clientEmail: request.customerEmail || website?.email || '—',
    clientPhone: request.customerPhone || request.senderNumber || website?.phone || '—',
    websiteId: isWebsitePaymentService(request.serviceType) ? request.serviceId : undefined,
    websiteName: website?.businessName || request.serviceName || 'GoAMAAS Website',
    subdomain: cleanSubdomain || undefined,
    websiteUrl: canonicalDomain ? `https://${canonicalDomain}` : undefined,
    serviceType: request.serviceType,
    planName: request.planTier || website?.planName || request.serviceName || 'GoAMAAS Website',
    amountBdt: Number(request.amount) || 0,
    currency: request.currency || '৳',
    paymentMethod: request.paymentMethod,
    transactionId:
      normalizeTransactionReference(request.transactionId || request.bankReference) || 'VERIFIED',
    senderNumber: request.senderNumber || undefined,
    approvedAtIso,
    subscriptionStartIso,
    subscriptionExpiryIso,
    statusLabel: 'PAID / APPROVED',
  };
}

export function hasDuplicateActiveTransactionReference(
  existingRequests: PaymentRequest[],
  candidateReference: string
): boolean {
  const normalizedCandidate = normalizeTransactionReference(candidateReference);
  if (!normalizedCandidate) return false;

  return existingRequests.some((req) => {
    if (req.status === 'rejected') return false;
    const existingTrx = normalizeTransactionReference(req.transactionId);
    const existingBankRef = normalizeTransactionReference(req.bankReference);
    return existingTrx === normalizedCandidate || existingBankRef === normalizedCandidate;
  });
}

export function validateManualPaymentSubmissionInput(params: {
  paymentMethod: PaymentMethodType;
  transactionId?: string;
  bankReference?: string;
  senderNumber?: string;
  amount: number;
  serviceId: string;
}): {
  valid: boolean;
  normalizedReference: string;
  normalizedSender: string;
  error?: string;
} {
  const cleanServiceId = (params.serviceId || '').trim();
  if (!cleanServiceId) {
    return {
      valid: false,
      normalizedReference: '',
      normalizedSender: '',
      error: 'Please select a valid website subscription or service plan.',
    };
  }

  if (
    params.paymentMethod !== 'bKash' &&
    params.paymentMethod !== 'Nagad' &&
    params.paymentMethod !== 'Bank Transfer'
  ) {
    return {
      valid: false,
      normalizedReference: '',
      normalizedSender: '',
      error: 'Please select a supported payment method (bKash, Nagad, or Bank Transfer).',
    };
  }

  const submittedAmount = Number(params.amount);
  if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) {
    return {
      valid: false,
      normalizedReference: '',
      normalizedSender: '',
      error: 'Invalid payable amount.',
    };
  }

  const rawReference =
    params.paymentMethod === 'Bank Transfer'
      ? (params.transactionId || params.bankReference || '')
      : (params.transactionId || '');
  const normalizedReference = normalizeTransactionReference(rawReference);

  if (!isValidTransactionReference(normalizedReference)) {
    return {
      valid: false,
      normalizedReference,
      normalizedSender: '',
      error:
        params.paymentMethod === 'Bank Transfer'
          ? 'Please enter a valid Transaction ID or Bank Transfer Reference (4–64 characters).'
          : 'Please enter a valid Transaction ID (TrxID) of at least 4 characters.',
    };
  }

  const normalizedSender = normalizeSenderPhoneNumber(params.senderNumber);
  if (!isValidSenderPhoneNumber(normalizedSender)) {
    return {
      valid: false,
      normalizedReference,
      normalizedSender,
      error: 'Please enter a valid sender phone number (10–15 digits, e.g. 017XXXXXXXX).',
    };
  }

  return {
    valid: true,
    normalizedReference,
    normalizedSender,
  };
}

export interface ApproveAndPublishAdapters {
  requireUuidServiceId: boolean;
  approvePaymentRpc: (
    requestId: string,
    notes?: string
  ) => Promise<AdminPaymentApprovalRpcResult>;
  fetchPaymentRequestById: (requestId: string) => Promise<PaymentRequest | null>;
  fetchWebsiteById: (websiteId: string) => Promise<SubscribedWebsite | null>;
  publishWebsiteRpc: (
    websiteId: string
  ) => Promise<{ success: boolean; message: string; error: Error | null }>;
}

/**
 * Orchestrates verified admin payment approval and exact target website publishing.
 *
 * Security & correctness guarantees:
 * 1. Enforces verified admin caller role and blocks self-approval.
 * 2. Matches ONLY the exact target website (`website.id === req.serviceId && website.userId === req.userId`).
 *    Never falls back to another website belonging to the same store or merchant.
 * 3. Supports idempotent recovery (`mode === 'retry_publish'` or already-approved request)
 *    without invoking `admin_approve_payment_request` a second time (preventing double 30-day extension).
 * 4. Re-fetches authoritative website state after publish and reports `websitePublished: true`
 *    ONLY when `paymentStatus === 'paid'`, `subscriptionStatus === 'active'`, unexpired,
 *    and `deploymentStatus === 'live'`.
 */
export async function executeApproveAndPublishWorkflow(params: {
  mode: 'approve_and_publish' | 'retry_publish';
  request: PaymentRequest | null | undefined;
  notes?: string;
  callerRole: UserRole;
  callerUserId?: string;
  adapters: ApproveAndPublishAdapters;
}): Promise<ApproveAndPublishResult> {
  const { mode, request, notes, callerRole, callerUserId, adapters } = params;

  if (callerRole !== 'admin' || !callerUserId) {
    return {
      success: false,
      paymentApproved: false,
      websitePublished: false,
      isWebsiteService: false,
      code: 'FORBIDDEN',
      message: 'Unauthorized: Verified platform administrator role is required.',
    };
  }

  if (!request) {
    return {
      success: false,
      paymentApproved: false,
      websitePublished: false,
      isWebsiteService: false,
      code: 'NOT_FOUND',
      message: 'Payment request record was not found.',
    };
  }

  const isWebsiteService = isWebsitePaymentService(request.serviceType);

  if (request.status === 'rejected') {
    return {
      success: false,
      paymentApproved: false,
      websitePublished: false,
      isWebsiteService,
      code: 'ALREADY_REJECTED',
      message: 'This payment request was rejected and cannot be approved or published.',
    };
  }

  if (mode === 'approve_and_publish' && request.userId && request.userId === callerUserId) {
    return {
      success: false,
      paymentApproved: false,
      websitePublished: false,
      isWebsiteService,
      code: 'SELF_APPROVAL_FORBIDDEN',
      message: 'Access denied: Administrators cannot approve their own payment requests.',
    };
  }

  const cleanWebsiteId = (request.serviceId || '').trim();
  let precheckSite: SubscribedWebsite | null = null;

  if (isWebsiteService) {
    if (!cleanWebsiteId || (adapters.requireUuidServiceId && !UUID_FORMAT_REGEX.test(cleanWebsiteId))) {
      return {
        success: false,
        paymentApproved: request.status === 'approved',
        websitePublished: false,
        isWebsiteService: true,
        code: 'INVALID_SERVICE_ID',
        message: 'Target website ID is missing or invalid on this payment request.',
      };
    }

    precheckSite = await adapters.fetchWebsiteById(cleanWebsiteId);
    if (!precheckSite) {
      return {
        success: false,
        paymentApproved: request.status === 'approved',
        websitePublished: false,
        isWebsiteService: true,
        websiteId: cleanWebsiteId,
        code: 'TARGET_WEBSITE_NOT_FOUND',
        message: 'Target website record does not exist. Approval halted safely.',
      };
    }

    if (!precheckSite.userId || precheckSite.userId !== request.userId) {
      return {
        success: false,
        paymentApproved: request.status === 'approved',
        websitePublished: false,
        isWebsiteService: true,
        websiteId: cleanWebsiteId,
        code: 'OWNERSHIP_MISMATCH',
        message: 'Target website owner does not match the payment request submitter.',
      };
    }

    if (
      request.storeId &&
      precheckSite.storeId &&
      request.storeId.trim() !== precheckSite.storeId.trim()
    ) {
      return {
        success: false,
        paymentApproved: request.status === 'approved',
        websitePublished: false,
        isWebsiteService: true,
        websiteId: cleanWebsiteId,
        code: 'STORE_MISMATCH',
        message: 'Target website store does not match the payment request store.',
      };
    }

    if (precheckSite.subscriptionStatus === 'cancelled') {
      return {
        success: false,
        paymentApproved: request.status === 'approved',
        websitePublished: false,
        isWebsiteService: true,
        websiteId: cleanWebsiteId,
        subdomain: precheckSite.subdomain,
        fullDomainUrl: precheckSite.fullDomainUrl,
        deploymentStatus: precheckSite.deploymentStatus,
        subscriptionStatus: precheckSite.subscriptionStatus,
        paymentStatus: precheckSite.paymentStatus,
        code: 'WEBSITE_CANCELLED',
        message: 'Cannot approve or publish a cancelled website subscription.',
      };
    }
  }

  // Step 1: Payment Approval (or idempotent verification if already approved)
  let paymentApproved = request.status === 'approved';

  if (mode === 'retry_publish') {
    if (!paymentApproved) {
      const freshReq = await adapters.fetchPaymentRequestById(request.id);
      paymentApproved = freshReq?.status === 'approved';
    }
    if (!paymentApproved) {
      return {
        success: false,
        paymentApproved: false,
        websitePublished: false,
        isWebsiteService,
        websiteId: isWebsiteService ? cleanWebsiteId : undefined,
        code: 'PAYMENT_NOT_APPROVED',
        message: 'Payment request must be approved before retrying website publishing.',
      };
    }
  } else if (!paymentApproved) {
    const approvalRes = await adapters.approvePaymentRpc(request.id, notes);
    if (!approvalRes.success) {
      if (approvalRes.code === 'ALREADY_SETTLED') {
        const freshReq = await adapters.fetchPaymentRequestById(request.id);
        if (freshReq?.status === 'approved') {
          paymentApproved = true;
        }
      }
      if (!paymentApproved) {
        return {
          success: false,
          paymentApproved: false,
          websitePublished: false,
          isWebsiteService,
          websiteId: isWebsiteService ? cleanWebsiteId : undefined,
          code: approvalRes.code || 'APPROVAL_FAILED',
          message: approvalRes.error?.message || approvalRes.message || 'Payment approval failed.',
        };
      }
    } else {
      paymentApproved = true;
    }
  }

  // Step 2: Non-website plans finish immediately after verified approval
  if (!isWebsiteService) {
    return {
      success: true,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: false,
      code: 'APPROVED',
      message: 'Payment approved and service plan activated.',
    };
  }

  // Step 3: Post-approval exact website verification & publishing
  const postApprovalSite = await adapters.fetchWebsiteById(cleanWebsiteId);
  if (!postApprovalSite || postApprovalSite.userId !== request.userId) {
    return {
      success: false,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: true,
      partialFailure: true,
      websiteId: cleanWebsiteId,
      code: 'POST_APPROVAL_SITE_MISSING',
      message:
        'Payment was approved, but the target website state could not be verified. Use Retry Publish.',
    };
  }

  if (postApprovalSite.paymentStatus !== 'paid') {
    return {
      success: false,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: true,
      partialFailure: true,
      websiteId: cleanWebsiteId,
      subdomain: postApprovalSite.subdomain,
      fullDomainUrl: postApprovalSite.fullDomainUrl,
      deploymentStatus: postApprovalSite.deploymentStatus,
      subscriptionStatus: postApprovalSite.subscriptionStatus,
      paymentStatus: postApprovalSite.paymentStatus,
      code: 'PAYMENT_STATUS_NOT_SYNCED',
      message:
        'Payment was approved, but the website record is not yet marked paid. Refresh and Retry Publish.',
    };
  }

  if (postApprovalSite.subscriptionStatus === 'suspended') {
    return {
      success: true,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: true,
      suspendedHold: true,
      websiteId: cleanWebsiteId,
      subdomain: postApprovalSite.subdomain,
      fullDomainUrl: postApprovalSite.fullDomainUrl,
      deploymentStatus: postApprovalSite.deploymentStatus,
      subscriptionStatus: postApprovalSite.subscriptionStatus,
      paymentStatus: postApprovalSite.paymentStatus,
      code: 'SUSPENDED_HOLD',
      message:
        'Payment approved and billing period extended. Website remains offline due to an active admin suspension.',
    };
  }

  // If `admin_approve_payment_request` did not already set `deployment_status = 'live'`
  // (e.g., `website_package`, older RPC revision, or retry after partial failure),
  // invoke the hardened `publish_client_website` RPC on the exact website ID.
  if (postApprovalSite.deploymentStatus !== 'live') {
    const pubRes = await adapters.publishWebsiteRpc(cleanWebsiteId);
    if (!pubRes.success) {
      return {
        success: false,
        paymentApproved: true,
        websitePublished: false,
        isWebsiteService: true,
        partialFailure: true,
        websiteId: cleanWebsiteId,
        subdomain: postApprovalSite.subdomain,
        fullDomainUrl: postApprovalSite.fullDomainUrl,
        deploymentStatus: postApprovalSite.deploymentStatus,
        subscriptionStatus: postApprovalSite.subscriptionStatus,
        paymentStatus: postApprovalSite.paymentStatus,
        code: 'PUBLISH_FAILED',
        message: `Payment approved, but website publishing failed: ${pubRes.message || 'Unknown error'}. Use Retry Publish to recover safely.`,
      };
    }
  }

  // Step 4: Authoritative post-publish verification before reporting Live
  const verifiedLiveSite = await adapters.fetchWebsiteById(cleanWebsiteId);
  if (!verifiedLiveSite || verifiedLiveSite.userId !== request.userId) {
    return {
      success: false,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: true,
      partialFailure: true,
      websiteId: cleanWebsiteId,
      code: 'VERIFY_PUBLISH_FAILED',
      message:
        'Payment approved, but post-publish verification could not confirm deployment status. Use Retry Publish.',
    };
  }

  if (!isWebsiteTrulyLive(verifiedLiveSite)) {
    return {
      success: false,
      paymentApproved: true,
      websitePublished: false,
      isWebsiteService: true,
      partialFailure: true,
      websiteId: cleanWebsiteId,
      subdomain: verifiedLiveSite.subdomain,
      fullDomainUrl: verifiedLiveSite.fullDomainUrl,
      deploymentStatus: verifiedLiveSite.deploymentStatus,
      subscriptionStatus: verifiedLiveSite.subscriptionStatus,
      paymentStatus: verifiedLiveSite.paymentStatus,
      code: 'NOT_LIVE_AFTER_PUBLISH',
      message: `Payment approved, but website deployment status is "${verifiedLiveSite.deploymentStatus}". Use Retry Publish.`,
    };
  }

  return {
    success: true,
    paymentApproved: true,
    websitePublished: true,
    isWebsiteService: true,
    websiteId: cleanWebsiteId,
    subdomain: verifiedLiveSite.subdomain,
    fullDomainUrl: verifiedLiveSite.fullDomainUrl,
    deploymentStatus: 'live',
    subscriptionStatus: verifiedLiveSite.subscriptionStatus,
    paymentStatus: 'paid',
    code: 'APPROVED_AND_PUBLISHED',
    message: `Payment approved and https://${verifiedLiveSite.fullDomainUrl} is now Active and Live!`,
  };
}

/**
 * Resolves the canonical public storefront URL for a published client website:
 * - On `amaas.xyz` / `*.amaas.xyz` production hosts, points directly to `https://<subdomain>.amaas.xyz`.
 * - On localhost, preview, or staging hosts without wildcard DNS, points to `/sites/<subdomain>`.
 */
export function getPublicWebsiteHref(
  site: Pick<SubscribedWebsite, 'subdomain' | 'fullDomainUrl'> | null | undefined,
  currentHostname?: string
): string {
  const cleanSub = (site?.subdomain || '').trim().toLowerCase();
  if (!cleanSub) return '/';

  const rawDomain = (site?.fullDomainUrl || `${cleanSub}.amaas.xyz`)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();

  const host = (
    currentHostname !== undefined
      ? currentHostname
      : typeof window !== 'undefined'
      ? window.location.hostname
      : ''
  )
    .trim()
    .toLowerCase();

  if (host === 'amaas.xyz' || host.endsWith('.amaas.xyz')) {
    return `https://${rawDomain || `${cleanSub}.amaas.xyz`}`;
  }

  return `/sites/${encodeURIComponent(cleanSub)}`;
}
