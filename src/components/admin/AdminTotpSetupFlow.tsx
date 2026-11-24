import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  AdminMfaState,
  VerifiedAdminFactor,
  recordAdminSessionEvent,
  refreshAndInspectAdminMfaState,
  replaceVerifiedAdminTotpFactor,
  startAdminTotpEnrollment,
  verifyAdminTotpChallenge,
} from '../../lib/adminSecurity';

interface AdminMfaRecoveryGuideProps {
  factor: VerifiedAdminFactor;
  isOnline: boolean;
  onRecheckMfaStatus: () => Promise<{ removed: boolean; message?: string }>;
  defaultExpanded?: boolean;
}

export const AdminMfaRecoveryGuide: React.FC<AdminMfaRecoveryGuideProps> = ({
  factor,
  isOnline,
  onRecheckMfaStatus,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'warning' | 'success';
    text: string;
  } | null>(null);

  const handleRecheck = async () => {
    if (isChecking || !isOnline) return;
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const res = await onRecheckMfaStatus();
      if (res.removed) {
        setStatusMessage({
          tone: 'success',
          text:
            res.message ||
            'Lost authenticator factor is no longer active. You can now set up a new Authenticator QR code.',
        });
      } else {
        setStatusMessage({
          tone: 'warning',
          text:
            res.message ||
            `Factor "${factor.friendlyName}" is still active in Supabase Auth. Remove it in Supabase Dashboard → Authentication → Users first, then recheck.`,
        });
      }
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full py-2 px-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 inline-flex items-center justify-between gap-2 transition-colors cursor-pointer text-left"
      >
        <span>Don&apos;t have GoAMAAS Admin in your Authenticator app?</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-2.5 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/80 text-xs space-y-2.5 text-left">
          <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-bold text-slate-900 dark:text-white">
                Authenticator Recovery &amp; Secure Re-Enrollment
              </p>
              <p>
                A verified TOTP factor (<strong>{factor.friendlyName}</strong>, ID{' '}
                <code className="font-mono text-[11px] bg-white/80 dark:bg-slate-900 px-1 py-0.5 rounded">
                  {factor.id.slice(0, 8)}...
                </code>
                ) is already enrolled on this administrator account.
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                For security, existing TOTP secrets and QR codes can never be viewed or recovered after setup, and two-factor authentication cannot be bypassed or auto-disabled without AAL2.
              </p>
            </div>
          </div>

          <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>
              Open <strong>Supabase Dashboard &rarr; Authentication &rarr; Users</strong>, select your authorized administrator user record, and delete the lost verified TOTP factor under <strong>Multi-Factor Authentication (MFA)</strong>.
            </li>
            <li>
              Return to this screen and click <strong>Recheck Authenticator Status</strong> below to generate a brand-new QR code and setup key for Google Authenticator or Microsoft Authenticator.
            </li>
          </ol>

          {statusMessage && (
            <div
              role="status"
              className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
                statusMessage.tone === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-white/90 dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          <button
            type="button"
            disabled={isChecking || !isOnline}
            onClick={() => void handleRecheck()}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-amber-300 dark:border-amber-700 disabled:opacity-50 text-slate-900 dark:text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isChecking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span>{isChecking ? 'Checking MFA State...' : 'Recheck Authenticator Status'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

interface AdminTotpSetupAndVerifyPanelProps {
  mfa: AdminMfaState;
  adminId: string;
  adminName?: string;
  isOnline: boolean;
  autoStartEnroll?: boolean;
  compact?: boolean;
  onRefreshVerification: () => Promise<unknown>;
  onAal2Confirmed?: () => Promise<void> | void;
  onRequestRemoveFactor?: (factorId: string) => void;
}

export const AdminTotpSetupAndVerifyPanel: React.FC<AdminTotpSetupAndVerifyPanelProps> = ({
  mfa,
  adminId,
  adminName,
  isOnline,
  autoStartEnroll = false,
  compact = false,
  onRefreshVerification,
  onAal2Confirmed,
  onRequestRemoveFactor,
}) => {
  const [enrollingMfa, setEnrollingMfa] = useState<{
    factorId: string;
    qrCodeSvgDataUri: string;
    secret: string;
  } | null>(null);
  const [verifyingMfaFactor, setVerifyingMfaFactor] = useState<{
    factor: VerifiedAdminFactor;
    mode: 'existing_verified' | 'resume_unverified';
  } | null>(null);
  const [replacingFactorId, setReplacingFactorId] = useState<string | null>(null);
  const [mfaEnrollCode, setMfaEnrollCode] = useState('');
  const [verifyFactorCode, setVerifyFactorCode] = useState('');
  const [mfaActionBusy, setMfaActionBusy] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [mfaActionFeedback, setMfaActionFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const autoStartedRef = React.useRef(false);

  // Clear ephemeral enrollment secrets from memory on unmount or once AAL2 is confirmed with enrolled factor
  useEffect(() => {
    return () => {
      setEnrollingMfa(null);
      setSecretCopied(false);
    };
  }, []);

  const handleStartMfaEnroll = React.useCallback(
    async (unverifiedAction: 'prompt' | 'remove_and_enroll' = 'prompt') => {
      if (mfaActionBusy || !isOnline) return;
      setMfaActionBusy(true);
      setMfaActionFeedback(null);
      try {
        const res = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
          unverifiedAction,
        });

        if (res.status === 'already_verified' && res.existingFactor) {
          setEnrollingMfa(null);
          setVerifyingMfaFactor(null);
          await onRefreshVerification();
          setMfaActionFeedback({
            tone: 'success',
            text: `Existing authenticator "${res.existingFactor.friendlyName}" is already verified and active at AAL2.`,
          });
          if (onAal2Confirmed) await onAal2Confirmed();
          return;
        }

        if (res.status === 'challenge_required' && res.existingFactor) {
          setEnrollingMfa(null);
          setVerifyingMfaFactor({
            factor: res.existingFactor,
            mode: 'existing_verified',
          });
          setVerifyFactorCode('');
          await onRefreshVerification();
          setMfaActionFeedback({
            tone: 'warning',
            text: `Existing verified authenticator "${res.existingFactor.friendlyName}" found. Enter a 6-digit code from your app to elevate this session to AAL2.`,
          });
          return;
        }

        if (res.status === 'pending_unverified' && res.existingFactor) {
          setEnrollingMfa(null);
          await onRefreshVerification();
          setMfaActionFeedback({
            tone: 'warning',
            text: `A pending unverified setup for "${res.existingFactor.friendlyName}" already exists. Complete it with a 6-digit code if you already scanned it, or generate a new QR code below.`,
          });
          return;
        }

        if (
          res.status !== 'enrolled' ||
          res.error ||
          !res.factorId ||
          !res.qrCodeSvgDataUri ||
          !res.secret
        ) {
          setMfaActionFeedback({
            tone: 'warning',
            text: res.error || 'Unable to start authenticator enrollment.',
          });
          return;
        }

        setVerifyingMfaFactor(null);
        setReplacingFactorId(null);
        setSecretCopied(false);
        setEnrollingMfa({
          factorId: res.factorId,
          qrCodeSvgDataUri: res.qrCodeSvgDataUri,
          secret: res.secret,
        });
        setMfaEnrollCode('');
        await onRefreshVerification();
      } finally {
        setMfaActionBusy(false);
      }
    },
    [isOnline, mfaActionBusy, onAal2Confirmed, onRefreshVerification]
  );

  // Auto-launch enrollment or AAL2 challenge when modal opened specifically to resolve MFA
  useEffect(() => {
    if (!autoStartEnroll || autoStartedRef.current) return;
    if (enrollingMfa || verifyingMfaFactor) return;
    autoStartedRef.current = true;
    if (mfa.isMfaEnrolled && mfa.verifiedTotpFactors[0] && mfa.currentLevel !== 'aal2') {
      setVerifyingMfaFactor({
        factor: mfa.verifiedTotpFactors[0],
        mode: 'existing_verified',
      });
      return;
    }
    if (!mfa.isMfaEnrolled && mfa.unverifiedTotpFactors.length === 0) {
      void handleStartMfaEnroll('prompt');
    }
  }, [
    autoStartEnroll,
    enrollingMfa,
    handleStartMfaEnroll,
    mfa.currentLevel,
    mfa.isMfaEnrolled,
    mfa.unverifiedTotpFactors.length,
    mfa.verifiedTotpFactors,
    verifyingMfaFactor,
  ]);

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
        adminId,
        action: 'mfa_totp_enrolled',
        targetType: 'mfa',
        targetId: enrollingMfa.factorId,
        outcome: 'success',
        summary: 'Enrolled, verified TOTP authenticator factor, and confirmed AAL2 session.',
      });
      setEnrollingMfa(null);
      setMfaEnrollCode('');
      setSecretCopied(false);
      await onRefreshVerification();
      setMfaActionFeedback({
        tone: 'success',
        text: 'Authenticator verified and active. Session assurance confirmed at AAL2.',
      });
      if (onAal2Confirmed) {
        await onAal2Confirmed();
      }
    } finally {
      setMfaActionBusy(false);
    }
  };

  const handleConfirmExistingOrPendingFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingMfaFactor || mfaActionBusy) return;
    setMfaActionBusy(true);
    setMfaActionFeedback(null);
    try {
      const target = verifyingMfaFactor;
      const res = await verifyAdminTotpChallenge(target.factor.id, verifyFactorCode);
      if (!res.success) {
        setMfaActionFeedback({
          tone: 'error',
          text: res.error || 'Invalid 6-digit verification code.',
        });
        return;
      }
      recordAdminSessionEvent({
        adminId,
        action:
          target.mode === 'resume_unverified' ? 'mfa_totp_enrolled' : 'mfa_step_up_verified',
        targetType: 'mfa',
        targetId: target.factor.id,
        outcome: 'success',
        summary:
          target.mode === 'resume_unverified'
            ? 'Completed pending TOTP enrollment and confirmed AAL2 session.'
            : 'Verified existing TOTP authenticator factor and confirmed AAL2 session.',
      });
      setVerifyingMfaFactor(null);
      setVerifyFactorCode('');
      await onRefreshVerification();
      setMfaActionFeedback({
        tone: 'success',
        text:
          target.mode === 'resume_unverified'
            ? 'Pending authenticator verified and session confirmed at AAL2.'
            : 'Existing authenticator verified and session confirmed at AAL2.',
      });
      if (onAal2Confirmed) {
        await onAal2Confirmed();
      }
    } finally {
      setMfaActionBusy(false);
    }
  };

  const handleConfirmReplaceVerifiedFactor = async (oldFactorId: string) => {
    if (mfaActionBusy || !isOnline) return;
    setMfaActionBusy(true);
    setMfaActionFeedback(null);
    try {
      const res = await replaceVerifiedAdminTotpFactor(oldFactorId, 'GoAMAAS Admin Authenticator');
      if (res.status !== 'enrolled' || res.error || !res.factorId || !res.qrCodeSvgDataUri || !res.secret) {
        setMfaActionFeedback({
          tone: 'error',
          text: res.error || 'Could not replace existing authenticator factor.',
        });
        return;
      }
      recordAdminSessionEvent({
        adminId,
        action: 'mfa_totp_replaced',
        targetType: 'mfa',
        targetId: oldFactorId,
        outcome: 'success',
        summary: 'Removed previous verified TOTP factor and started new QR enrollment.',
      });
      setReplacingFactorId(null);
      setVerifyingMfaFactor(null);
      setSecretCopied(false);
      setEnrollingMfa({
        factorId: res.factorId,
        qrCodeSvgDataUri: res.qrCodeSvgDataUri,
        secret: res.secret,
      });
      setMfaEnrollCode('');
      await onRefreshVerification();
    } finally {
      setMfaActionBusy(false);
    }
  };

  const handleCopySecret = async (secretValue: string) => {
    try {
      await navigator.clipboard.writeText(secretValue);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleRecoveryRecheck = async (): Promise<{ removed: boolean; message?: string }> => {
    const refreshed = await refreshAndInspectAdminMfaState();
    await onRefreshVerification();
    if (!refreshed.isMfaEnrolled) {
      setVerifyingMfaFactor(null);
      return {
        removed: true,
        message: 'Previous factor removed. Click "Set Up Authenticator" to scan a new QR code.',
      };
    }
    return {
      removed: false,
      message: `Factor "${refreshed.verifiedTotpFactors[0]?.friendlyName || 'Authenticator'}" is still active on Supabase Auth.`,
    };
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              mfa.isMfaVerifiedForSession
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            {mfa.isMfaVerifiedForSession ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              <KeyRound className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Two-Factor Authentication (TOTP)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {adminName ? (
                <>
                  Session: <span className="font-medium text-slate-700 dark:text-slate-300">{adminName}</span> &middot;{' '}
                </>
              ) : null}
              Assurance Level:{' '}
              <strong
                className={`font-mono uppercase ${
                  mfa.currentLevel === 'aal2'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {mfa.currentLevel || 'aal1'}
              </strong>
              {mfa.isMfaVerifiedForSession ? ' (Verified)' : ' (AAL2 required for permanent deletion)'}
            </p>
          </div>
        </div>

        {!mfa.isMfaEnrolled &&
          mfa.unverifiedTotpFactors.length === 0 &&
          !enrollingMfa &&
          !verifyingMfaFactor && (
            <button
              type="button"
              disabled={mfaActionBusy || !isOnline}
              onClick={() => void handleStartMfaEnroll('prompt')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              {mfaActionBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              <span>Set Up Authenticator</span>
            </button>
          )}
      </div>

      {mfa.inspectionError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Unable to inspect MFA status: {mfa.inspectionError}</span>
        </div>
      )}

      {mfaActionFeedback && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border leading-relaxed flex items-start gap-2.5 ${
            mfaActionFeedback.tone === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : mfaActionFeedback.tone === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {mfaActionFeedback.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{mfaActionFeedback.text}</span>
        </div>
      )}

      {/* Existing Verified TOTP Factor(s) */}
      {mfa.isMfaEnrolled && !enrollingMfa && (
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          {mfa.verifiedTotpFactors.map((factor) => (
            <div
              key={factor.id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    {factor.friendlyName}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Verified TOTP Factor &middot; Enforced on sign-in and permanent deletion
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {mfa.currentLevel !== 'aal2' && !verifyingMfaFactor && (
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => {
                        setVerifyFactorCode('');
                        setMfaActionFeedback(null);
                        setVerifyingMfaFactor({ factor, mode: 'existing_verified' });
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Verify to AAL2
                    </button>
                  )}
                  {mfa.currentLevel === 'aal2' && replacingFactorId !== factor.id && (
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => setReplacingFactorId(factor.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Replace Authenticator
                    </button>
                  )}
                  {onRequestRemoveFactor && mfa.currentLevel === 'aal2' && (
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => onRequestRemoveFactor(factor.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-semibold text-xs cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {replacingFactorId === factor.id && mfa.currentLevel === 'aal2' && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2.5 text-[11px] text-amber-900 dark:text-amber-200">
                  <p className="leading-relaxed">
                    <strong>Re-enroll a New Authenticator App:</strong> Previous TOTP secrets cannot be recovered. Confirming will deactivate <strong>{factor.friendlyName}</strong> and immediately generate a new QR code and manual setup key.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => void handleConfirmReplaceVerifiedFactor(factor.id)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {mfaActionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Deactivate Old &amp; Generate New QR</span>
                    </button>
                    <button
                      type="button"
                      disabled={mfaActionBusy}
                      onClick={() => setReplacingFactorId(null)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mfa.currentLevel !== 'aal2' && (
                <AdminMfaRecoveryGuide
                  factor={factor}
                  isOnline={isOnline}
                  onRecheckMfaStatus={handleRecoveryRecheck}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending / Unverified TOTP Factor(s) detected via listFactors() data.all */}
      {!mfa.isMfaEnrolled &&
        mfa.unverifiedTotpFactors.length > 0 &&
        !enrollingMfa &&
        !verifyingMfaFactor && (
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            {mfa.unverifiedTotpFactors.map((factor) => (
              <div
                key={factor.id}
                className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col gap-3"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    Pending Setup: {factor.friendlyName}
                  </span>
                  <span className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed block mt-0.5">
                    An unfinished TOTP setup exists in your account without an active QR code. If you do not have this code in your Authenticator app, click <strong>Set Up Authenticator (New QR Code)</strong> below to replace the stale setup safely.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={mfaActionBusy || !isOnline}
                    onClick={() => void handleStartMfaEnroll('remove_and_enroll')}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {mfaActionBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <QrCode className="w-3.5 h-3.5" />
                    )}
                    <span>Set Up Authenticator (New QR Code)</span>
                  </button>
                  <button
                    type="button"
                    disabled={mfaActionBusy || !isOnline}
                    onClick={() => {
                      setVerifyFactorCode('');
                      setMfaActionFeedback(null);
                      setVerifyingMfaFactor({ factor, mode: 'resume_unverified' });
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
                  >
                    I Already Scanned It &mdash; Enter Code
                  </button>
                  {onRequestRemoveFactor && (
                    <button
                      type="button"
                      disabled={mfaActionBusy || !isOnline}
                      onClick={() => onRequestRemoveFactor(factor.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-semibold text-xs cursor-pointer"
                    >
                      Remove Stale
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Verify Existing Verified Factor OR Resume Unverified Pending Factor */}
      {verifyingMfaFactor && (
        <form
          onSubmit={(e) => void handleConfirmExistingOrPendingFactor(e)}
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            {verifyingMfaFactor.mode === 'resume_unverified'
              ? `Enter the 6-digit verification code from "${verifyingMfaFactor.factor.friendlyName}" to finish verifying this setup and elevate your session to AAL2.`
              : `Enter the 6-digit verification code from Google Authenticator or Microsoft Authenticator ("${verifyingMfaFactor.factor.friendlyName}") to confirm AAL2 session assurance.`}
          </p>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              6-Digit Authenticator Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={verifyFactorCode}
              onChange={(e) => {
                setVerifyFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                if (mfaActionFeedback?.tone === 'error') setMfaActionFeedback(null);
              }}
              placeholder="000000"
              className="w-full sm:w-48 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-base tracking-widest text-center tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-600"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={mfaActionBusy || verifyFactorCode.length !== 6}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              {mfaActionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Verify &amp; Confirm AAL2</span>
            </button>
            {verifyingMfaFactor.mode === 'resume_unverified' && (
              <button
                type="button"
                disabled={mfaActionBusy || !isOnline}
                onClick={() => void handleStartMfaEnroll('remove_and_enroll')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Generate New QR Code Instead
              </button>
            )}
            <button
              type="button"
              disabled={mfaActionBusy}
              onClick={() => {
                setVerifyingMfaFactor(null);
                setVerifyFactorCode('');
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Active New TOTP QR Enrollment Screen */}
      {enrollingMfa && (
        <form
          onSubmit={(e) => void handleConfirmMfaEnroll(e)}
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div className="space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Step 1: Scan QR Code or Enter Setup Key
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Scan this QR code using <strong>Google Authenticator</strong> or{' '}
              <strong>Microsoft Authenticator</strong> (or enter the manual setup key), then enter the 6-digit code below.
            </p>
          </div>

          <div className={`flex flex-col ${compact ? '' : 'sm:flex-row'} items-center gap-4`}>
            <div className="p-3 rounded-xl bg-white border border-slate-200 shrink-0 shadow-xs">
              <img
                src={enrollingMfa.qrCodeSvgDataUri}
                alt="GoAMAAS Admin TOTP Authenticator QR Code"
                referrerPolicy="no-referrer"
                className="w-40 h-40"
              />
            </div>

            <div className="space-y-3 w-full min-w-0">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Manual Setup Key (Secret):
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopySecret(enrollingMfa.secret)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                  >
                    {secretCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Key</span>
                      </>
                    )}
                  </button>
                </div>
                <code className="block p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all text-slate-900 dark:text-white select-all">
                  {enrollingMfa.secret}
                </code>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Step 2: Enter 6-Digit Code from Authenticator App
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={mfaEnrollCode}
                  onChange={(e) => {
                    setMfaEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (mfaActionFeedback?.tone === 'error') setMfaActionFeedback(null);
                  }}
                  placeholder="000000"
                  className="w-full sm:w-48 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-base tracking-widest text-center tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={mfaActionBusy || mfaEnrollCode.length !== 6}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              {mfaActionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Verify &amp; Activate Authenticator</span>
            </button>
            <button
              type="button"
              disabled={mfaActionBusy}
              onClick={() => {
                setEnrollingMfa(null);
                setMfaEnrollCode('');
                setSecretCopied(false);
                void onRefreshVerification();
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
