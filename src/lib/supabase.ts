import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';
import {
  SubscribedWebsite,
  WebsiteResourceUsage,
  Store,
  PaymentGatewayConfig,
  Product,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Customer,
  InventoryMovement,
  TeamMember,
  SupportTicket,
  SupportTicketMessage,
  ServicePricingCatalogEntry,
  WebsiteLifecycleAuditLog,
  WebsiteEditableFields,
} from '../types';
import { normalizeDashboardPlanId } from '../data/pricingConfig';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESERVED_PLATFORM_SUBDOMAINS: ReadonlySet<string> = new Set([
  'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
  'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
  'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
  'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
  'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
  'testing', 'webhook', 'webhooks', 'www',
]);

export function validateSubdomainFormat(raw: string): {
  valid: boolean;
  clean: string;
  reason?: string;
} {
  const trimmed = (raw || '').toLowerCase().trim();
  if (!trimmed) {
    return { valid: false, clean: '', reason: 'Subdomain cannot be empty.' };
  }
  if (trimmed.length < 3) {
    return { valid: false, clean: trimmed, reason: 'Subdomain must be at least 3 characters long.' };
  }
  if (trimmed.length > 30) {
    return { valid: false, clean: trimmed, reason: 'Subdomain cannot exceed 30 characters.' };
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    return {
      valid: false,
      clean: trimmed,
      reason: 'Subdomain can only contain lowercase letters, numbers, and internal hyphens.',
    };
  }
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { valid: false, clean: trimmed, reason: 'Subdomain cannot start or end with a hyphen.' };
  }
  if (trimmed.startsWith('xn--')) {
    return { valid: false, clean: trimmed, reason: 'Punycode (xn--) subdomains are not allowed.' };
  }
  if (RESERVED_PLATFORM_SUBDOMAINS.has(trimmed)) {
    return { valid: false, clean: trimmed, reason: `"${trimmed}" is a reserved system keyword.` };
  }
  return { valid: true, clean: trimmed };
}

export function sanitizeStoreSlug(raw: string, fallbackSuffix = 'store'): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const suffix = fallbackSuffix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8) || '01';
  if (!cleaned || cleaned.length < 3 || RESERVED_PLATFORM_SUBDOMAINS.has(cleaned) || cleaned.startsWith('xn--')) {
    return `store-${cleaned || 'merchant'}-${suffix}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
  }
  return `${cleaned}-${suffix}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
}

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

  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
