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
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      return { data: null, error };
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
