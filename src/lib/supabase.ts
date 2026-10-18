import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';

// Environment variables (safe for Vite client runtime, dynamic defines, and Node/testing)
const getEnvVar = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      const val = import.meta.env[key];
      if (typeof val === 'string' && val.trim()) {
        if (key === 'VITE_SUPABASE_URL') {
          if (val.trim().startsWith('https://')) return val.trim();
        } else {
          return val.trim();
        }
      }
    }
  } catch {}

  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      const pVal = process.env[key];
      if (typeof pVal === 'string' && pVal.trim()) {
        if (key === 'VITE_SUPABASE_URL') {
          if (pVal.trim().startsWith('https://')) return pVal.trim();
        } else {
          return pVal.trim();
        }
      }
    }
  } catch {}

  // Fallback to configured project URL if URL variable was malformed
  if (key === 'VITE_SUPABASE_URL') {
    return 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
  }

  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Check if credentials exist and are valid production/project values
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key-here' &&
  supabaseAnonKey !== 'your-anon-key' &&
  supabaseUrl.startsWith('https://')
);

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  missingVariables: string[];
  setupInstructions: string[];
  redirectUrl: string;
}

export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  const missingVariables: string[] = [];
  if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || !supabaseUrl.startsWith('https://')) {
    missingVariables.push('VITE_SUPABASE_URL');
  }
  if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key-here' || supabaseAnonKey === 'your-anon-key') {
    missingVariables.push('VITE_SUPABASE_ANON_KEY');
  }

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const redirectUrl = `${currentOrigin}/auth/callback`;

  const setupInstructions = [
    '1. Create or open your project at https://supabase.com/dashboard.',
    '2. Go to Project Settings -> API and copy the Project URL and anon public API key.',
    '3. In your environment or .env.local file, configure:\n   VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"\n   VITE_SUPABASE_ANON_KEY="<your-anon-key>"',
    '4. To enable Google OAuth: Go to Supabase Dashboard -> Authentication -> Providers -> Google.',
    '5. In Google Cloud Console (APIs & Services -> Credentials -> OAuth 2.0 Client IDs), set Authorized redirect URI to your Supabase callback URL (e.g. https://<project-ref>.supabase.co/auth/v1/callback).',
    `6. In Supabase Dashboard -> Authentication -> URL Configuration, add "${redirectUrl}" and "${currentOrigin}/reset-password" to Authorized Redirect URLs.`,
    '7. Execute supabase/schema.sql in Supabase SQL Editor to provision tables, triggers, and Row Level Security policies.',
  ];

  return {
    isConfigured: isSupabaseConfigured,
    missingVariables,
    setupInstructions,
    redirectUrl,
  };
};

// Singleton Supabase client (gracefully null if unconfigured)
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface UserProfileRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  role: 'merchant' | 'admin';
  onboarding_completed: boolean;
  store_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Initiates the real Google OAuth sign-in flow through Supabase Auth.
 * Never simulates authentication.
 */
export async function signInWithGoogle(customRedirectTo?: string): Promise<{ data: { provider: string; url: string } | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      data: null,
      error: new Error(
        `Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}. Please configure them in .env.local to enable Google authentication.`
      ),
    };
  }

  try {
    // Determine the authoritative redirect URL:
    // If running in production on app.amaas.xyz (or any non-preview domain), ensure we use that origin.
    const isProductionHost = typeof window !== 'undefined' && (
      window.location.hostname === 'app.amaas.xyz' ||
      window.location.hostname.endsWith('.amaas.xyz')
    );
    const origin = isProductionHost ? 'https://app.amaas.xyz' : window.location.origin;
    const redirectTo = customRedirectTo || `${origin}/auth/callback`;

    // Diagnostic logging without sensitive credentials or tokens
    console.info('[GoAMAAS Auth] Initiating Google OAuth flow', {
      origin: window.location.origin,
      hostname: window.location.hostname,
      isProductionHost,
      resolvedRedirectTo: redirectTo,
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true, // We inspect and handle navigation explicitly
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('[GoAMAAS Auth] signInWithOAuth returned error:', error.message);
      return { data: null, error };
    }

    if (data?.url) {
      let targetAuthHost = 'unknown';
      try {
        const parsedUrl = new URL(data.url);
        targetAuthHost = parsedUrl.host;
      } catch {}

      console.info('[GoAMAAS Auth] Navigating directly to Supabase Auth provider URL', {
        currentHostname: window.location.hostname,
        targetAuthHost,
        resolvedRedirectTo: redirectTo,
      });

      // Explicitly assign top-level window location to avoid any iframe/bridge interception
      if (typeof window !== 'undefined') {
        window.location.assign(data.url);
      }
    }

    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred during Google sign-in'),
    };
  }
}

