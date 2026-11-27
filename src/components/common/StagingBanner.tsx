import React, { useEffect } from 'react';
import { checkGoogleOAuthProviderStatus, isStagingSupabaseRuntime } from '../../lib/supabase';

export function StagingBanner() {
  const isStagingRuntime = isStagingSupabaseRuntime();

  useEffect(() => {
    if (!isStagingRuntime) return;
    void checkGoogleOAuthProviderStatus();
  }, [isStagingRuntime]);

  if (!isStagingRuntime) return null;

  return (
    <div
      data-testid="staging-environment-banner"
      className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs sm:text-sm font-bold shadow-md sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-600"
    >
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-950 animate-pulse" />
      <span>
        ⚠️ STAGING ENVIRONMENT ACTIVE — Connected to Supabase Staging (umiheyukaddfaupsyooh). All actions performed here are isolated from Production.
      </span>
    </div>
  );
}