export const supabaseEnv = getEnvVar('VITE_SUPABASE_ENV');

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const jsonStr =
      typeof atob === 'function'
        ? atob(padded)
        : typeof Buffer !== 'undefined'
          ? Buffer.from(padded, 'base64').toString('utf8')
          : '';
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function validateSupabaseClientCredentials(
  url: string,
  anonKey: string
): { valid: boolean; missingVariables: string[] } {
  const missingVariables: string[] = [];
  const cleanUrl = (url || '').trim();
  const cleanKey = (anonKey || '').trim();

  let urlProjectRef = '';
  if (!cleanUrl || cleanUrl === 'https://your-project.supabase.co' || !cleanUrl.startsWith('https://')) {
    missingVariables.push('VITE_SUPABASE_URL');
  } else {
    try {
      const parsed = new URL(cleanUrl);
      const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      if (match) urlProjectRef = match[1].toLowerCase();
    } catch {
      missingVariables.push('VITE_SUPABASE_URL');
    }
  }

  if (
    !cleanKey ||
    cleanKey === 'your-anon-key-here' ||
    cleanKey === 'your-anon-key' ||
    cleanKey.startsWith('sb_secret_')
  ) {
    missingVariables.push('VITE_SUPABASE_ANON_KEY');
  } else {
    const parts = cleanKey.split('.');
    if (parts.length === 3) {
      const claims = decodeBase64UrlJson(parts[1]);
      if (claims) {
        if (claims.role === 'service_role') {
          missingVariables.push('VITE_SUPABASE_ANON_KEY (service_role key is not allowed on client)');
        } else if (
          typeof claims.ref === 'string' &&
          claims.ref.trim() &&
          urlProjectRef &&
          claims.ref.trim().toLowerCase() !== urlProjectRef
        ) {
          missingVariables.push('VITE_SUPABASE_ANON_KEY (project ref does not match VITE_SUPABASE_URL)');
        }
      }
    }
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

export function extractSupabaseProjectRef(url: string): string {
  try {
    const parsed = new URL((url || '').trim());
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export const supabaseProjectRef: string = extractSupabaseProjectRef(supabaseUrl);

const credentialCheck = validateSupabaseClientCredentials(supabaseUrl, supabaseAnonKey);

// Check if credentials exist, are non-secret public values, and belong to the same Supabase project
export const isSupabaseConfigured: boolean = credentialCheck.valid;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  environment?: string;
  projectRef?: string;
  missingVariables: string[];
  setupInstructions: string[];
  redirectUrl: string;
}

export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  const { missingVariables } = validateSupabaseClientCredentials(supabaseUrl, supabaseAnonKey);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const redirectUrl = `${currentOrigin}/auth/callback`;

  const setupInstructions = [
    '1. Create or open your project at https://supabase.com/dashboard.',
    '2. Go to Project Settings -> API and copy the Project URL and anon/publishable public API key from the SAME project.',
    '3. In your environment or .env.local file, configure:\n   VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"\n   VITE_SUPABASE_ANON_KEY="<your-anon-key>"\n   VITE_SUPABASE_ENV="staging"',
    '4. To enable Google OAuth: Go to Supabase Dashboard -> Authentication -> Providers -> Google.',
    '5. In Google Cloud Console (APIs & Services -> Credentials -> OAuth 2.0 Client IDs), set Authorized redirect URI to your Supabase callback URL (e.g. https://<project-ref>.supabase.co/auth/v1/callback).',
    `6. In Supabase Dashboard -> Authentication -> URL Configuration, add "${redirectUrl}" and "${currentOrigin}/reset-password" to Authorized Redirect URLs.`,
    '7. Execute supabase/schema.sql in Supabase SQL Editor to provision tables, triggers, and Row Level Security policies.',
  ];

  return {
    isConfigured: isSupabaseConfigured,
    environment: supabaseEnv || undefined,
    projectRef: supabaseProjectRef || undefined,
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
    const payload: Record<string, any> = {
      id: profile.id,
      updated_at: new Date().toISOString(),
    };
    if (profile.full_name !== undefined) payload.full_name = profile.full_name;
    if (profile.email !== undefined) payload.email = profile.email;
    if (profile.avatar_url !== undefined) payload.avatar_url = profile.avatar_url;
    if (profile.onboarding_completed !== undefined) payload.onboarding_completed = profile.onboarding_completed;
    // Never allow client-side role elevation to 'admin'; only pass 'merchant' when explicitly initializing
    if (profile.role === 'merchant') {
      payload.role = 'merchant';
    }
    if (profile.store_id === null) {
      payload.store_id = null;
    } else if (typeof profile.store_id === 'string' && UUID_REGEX.test(profile.store_id.trim())) {
      payload.store_id = profile.store_id.trim();
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

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

  const normalizedServiceId = (params.serviceId || '').trim().toLowerCase();
  if (
    params.serviceCategory === 'website' ||
    normalizedServiceId === 'website_lite' ||
    normalizedServiceId === 'business_website_lite' ||
    normalizedServiceId === 'bespoke_web_dev'
  ) {
    return {
      data: null,
      error: new Error('Free trials are not available for Website Service. Paid verification is required.'),
    };
  }

  if (!UUID_REGEX.test((params.userId || '').trim())) {
    return {
      data: null,
      error: new Error('Authentication required: invalid user session identifier.'),
    };
  }

  try {
    const validStoreId =
      params.storeId && UUID_REGEX.test(params.storeId.trim()) ? params.storeId.trim() : null;

    // 1. Try invoking the secure server-side stored procedure if available
    const { data: rpcData, error: rpcError } = await supabase.rpc('activate_service_trial', {
      p_service_id: params.serviceId.trim(),
      p_service_name: params.serviceName.trim(),
      p_service_category: params.serviceCategory,
      p_store_id: validStoreId,
    });

    if (!rpcError && rpcData) {
      const response = rpcData as { success: boolean; code?: string; message?: string; trial?: RawServiceTrialRow };
      if (!response.success && response.code === 'TRIAL_ALREADY_USED') {
        return { data: response.trial || null, error: new Error(response.message || 'Trial already activated'), alreadyUsed: true };
      }
      if (!response.success) {
        return { data: null, error: new Error(response.message || 'Trial activation denied by policy.') };
      }
      if (response.success && response.trial) {
        return { data: response.trial, error: null };
      }
    }

    if (rpcError && rpcError.code !== 'PGRST202') {
      return { data: null, error: new Error(rpcError.message || 'Failed to activate trial') };
    }

    // 2. Direct table insert fallback ONLY if RPC is not yet deployed (PGRST202), still protected by RLS and unique constraint
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: insertData, error: insertError } = await supabase
      .from('service_trials')
      .insert({
        user_id: params.userId.trim(),
        store_id: validStoreId,
        service_id: params.serviceId.trim(),
        service_name: params.serviceName.trim(),
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
      return { data: null, error: new Error(insertError.message || 'Failed to activate trial') };
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
      return { data: null, error: new Error(error.message || 'Failed to fetch payment requests') };
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
    const {
      data: { user: authUser },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !authUser) {
      return {
        data: null,
        error: new Error('Authentication required: please sign in to submit payment.'),
      };
    }

    const cleanServiceId = (params.serviceId || '').trim();
    if (!cleanServiceId) {
      return {
        data: null,
        error: new Error('Target service ID is required to submit a payment request.'),
      };
    }

    const submittedAmount = Number(params.amount);
    if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) {
      return {
        data: null,
        error: new Error('Invalid payment amount: a positive amount is required.'),
      };
    }

    let resolvedServiceId = cleanServiceId;
    let resolvedPlanTier = (params.planTier || '').trim();

    if (
      params.serviceType === 'website_subscription' ||
      params.serviceType === 'website_package'
    ) {
      if (!UUID_REGEX.test(cleanServiceId)) {
        return {
          data: null,
          error: new Error('Invalid website ID format. Please save your website first before submitting payment.'),
        };
      }

      const { data: siteRow, error: siteErr } = await supabase
        .from('subscribed_websites')
        .select('id, user_id, monthly_fee')
        .eq('id', cleanServiceId)
        .maybeSingle();

      if (siteErr) {
        return {
          data: null,
          error: new Error(siteErr.message || 'Failed to verify website ownership before submitting payment.'),
        };
      }
      if (!siteRow) {
        return {
          data: null,
          error: new Error('Target website not found or you do not have permission to submit payment for it.'),
        };
      }
      if (siteRow.user_id !== authUser.id) {
        return {
          data: null,
          error: new Error('Unauthorized: You can only submit a payment request for your own website.'),
        };
      }

      if (params.serviceType === 'website_subscription') {
        const { data: liteRow, error: liteErr } = await supabase
          .from('service_pricing_catalog')
          .select('*')
          .eq('service_type', 'website_subscription')
          .eq('service_code', 'website_lite')
          .maybeSingle();

        if (liteErr) {
          return {
            data: null,
            error: new Error(liteErr.message || 'Unable to verify website subscription pricing from database.'),
          };
        }

        const typedLite = liteRow as RawServicePricingCatalogRow | null;
        if (!typedLite || !typedLite.is_active || !(Number(typedLite.price_bdt) > 0)) {
          return {
            data: null,
            error: new Error('The GoAMAAS Website subscription plan is currently unavailable or inactive.'),
          };
        }

        const catalogPrice = Number(typedLite.price_bdt);
        const expectedMonthlyFee = Number(siteRow.monthly_fee) > 0 ? Number(siteRow.monthly_fee) : catalogPrice;
        if (submittedAmount !== expectedMonthlyFee) {
          return {
            data: null,
            error: new Error(
              `Payment amount mismatch: expected ৳${expectedMonthlyFee}, received ৳${submittedAmount}.`
            ),
          };
        }
        resolvedPlanTier = typedLite.plan_tier_label || resolvedPlanTier || 'GoAMAAS Website';
      } else {
        const { data: pkgRows, error: pkgErr } = await supabase
          .from('service_pricing_catalog')
          .select('*')
          .eq('service_type', 'website_package');

        if (pkgErr) {
          return {
            data: null,
            error: new Error(pkgErr.message || 'Unable to verify website package pricing from database.'),
          };
        }

        const lowerTier = resolvedPlanTier.toLowerCase();
        const lowerName = (params.serviceName || '').trim().toLowerCase();
        const inferredPackageCode = lowerTier.includes('starter') || lowerName.includes('starter')
          ? 'starter_web'
          : lowerTier.includes('business') || lowerName.includes('business')
          ? 'business_web'
          : lowerTier.includes('advanced') || lowerName.includes('advanced')
          ? 'advanced_web'
          : lowerName.includes('custom setup') || lowerTier === 'one-time'
          ? 'custom_setup'
          : '';

        const matchedPkg = ((pkgRows as RawServicePricingCatalogRow[]) || []).find((row) => {
          if (!row.is_active || !(Number(row.price_bdt) > 0)) return false;
          const rowCode = (row.service_code || '').trim().toLowerCase();
          const rowLabel = (row.plan_tier_label || '').trim().toLowerCase();
          if (inferredPackageCode) return rowCode === inferredPackageCode;
          return (
            rowCode === lowerTier ||
            rowCode === lowerName ||
            rowLabel === lowerTier ||
            rowLabel === lowerName
          );
        });

        if (!matchedPkg) {
          return {
            data: null,
            error: new Error('The selected website package is currently unavailable or inactive.'),
          };
        }

        const expectedPkgPrice = Number(matchedPkg.price_bdt);
        if (submittedAmount !== expectedPkgPrice) {
          return {
            data: null,
            error: new Error(
              `Payment amount mismatch for ${matchedPkg.plan_tier_label}: expected ৳${expectedPkgPrice}, received ৳${submittedAmount}.`
            ),
          };
        }
      }
    } else if (params.serviceType === 'dashboard_plan') {
      const canonicalPlanId = normalizeDashboardPlanId(cleanServiceId);
      if (!canonicalPlanId) {
        return {
          data: null,
          error: new Error('Invalid or unrecognized dashboard plan selected.'),
        };
      }

      const { data: planRow, error: planErr } = await supabase
        .from('service_pricing_catalog')
        .select('*')
        .eq('service_type', 'dashboard_plan')
        .eq('service_code', canonicalPlanId)
        .maybeSingle();

      if (planErr) {
        return {
          data: null,
          error: new Error(planErr.message || 'Unable to verify dashboard plan pricing from database.'),
        };
      }

      const typedPlanRow = planRow as RawServicePricingCatalogRow | null;
      const expectedPlanPrice = Number(typedPlanRow?.price_bdt);
      if (!typedPlanRow || !typedPlanRow.is_active || !Number.isFinite(expectedPlanPrice) || expectedPlanPrice <= 0) {
        return {
          data: null,
          error: new Error('The selected dashboard plan is currently unavailable or inactive.'),
        };
      }

      if (submittedAmount !== expectedPlanPrice) {
        return {
          data: null,
          error: new Error(
            `Payment amount mismatch for ${typedPlanRow.plan_tier_label} plan: expected ৳${expectedPlanPrice}, received ৳${submittedAmount}.`
          ),
        };
      }

      resolvedServiceId = canonicalPlanId;
      resolvedPlanTier = (typedPlanRow.plan_tier_label || resolvedPlanTier).trim();
    } else if (params.serviceType === 'ai_automation') {
      const canonicalAutoCode = cleanServiceId.toLowerCase();
      const { data: autoRow, error: autoErr } = await supabase
        .from('service_pricing_catalog')
        .select('*')
        .eq('service_type', 'ai_automation')
        .eq('service_code', canonicalAutoCode)
        .maybeSingle();

      if (autoErr) {
        return {
          data: null,
          error: new Error(autoErr.message || 'Unable to verify automation package pricing from database.'),
        };
      }

      const typedAutoRow = autoRow as RawServicePricingCatalogRow | null;
      const expectedAutoPrice = Number(typedAutoRow?.price_bdt);
      const expectedSetupFee = Number(typedAutoRow?.setup_fee_bdt) || 0;
      if (!typedAutoRow || !typedAutoRow.is_active || !Number.isFinite(expectedAutoPrice) || expectedAutoPrice <= 0) {
        return {
          data: null,
          error: new Error('The selected automation package is currently unavailable or inactive.'),
        };
      }

      if (
        submittedAmount !== expectedAutoPrice &&
        submittedAmount !== expectedAutoPrice + expectedSetupFee
      ) {
        return {
          data: null,
          error: new Error(
            `Payment amount mismatch for ${typedAutoRow.plan_tier_label}: expected ৳${expectedAutoPrice}, received ৳${submittedAmount}.`
          ),
        };
      }

      resolvedServiceId = canonicalAutoCode;
      resolvedPlanTier = (resolvedPlanTier || typedAutoRow.plan_tier_label).trim();
    } else {
      return {
        data: null,
        error: new Error('Invalid service type specified for payment request.'),
      };
    }

    const validStoreId =
      params.storeId && UUID_REGEX.test(params.storeId.trim()) ? params.storeId.trim() : null;

    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        user_id: authUser.id,
        store_id: validStoreId,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        customer_email: params.customerEmail,
        service_type: params.serviceType,
        service_id: resolvedServiceId,
        service_name: params.serviceName,
        plan_tier: resolvedPlanTier,
        amount: submittedAmount,
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
      if (error.code === '23505') {
        const errMsg = (error.message || '').toLowerCase();
        if (errMsg.includes('uq_payment_requests_pending_user_service')) {
          return {
            data: null,
            error: new Error('A payment request for this service is already pending admin verification.'),
          };
        }
        if (
          errMsg.includes('uq_payment_requests_active_transaction_id') ||
          errMsg.includes('uq_payment_requests_active_bank_reference')
        ) {
          return {
            data: null,
            error: new Error('This transaction reference has already been submitted and is pending or approved.'),
          };
        }
        return {
          data: null,
          error: new Error('Duplicate payment request or transaction reference detected.'),
        };
      }
      return { data: null, error: new Error(error.message || 'Failed to submit payment request to database') };
    }
    if (!data) {
      return { data: null, error: new Error('Failed to submit payment request: no record returned from database') };
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
  const cleanRequestId = (requestId || '').trim();
  if (!cleanRequestId || !UUID_REGEX.test(cleanRequestId)) {
    return { success: false, error: new Error('Invalid payment request ID format') };
  }
  try {
    const { data, error } = await supabase.rpc('admin_approve_payment_request', {
      p_request_id: cleanRequestId,
      p_admin_notes: notes || null,
    });
    if (error) {
      return { success: false, error: new Error(error.message || 'RPC admin_approve_payment_request failed') };
    }
    const res = data as { success?: boolean; message?: string; code?: string } | null;
    if (!res || typeof res !== 'object' || !res.success) {
      return { success: false, error: new Error(res?.message || 'Payment approval failed') };
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
  const cleanRequestId = (requestId || '').trim();
  if (!cleanRequestId || !UUID_REGEX.test(cleanRequestId)) {
    return { success: false, error: new Error('Invalid payment request ID format') };
  }
  try {
    const { data, error } = await supabase.rpc('admin_reject_payment_request', {
      p_request_id: cleanRequestId,
      p_reason: reason,
    });
    if (error) {
      return { success: false, error: new Error(error.message || 'RPC admin_reject_payment_request failed') };
    }
    const res = data as { success?: boolean; message?: string; code?: string } | null;
    if (!res || typeof res !== 'object' || !res.success) {
      return { success: false, error: new Error(res?.message || 'Payment rejection failed') };
    }
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err : new Error('Failed to reject payment') };
  }
}

// ==============================================================================
// Supabase Storage API for Website Media Assets ('website-assets' bucket)
// ==============================================================================

export const WEBSITE_ASSETS_BUCKET = 'website-assets';
export const MAX_WEBSITE_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_WEBSITE_ASSET_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Verifies whether a public Supabase Storage bucket exists on the configured project.
 *
 * IMPORTANT: Never use `supabase.storage.getBucket()` or `listBuckets()` with an `anon`
 * or `authenticated` key — `storage.buckets` enforces RLS with no client SELECT policy,
 * causing `/storage/v1/bucket/:id` to return `404 Bucket not found (NoSuchBucket)` even
 * when the bucket exists. Probing the public object endpoint resolves bucket existence
 * accurately (`NoSuchKey` / `Object not found` = bucket exists; `NoSuchBucket` = missing).
 */
export async function checkPublicStorageBucketExists(
  bucketId: string = WEBSITE_ASSETS_BUCKET
): Promise<{ exists: boolean; indeterminate?: boolean; projectRef: string; code?: string }> {
  const cleanBase = supabaseUrl.replace(/\/+$/, '');
  if (!cleanBase) {
    return { exists: false, indeterminate: true, projectRef: supabaseProjectRef };
  }
  try {
    const probeUrl = `${cleanBase}/storage/v1/object/public/${encodeURIComponent(bucketId)}/__bucket_probe__`;
    const resp = await fetch(probeUrl, { method: 'GET' });
    if (resp.ok) {
      return { exists: true, projectRef: supabaseProjectRef, code: 'OK' };
    }
    const body = (await resp.json().catch(() => null)) as
      | { code?: string; error?: string; message?: string; statusCode?: string }
      | null;
    const errCode = (body?.code || '').trim();
    const lowerMsg = (body?.message || body?.error || '').trim().toLowerCase();

    if (errCode === 'NoSuchKey' || lowerMsg === 'object not found' || body?.error === 'not_found') {
      return { exists: true, projectRef: supabaseProjectRef, code: errCode || 'NoSuchKey' };
    }
    if (errCode === 'NoSuchBucket' || lowerMsg === 'bucket not found') {
      return { exists: false, projectRef: supabaseProjectRef, code: 'NoSuchBucket' };
    }
    return { exists: true, indeterminate: true, projectRef: supabaseProjectRef, code: errCode || undefined };
  } catch {
    return { exists: true, indeterminate: true, projectRef: supabaseProjectRef };
  }
}

export function classifyWebsiteStorageUploadError(
  uploadErr: unknown,
  opts?: { bucketConfirmedMissing?: boolean; projectRef?: string }
): Error {
  const errObj =
    typeof uploadErr === 'object' && uploadErr !== null
      ? (uploadErr as {
          message?: string;
          code?: string;
          statusCode?: string | number;
          status?: number;
        })
      : {};

  const rawMessage = typeof errObj.message === 'string' ? errObj.message.trim() : '';
  const lowerMsg = rawMessage.toLowerCase();
  const errCode = typeof errObj.code === 'string' ? errObj.code.trim() : '';
  const statusCodeStr =
    errObj.statusCode !== undefined && errObj.statusCode !== null ? String(errObj.statusCode).trim() : '';
  const httpStatus = typeof errObj.status === 'number' ? errObj.status : NaN;

  // 1. Permission, authentication, or Row-Level Security errors must NEVER be reported as a missing bucket
  if (
    statusCodeStr === '401' ||
    statusCodeStr === '403' ||
    httpStatus === 401 ||
    httpStatus === 403 ||
    errCode === 'AccessDenied' ||
    errCode === 'Unauthorized' ||
    errCode === 'InvalidJWT' ||
    lowerMsg.includes('row-level security') ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('not authorized') ||
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('jwt')
  ) {
    return new Error(
      'Upload permission denied by Storage security policy. Please ensure you are signed in with an active account and try again.'
    );
  }

  // 2. File size & MIME type limits enforced by bucket configuration
  if (
    statusCodeStr === '413' ||
    httpStatus === 413 ||
    errCode === 'EntityTooLarge' ||
    lowerMsg.includes('exceeded the maximum allowed size') ||
    lowerMsg.includes('payload too large')
  ) {
    return new Error('Image exceeds the 5 MB maximum upload size. Please choose a smaller image.');
  }

  if (
    statusCodeStr === '415' ||
    httpStatus === 415 ||
    errCode === 'InvalidMimeType' ||
    lowerMsg.includes('mime type')
  ) {
    return new Error('Unsupported file type. Please upload PNG, JPG, WEBP, GIF, or AVIF images.');
  }

  // 3. Missing bucket — ONLY when structured NoSuchBucket / exact "bucket not found" AND confirmed absent via public probe
  const looksLikeMissingBucket =
    errCode === 'NoSuchBucket' || lowerMsg === 'bucket not found';

  if (looksLikeMissingBucket) {
    if (opts?.bucketConfirmedMissing) {
      const refLabel = opts.projectRef || supabaseProjectRef || 'unknown-project';
      return new Error(
        `Supabase Storage bucket "${WEBSITE_ASSETS_BUCKET}" was not found on connected Supabase project "${refLabel}". Verify VITE_SUPABASE_URL points to GoAmaas-Staging (umiheyukaddfaupsyooh).`
      );
    }
    return new Error(
      'Unable to complete Storage upload under current session permissions. Please refresh your sign-in session and try again.'
    );
  }

  return new Error(rawMessage || 'Failed to upload image to Supabase Storage');
}

export async function uploadWebsiteAssetToStorage(params: {
  file: File;
  folder: 'logos' | 'heroes' | 'banners' | 'products' | 'sections';
  websiteId?: string;
  storeId?: string;
}): Promise<{ publicUrl: string | null; storagePath?: string; error: Error | null }> {
  const { file, folder, websiteId, storeId } = params;
  if (!file || file.size <= 0) {
    return { publicUrl: null, error: new Error('Please choose a non-empty image file.') };
  }
  if (file.size > MAX_WEBSITE_ASSET_BYTES) {
    return {
      publicUrl: null,
      error: new Error('Image exceeds the 5 MB maximum upload size. Please choose a smaller image.'),
    };
  }
  const mime = (file.type || '').toLowerCase().trim();
  if (!ALLOWED_WEBSITE_ASSET_MIMES.has(mime)) {
    return {
      publicUrl: null,
      error: new Error('Unsupported file type. Please upload PNG, JPG, WEBP, GIF, or AVIF images.'),
    };
  }

  // Offline demo mode only (when Supabase credentials are not configured)
  if (!isSupabaseConfigured || !supabase) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      return { publicUrl: dataUrl, error: null };
    } catch (err: unknown) {
      return {
        publicUrl: null,
        error: err instanceof Error ? err : new Error('Failed to load local preview image'),
      };
    }
  }

  try {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (sessionErr || authErr || !session?.access_token || !user) {
      return {
        publicUrl: null,
        error: new Error('Authentication required: please sign in to upload website assets.'),
      };
    }

    const ownerUid = session.user?.id || user.id;

    const rawName = (file.name || 'image.png').toLowerCase();
    const dotIdx = rawName.lastIndexOf('.');
    const rawExt = dotIdx >= 0 ? rawName.slice(dotIdx + 1) : 'png';
    const safeExt = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'png';
    const rawBase = dotIdx >= 0 ? rawName.slice(0, dotIdx) : rawName;
    const safeBase =
      rawBase
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36) || 'asset';

    const cleanScope =
      (websiteId && UUID_REGEX.test(websiteId.trim()) ? websiteId.trim() : '') ||
      (storeId && UUID_REGEX.test(storeId.trim()) ? storeId.trim() : 'general');
    const rand = Math.random().toString(36).slice(2, 8);
    // Strict owner-first folder structure: <auth.uid()>/<scope>/<folder>/<timestamp>-<rand>-<name>.<ext>
    const storagePath = `${ownerUid}/${cleanScope}/${folder}/${Date.now()}-${rand}-${safeBase}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(WEBSITE_ASSETS_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
      });

    if (uploadErr) {
      const errCode = (uploadErr as { code?: string }).code || '';
      const lowerMsg = (uploadErr.message || '').trim().toLowerCase();
      let bucketConfirmedMissing = false;

      if (errCode === 'NoSuchBucket' || lowerMsg === 'bucket not found') {
        const probe = await checkPublicStorageBucketExists(WEBSITE_ASSETS_BUCKET);
        bucketConfirmedMissing = !probe.exists && !probe.indeterminate;
      }

      return {
        publicUrl: null,
        error: classifyWebsiteStorageUploadError(uploadErr, {
          bucketConfirmedMissing,
          projectRef: supabaseProjectRef,
        }),
      };
    }

    const { data: pubData } = supabase.storage.from(WEBSITE_ASSETS_BUCKET).getPublicUrl(storagePath);
    if (!pubData?.publicUrl) {
      return {
        publicUrl: null,
        error: new Error('Image uploaded, but public URL could not be generated.'),
      };
    }

    return {
      publicUrl: pubData.publicUrl,
      storagePath,
      error: null,
    };
  } catch (err: unknown) {
    return {
      publicUrl: null,
      error: err instanceof Error ? err : new Error('Unexpected error uploading image to Supabase Storage'),
    };
  }
}

export async function deleteWebsiteAssetFromStorage(
  publicUrlOrPath: string
): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !publicUrlOrPath) {
    return { error: null };
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: new Error('Authentication required') };
    }

    const marker = `/object/public/${WEBSITE_ASSETS_BUCKET}/`;
    const markerIdx = publicUrlOrPath.indexOf(marker);
    const objectPath =
      markerIdx >= 0
        ? decodeURIComponent(publicUrlOrPath.slice(markerIdx + marker.length).split('?')[0])
        : publicUrlOrPath.replace(/^\/+/, '');

    if (!objectPath || !objectPath.startsWith(`${user.id}/`)) {
      return { error: null };
    }

    const { error } = await supabase.storage.from(WEBSITE_ASSETS_BUCKET).remove([objectPath]);
    return { error: error ? new Error(error.message) : null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err : new Error('Failed to delete storage asset') };
  }
}

// ==============================================================================
// Subscribed Websites Management API (Database-First Multi-Tenant Integration)
// ==============================================================================

// Columns restricted to database defaults, triggers, and SECURITY DEFINER RPCs.
// Authenticated merchant INSERT payloads MUST NEVER include any of these columns.
export const SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS = [
  'currency',
  'subscribed_at',
  'current_period_end',
  'grace_period_end',
  'deployment_status',
  'resource_usage',
  'created_at',
  'payment_status',
  'updated_at',
  'notes',
] as const;

// Least-privilege columns permitted for authenticated merchant INSERT across all schema revisions.
// Plan/billing fields (plan_tier, monthly_fee) and lifecycle/audit fields are intentionally omitted
// so PostgreSQL column defaults and protect_subscribed_website_security() populate them safely.
export const SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS = [
  'user_id',
  'store_id',
  'business_name',
  'niche',
  'subdomain',
  'full_domain',
  'template_id',
  'template_name',
  'status',
  'config',
] as const;

export type MerchantWebsiteInsertPayload = {
  user_id: string;
  store_id?: string;
  business_name: string;
  niche: string;
  subdomain: string;
  full_domain: string;
  template_id: string;
  template_name: string;
  status: 'active';
  config: Record<string, any>;
};

function sanitizeWebsiteConfigForInsert(rawConfig: Record<string, any> | undefined): Record<string, any> {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return {};
  }
  const restrictedSet = new Set<string>(SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS);
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (restrictedSet.has(key)) continue;
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function buildMerchantWebsiteInsertPayload(params: {
  userId: string;
  businessName: string;
  niche: string;
  subdomain: string;
  storeId?: string;
  templateId?: string;
  templateName?: string;
  config?: Record<string, any>;
}): { payload: MerchantWebsiteInsertPayload | null; cleanSubdomain: string; error: Error | null } {
  const trimmedUserId = (params.userId || '').trim();
  if (!UUID_REGEX.test(trimmedUserId)) {
    return {
      payload: null,
      cleanSubdomain: '',
      error: new Error('Authentication required: invalid user session identifier.'),
    };
  }

  const trimmedBusinessName = (params.businessName || '').trim();
  if (!trimmedBusinessName) {
    return {
      payload: null,
      cleanSubdomain: '',
      error: new Error('Business name is required to create a website.'),
    };
  }

  const subValidation = validateSubdomainFormat(params.subdomain);
  if (!subValidation.valid) {
    return {
      payload: null,
      cleanSubdomain: subValidation.clean,
      error: new Error(subValidation.reason || 'Invalid subdomain format'),
    };
  }
  const cleanSubdomain = subValidation.clean;

  const payload: MerchantWebsiteInsertPayload = {
    user_id: trimmedUserId,
    business_name: trimmedBusinessName,
    niche: (params.niche || 'ecommerce').trim(),
    subdomain: cleanSubdomain,
    full_domain: `${cleanSubdomain}.amaas.xyz`,
    template_id: (params.templateId || 'tpl-modern-business').trim() || 'tpl-modern-business',
    template_name: (params.templateName || 'Modern Executive').trim() || 'Modern Executive',
    status: 'active',
    config: sanitizeWebsiteConfigForInsert(params.config),
  };

  if (params.storeId && UUID_REGEX.test(params.storeId.trim())) {
    payload.store_id = params.storeId.trim();
  }

  // Runtime defense-in-depth: guarantee restricted columns can never leak into merchant INSERT
  const allowedSet = new Set<string>(SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS);
  for (const key of Object.keys(payload)) {
    if (!allowedSet.has(key)) {
      delete (payload as Record<string, unknown>)[key];
    }
  }

  return { payload, cleanSubdomain, error: null };
}

export function mapDatabaseRowToSubscribedWebsite(row: any): SubscribedWebsite {
  const config = (row.config as Record<string, any>) || {};
  const draftRaw =
    config.draft && typeof config.draft === 'object' && !Array.isArray(config.draft)
      ? (config.draft as WebsiteEditableFields)
      : undefined;
  const hasDraft = Boolean(draftRaw && Object.keys(draftRaw).length > 0);
  const cleanSubdomain = (row.subdomain || '').toLowerCase().trim();
  const fullDomain = row.full_domain || `${cleanSubdomain}.amaas.xyz`;

  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id || '',
    businessName: row.business_name || 'Business',
    ownerName: config.ownerName || 'Store Owner',
    email: config.email || '',
    phone: config.phone || '',
    niche: (row.niche as any) || 'ecommerce',
    nicheLabel: config.nicheLabel || row.template_name || 'Business Storefront',
    templateId: row.template_id || config.templateId || 'tpl-modern-business',
    templateName: row.template_name || 'Modern Executive',
    subdomain: cleanSubdomain,
    fullDomainUrl: fullDomain,
    customDomain: config.customDomain || undefined,
    brandColor: config.brandColor || '#2563EB',
    logoUrl: config.logoUrl || undefined,
    heroImageUrl: config.heroImageUrl || undefined,
    heroCtaText: config.heroCtaText || undefined,
    heroCtaLink: config.heroCtaLink || undefined,
    secondaryCtaText: config.secondaryCtaText || undefined,
    secondaryCtaLink: config.secondaryCtaLink || undefined,
    bannerImageUrl: config.bannerImageUrl || undefined,
    bannerTitle: config.bannerTitle || undefined,
    bannerSubtitle: config.bannerSubtitle || undefined,
    bannerCtaText: config.bannerCtaText || undefined,
    bannerCtaLink: config.bannerCtaLink || undefined,
    address: config.address || '',
    headline: config.headline || 'Welcome to our official website',
    subheadline: config.subheadline || 'Explore our catalog and connect with our team.',
    aboutText: config.aboutText || '',
    servicesOrProducts: Array.isArray(config.servicesOrProducts)
      ? config.servicesOrProducts
      : Array.isArray(config.items)
      ? config.items
      : [],
    whatsappNumber: config.whatsappNumber ?? config.phone ?? '',
    socialLinks: config.socialLinks || {},
    customLinks: Array.isArray(config.customLinks) ? config.customLinks : [],
    sections: Array.isArray(config.sections) ? config.sections : undefined,
    themeSettings:
      config.themeSettings && typeof config.themeSettings === 'object'
        ? config.themeSettings
        : undefined,
    hasUnpublishedDraft: hasDraft,
    draftConfig: hasDraft ? draftRaw : undefined,
    planName: row.plan_tier || 'GoAMAAS Website',
    monthlyFee: Number(row.monthly_fee) || 600,
    subscriptionStatus: (row.status as SubscribedWebsite['subscriptionStatus']) || 'active',
    paymentStatus: (row.payment_status as SubscribedWebsite['paymentStatus']) || 'pending',
    deploymentStatus:
      (row.deployment_status as SubscribedWebsite['deploymentStatus']) || 'deploying',
    sslStatus: 'active',
    nextBillingDate:
      row.next_billing_date ||
      (row.current_period_end ? new Date(row.current_period_end).toISOString().split('T')[0] : ''),
    gracePeriodEndsAt: row.grace_period_end ? new Date(row.grace_period_end).toISOString() : undefined,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    lastUpdatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    resourceUsage: (row.resource_usage as WebsiteResourceUsage) || {
      pagesCount: 1,
      pagesLimit: 10,
      storageUsedMb: 0,
      storageLimitMb: 1024,
      bandwidthUsedGb: 0,
      bandwidthLimitGb: 25,
      monthlyUpdatesUsed: 0,
      monthlyUpdatesLimit: 999,
    },
    notes: row.notes,
  };
}

export async function createSubscribedWebsiteInDb(params: {
  businessName: string;
  niche: string;
  subdomain: string;
  storeId?: string;
  templateId?: string;
  templateName?: string;
  config: Record<string, any>;
}): Promise<{ data: SubscribedWebsite | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase client is not configured') };
  }
  try {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user || !session?.access_token) {
      return {
        data: null,
        error: new Error('Authentication required: please sign in to save your website.'),
      };
    }

    if (session.user?.id && session.user.id !== user.id) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
      if (!session?.access_token || session.user?.id !== user.id) {
        return {
          data: null,
          error: new Error('Your login session changed. Please sign in again and retry.'),
        };
      }
    }

    const { payload, cleanSubdomain, error: buildErr } = buildMerchantWebsiteInsertPayload({
      userId: user.id,
      businessName: params.businessName,
      niche: params.niche,
      subdomain: params.subdomain,
      storeId: params.storeId,
      templateId: params.templateId,
      templateName: params.templateName,
      config: params.config,
    });

    if (buildErr || !payload) {
      return { data: null, error: buildErr || new Error('Invalid website creation payload') };
    }

    let { data, error } = await supabase
      .from('subscribed_websites')
      .insert(payload)
      .select('*')
      .single();

    // If an admin updated service_pricing_catalog.price_bdt away from the table's column default (600),
    // passing NULL for plan_tier/monthly_fee lets protect_subscribed_website_security() auto-populate
    // the authoritative catalog fee & label without ever touching restricted lifecycle/payment columns.
    if (error && /invalid monthly_fee/i.test(error.message || '')) {
      const catalogDeferredPayload: Record<string, any> = {
        ...payload,
        plan_tier: null,
        monthly_fee: null,
      };
      const retryRes = await supabase
        .from('subscribed_websites')
        .insert(catalogDeferredPayload)
        .select('*')
        .single();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      const msg = error.message || 'Database error creating website';
      if (
        error.code === '23505' ||
        /duplicate key|unique constraint|subscribed_websites_subdomain_key|idx_subscribed_websites_subdomain/i.test(
          msg
        )
      ) {
        return {
          data: null,
          error: new Error(
            `The subdomain "${cleanSubdomain}" is already registered. Please choose another subdomain.`
          ),
        };
      }
      if (error.code === '42501' || /permission denied/i.test(msg)) {
        return {
          data: null,
          error: new Error(
            `Website creation was rejected by database permissions (${msg}). Please verify your account session and store permissions.`
          ),
        };
      }
      return { data: null, error: new Error(msg) };
    }

    if (!data) {
      return { data: null, error: new Error('Failed to create website: no record returned from database') };
    }

    const mapped = mapDatabaseRowToSubscribedWebsite(data);
    return { data: mapped, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unexpected error while creating website in database'),
    };
  }
}

export async function fetchUserSubscribedWebsitesFromDb(): Promise<{ data: SubscribedWebsite[] | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('subscribed_websites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch websites') };
    }

    const mapped = (data || []).map(mapDatabaseRowToSubscribedWebsite);
    return { data: mapped, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unexpected error while loading websites from database'),
    };
  }
}

export async function checkRemoteSubdomainAvailability(
  subdomain: string,
  excludeId?: string
): Promise<{ available: boolean; reason?: string; error?: Error | null }> {
  const subValidation = validateSubdomainFormat(subdomain);
  if (!subValidation.valid) {
    return { available: false, reason: subValidation.reason };
  }
  const clean = subValidation.clean;

  if (isSupabaseConfigured && supabase) {
    try {
      // If editing an existing draft website owned by the caller, allow its own current subdomain
      if (excludeId && UUID_REGEX.test(excludeId.trim())) {
        const { data: ownRow } = await supabase
          .from('subscribed_websites')
          .select('id, subdomain')
          .eq('id', excludeId.trim())
          .maybeSingle();
        if (ownRow && (ownRow.subdomain || '').toLowerCase().trim() === clean) {
          return { available: true };
        }
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc('check_subdomain_availability', {
        p_subdomain: clean,
      });

      if (!rpcError && rpcData && typeof rpcData === 'object') {
        const res = rpcData as { available: boolean; reason?: string };
        return { available: Boolean(res.available), reason: res.reason };
      }

      if (rpcError) {
        return {
          available: false,
          reason: 'Could not verify subdomain uniqueness with database. Please try again.',
          error: new Error(rpcError.message),
        };
      }
    } catch (err) {
      console.warn('[GoAMAAS] Remote subdomain check warning:', err);
      return {
        available: false,
        reason: 'Could not verify subdomain uniqueness with database. Please try again.',
        error: err instanceof Error ? err : new Error('Network error during subdomain check'),
      };
    }
  }

  return { available: true };
}

// ==============================================================================
// Public Multi-Tenant Subdomain Resolution API
// ==============================================================================
export async function fetchPublishedWebsiteBySubdomain(
  subdomain: string
): Promise<{ data: any | null; error: Error | null; notFound?: boolean }> {
  const subValidation = validateSubdomainFormat(subdomain);
  if (!subValidation.valid) {
    return { data: null, error: null, notFound: true };
  }
  const cleanSubdomain = subValidation.clean;

  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    // 1. Check server-side resolver API endpoint first if running in browser
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
        } else if (res.status === 404 || res.status === 400) {
          return { data: null, error: null, notFound: true };
        }
      } catch {
        // Fall back to audited SECURITY DEFINER RPC below
      }
    }

    // 2. Call the audited SECURITY DEFINER stored procedure (never direct table SELECT for anon)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_published_website_by_subdomain', {
      p_subdomain: cleanSubdomain,
    });

    if (rpcError) {
      return { data: null, error: new Error(rpcError.message || 'Failed to resolve subdomain') };
    }

    if (rpcData) {
      const res = rpcData as { found: boolean; site?: any; message?: string };
      if (res.found && res.site) {
        return { data: res.site, error: null };
      }
    }

    return { data: null, error: null, notFound: true };
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

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || 'Publish procedure failed',
        error: new Error(rpcError.message),
      };
    }

    return {
      success: false,
      message: 'Unknown response from publish procedure',
      error: new Error('Publish procedure returned empty response'),
    };
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
  updates: Record<string, any>,
  options?: { saveAsDraftOnly?: boolean; clearDraft?: boolean }
): Promise<{ success: boolean; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, error: null };
  }
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) {
      return { success: false, error: new Error('Invalid website ID format: expected UUID') };
    }

    const { data: current, error: fetchErr } = await supabase
      .from('subscribed_websites')
      .select('config, business_name, deployment_status')
      .eq('id', websiteId)
      .maybeSingle();

    if (fetchErr) {
      return { success: false, error: fetchErr };
    }
    if (!current) {
      return { success: false, error: new Error('Website not found in database') };
    }

    const currentConfig = (current?.config as Record<string, any>) || {};
    const configPatch: Record<string, any> = {
      ...(updates.businessName !== undefined && { businessName: updates.businessName }),
      ...(updates.headline !== undefined && { headline: updates.headline }),
      ...(updates.subheadline !== undefined && { subheadline: updates.subheadline }),
      ...(updates.heroCtaText !== undefined && { heroCtaText: updates.heroCtaText }),
      ...(updates.heroCtaLink !== undefined && { heroCtaLink: updates.heroCtaLink }),
      ...(updates.secondaryCtaText !== undefined && { secondaryCtaText: updates.secondaryCtaText }),
      ...(updates.secondaryCtaLink !== undefined && { secondaryCtaLink: updates.secondaryCtaLink }),
      ...(updates.heroImageUrl !== undefined && { heroImageUrl: updates.heroImageUrl }),
      ...(updates.bannerImageUrl !== undefined && { bannerImageUrl: updates.bannerImageUrl }),
      ...(updates.bannerTitle !== undefined && { bannerTitle: updates.bannerTitle }),
      ...(updates.bannerSubtitle !== undefined && { bannerSubtitle: updates.bannerSubtitle }),
      ...(updates.bannerCtaText !== undefined && { bannerCtaText: updates.bannerCtaText }),
      ...(updates.bannerCtaLink !== undefined && { bannerCtaLink: updates.bannerCtaLink }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.whatsappNumber !== undefined && { whatsappNumber: updates.whatsappNumber }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.aboutText !== undefined && { aboutText: updates.aboutText }),
      ...(updates.brandColor !== undefined && { brandColor: updates.brandColor }),
      ...(updates.servicesOrProducts !== undefined && { servicesOrProducts: updates.servicesOrProducts }),
      ...(updates.socialLinks !== undefined && { socialLinks: updates.socialLinks }),
      ...(updates.customLinks !== undefined && { customLinks: updates.customLinks }),
      ...(updates.sections !== undefined && { sections: updates.sections }),
      ...(updates.themeSettings !== undefined && { themeSettings: updates.themeSettings }),
      ...(updates.customDomain !== undefined && { customDomain: updates.customDomain }),
      ...(updates.ownerName !== undefined && { ownerName: updates.ownerName }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.logoUrl !== undefined && { logoUrl: updates.logoUrl }),
      ...(updates.templateId !== undefined && { templateId: updates.templateId }),
      ...(updates.templateName !== undefined && { templateName: updates.templateName }),
    };

    const isCurrentlyLive = current.deployment_status === 'live';
    const stageInDraftOnly = Boolean(options?.saveAsDraftOnly && isCurrentlyLive);

    let mergedConfig: Record<string, any>;
    const payload: Record<string, any> = {};

    if (stageInDraftOnly) {
      const existingDraft =
        currentConfig.draft && typeof currentConfig.draft === 'object' ? currentConfig.draft : {};
      mergedConfig = {
        ...currentConfig,
        hasUnpublishedDraft: true,
        draft: {
          ...existingDraft,
          ...configPatch,
        },
      };
      payload.config = mergedConfig;
    } else {
      const baseWithoutDraft = { ...currentConfig };
      if (options?.clearDraft !== false) {
        delete baseWithoutDraft.draft;
        delete baseWithoutDraft.hasUnpublishedDraft;
      }
      mergedConfig = {
        ...baseWithoutDraft,
        ...configPatch,
      };
      payload.config = mergedConfig;
      if (updates.businessName) {
        payload.business_name = updates.businessName;
      }
      if (updates.niche) {
        payload.niche = updates.niche;
      }
      if (updates.templateId) {
        payload.template_id = updates.templateId;
      }
      if (updates.templateName) {
        payload.template_name = updates.templateName;
      }
    }

    const { data: updatedData, error } = await supabase
      .from('subscribed_websites')
      .update(payload)
      .eq('id', websiteId)
      .select('id')
      .single();

    if (error) {
      return { success: false, error };
    }
    if (!updatedData) {
      return { success: false, error: new Error('Website update affected 0 rows') };
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

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || 'Unpublish procedure failed',
        error: new Error(rpcError.message),
      };
    }

    return {
      success: false,
      message: 'Unknown response from unpublish procedure',
      error: new Error('Unpublish procedure returned empty response'),
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Failed to unpublish website',
      error: err instanceof Error ? err : new Error('Unpublish operation failed'),
    };
  }
}

export async function cancelClientWebsiteSubscriptionInDb(
  websiteId: string
): Promise<{ success: boolean; message: string; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: 'Website subscription cancelled locally.', error: null };
  }
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('cancel_client_website_subscription', {
      p_website_id: websiteId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as { success: boolean; message: string };
      if (!res.success) {
        return { success: false, message: res.message, error: new Error(res.message) };
      }
      return { success: true, message: res.message, error: null };
    }

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || 'Cancellation procedure failed',
        error: new Error(rpcError.message),
      };
    }

    return {
      success: false,
      message: 'Unknown response from cancellation procedure',
      error: new Error('Cancellation procedure returned empty response'),
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Failed to cancel website subscription',
      error: err instanceof Error ? err : new Error('Cancellation operation failed'),
    };
  }
}

export async function adminDeleteSubscribedWebsiteInDb(
  websiteId: string
): Promise<{ success: boolean; message: string; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: 'Website deleted locally.', error: null };
  }
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_subscribed_website', {
      p_website_id: websiteId,
    });

    if (!rpcError && rpcData) {
      const res = rpcData as { success: boolean; message: string };
      if (!res.success) {
        return { success: false, message: res.message, error: new Error(res.message) };
      }
      return { success: true, message: res.message, error: null };
    }

    if (rpcError) {
      return {
        success: false,
        message: rpcError.message || 'Admin delete procedure failed',
        error: new Error(rpcError.message),
      };
    }

    return {
      success: false,
      message: 'Unknown response from admin delete procedure',
      error: new Error('Admin delete procedure returned empty response'),
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Failed to delete website',
      error: err instanceof Error ? err : new Error('Admin delete operation failed'),
    };
  }
}

export async function adminUpdateWebsiteLifecycleInDb(
  websiteId: string,
  action: 'suspend' | 'reactivate' | 'renew',
  reason: string
): Promise<{ success: boolean; message: string; auditLogId?: string; error: Error | null }> {
  const cleanReason = (reason || '').trim();
  if (!cleanReason) {
    const err = new Error('An explicit administrative reason is required for website lifecycle audit logging.');
    return { success: false, message: err.message, error: err };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: `Website ${action} applied locally.`, error: null };
  }
  const cleanId = (websiteId || '').trim();
  if (!UUID_REGEX.test(cleanId)) {
    return { success: false, message: 'Invalid website ID format', error: new Error('Invalid website ID format') };
  }
  try {
    const { data, error } = await supabase.rpc('admin_update_website_lifecycle', {
      p_website_id: cleanId,
      p_action: action,
      p_reason: cleanReason,
    });
    if (error) {
      return {
        success: false,
        message: error.message || `Failed to ${action} website`,
        error: new Error(error.message || `Failed to ${action} website`),
      };
    }
    const res = data as { success?: boolean; message?: string; auditLogId?: string } | null;
    if (!res || typeof res !== 'object' || !res.success) {
      const msg = res?.message || `Website ${action} failed`;
      return { success: false, message: msg, error: new Error(msg) };
    }
    return {
      success: true,
      message: res.message || `Website ${action} completed`,
      auditLogId: res.auditLogId,
      error: null,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(`Failed to ${action} website`);
    return { success: false, message: error.message, error };
  }
}

// ==============================================================================
// Multi-Tenant Stores Database API (public.stores)
// ==============================================================================
export interface RawStoreRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category?: string | null;
  currency?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
}

export function mapDatabaseRowToStore(row: RawStoreRow): Store {
  return {
    id: row.id,
    name: row.name || 'My Store',
    slug: row.slug || 'my-store',
    category: row.category || 'General E-Commerce',
    currency: row.currency || '৳',
    phone: row.phone || '',
    address: row.address || '',
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  };
}

export async function fetchUserStoresFromDb(): Promise<{ data: Store[] | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch stores') };
    }

    return { data: ((data as RawStoreRow[]) || []).map(mapDatabaseRowToStore), error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to load stores from database'),
    };
  }
}

export async function createStoreInDb(params: {
  name: string;
  slug?: string;
  category?: string;
  currency?: string;
  phone?: string;
  address?: string;
}): Promise<{ data: Store | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured') };
  }
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { data: null, error: new Error('Authentication required to create a store') };
    }

    const cleanName = (params.name || '').trim() || 'My Store';
    const primarySlug = sanitizeStoreSlug(params.slug || cleanName, user.id.slice(0, 6));

    const basePayload = {
      owner_id: user.id,
      name: cleanName,
      category: (params.category || 'General E-Commerce').trim(),
      currency: (params.currency || '৳').trim(),
      phone: (params.phone || '').trim(),
      address: (params.address || '').trim(),
    };

    const { data, error } = await supabase
      .from('stores')
      .insert({ ...basePayload, slug: primarySlug })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const retrySuffix = `${user.id.slice(0, 4)}${Math.random().toString(36).slice(2, 6)}`;
        const retrySlug = sanitizeStoreSlug(cleanName, retrySuffix);
        const { data: retryData, error: retryErr } = await supabase
          .from('stores')
          .insert({ ...basePayload, slug: retrySlug })
          .select('*')
          .single();
        if (retryErr || !retryData) {
          return { data: null, error: new Error(retryErr?.message || 'Failed to create store with unique slug') };
        }
        return { data: mapDatabaseRowToStore(retryData as RawStoreRow), error: null };
      }
      return { data: null, error: new Error(error.message || 'Failed to create store in database') };
    }

    if (!data) {
      return { data: null, error: new Error('Failed to create store: empty response') };
    }

    return { data: mapDatabaseRowToStore(data as RawStoreRow), error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unexpected error creating store'),
    };
  }
}

export async function updateStoreInDb(
  storeId: string,
  updates: Partial<Store>
): Promise<{ data: Store | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  const cleanId = (storeId || '').trim();
  if (!UUID_REGEX.test(cleanId)) {
    return { data: null, error: new Error('Invalid store ID format') };
  }
  try {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined && updates.name.trim()) payload.name = updates.name.trim();
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.slug !== undefined && updates.slug.trim()) {
      const normalizedSlug = updates.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (normalizedSlug.length >= 3) {
        payload.slug = normalizedSlug;
      }
    }

    const { data, error } = await supabase
      .from('stores')
      .update(payload)
      .eq('id', cleanId)
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to update store in database') };
    }

    return { data: mapDatabaseRowToStore(data as RawStoreRow), error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to update store'),
    };
  }
}

// ==============================================================================
// Payment Gateway Configurations API (public.payment_gateway_configs)
// ==============================================================================
export interface RawPaymentGatewayConfigRow {
  id: string;
  display_name: string;
  is_enabled: boolean;
  account_number?: string | null;
  account_name?: string | null;
  bank_name?: string | null;
  branch_name?: string | null;
  routing_number?: string | null;
  instructions?: string | null;
}

export async function fetchPaymentGatewayConfigsFromDb(): Promise<{
  data: PaymentGatewayConfig[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('payment_gateway_configs')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch payment gateway configs') };
    }

    const rows = (data as RawPaymentGatewayConfigRow[]) || [];
    if (rows.length === 0) {
      return { data: null, error: null };
    }

    const orderRank: Record<string, number> = {
      bkash: 1,
      nagad: 2,
      bank_transfer: 3,
      whatsapp_support: 4,
    };

    const isKnownGatewayId = (
      val: string
    ): val is PaymentGatewayConfig['id'] =>
      val === 'bkash' ||
      val === 'nagad' ||
      val === 'bank_transfer' ||
      val === 'whatsapp_support';

    const mapped: PaymentGatewayConfig[] = rows
      .filter((r) => isKnownGatewayId(r.id))
      .sort((a, b) => (orderRank[a.id] || 99) - (orderRank[b.id] || 99))
      .map((r) => ({
        id: r.id as PaymentGatewayConfig['id'],
        displayName: r.display_name,
        isEnabled: Boolean(r.is_enabled),
        accountNumber: r.account_number ?? '',
        ...(r.account_name !== null && r.account_name !== undefined ? { accountName: r.account_name } : {}),
        ...(r.bank_name !== null && r.bank_name !== undefined ? { bankName: r.bank_name } : {}),
        ...(r.branch_name !== null && r.branch_name !== undefined ? { branchName: r.branch_name } : {}),
        ...(r.routing_number !== null && r.routing_number !== undefined ? { routingNumber: r.routing_number } : {}),
        instructions: r.instructions || '',
      }));

    return { data: mapped, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to load payment gateway configurations'),
    };
  }
}

export async function adminUpdatePaymentGatewayConfigInDb(
  gatewayId: PaymentGatewayConfig['id'],
  updates: Partial<PaymentGatewayConfig>
): Promise<{ success: boolean; message: string; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, message: 'Saved locally', error: null };
  }
  try {
    const { data, error } = await supabase.rpc('admin_update_payment_gateway_config', {
      p_gateway_id: gatewayId,
      p_is_enabled: updates.isEnabled !== undefined ? Boolean(updates.isEnabled) : null,
      p_account_number: updates.accountNumber !== undefined ? updates.accountNumber : null,
      p_account_name: updates.accountName !== undefined ? updates.accountName : null,
      p_bank_name: updates.bankName !== undefined ? updates.bankName : null,
      p_branch_name: updates.branchName !== undefined ? updates.branchName : null,
      p_routing_number: updates.routingNumber !== undefined ? updates.routingNumber : null,
      p_instructions: updates.instructions !== undefined ? updates.instructions : null,
    });

    if (error) {
      return {
        success: false,
        message: error.message || 'Failed to update payment gateway configuration',
        error: new Error(error.message || 'Failed to update payment gateway configuration'),
      };
    }

    const res = data as { success?: boolean; message?: string } | null;
    if (!res || typeof res !== 'object' || !res.success) {
      const msg = res?.message || 'Failed to update payment gateway configuration';
      return { success: false, message: msg, error: new Error(msg) };
    }

    return { success: true, message: res.message || 'Payment gateway configuration updated.', error: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Failed to update payment gateway configuration');
    return { success: false, message: error.message, error };
  }
}

// ==============================================================================
// Service Pricing Catalog & Admin Website Lifecycle Audit Logs
// ==============================================================================
export interface RawServicePricingCatalogRow {
  service_type: ServicePricingCatalogEntry['serviceType'];
  service_code: string;
  plan_tier_label: string;
  price_bdt: number | string;
  setup_fee_bdt: number | string;
  is_active: boolean;
  updated_at?: string;
}

export async function fetchServicePricingCatalogFromDb(): Promise<{
  data: ServicePricingCatalogEntry[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('service_pricing_catalog')
      .select('*')
      .order('service_type', { ascending: true })
      .order('service_code', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch service pricing catalog') };
    }

    const mapped: ServicePricingCatalogEntry[] = ((data as RawServicePricingCatalogRow[]) || []).map((row) => ({
      serviceType: row.service_type,
      serviceCode: row.service_code,
      planTierLabel: row.plan_tier_label,
      priceBdt: Number(row.price_bdt) || 0,
      setupFeeBdt: Number(row.setup_fee_bdt) || 0,
      isActive: Boolean(row.is_active),
      updatedAt: row.updated_at,
    }));

    return { data: mapped, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to load service pricing catalog'),
    };
  }
}

export interface RawWebsiteLifecycleAuditLogRow {
  id: string;
  website_id: string;
  admin_id: string;
  action: 'suspend' | 'reactivate' | 'renew';
  reason: string;
  verified_payment_request_id?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  previous_deployment_status?: string | null;
  new_deployment_status?: string | null;
  payment_status_snapshot?: string | null;
  previous_period_end?: string | null;
  new_period_end?: string | null;
  created_at: string;
}

export async function fetchWebsiteLifecycleAuditLogsFromDb(limit = 50): Promise<{
  data: WebsiteLifecycleAuditLog[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('website_lifecycle_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch lifecycle audit logs') };
    }

    const mapped: WebsiteLifecycleAuditLog[] = ((data as RawWebsiteLifecycleAuditLogRow[]) || []).map((row) => ({
      id: row.id,
      websiteId: row.website_id,
      adminId: row.admin_id,
      action: row.action,
      reason: row.reason,
      verifiedPaymentRequestId: row.verified_payment_request_id ?? null,
      previousStatus: row.previous_status ?? null,
      newStatus: row.new_status ?? null,
      previousDeploymentStatus: row.previous_deployment_status ?? null,
      newDeploymentStatus: row.new_deployment_status ?? null,
      paymentStatusSnapshot: row.payment_status_snapshot ?? null,
      previousPeriodEnd: row.previous_period_end ?? null,
      newPeriodEnd: row.new_period_end ?? null,
      createdAt: row.created_at,
    }));

    return { data: mapped, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to load lifecycle audit logs'),
    };
  }
}

// ==============================================================================
// Multi-Tenant Store Catalog, Orders, Customers, Inventory, Team & Support CRUD
// ==============================================================================
interface RawProductRow {
  id: string;
  store_id: string;
  website_id?: string | null;
  name: string;
  sku: string;
  category?: string | null;
  price: number | string;
  cost_price?: number | string | null;
  stock: number;
  low_stock_threshold?: number | null;
  status?: 'active' | 'draft' | 'archived' | null;
  description?: string | null;
  image_url?: string | null;
  is_visible?: boolean | null;
  sort_order?: number | null;
  sales_count?: number | null;
  rating?: number | string | null;
  created_at?: string;
}

function mapRowToProduct(row: RawProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category || 'General',
    price: Number(row.price) || 0,
    costPrice: Number(row.cost_price) || 0,
    stock: Number(row.stock) || 0,
    lowStockThreshold: row.low_stock_threshold ?? 10,
    status: row.status === 'draft' || row.status === 'archived' ? row.status : 'active',
    description: row.description || '',
    rating: Number(row.rating) || 5.0,
    salesCount: Number(row.sales_count) || 0,
    image: row.image_url || undefined,
    websiteId: row.website_id || undefined,
    isVisible: row.is_visible ?? true,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
  };
}

export async function fetchStoreProductsFromDb(storeId: string): Promise<{
  data: Product[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: null };
  }
  try {
    let { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (
      error &&
      (error.code === 'PGRST204' ||
        (error.message || '').includes('sort_order') ||
        (error.message || '').includes('column'))
    ) {
      const retry = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch products') };
    }
    return { data: ((data as RawProductRow[]) || []).map(mapRowToProduct), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load products') };
  }
}

export async function createProductInDb(
  storeId: string,
  prod: Omit<Product, 'id' | 'salesCount' | 'rating'>
): Promise<{ data: Product | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: new Error('Valid store is required to create a product') };
  }
  try {
    const basePayload: Record<string, unknown> = {
      store_id: storeId,
      name: prod.name.trim(),
      sku: prod.sku.trim(),
      category: (prod.category || 'General').trim(),
      price: Number(prod.price) || 0,
      cost_price: Number(prod.costPrice) || 0,
      stock: Math.max(0, Math.trunc(Number(prod.stock) || 0)),
      low_stock_threshold: Math.max(0, Math.trunc(Number(prod.lowStockThreshold) || 10)),
      status: prod.status || 'active',
      description: prod.description || '',
      sales_count: 0,
      rating: 5.0,
    };

    const extendedPayload: Record<string, unknown> = { ...basePayload };
    if (prod.image !== undefined) {
      extendedPayload.image_url = prod.image.trim() || null;
    }
    if (prod.websiteId !== undefined) {
      extendedPayload.website_id =
        prod.websiteId && UUID_REGEX.test(prod.websiteId.trim()) ? prod.websiteId.trim() : null;
    }
    if (prod.isVisible !== undefined) {
      extendedPayload.is_visible = Boolean(prod.isVisible);
    }
    if (prod.sortOrder !== undefined) {
      extendedPayload.sort_order = Math.trunc(Number(prod.sortOrder) || 0);
    }

    let { data, error } = await supabase
      .from('products')
      .insert(extendedPayload)
      .select('*')
      .single();

    if (
      error &&
      (error.code === 'PGRST204' ||
        (error.message || '').includes('column') ||
        (error.message || '').includes('schema cache'))
    ) {
      const retry = await supabase.from('products').insert(basePayload).select('*').single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to create product') };
    }
    return { data: mapRowToProduct(data as RawProductRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to create product') };
  }
}

export async function updateProductInDb(
  productId: string,
  updates: Partial<Product>
): Promise<{ data: Product | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(productId)) {
    return { data: null, error: new Error('Invalid product ID') };
  }
  try {
    const basePayload: Record<string, unknown> = {};
    if (updates.name !== undefined) basePayload.name = updates.name.trim();
    if (updates.sku !== undefined) basePayload.sku = updates.sku.trim();
    if (updates.category !== undefined) basePayload.category = updates.category;
    if (updates.price !== undefined) basePayload.price = Number(updates.price) || 0;
    if (updates.costPrice !== undefined) basePayload.cost_price = Number(updates.costPrice) || 0;
    if (updates.stock !== undefined) basePayload.stock = Math.max(0, Math.trunc(Number(updates.stock) || 0));
    if (updates.lowStockThreshold !== undefined) {
      basePayload.low_stock_threshold = Math.max(0, Math.trunc(Number(updates.lowStockThreshold) || 0));
    }
    if (updates.status !== undefined) basePayload.status = updates.status;
    if (updates.description !== undefined) basePayload.description = updates.description;
    if (updates.salesCount !== undefined) {
      basePayload.sales_count = Math.max(0, Math.trunc(Number(updates.salesCount) || 0));
    }
    if (updates.rating !== undefined) basePayload.rating = Number(updates.rating) || 5.0;

    const extendedPayload: Record<string, unknown> = { ...basePayload };
    if (updates.image !== undefined) {
      extendedPayload.image_url = updates.image.trim() || null;
    }
    if (updates.websiteId !== undefined) {
      extendedPayload.website_id =
        updates.websiteId && UUID_REGEX.test(updates.websiteId.trim())
          ? updates.websiteId.trim()
          : null;
    }
    if (updates.isVisible !== undefined) {
      extendedPayload.is_visible = Boolean(updates.isVisible);
    }
    if (updates.sortOrder !== undefined) {
      extendedPayload.sort_order = Math.trunc(Number(updates.sortOrder) || 0);
    }

    let { data, error } = await supabase
      .from('products')
      .update(extendedPayload)
      .eq('id', productId)
      .select('*')
      .single();

    if (
      error &&
      Object.keys(basePayload).length > 0 &&
      (error.code === 'PGRST204' ||
        (error.message || '').includes('column') ||
        (error.message || '').includes('schema cache'))
    ) {
      const retry = await supabase
        .from('products')
        .update(basePayload)
        .eq('id', productId)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to update product') };
    }
    return { data: mapRowToProduct(data as RawProductRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to update product') };
  }
}

export async function deleteProductInDb(productId: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(productId)) {
    return { error: new Error('Invalid product ID') };
  }
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    return { error: error ? new Error(error.message || 'Failed to delete product') : null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err : new Error('Failed to delete product') };
  }
}

interface RawOrderRow {
  id: string;
  store_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  address: string;
  city: string;
  total: number | string;
  subtotal: number | string;
  delivery_charge?: number | string | null;
  status?: OrderStatus | null;
  payment_status?: 'paid' | 'pending' | 'failed' | null;
  payment_method?: string | null;
  courier_name?: string | null;
  tracking_code?: string | null;
  source?: string | null;
  items?: OrderItem[] | null;
  created_at?: string;
}

function mapRowToOrder(row: RawOrderRow): Order {
  const total = Number(row.total) || 0;
  const subtotal = Number(row.subtotal) || 0;
  const deliveryFee = Number(row.delivery_charge) || 0;
  const derivedDiscount = Math.max(0, subtotal + deliveryFee - total);
  const allowedMethod =
    row.payment_method === 'bKash' ||
    row.payment_method === 'Nagad' ||
    row.payment_method === 'Card' ||
    row.payment_method === 'Bank Transfer'
      ? row.payment_method
      : 'Cash on Delivery (COD)';

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email || '',
    customerPhone: row.customer_phone,
    items: Array.isArray(row.items) ? row.items : [],
    total,
    deliveryFee,
    discount: derivedDiscount,
    status: row.status || 'pending',
    paymentStatus: row.payment_status || 'pending',
    paymentMethod: allowedMethod,
    shippingAddress: row.address || '',
    city: row.city || '',
    courierName: row.courier_name || undefined,
    trackingCode: row.tracking_code || undefined,
    source: row.source || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function fetchStoreOrdersFromDb(storeId: string): Promise<{
  data: Order[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch orders') };
    }
    return { data: ((data as RawOrderRow[]) || []).map(mapRowToOrder), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load orders') };
  }
}

export async function createOrderInDb(
  storeId: string,
  orderNumber: string,
  order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>
): Promise<{ data: Order | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: new Error('Valid store is required to create an order') };
  }
  try {
    const total = Number(order.total) || 0;
    const deliveryCharge = Number(order.deliveryFee) || 0;
    const discount = Number(order.discount) || 0;
    const subtotal = Math.max(0, total - deliveryCharge + discount);
    const dbPaymentStatus: 'paid' | 'pending' | 'failed' =
      order.paymentStatus === 'paid'
        ? 'paid'
        : order.paymentStatus === 'failed' || order.paymentStatus === 'refunded'
        ? 'failed'
        : 'pending';

    const { data, error } = await supabase
      .from('orders')
      .insert({
        store_id: storeId,
        order_number: orderNumber,
        customer_name: order.customerName.trim(),
        customer_phone: order.customerPhone.trim(),
        customer_email: (order.customerEmail || '').trim() || null,
        address: (order.shippingAddress || 'N/A').trim(),
        city: (order.city || 'Dhaka').trim(),
        total,
        subtotal,
        delivery_charge: deliveryCharge,
        status: order.status || 'pending',
        payment_status: dbPaymentStatus,
        payment_method: order.paymentMethod || 'Cash on Delivery (COD)',
        courier_name: order.courierName || null,
        tracking_code: order.trackingCode || null,
        source: order.source || 'Dashboard',
        items: order.items || [],
      })
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to create order') };
    }
    return { data: mapRowToOrder(data as RawOrderRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to create order') };
  }
}

export async function updateOrderInDb(
  orderId: string,
  updates: Partial<{
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    courierName: string;
    trackingCode: string;
  }>
): Promise<{ data: Order | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(orderId)) {
    return { data: null, error: new Error('Invalid order ID') };
  }
  try {
    const payload: Record<string, unknown> = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.paymentStatus !== undefined) {
      payload.payment_status =
        updates.paymentStatus === 'paid'
          ? 'paid'
          : updates.paymentStatus === 'failed' || updates.paymentStatus === 'refunded'
          ? 'failed'
          : 'pending';
    }
    if (updates.courierName !== undefined) payload.courier_name = updates.courierName;
    if (updates.trackingCode !== undefined) payload.tracking_code = updates.trackingCode;

    const { data, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to update order') };
    }
    return { data: mapRowToOrder(data as RawOrderRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to update order') };
  }
}

interface RawCustomerRow {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  orders_count?: number | null;
  total_spent?: number | string | null;
  notes?: string | null;
  created_at?: string;
}

function mapRowToCustomer(row: RawCustomerRow): Customer {
  const totalSpent = Number(row.total_spent) || 0;
  const ordersCount = Number(row.orders_count) || 0;
  const createdDate = row.created_at
    ? new Date(row.created_at).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone,
    city: row.city || '',
    totalSpent,
    ordersCount,
    lastOrderDate: createdDate,
    notes: row.notes || '',
    status: totalSpent >= 10000 || ordersCount >= 5 ? 'vip' : 'active',
    tags: totalSpent >= 10000 ? ['VIP'] : [],
    createdAt: createdDate,
  };
}

export async function fetchStoreCustomersFromDb(storeId: string): Promise<{
  data: Customer[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch customers') };
    }
    return { data: ((data as RawCustomerRow[]) || []).map(mapRowToCustomer), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load customers') };
  }
}

export async function createCustomerInDb(
  storeId: string,
  cust: {
    name: string;
    phone: string;
    email?: string;
    city?: string;
    notes?: string;
    ordersCount?: number;
    totalSpent?: number;
  }
): Promise<{ data: Customer | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: new Error('Valid store is required to create a customer') };
  }
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        store_id: storeId,
        name: cust.name.trim(),
        phone: cust.phone.trim(),
        email: (cust.email || '').trim() || null,
        city: (cust.city || '').trim() || null,
        notes: cust.notes || '',
        orders_count: cust.ordersCount ?? 0,
        total_spent: cust.totalSpent ?? 0,
      })
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to create customer') };
    }
    return { data: mapRowToCustomer(data as RawCustomerRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to create customer') };
  }
}

export async function updateCustomerInDb(
  customerId: string,
  updates: Partial<Customer>
): Promise<{ data: Customer | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(customerId)) {
    return { data: null, error: new Error('Invalid customer ID') };
  }
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.phone !== undefined) payload.phone = updates.phone.trim();
    if (updates.email !== undefined) payload.email = updates.email.trim() || null;
    if (updates.city !== undefined) payload.city = updates.city.trim() || null;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.ordersCount !== undefined) payload.orders_count = Math.max(0, Math.trunc(updates.ordersCount));
    if (updates.totalSpent !== undefined) payload.total_spent = Number(updates.totalSpent) || 0;

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', customerId)
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to update customer') };
    }
    return { data: mapRowToCustomer(data as RawCustomerRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to update customer') };
  }
}

export async function deleteCustomerInDb(customerId: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(customerId)) {
    return { error: new Error('Invalid customer ID') };
  }
  try {
    const { error } = await supabase.from('customers').delete().eq('id', customerId);
    return { error: error ? new Error(error.message || 'Failed to delete customer') : null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err : new Error('Failed to delete customer') };
  }
}

interface RawInventoryMovementRow {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  type: 'restock' | 'sale' | 'adjustment' | 'damaged';
  quantity_change: number;
  new_stock: number;
  reason: string;
  created_at?: string;
}

export async function fetchStoreInventoryMovementsFromDb(storeId: string): Promise<{
  data: InventoryMovement[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch inventory movements') };
    }

    const mapped: InventoryMovement[] = ((data as RawInventoryMovementRow[]) || []).map((row) => {
      const qtyDelta = Number(row.quantity_change) || 0;
      const newStock = Number(row.new_stock) || 0;
      return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        sku: '',
        type: row.type === 'damaged' ? 'adjustment' : row.type,
        quantityDelta: qtyDelta,
        previousStock: Math.max(0, newStock - qtyDelta),
        newStock,
        reason: row.reason || '',
        operator: 'Store Staff',
        date: row.created_at
          ? new Date(row.created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      };
    });

    return { data: mapped, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load inventory movements') };
  }
}

export async function createInventoryMovementInDb(params: {
  storeId: string;
  productId: string;
  productName: string;
  type: 'restock' | 'sale' | 'adjustment' | 'return';
  quantityDelta: number;
  newStock: number;
  reason: string;
}): Promise<{ data: InventoryMovement | null; error: Error | null }> {
  if (
    !isSupabaseConfigured ||
    !supabase ||
    !UUID_REGEX.test(params.storeId) ||
    !UUID_REGEX.test(params.productId)
  ) {
    return { data: null, error: new Error('Valid store and product IDs are required') };
  }
  try {
    const dbType: 'restock' | 'sale' | 'adjustment' =
      params.type === 'return' ? 'restock' : params.type;
    const { data, error } = await supabase
      .from('inventory_movements')
      .insert({
        store_id: params.storeId,
        product_id: params.productId,
        product_name: params.productName,
        type: dbType,
        quantity_change: Math.trunc(params.quantityDelta),
        new_stock: Math.max(0, Math.trunc(params.newStock)),
        reason: (params.reason || 'Stock adjustment').trim(),
      })
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to record inventory movement') };
    }
    const row = data as RawInventoryMovementRow;
    return {
      data: {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        sku: '',
        type: params.type,
        quantityDelta: Number(row.quantity_change) || 0,
        previousStock: Math.max(0, (Number(row.new_stock) || 0) - (Number(row.quantity_change) || 0)),
        newStock: Number(row.new_stock) || 0,
        reason: row.reason,
        operator: 'Store Staff',
        date: row.created_at
          ? new Date(row.created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to record inventory movement') };
  }
}

interface RawStoreMemberRow {
  id: string;
  store_id: string;
  user_id?: string | null;
  name: string;
  email: string;
  role: TeamMember['role'];
  status: TeamMember['status'];
  created_at?: string;
}

export async function fetchStoreMembersFromDb(storeId: string): Promise<{
  data: TeamMember[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('store_members')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch team members') };
    }
    const mapped: TeamMember[] = ((data as RawStoreMemberRow[]) || []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role || 'staff',
      status: row.status === 'active' ? 'active' : 'invited',
      joinedAt: row.created_at
        ? new Date(row.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    }));
    return { data: mapped, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load team members') };
  }
}

export async function inviteStoreMemberInDb(
  storeId: string,
  member: { name: string; email: string; role: TeamMember['role'] }
): Promise<{ data: TeamMember | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(storeId)) {
    return { data: null, error: new Error('Valid store is required to invite a team member') };
  }
  try {
    const safeRole: TeamMember['role'] =
      member.role === 'owner' ? 'admin' : member.role;
    const { data, error } = await supabase
      .from('store_members')
      .insert({
        store_id: storeId,
        user_id: null,
        name: member.name.trim(),
        email: member.email.trim().toLowerCase(),
        role: safeRole,
        status: 'invited',
      })
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to invite team member') };
    }
    const row = data as RawStoreMemberRow;
    return {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        joinedAt: row.created_at
          ? new Date(row.created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to invite team member') };
  }
}

export async function removeStoreMemberInDb(memberId: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(memberId)) {
    return { error: new Error('Invalid team member ID') };
  }
  try {
    const { error } = await supabase.from('store_members').delete().eq('id', memberId);
    return { error: error ? new Error(error.message || 'Failed to remove team member') : null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err : new Error('Failed to remove team member') };
  }
}

interface RawSupportTicketRow {
  id: string;
  user_id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: string;
  status: SupportTicket['status'];
  messages?: SupportTicketMessage[] | null;
  created_at?: string;
  updated_at?: string;
}

function mapRowToSupportTicket(row: RawSupportTicketRow): SupportTicket {
  const validCategories: SupportTicket['category'][] = [
    'Billing',
    'Technical',
    'Integration',
    'Website Service',
    'General',
  ];
  const category = validCategories.includes(row.category as SupportTicket['category'])
    ? (row.category as SupportTicket['category'])
    : 'General';
  const priority: SupportTicket['priority'] =
    row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium';

  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    subject: row.subject,
    category,
    priority,
    status: row.status || 'open',
    messages: Array.isArray(row.messages) ? row.messages : [],
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  };
}

export async function fetchSupportTicketsFromDb(): Promise<{
  data: SupportTicket[] | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: null };
  }
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to fetch support tickets') };
    }
    return { data: ((data as RawSupportTicketRow[]) || []).map(mapRowToSupportTicket), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to load support tickets') };
  }
}

export async function createSupportTicketInDb(params: {
  userId: string;
  ticketNumber: string;
  subject: string;
  category: SupportTicket['category'];
  priority: SupportTicket['priority'];
  messages: SupportTicketMessage[];
}): Promise<{ data: SupportTicket | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(params.userId)) {
    return { data: null, error: new Error('Authentication required to create a support ticket') };
  }
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: params.userId,
        ticket_number: params.ticketNumber,
        subject: params.subject.trim(),
        category: params.category,
        priority: params.priority,
        status: 'open',
        messages: params.messages,
      })
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to create support ticket') };
    }
    return { data: mapRowToSupportTicket(data as RawSupportTicketRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to create support ticket') };
  }
}

export async function updateSupportTicketInDb(
  ticketId: string,
  updates: { messages?: SupportTicketMessage[]; status?: SupportTicket['status'] }
): Promise<{ data: SupportTicket | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase || !UUID_REGEX.test(ticketId)) {
    return { data: null, error: new Error('Invalid ticket ID') };
  }
  try {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.messages !== undefined) payload.messages = updates.messages;
    if (updates.status !== undefined) payload.status = updates.status;

    const { data, error } = await supabase
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error || !data) {
      return { data: null, error: new Error(error?.message || 'Failed to update support ticket') };
    }
    return { data: mapRowToSupportTicket(data as RawSupportTicketRow), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to update support ticket') };
  }
}