/**
 * Signs in with email and password via Supabase Auth.
 */
export async function signInWithEmail(email: string, password: string): Promise<{ user: SupabaseUser | null; session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      user: null,
      session: null,
      error: new Error(`Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      session: null,
      error: err instanceof Error ? err : new Error('Failed to sign in with email and password'),
    };
  }
}

/**
 * Registers a new account with email and password via Supabase Auth.
 */
export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
  businessName: string
): Promise<{ user: SupabaseUser | null; session: Session | null; needsEmailConfirmation: boolean; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      user: null,
      session: null,
      needsEmailConfirmation: false,
      error: new Error(`Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const origin = window.location.origin;
    const emailRedirectTo = `${origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          business_name: businessName.trim(),
          role: 'merchant',
          onboarding_completed: false,
        },
        emailRedirectTo,
      },
    });

    if (error) {
      return { user: null, session: null, needsEmailConfirmation: false, error };
    }

    // If Supabase has email confirmation enabled, user is returned but session is null
    const needsEmailConfirmation = Boolean(data.user && !data.session);

    return {
      user: data.user,
      session: data.session,
      needsEmailConfirmation,
      error: null,
    };
  } catch (err: unknown) {
    return {
      user: null,
      session: null,
      needsEmailConfirmation: false,
      error: err instanceof Error ? err : new Error('Failed to create account with email and password'),
    };
  }
}

/**
 * Requests a real password reset link sent to the user's email via Supabase Auth.
 */
export async function resetPasswordForEmail(email: string, customRedirectTo?: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      error: new Error(`Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const origin = window.location.origin;
    const redirectTo = customRedirectTo || `${origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    return { error };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err : new Error('Failed to send password recovery email'),
    };
  }
}

/**
 * Updates the authenticated user's password in Supabase Auth.
 */
export async function updateUserPassword(newPassword: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      error: new Error(`Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    return { error };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err : new Error('Failed to update account password'),
    };
  }
}

/**
 * Resends the signup email verification link via Supabase Auth.
 */
