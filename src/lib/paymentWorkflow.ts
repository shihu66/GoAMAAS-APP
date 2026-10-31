import {
  AdminPaymentApprovalRpcResult,
  ApproveAndPublishResult,
  PaymentMethodType,
  PaymentRequest,
  SubscribedWebsite,
  UserRole,
} from '../types';

const UUID_FORMAT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function isWebsiteTrulyLive(site?: SubscribedWebsite | null): boolean {
  if (!site) return false;
  if (site.paymentStatus !== 'paid') return false;
  if (site.subscriptionStatus !== 'active' && site.subscriptionStatus !== 'grace_period') {
    return false;
  }
  return site.deploymentStatus === 'live';
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
 *    without invoking `admin_approve_payment_request` a second time.
 * 4. Re-fetches authoritative website state after publish and reports `websitePublished: true`
 *    ONLY when `paymentStatus === 'paid'`, `subscriptionStatus` is `'active' | 'grace_period'`,
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