export async function resendVerificationEmail(email: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      error: new Error(`Supabase is not configured. Missing environment variables: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const origin = window.location.origin;
    const emailRedirectTo = `${origin}/auth/callback`;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo,
      },
    });

    return { error };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err : new Error('Failed to resend confirmation email'),
    };
  }
}

/**
 * Fetches user profile from Supabase PostgreSQL public.profiles table.
 * Accurately reports missing configuration or database errors.
 */
export async function getUserProfile(userId: string): Promise<{ profile: UserProfileRecord | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      profile: null,
      error: new Error(`Supabase is not configured. Missing: ${status.missingVariables.join(', ')}.`),
    };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data as UserProfileRecord | null, error: null };
  } catch (err: unknown) {
    return {
      profile: null,
      error: err instanceof Error ? err : new Error('Failed to query user profile from Supabase'),
    };
  }
}

/**
 * Upserts user profile in Supabase PostgreSQL public.profiles table.
 * Never silently reports success when Supabase is unconfigured or returns an error.
 */
export async function upsertUserProfile(profile: Partial<UserProfileRecord> & { id: string }): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    const status = getSupabaseConfigStatus();
    return {
      error: new Error(`Supabase is not configured. Missing: ${status.missingVariables.join(', ')}. Unable to persist profile.`),
    };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        ...profile,
        updated_at: new Date().toISOString(),
      });

    return { error };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err : new Error('Failed to persist user profile in Supabase'),
    };
  }
}

/**
 * Signs out from the active Supabase session.
 */
export async function signOutFromSupabase(): Promise<{ error: Error | null }> {
  if (!supabase) {
    return { error: null };
  }

  const { error } = await supabase.auth.signOut();
  return { error };
}

export type { SupabaseUser, Session };

// ==============================================================================
// Service Trials Database API
// ==============================================================================
export interface RawServiceTrialRow {
  id: string;
  user_id: string;
  store_id?: string | null;
  service_id: string;
  service_name: string;
  service_category: 'dashboard' | 'ai_automation' | 'website' | 'landing_pages';
  status: 'active' | 'expired' | 'converted';
  started_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export async function fetchUserServiceTrials(userId: string): Promise<{ data: RawServiceTrialRow[] | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('service_trials')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      // If table has not been created yet in remote Supabase, gracefully report error
      return { data: null, error };
    }
    return { data: (data as RawServiceTrialRow[]) || [], error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to query service trials from Supabase'),
    };
  }
}

export async function activateServiceTrialInDb(params: {
  serviceId: string;
  serviceName: string;
  serviceCategory: 'dashboard' | 'ai_automation' | 'website' | 'landing_pages';
  userId: string;
  storeId?: string | null;
}): Promise<{ data: RawServiceTrialRow | null; error: Error | null; alreadyUsed?: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: new Error('Supabase is not configured. Please ensure credentials are set up.'),
    };
  }

  try {
    // 1. Try invoking the secure server-side stored procedure if available
    const { data: rpcData, error: rpcError } = await supabase.rpc('activate_service_trial', {
      p_service_id: params.serviceId,
      p_service_name: params.serviceName,
      p_service_category: params.serviceCategory,
      p_store_id: params.storeId || null,
    });

    if (!rpcError && rpcData) {
      const response = rpcData as { success: boolean; code?: string; message?: string; trial?: RawServiceTrialRow };
      if (!response.success && response.code === 'TRIAL_ALREADY_USED') {
        return { data: response.trial || null, error: new Error(response.message || 'Trial already activated'), alreadyUsed: true };
      }
      if (response.success && response.trial) {
        return { data: response.trial, error: null };
      }
    }

    // 2. Direct table insert fallback protected by RLS and unique constraint
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: insertData, error: insertError } = await supabase
      .from('service_trials')
      .insert({
        user_id: params.userId,
        store_id: params.storeId || null,
        service_id: params.serviceId,
        service_name: params.serviceName,
        service_category: params.serviceCategory,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (insertError) {
      // 23505 is PostgreSQL unique_violation code
      if (insertError.code === '23505' || insertError.message.includes('duplicate key') || insertError.message.includes('uq_user_service_trial')) {
        return { data: null, error: new Error('You have already activated the 7-day free trial for this service.'), alreadyUsed: true };
      }
      return { data: null, error: insertError };
    }

    return { data: insertData as RawServiceTrialRow, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to activate trial in database'),
    };
  }
}

// ==============================================================================
// Payment Requests Database API
// ==============================================================================
export interface RawPaymentRequestRow {
  id: string;
  user_id: string;
  store_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  service_type: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  service_id: string;
  service_name: string;
  plan_tier: string;
  amount: number;
  currency: string;
  payment_method: 'bKash' | 'Nagad' | 'Bank Transfer';
  transaction_id?: string | null;
  sender_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_reference?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchUserPaymentRequests(userId?: string): Promise<{ data: RawPaymentRequestRow[] | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    let query = supabase.from('payment_requests').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      return { data: null, error };
    }
    return { data: (data as RawPaymentRequestRow[]) || [], error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to fetch payment requests'),
    };
  }
}

export async function createPaymentRequestInDb(params: {
  userId: string;
  storeId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceId: string;
  serviceName: string;
  planTier: string;
  amount: number;
  paymentMethod: 'bKash' | 'Nagad' | 'Bank Transfer';
  transactionId?: string;
  senderNumber?: string;
  bankName?: string;
  bankAccountName?: string;
  bankReference?: string;
}): Promise<{ data: RawPaymentRequestRow | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: new Error('Supabase is not configured.'),
    };
  }
  try {
    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        user_id: params.userId,
        store_id: params.storeId || null,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        customer_email: params.customerEmail,
        service_type: params.serviceType,
        service_id: params.serviceId,
        service_name: params.serviceName,
        plan_tier: params.planTier,
        amount: params.amount,
        currency: '৳',
        payment_method: params.paymentMethod,
        transaction_id: params.transactionId || null,
        sender_number: params.senderNumber || null,
        bank_name: params.bankName || null,
        bank_account_name: params.bankAccountName || null,
        bank_reference: params.bankReference || null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error };
    }
    return { data: data as RawPaymentRequestRow, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to submit payment request'),
    };
  }
}

export async function adminApprovePaymentInDb(requestId: string, notes?: string): Promise<{ success: boolean; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: new Error('Supabase not configured') };
  }
  try {
    const { data, error } = await supabase.rpc('admin_approve_payment_request', {
      p_request_id: requestId,
      p_admin_notes: notes || null,
    });
    if (error) {
      // Fallback direct update if RPC is missing
      const { error: directErr } = await supabase
        .from('payment_requests')
        .update({ status: 'approved', admin_notes: notes, updated_at: new Date().toISOString() })
        .eq('id', requestId);
      if (directErr) return { success: false, error: directErr };
      return { success: true, error: null };
    }
    const res = data as { success: boolean; message: string };
    if (!res.success) {
      return { success: false, error: new Error(res.message) };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err : new Error('Failed to approve payment') };
  }
}

export async function adminRejectPaymentInDb(requestId: string, reason: string): Promise<{ success: boolean; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: new Error('Supabase not configured') };
  }
  try {
    const { data, error } = await supabase.rpc('admin_reject_payment_request', {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) {
      const { error: directErr } = await supabase
        .from('payment_requests')
        .update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() })
        .eq('id', requestId);
      if (directErr) return { success: false, error: directErr };
      return { success: true, error: null };
    }
    const res = data as { success: boolean; message: string };
    if (!res.success) {
      return { success: false, error: new Error(res.message) };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err : new Error('Failed to reject payment') };
  }
}

// ==============================================================================
// Public Multi-Tenant Subdomain Resolution API
// ==============================================================================
export async function fetchPublishedWebsiteBySubdomain(
  subdomain: string
): Promise<{ data: any | null; error: Error | null; notFound?: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const cleanSubdomain = subdomain.toLowerCase().trim();

    // 0. First check server-side resolver API endpoint if running in browser
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/resolve-tenant?subdomain=${encodeURIComponent(cleanSubdomain)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.found && json.site) {
            return { data: json.site, error: null };
          }
          if (json.found === false && res.status === 404) {
            return { data: null, error: null, notFound: true };
          }
        }
      } catch {
        // Fall back to direct Supabase query
      }
    }

    // 1. Try calling the dedicated stored procedure
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_published_website_by_subdomain', {
      p_subdomain: cleanSubdomain,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as { found: boolean; site?: any; message?: string };
      if (res.found && res.site) {
        return { data: res.site, error: null };
      }
      return { data: null, error: null, notFound: true };
    }

    // 2. Direct table select fallback
    const { data, error } = await supabase
      .from('subscribed_websites')
      .select('*')
      .ilike('subdomain', cleanSubdomain)
      .eq('deployment_status', 'live')
      .maybeSingle();

    if (error) {
      // If error due to column or select '*', retry with minimal core columns
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('subscribed_websites')
        .select('id, user_id, store_id, subdomain, business_name, niche, template_name, config, status, deployment_status, created_at')
        .ilike('subdomain', cleanSubdomain)
        .eq('deployment_status', 'live')
        .maybeSingle();

      if (fallbackErr) return { data: null, error: fallbackErr };
      if (!fallbackData) return { data: null, error: null, notFound: true };
      return { data: fallbackData, error: null };
    }

    if (!data) {
      return { data: null, error: null, notFound: true };
    }

    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to resolve website subdomain from database'),
    };
  }
}

export async function publishClientWebsiteInDb(
  websiteId: string
): Promise<{ success: boolean; message: string; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: 'Website published locally.', error: null };
  }
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('publish_client_website', {
      p_website_id: websiteId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as { success: boolean; message: string; code?: string };
      if (!res.success) {
        return { success: false, message: res.message, error: new Error(res.message) };
      }
      return { success: true, message: res.message, error: null };
    }

    // Fallback direct update (column-safe)
    const { error: updateErr } = await supabase
      .from('subscribed_websites')
      .update({ deployment_status: 'live', status: 'active' })
      .eq('id', websiteId);

    if (updateErr) {
      return { success: false, message: updateErr.message, error: updateErr };
    }

    return { success: true, message: 'Website published successfully!', error: null };
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Failed to publish website',
      error: err instanceof Error ? err : new Error('Publish operation failed'),
    };
  }
}

export async function updateClientWebsiteInDb(
  websiteId: string,
  updates: Record<string, any>
): Promise<{ success: boolean; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, error: null };
  }
  try {
    const { data: current } = await supabase
      .from('subscribed_websites')
      .select('config, business_name')
      .eq('id', websiteId)
      .maybeSingle();

    const currentConfig = (current?.config as Record<string, any>) || {};
    const mergedConfig = {
      ...currentConfig,
      ...(updates.headline !== undefined && { headline: updates.headline }),
      ...(updates.subheadline !== undefined && { subheadline: updates.subheadline }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.whatsappNumber !== undefined && { whatsappNumber: updates.whatsappNumber }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.aboutText !== undefined && { aboutText: updates.aboutText }),
      ...(updates.brandColor !== undefined && { brandColor: updates.brandColor }),
      ...(updates.servicesOrProducts !== undefined && { servicesOrProducts: updates.servicesOrProducts }),
    };

    const payload: Record<string, any> = {
      config: mergedConfig,
    };
    if (updates.businessName) {
      payload.business_name = updates.businessName;
    }

    const { error } = await supabase
      .from('subscribed_websites')
      .update(payload)
      .eq('id', websiteId);

    if (error) {
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error('Failed to update website content in database'),
    };
  }
}

export async function unpublishClientWebsiteInDb(
  websiteId: string
): Promise<{ success: boolean; message: string; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: 'Website unpublished locally.', error: null };
  }
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('unpublish_client_website', {
      p_website_id: websiteId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as { success: boolean; message: string };
      if (!res.success) {
        return { success: false, message: res.message, error: new Error(res.message) };
      }
      return { success: true, message: res.message, error: null };
    }

    // Direct fallback (snake_case column)
    const { error: updateErr } = await supabase
      .from('subscribed_websites')
      .update({ deployment_status: 'suspended' })
      .eq('id', websiteId);

    if (updateErr) {
      return { success: false, message: updateErr.message, error: updateErr };
    }

    return { success: true, message: 'Website unpublished successfully.', error: null };
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Failed to unpublish website',
      error: err instanceof Error ? err : new Error('Unpublish operation failed'),
    };
  }
}
