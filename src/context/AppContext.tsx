import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Product,
  Order,
  ServiceTrialRecord,
  ServiceAccessStatus,
  ServiceTrialCategory,
  PaymentRequest,
  PaymentGatewayConfig,
  PaymentMethodType,
  PaymentRequestStatus,
  OrderStatus,
  PaymentStatus,
  Customer,
  InventoryMovement,
  LandingPage,
  AIAutomation,
  WebsiteRequest,
  TeamMember,
  SupportTicket,
  SupportTicketMessage,
  AppNotification,
  Invoice,
  Store,
  User,
  UserRole,
  OnboardingData,
  SubscribedWebsite,
  CreateSubscribedWebsiteInput,
  WebsiteSubscriptionPlanConfig,
  ServicePricingCatalogEntry,
  WebsiteLifecycleAuditLog,
  ApproveAndPublishResult,
} from '../types';
import {
  INITIAL_STORES,
  INITIAL_USER,
  INITIAL_ONBOARDING,
  INITIAL_PRODUCTS,
  INITIAL_ORDERS,
  INITIAL_CUSTOMERS,
  INITIAL_INVENTORY_LOGS,
  INITIAL_LANDING_PAGES,
  INITIAL_AUTOMATIONS,
  INITIAL_WEBSITE_REQUESTS,
  INITIAL_TEAM_MEMBERS,
  INITIAL_SUPPORT_TICKETS,
  INITIAL_NOTIFICATIONS,
  INITIAL_INVOICES,
  INITIAL_SUBSCRIBED_WEBSITES,
} from '../data/mockData';
import {
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
  DashboardPlanId,
  getDashboardPlanById,
  normalizeDashboardPlanId,
  resolveAuthoritativeServicePrice,
} from '../data/pricingConfig';
import {
  NAGAD_PERSONAL_NUMBER,
  NAGAD_ACCOUNT_TYPE_EN,
  NAGAD_DEFAULT_ADMIN_INSTRUCTIONS,
} from '../data/paymentGatewaysConfig';
import {
  executeApproveAndPublishWorkflow,
  hasDuplicateActiveTransactionReference,
  isWebsitePaymentService,
  isWebsiteTrulyLive,
  validateManualPaymentSubmissionInput,
} from '../lib/paymentWorkflow';
import {
  supabase,
  isSupabaseConfigured,
  UUID_REGEX,
  validateSubdomainFormat,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPasswordForEmail,
  updateUserPassword,
  resendVerificationEmail,
  signOutFromSupabase,
  getUserProfile,
  upsertUserProfile,
  getSupabaseConfigStatus,
  fetchUserServiceTrials,
  activateServiceTrialInDb,
  RawServiceTrialRow,
  fetchUserPaymentRequests,
  fetchPaymentRequestByIdFromDb,
  createPaymentRequestInDb,
  adminApprovePaymentInDb,
  adminRejectPaymentInDb,
  RawPaymentRequestRow,
  fetchPublishedWebsiteBySubdomain,
  fetchSubscribedWebsiteByIdFromDb,
  publishClientWebsiteInDb,
  updateClientWebsiteInDb,
  unpublishClientWebsiteInDb,
  createSubscribedWebsiteInDb,
  fetchUserSubscribedWebsitesFromDb,
  checkRemoteSubdomainAvailability,
  cancelClientWebsiteSubscriptionInDb,
  adminUpdateWebsiteLifecycleInDb,
  adminDeleteSubscribedWebsiteInDb,
  fetchUserStoresFromDb,
  createStoreInDb,
  updateStoreInDb,
  fetchPaymentGatewayConfigsFromDb,
  adminUpdatePaymentGatewayConfigInDb,
  fetchServicePricingCatalogFromDb,
  fetchWebsiteLifecycleAuditLogsFromDb,
  fetchStoreProductsFromDb,
  createProductInDb,
  updateProductInDb,
  deleteProductInDb,
  fetchStoreOrdersFromDb,
  createOrderInDb,
  updateOrderInDb,
  fetchStoreCustomersFromDb,
  createCustomerInDb,
  updateCustomerInDb,
  deleteCustomerInDb,
  fetchStoreInventoryMovementsFromDb,
  createInventoryMovementInDb,
  fetchStoreMembersFromDb,
  inviteStoreMemberInDb,
  removeStoreMemberInDb,
  fetchSupportTicketsFromDb,
  createSupportTicketInDb,
  updateSupportTicketInDb,
  uploadWebsiteAssetToStorage,
  deleteWebsiteAssetFromStorage,
} from '../lib/supabase';
import {
  isAuthorizedAdminEmail,
  isAuthUserEmailVerified,
} from '../lib/adminSecurity';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface AppContextType {
  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Real Supabase Auth & User
  user: User | null;
  role: UserRole;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  setAuthenticatedUser: (user: User) => void;
  loginWithGoogle: (customRedirectTo?: string) => Promise<{ error: Error | null }>;
  loginWithEmail: (email: string, password: string) => Promise<{ user: User | null; error: Error | null }>;
  registerWithEmail: (name: string, email: string, password: string, businessName: string) => Promise<{ user: User | null; needsEmailConfirmation: boolean; error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;

  // Stores
  stores: Store[];
  activeStore: Store;
  activeStoreId: string;
  setActiveStoreId: (id: string) => void;
  updateActiveStore: (updated: Partial<Store>) => void;

  // Onboarding
  onboarding: OnboardingData;
  updateOnboarding: (data: Partial<OnboardingData>) => void;
  completeOnboarding: (overrides?: Partial<OnboardingData>) => Promise<void>;

  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'salesCount' | 'rating'>) => Promise<Product | null>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<Product | null>;
  deleteProduct: (id: string) => Promise<boolean>;
  adjustProductStock: (id: string, delta: number, reason: string) => void;
  ensureMerchantStore: (preferredName?: string) => Promise<string | undefined>;

  // Orders
  orders: Order[];
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  updateOrderPaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  updateOrderTracking: (id: string, courierName: string, trackingCode: string) => void;

  // Customers
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id' | 'totalSpent' | 'ordersCount' | 'lastOrderDate' | 'createdAt'>) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addCustomerNote: (id: string, note: string) => void;

  // Inventory
  inventoryLogs: InventoryMovement[];

  // Landing Page Builder
  landingPages: LandingPage[];
  createLandingPage: (page: Omit<LandingPage, 'id' | 'visitors' | 'conversions' | 'updatedAt'>) => void;
  updateLandingPage: (id: string, page: Partial<LandingPage>) => void;
  deleteLandingPage: (id: string) => void;
  togglePublishLandingPage: (id: string) => void;

  // Automations
  automations: AIAutomation[];
  toggleAutomation: (id: string) => void;
  updateAutomation: (id: string, data: Partial<AIAutomation>) => void;
  testRunAutomation: (id: string) => void;

  // Website Requests (One-time bespoke)
  websiteRequests: WebsiteRequest[];
  addWebsiteRequest: (req: Omit<WebsiteRequest, 'id' | 'status' | 'createdAt'>) => void;
  updateWebsiteRequestStatus: (id: string, status: WebsiteRequest['status']) => void;

  // Subscribed Websites (GoAMAAS Website - ৳600/month recurring plan)
  websiteSubscriptionPlan: WebsiteSubscriptionPlanConfig;
  updateWebsiteSubscriptionPlanConfig: (updates: Partial<WebsiteSubscriptionPlanConfig>) => void;
  subscribedWebsites: SubscribedWebsite[];
  isWebsitesLoading: boolean;
  createSubscribedWebsite: (data: CreateSubscribedWebsiteInput) => Promise<SubscribedWebsite>;
  updateSubscribedWebsite: (
    id: string,
    updates: Partial<SubscribedWebsite>,
    options?: { saveAsDraftOnly?: boolean; silentToast?: boolean }
  ) => Promise<{ success: boolean; error?: Error }>;
  saveWebsiteDraft: (id: string, updates: Partial<SubscribedWebsite>) => Promise<{ success: boolean; error?: Error }>;
  publishWebsiteUpdates: (id: string, updates?: Partial<SubscribedWebsite>) => Promise<{ success: boolean; message: string }>;
  uploadWebsiteAsset: (params: {
    file: File;
    folder: 'logos' | 'heroes' | 'banners' | 'products' | 'sections';
    websiteId?: string;
  }) => Promise<{ publicUrl: string | null; error: Error | null }>;
  removeWebsiteAsset: (publicUrl: string) => Promise<void>;
  renewSubscribedWebsite: (id: string, reason?: string) => void;
  suspendSubscribedWebsite: (id: string, reason?: string) => void;
  reactivateSubscribedWebsite: (id: string, reason?: string) => void;
  adminDeleteSubscribedWebsite: (id: string) => Promise<{ success: boolean; message: string }>;
  websiteLifecycleAuditLogs: WebsiteLifecycleAuditLog[];
  refreshWebsiteLifecycleAuditLogs: () => Promise<void>;
  servicePricingCatalog: ServicePricingCatalogEntry[];
  isPricingCatalogLoading: boolean;
  isPricingCatalogLoaded: boolean;
  pricingCatalogError: string | null;
  refreshServicePricingCatalog: () => Promise<ServicePricingCatalogEntry[] | null>;
  checkSubdomainAvailability: (subdomain: string, excludeId?: string) => { available: boolean; reason?: string };
  checkSubdomainAvailabilityAsync: (subdomain: string, excludeId?: string) => Promise<{ available: boolean; reason?: string }>;
  refreshSubscribedWebsites: () => Promise<void>;
  requestWebsiteContentUpdate: (websiteId: string, details: string) => void;

  // Subscriptions & Billing
  currentPlan: DashboardPlanId;
  trialDaysLeft: number;
  invoices: Invoice[];
  updatePlan: (plan: DashboardPlanId | Uppercase<DashboardPlanId>) => void;
  cancelSubscription: () => void;

  // Independent 7-Day Free Trial System For Every Service
  serviceTrials: ServiceTrialRecord[];
  isTrialsLoading: boolean;
  getServiceAccess: (serviceId: string, serviceName: string, category: ServiceTrialCategory) => ServiceAccessStatus;
  activateServiceTrial: (serviceId: string, serviceName: string, category: ServiceTrialCategory) => Promise<{ success: boolean; message: string; trial?: ServiceTrialRecord }>;
  refreshServiceTrials: () => Promise<void>;

  // Payment Requests & Gateways System
  paymentRequests: PaymentRequest[];
  isPaymentsLoading: boolean;
  paymentGatewayConfigs: PaymentGatewayConfig[];
  submitPaymentRequest: (params: {
    serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
    serviceId: string;
    serviceName: string;
    planTier: string;
    amount: number;
    paymentMethod: PaymentMethodType;
    transactionId?: string;
    senderNumber?: string;
    bankName?: string;
    bankAccountName?: string;
    bankReference?: string;
  }) => Promise<{ success: boolean; message: string; request?: PaymentRequest }>;
  adminApprovePayment: (requestId: string, notes?: string) => Promise<{ success: boolean; message: string }>;
  adminApproveAndPublishPayment: (
    requestId: string,
    notes?: string
  ) => Promise<ApproveAndPublishResult>;
  adminRetryPublishForPayment: (requestId: string) => Promise<ApproveAndPublishResult>;
  adminRejectPayment: (requestId: string, reason: string) => Promise<{ success: boolean; message: string }>;
  refreshPaymentRequests: () => Promise<void>;
  updatePaymentGatewayConfig: (id: string, updates: Partial<PaymentGatewayConfig>) => Promise<boolean>;
  publishWebsite: (websiteId: string) => Promise<{ success: boolean; message: string }>;
  unpublishWebsite: (websiteId: string) => Promise<{ success: boolean; message: string }>;
  cancelWebsiteSubscription: (websiteId: string) => Promise<{ success: boolean; message: string }>;
  resolvePublicWebsite: (subdomain: string) => Promise<{ site: SubscribedWebsite | null; notFound: boolean }>;

  // Team
  teamMembers: TeamMember[];
  addTeamMember: (member: Omit<TeamMember, 'id' | 'joinedAt'>) => void;
  removeTeamMember: (id: string) => void;

  // Support
  supportTickets: SupportTicket[];
  createSupportTicket: (subject: string, category: SupportTicket['category'], priority: SupportTicket['priority'], text: string) => void;
  replySupportTicket: (ticketId: string, text: string) => void;

  // Notifications
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // Toast
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  // Reset
  resetDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(`goamaas_${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`goamaas_${key}`, JSON.stringify(value));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('goamaas_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('goamaas_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Toast System
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // User & Auth State (Authoritative Supabase session when configured; never trust metadata/localStorage for admin role)
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(() => {
    if (isSupabaseConfigured) return null;
    const stored = getStored<User | null>('user', INITIAL_USER);
    return stored ? { ...stored, role: 'merchant' } : null;
  });
  const [role, setRole] = useState<UserRole>('merchant');

  // Real Stores (persisted in public.stores when Supabase is configured)
  const [stores, setStores] = useState<Store[]>(() =>
    isSupabaseConfigured ? [] : getStored('stores', INITIAL_STORES)
  );
  const [activeStoreId, setActiveStoreIdState] = useState<string>(() =>
    isSupabaseConfigured ? '' : getStored('activeStoreId', '')
  );
  const syncingStoresUserRef = useRef<string | null>(null);

  // Onboarding
  const [onboarding, setOnboarding] = useState<OnboardingData>(() => getStored('onboarding', INITIAL_ONBOARDING));

  useEffect(() => {
    setStored('onboarding', onboarding);
  }, [onboarding]);

  const updateOnboarding = (data: Partial<OnboardingData>) => {
    setOnboarding((prev) => ({ ...prev, ...data }));
  };

  // Helper to construct User object strictly from Supabase auth user + authoritative public.profiles row
  const buildUserFromSession = async (sessionUser: any): Promise<User> => {
    const userId = sessionUser.id;
    const meta = sessionUser.user_metadata || {};
    let { profile } = await getUserProfile(userId);

    const fullName =
      profile?.full_name ||
      meta.full_name ||
      meta.name ||
      sessionUser.email?.split('@')[0] ||
      'Merchant';

    const isOnAdminRoute =
      typeof window !== 'undefined' &&
      (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));

    // Ensure profile row exists for OAuth / confirmed merchant users without trusting metadata role
    // Never auto-provision a merchant profile row while inside /admin routes
    if (!profile && isSupabaseConfigured && !isOnAdminRoute) {
      await upsertUserProfile({
        id: userId,
        full_name: fullName,
        email: sessionUser.email || '',
        role: 'merchant',
        onboarding_completed: Boolean(meta.onboarding_completed),
      });
      const refreshed = await getUserProfile(userId);
      profile = refreshed.profile;
    }

    // SECURITY: Never trust user_metadata.role or localStorage for admin authorization;
    // require authorized email + verified email + profile.role === 'admin' + server RPC is_admin()
    let verifiedRole: UserRole = 'merchant';
    if (
      profile?.role === 'admin' &&
      isAuthorizedAdminEmail(sessionUser.email) &&
      isAuthUserEmailVerified(sessionUser) &&
      isSupabaseConfigured &&
      supabase
    ) {
      const { data: rpcAdmin, error: rpcErr } = await supabase.rpc('is_admin');
      if (!rpcErr && rpcAdmin === true) {
        verifiedRole = 'admin';
      }
    }
    const verifiedStoreId =
      profile?.store_id && UUID_REGEX.test(profile.store_id) ? profile.store_id : '';

    if (profile?.onboarding_completed || meta.onboarding_completed) {
      setOnboarding((prev) => ({ ...prev, completed: true }));
    }

    return {
      id: userId,
      name: fullName,
      email: sessionUser.email || '',
      role: verifiedRole,
      storeId: verifiedStoreId,
    };
  };

  const clearAuthenticatedSessionState = useCallback(() => {
    syncingStoresUserRef.current = null;
    setUser(null);
    setRole('merchant');
    if (isSupabaseConfigured) {
      setStores([]);
      setActiveStoreIdState('');
      setProducts([]);
      setOrders([]);
      setCustomers([]);
      setInventoryLogs([]);
      setTeamMembers([]);
      setSupportTickets([]);
      setInvoices([]);
      setNotifications([]);
      setSubscribedWebsites([]);
      setPaymentRequests([]);
      setServiceTrials([]);
      setWebsiteLifecycleAuditLogs([]);
      setServicePricingCatalog([]);
      setIsPricingCatalogLoaded(false);
      setIsPricingCatalogLoading(false);
      setPricingCatalogError(null);
      setCurrentPlan('starter');
    }
    try {
      localStorage.removeItem('goamaas_user');
      localStorage.removeItem('goamaas_stores');
      localStorage.removeItem('goamaas_activeStoreId');
      localStorage.removeItem('goamaas_products');
      localStorage.removeItem('goamaas_orders');
      localStorage.removeItem('goamaas_customers');
      localStorage.removeItem('goamaas_inventoryLogs');
      localStorage.removeItem('goamaas_teamMembers');
      localStorage.removeItem('goamaas_supportTickets');
      localStorage.removeItem('goamaas_invoices');
      localStorage.removeItem('goamaas_subscribedWebsites');
      localStorage.removeItem('goamaas_payment_requests');
      localStorage.removeItem('goamaas_service_trials');
    } catch {}
  }, []);

  // Supabase Auth Listener & Persistent Session Initialization
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth
        .getSession()
        .then(async ({ data: { session }, error }) => {
          if (error) {
            console.error('Supabase getSession error:', error);
          }
          if (session?.user) {
            try {
              const parsedUser = await buildUserFromSession(session.user);
              setUser(parsedUser);
              setRole(parsedUser.role);
            } catch (e) {
              console.error('Failed to parse Supabase session user:', e);
              clearAuthenticatedSessionState();
            }
          } else {
            clearAuthenticatedSessionState();
          }
          setIsAuthLoading(false);
        })
        .catch(() => {
          setIsAuthLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          clearAuthenticatedSessionState();
        } else if (session?.user) {
          try {
            const parsedUser = await buildUserFromSession(session.user);
            setUser(parsedUser);
            setRole(parsedUser.role);
          } catch (e) {
            console.error('Error during onAuthStateChange user sync:', e);
          }
        }
        setIsAuthLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setIsAuthLoading(false);
    }
  }, [clearAuthenticatedSessionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStored('user', user);
    } else {
      localStorage.removeItem('goamaas_user');
    }
    if (user) {
      setRole(user.role);
    }
  }, [user]);

  const setAuthenticatedUser = (newUser: User) => {
    const safeRole: UserRole =
      isSupabaseConfigured &&
      newUser.role === 'admin' &&
      isAuthorizedAdminEmail(newUser.email)
        ? 'admin'
        : 'merchant';
    setUser({ ...newUser, role: safeRole });
    setRole(safeRole);
  };

  const loginWithGoogle = async (customRedirectTo?: string): Promise<{ error: Error | null }> => {
    const result = await signInWithGoogle(customRedirectTo);
    if (result.error) {
      showToast(result.error.message, 'error');
      return { error: result.error };
    }
    return { error: null };
  };

  const loginWithEmail = async (email: string, password: string): Promise<{ user: User | null; error: Error | null }> => {
    if (!isSupabaseConfigured || !supabase) {
      const status = getSupabaseConfigStatus();
      const errorMsg = `Supabase credentials (${status.missingVariables.join(', ')}) are not configured in environment variables.`;
      showToast(errorMsg, 'error');
      return { user: null, error: new Error(errorMsg) };
    }

    const { user: authUser, error } = await signInWithEmail(email, password);
    if (error || !authUser) {
      const err = error || new Error('Authentication failed');
      showToast(err.message, 'error');
      return { user: null, error: err };
    }

    const parsedUser = await buildUserFromSession(authUser);
    setUser(parsedUser);
    setRole(parsedUser.role);
    showToast(`Welcome back, ${parsedUser.name}!`, 'success');
    return { user: parsedUser, error: null };
  };

  const registerWithEmail = async (
    name: string,
    email: string,
    password: string,
    businessName: string
  ): Promise<{ user: User | null; needsEmailConfirmation: boolean; error: Error | null }> => {
    if (!isSupabaseConfigured || !supabase) {
      const status = getSupabaseConfigStatus();
      const errorMsg = `Supabase credentials (${status.missingVariables.join(', ')}) are not configured in environment variables.`;
      showToast(errorMsg, 'error');
      return { user: null, needsEmailConfirmation: false, error: new Error(errorMsg) };
    }

    const { user: authUser, needsEmailConfirmation, error } = await signUpWithEmail(
      name,
      email,
      password,
      businessName
    );

    if (error || !authUser) {
      const err = error || new Error('Registration failed');
      showToast(err.message, 'error');
      return { user: null, needsEmailConfirmation: false, error: err };
    }

    if (needsEmailConfirmation) {
      showToast('Registration successful! Please check your email to verify your account.', 'info');
      return { user: null, needsEmailConfirmation: true, error: null };
    }

    // Active session returned immediately: persist profile and primary store in PostgreSQL
    const { error: profileError } = await upsertUserProfile({
      id: authUser.id,
      full_name: name.trim(),
      email: email.trim(),
      role: 'merchant',
      onboarding_completed: false,
    });
    if (profileError) {
      console.error('Failed to create profile during signup:', profileError);
      showToast(`Account created, but profile initialization failed: ${profileError.message}`, 'warning');
      return { user: null, needsEmailConfirmation, error: new Error(`Account created in Auth, but profile setup failed: ${profileError.message}`) };
    }

    syncingStoresUserRef.current = authUser.id;
    const { data: createdStore, error: storeErr } = await createStoreInDb({
      name: businessName.trim() || `${name.trim()}'s Store`,
      category: 'General E-Commerce',
      currency: '৳',
    });

    if (storeErr) {
      console.warn('[GoAMAAS] Initial store creation warning during signup:', storeErr.message);
      syncingStoresUserRef.current = null;
    }

    const resolvedStoreId = createdStore?.id || '';
    if (resolvedStoreId) {
      await upsertUserProfile({
        id: authUser.id,
        store_id: resolvedStoreId,
      });
      setStores([createdStore!]);
      setActiveStoreIdState(resolvedStoreId);
    }

    const parsedUser: User = {
      id: authUser.id,
      name: name.trim(),
      email: email.trim(),
      role: 'merchant',
      storeId: resolvedStoreId,
    };

    setUser(parsedUser);
    setRole('merchant');
    updateOnboarding({ businessName: businessName.trim(), completed: false });

    showToast(`Welcome ${name}! Your workspace "${businessName}" is ready.`, 'success');
    return { user: parsedUser, needsEmailConfirmation: false, error: null };
  };

  const requestPasswordReset = async (email: string): Promise<{ error: Error | null }> => {
    const result = await resetPasswordForEmail(email);
    if (result.error) {
      showToast(result.error.message, 'error');
    } else {
      showToast('Password recovery instructions sent to your email.', 'success');
    }
    return result;
  };

  const updatePassword = async (newPassword: string): Promise<{ error: Error | null }> => {
    const result = await updateUserPassword(newPassword);
    if (result.error) {
      showToast(result.error.message, 'error');
    } else {
      showToast('Password successfully updated!', 'success');
    }
    return result;
  };

  const resendVerification = async (email: string): Promise<{ error: Error | null }> => {
    const result = await resendVerificationEmail(email);
    if (result.error) {
      showToast(result.error.message, 'error');
    } else {
      showToast('Verification email resent. Please check your inbox.', 'success');
    }
    return result;
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await signOutFromSupabase();
    }
    clearAuthenticatedSessionState();
    showToast('Signed out of GoAMAAS session', 'info');
  };

  const switchRole = (newRole: UserRole) => {
    // SECURITY: Client-side role switching can never grant administrator privileges
    if (!isSupabaseConfigured || user?.role !== 'admin') {
      if (newRole === 'admin') {
        showToast('Unauthorized: Administrator privileges are verified server-side.', 'error');
      }
      return;
    }
    setRole(newRole);
  };

  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_stores');
      localStorage.removeItem('goamaas_activeStoreId');
    } else {
      setStored('stores', stores);
      setStored('activeStoreId', activeStoreId);
    }
  }, [stores, activeStoreId]);

  // Synchronize authenticated user's stores with public.stores in PostgreSQL
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id) return;

    let cancelled = false;
    (async () => {
      const { data: dbStores, error } = await fetchUserStoresFromDb();
      if (cancelled) return;

      if (error) {
        console.warn('[GoAMAAS] Failed to load stores from Supabase:', error.message);
        return;
      }

      if (dbStores && dbStores.length > 0) {
        syncingStoresUserRef.current = user.id;
        setStores(dbStores);
        const preferred =
          user.storeId && dbStores.some((s) => s.id === user.storeId)
            ? user.storeId
            : dbStores[0].id;
        setActiveStoreIdState((prev) =>
          prev && dbStores.some((s) => s.id === prev) ? prev : preferred
        );
        return;
      }

      // Never auto-provision a default merchant store for platform admin sessions or /admin routes
      const isOnAdminRoute =
        typeof window !== 'undefined' &&
        (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));
      if (user.role === 'admin' || isOnAdminRoute) return;

      // Auto-provision default store once if authenticated user has zero stores in DB
      if (syncingStoresUserRef.current === user.id) return;
      syncingStoresUserRef.current = user.id;

      const defaultStoreName =
        onboarding.businessName?.trim() ||
        (user.name ? `${user.name}'s Store` : 'My Store');
      const { data: created, error: createErr } = await createStoreInDb({
        name: defaultStoreName,
        category: onboarding.category || 'General E-Commerce',
        currency: onboarding.currency || '৳',
        phone: onboarding.phone || '',
      });
      if (cancelled) return;

      if (!createErr && created) {
        setStores([created]);
        setActiveStoreIdState(created.id);
        await upsertUserProfile({ id: user.id, store_id: created.id });
      } else if (createErr) {
        syncingStoresUserRef.current = null;
        console.warn('[GoAMAAS] Could not auto-provision default store:', createErr.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Clean fallback store to prevent undefined errors in UI components while loading
  const fallbackStore: Store = {
    id: user?.storeId || '',
    name: onboarding.businessName?.trim() || (user?.name ? `${user.name}'s Store` : 'My Store'),
    slug: 'my-store',
    category: 'General E-Commerce',
    currency: '৳',
    phone: '',
    address: '',
    createdAt: new Date().toISOString().split('T')[0],
  };

  const activeStore = stores.find((s) => s.id === activeStoreId) || stores[0] || fallbackStore;

  const setActiveStoreId = (id: string) => {
    setActiveStoreIdState(id);
    const target = stores.find((s) => s.id === id);
    if (target) {
      showToast(`Switched active store to "${target.name}"`, 'info');
    }
  };

  const updateActiveStore = (updated: Partial<Store>) => {
    const targetStoreId = activeStore.id;
    setStores((prev) => {
      const exists = prev.some((s) => s.id === targetStoreId);
      if (exists) {
        return prev.map((s) => (s.id === targetStoreId ? { ...s, ...updated } : s));
      }
      return [{ ...activeStore, ...updated }];
    });

    if (isSupabaseConfigured && supabase && user?.id) {
      void (async () => {
        if (targetStoreId && UUID_REGEX.test(targetStoreId)) {
          const { data: saved, error } = await updateStoreInDb(targetStoreId, updated);
          if (error) {
            showToast(`Failed to save store settings: ${error.message}`, 'error');
            const { data: refreshed } = await fetchUserStoresFromDb();
            if (refreshed) setStores(refreshed);
            return;
          }
          if (saved) {
            setStores((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
          }
          showToast('Store settings updated successfully', 'success');
        } else {
          const { data: created, error } = await createStoreInDb({
            name: updated.name || activeStore.name,
            slug: updated.slug,
            category: updated.category || activeStore.category,
            currency: updated.currency || activeStore.currency,
            phone: updated.phone ?? activeStore.phone,
            address: updated.address ?? activeStore.address,
          });
          if (error || !created) {
            showToast(`Failed to create store in database: ${error?.message || 'Unknown error'}`, 'error');
            return;
          }
          setStores([created]);
          setActiveStoreIdState(created.id);
          await upsertUserProfile({ id: user.id, store_id: created.id });
          showToast('Store created and saved to database', 'success');
        }
      })();
      return;
    }

    showToast('Store settings updated successfully', 'success');
  };

  const completeOnboarding = async (overrides?: Partial<OnboardingData>): Promise<void> => {
    const mergedOnboarding: OnboardingData = {
      ...onboarding,
      ...(overrides || {}),
      completed: true,
    };
    setOnboarding(mergedOnboarding);

    const storePatch: Partial<Store> = {
      name: mergedOnboarding.businessName?.trim() || activeStore.name,
      category: mergedOnboarding.category || activeStore.category || 'General E-Commerce',
      currency: mergedOnboarding.currency || activeStore.currency || '৳',
      phone: mergedOnboarding.phone?.trim() ?? activeStore.phone ?? '',
      address: mergedOnboarding.city?.trim() || activeStore.address || '',
    };

    if (user && isSupabaseConfigured && supabase) {
      let validStoreId =
        activeStoreId && UUID_REGEX.test(activeStoreId)
          ? activeStoreId
          : activeStore.id && UUID_REGEX.test(activeStore.id)
          ? activeStore.id
          : undefined;

      if (validStoreId) {
        const { data: savedStore } = await updateStoreInDb(validStoreId, storePatch);
        if (savedStore) {
          setStores((prev) =>
            prev.some((s) => s.id === savedStore.id)
              ? prev.map((s) => (s.id === savedStore.id ? savedStore : s))
              : [savedStore, ...prev]
          );
        }
      } else {
        const { data: createdStore } = await createStoreInDb({
          name: storePatch.name || `${user.name}'s Store`,
          category: storePatch.category,
          currency: storePatch.currency,
          phone: storePatch.phone,
          address: storePatch.address,
        });
        if (createdStore) {
          validStoreId = createdStore.id;
          setStores((prev) => [createdStore, ...prev.filter((s) => s.id !== createdStore.id)]);
          setActiveStoreIdState(createdStore.id);
        }
      }

      const { error: profileError } = await upsertUserProfile({
        id: user.id,
        onboarding_completed: true,
        store_id: validStoreId,
      });
      if (profileError) {
        console.error('Failed to update profile onboarding status:', profileError);
        showToast('Warning: Profile update failed: ' + profileError.message, 'warning');
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { onboarding_completed: true, ...(validStoreId ? { store_id: validStoreId } : {}) },
      });
      if (authError) {
        console.error('Failed to update auth metadata onboarding status:', authError);
      }
    } else {
      updateActiveStore(storePatch);
    }
    showToast('Onboarding completed! Welcome to your dashboard.', 'success');
  };

  // Products (Real multi-tenant catalog; zero mock data when Supabase is configured)
  const [products, setProducts] = useState<Product[]>(() =>
    isSupabaseConfigured ? [] : getStored('products', INITIAL_PRODUCTS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_products');
    } else {
      setStored('products', products);
    }
  }, [products]);

  const ensureMerchantStore = useCallback(
    async (preferredName?: string): Promise<string | undefined> => {
      if (!isSupabaseConfigured || !supabase || !user?.id) {
        return activeStore?.id;
      }
      if (
        activeStoreId &&
        UUID_REGEX.test(activeStoreId) &&
        stores.some((s) => s.id === activeStoreId)
      ) {
        return activeStoreId;
      }
      const existingValid = stores.find((s) => UUID_REGEX.test(s.id));
      if (existingValid) {
        setActiveStoreIdState(existingValid.id);
        return existingValid.id;
      }
      const { data: dbStores } = await fetchUserStoresFromDb();
      if (dbStores && dbStores.length > 0) {
        setStores(dbStores);
        const preferredDbStore =
          (user.storeId && dbStores.find((s) => s.id === user.storeId && UUID_REGEX.test(s.id))) ||
          dbStores.find((s) => UUID_REGEX.test(s.id));
        if (preferredDbStore) {
          setActiveStoreIdState(preferredDbStore.id);
          return preferredDbStore.id;
        }
      }
      const { data: createdStore, error } = await createStoreInDb({
        name: (preferredName || '').trim() || `${user.name || 'Merchant'}'s Store`,
        category: 'General',
        currency: '৳',
      });
      if (error || !createdStore) {
        return undefined;
      }
      setStores((prev) => [createdStore, ...prev.filter((s) => s.id !== createdStore.id)]);
      setActiveStoreIdState(createdStore.id);
      void upsertUserProfile({ id: user.id, store_id: createdStore.id });
      return createdStore.id;
    },
    [activeStore?.id, activeStoreId, stores, user?.id, user?.name, user?.storeId]
  );

  const addProduct = async (
    prodData: Omit<Product, 'id' | 'salesCount' | 'rating'>
  ): Promise<Product | null> => {
    if (isSupabaseConfigured && user?.id) {
      const linkedWebsiteStoreId = prodData.websiteId
        ? subscribedWebsites.find((w) => w.id === prodData.websiteId)?.storeId
        : undefined;
      const resolvedStoreId =
        linkedWebsiteStoreId && UUID_REGEX.test(linkedWebsiteStoreId)
          ? linkedWebsiteStoreId
          : await ensureMerchantStore();
      if (!resolvedStoreId || !UUID_REGEX.test(resolvedStoreId)) {
        showToast('Store workspace is still initializing. Please try again in a moment.', 'warning');
        return null;
      }
      const { data, error } = await createProductInDb(resolvedStoreId, prodData);
      if (error || !data) {
        showToast(error?.message || 'Failed to add product to database', 'error');
        return null;
      }
      setProducts((prev) => [data, ...prev.filter((p) => p.id !== data.id)]);
      showToast(`Added product "${data.name}"`, 'success');
      return data;
    }

    const newProduct: Product = {
      ...prodData,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isVisible: prodData.isVisible ?? true,
      salesCount: 0,
      rating: 5.0,
    };
    setProducts((prev) => [newProduct, ...prev]);
    showToast(`Added product "${prodData.name}"`, 'success');
    return newProduct;
  };

  const updateProduct = async (id: string, updated: Partial<Product>): Promise<Product | null> => {
    const prevSnapshot = products;
    let optimisticItem: Product | null = null;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          optimisticItem = { ...p, ...updated };
          return optimisticItem;
        }
        return p;
      })
    );

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      const { data, error } = await updateProductInDb(id, updated);
      if (error || !data) {
        setProducts(prevSnapshot);
        showToast(error?.message || 'Failed to update product in database', 'error');
        return null;
      }
      setProducts((prev) => prev.map((p) => (p.id === id ? data : p)));
      showToast('Product details updated', 'success');
      return data;
    }

    showToast('Product details updated', 'success');
    return optimisticItem;
  };

  const deleteProduct = async (id: string): Promise<boolean> => {
    const prod = products.find((p) => p.id === id);
    const prevSnapshot = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      const { error } = await deleteProductInDb(id);
      if (error) {
        setProducts(prevSnapshot);
        showToast(error.message || 'Failed to delete product', 'error');
        return false;
      }
      showToast(`Deleted product "${prod?.name || id}"`, 'info');
      return true;
    }

    showToast(`Deleted product "${prod?.name || id}"`, 'info');
    return true;
  };

  const adjustProductStock = (id: string, delta: number, reason: string) => {
    const prod = products.find((p) => p.id === id);
    if (!prod) return;

    const previousStock = prod.stock;
    const newStock = Math.max(0, previousStock + delta);
    const moveType: 'restock' | 'adjustment' = delta > 0 ? 'restock' : 'adjustment';

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: newStock } : p))
    );

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(activeStore.id) && UUID_REGEX.test(id)) {
      void (async () => {
        const { error: prodErr } = await updateProductInDb(id, { stock: newStock });
        if (prodErr) {
          setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: previousStock } : p)));
          showToast(prodErr.message || 'Failed to update stock in database', 'error');
          return;
        }
        const { data: logRow } = await createInventoryMovementInDb({
          storeId: activeStore.id,
          productId: id,
          productName: prod.name,
          type: moveType,
          quantityDelta: delta,
          newStock,
          reason,
        });
        if (logRow) {
          setInventoryLogs((prev) => [{ ...logRow, sku: prod.sku, operator: user.name || 'Store Merchant' }, ...prev]);
        }
        showToast(`Updated stock for "${prod.name}" by ${delta > 0 ? `+${delta}` : delta}`, 'success');
      })();
      return;
    }

    const log: InventoryMovement = {
      id: `inv-${Date.now()}`,
      productId: id,
      productName: prod.name,
      sku: prod.sku,
      type: moveType,
      quantityDelta: delta,
      previousStock,
      newStock,
      reason,
      operator: user?.name || 'Store Merchant',
      date: new Date().toISOString().split('T')[0],
    };
    setInventoryLogs((prev) => [log, ...prev]);
    showToast(`Updated stock for "${prod.name}" by ${delta > 0 ? `+${delta}` : delta}`, 'success');
  };

  // Orders (Real multi-tenant orders; zero mock data when Supabase is configured)
  const [orders, setOrders] = useState<Order[]>(() =>
    isSupabaseConfigured ? [] : getStored('orders', INITIAL_ORDERS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_orders');
    } else {
      setStored('orders', orders);
    }
  }, [orders]);

  // Customers (Real multi-tenant customer list; zero mock data when Supabase is configured)
  const [customers, setCustomers] = useState<Customer[]>(() =>
    isSupabaseConfigured ? [] : getStored('customers', INITIAL_CUSTOMERS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_customers');
    } else {
      setStored('customers', customers);
    }
  }, [customers]);

  // Inventory Logs
  const [inventoryLogs, setInventoryLogs] = useState<InventoryMovement[]>(() =>
    isSupabaseConfigured ? [] : getStored('inventoryLogs', INITIAL_INVENTORY_LOGS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_inventoryLogs');
    } else {
      setStored('inventoryLogs', inventoryLogs);
    }
  }, [inventoryLogs]);

  const addCustomer = (
    custData: Omit<Customer, 'id' | 'totalSpent' | 'ordersCount' | 'lastOrderDate' | 'createdAt'>
  ) => {
    if (isSupabaseConfigured && user?.id) {
      if (!UUID_REGEX.test(activeStore.id)) {
        showToast('Store workspace is still initializing. Please try again in a moment.', 'warning');
        return;
      }
      void (async () => {
        const { data, error } = await createCustomerInDb(activeStore.id, {
          name: custData.name,
          phone: custData.phone,
          email: custData.email,
          city: custData.city,
          notes: custData.notes,
          ordersCount: 0,
          totalSpent: 0,
        });
        if (error || !data) {
          showToast(error?.message || 'Failed to add customer to database', 'error');
          return;
        }
        setCustomers((prev) => [data, ...prev.filter((c) => c.id !== data.id)]);
      })();
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newCustomer: Customer = {
      ...custData,
      id: `cust-${Date.now()}`,
      totalSpent: 0,
      ordersCount: 1,
      lastOrderDate: today,
      createdAt: today,
    };
    setCustomers((prev) => [newCustomer, ...prev]);
  };

  const updateCustomer = (id: string, updated: Partial<Customer>) => {
    const prevSnapshot = customers;
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { data, error } = await updateCustomerInDb(id, updated);
        if (error || !data) {
          setCustomers(prevSnapshot);
          showToast(error?.message || 'Failed to update customer in database', 'error');
          return;
        }
        setCustomers((prev) => prev.map((c) => (c.id === id ? data : c)));
      })();
    }
  };

  const deleteCustomer = (id: string) => {
    const prevSnapshot = customers;
    setCustomers((prev) => prev.filter((c) => c.id !== id));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { error } = await deleteCustomerInDb(id);
        if (error) {
          setCustomers(prevSnapshot);
          showToast(error.message || 'Failed to remove customer record', 'error');
          return;
        }
        showToast('Customer record removed', 'info');
      })();
      return;
    }

    showToast('Customer record removed', 'info');
  };

  const addCustomerNote = (id: string, note: string) => {
    const prevSnapshot = customers;
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, notes: note } : c))
    );

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { data, error } = await updateCustomerInDb(id, { notes: note });
        if (error || !data) {
          setCustomers(prevSnapshot);
          showToast(error?.message || 'Failed to save customer note', 'error');
          return;
        }
        setCustomers((prev) => prev.map((c) => (c.id === id ? data : c)));
        showToast('Customer note updated', 'success');
      })();
      return;
    }

    showToast('Customer note updated', 'success');
  };

  const addOrder = (orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>) => {
    const orderNum = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

    if (isSupabaseConfigured && user?.id) {
      if (!UUID_REGEX.test(activeStore.id)) {
        showToast('Store workspace is still initializing. Please try again in a moment.', 'warning');
        return;
      }
      void (async () => {
        const { data: createdOrder, error } = await createOrderInDb(activeStore.id, orderNum, orderData);
        if (error || !createdOrder) {
          showToast(error?.message || 'Failed to create order in database', 'error');
          return;
        }
        setOrders((prev) => [createdOrder, ...prev.filter((o) => o.id !== createdOrder.id)]);

        for (const item of orderData.items) {
          const matchingProd = products.find((p) => p.id === item.productId);
          if (matchingProd && UUID_REGEX.test(matchingProd.id)) {
            const nextSales = (matchingProd.salesCount || 0) + item.quantity;
            const nextStock = Math.max(0, matchingProd.stock - item.quantity);
            const { data: updatedProd } = await updateProductInDb(matchingProd.id, {
              salesCount: nextSales,
              stock: nextStock,
            });
            if (updatedProd) {
              setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? updatedProd : p)));
            }
          }
        }

        const existingCustomer = customers.find(
          (c) => c.phone === orderData.customerPhone || (c.email && c.email === orderData.customerEmail)
        );
        if (existingCustomer && UUID_REGEX.test(existingCustomer.id)) {
          updateCustomer(existingCustomer.id, {
            totalSpent: existingCustomer.totalSpent + orderData.total,
            ordersCount: existingCustomer.ordersCount + 1,
          });
        } else {
          const { data: newCust } = await createCustomerInDb(activeStore.id, {
            name: orderData.customerName,
            phone: orderData.customerPhone,
            email: orderData.customerEmail,
            city: orderData.city,
            ordersCount: 1,
            totalSpent: orderData.total,
          });
          if (newCust) {
            setCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== newCust.id)]);
          }
        }

        showToast(`New order #${createdOrder.orderNumber} created successfully!`, 'success');
      })();
      return;
    }

    const newOrder: Order = {
      ...orderData,
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [newOrder, ...prev]);

    orderData.items.forEach((item) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.productId
            ? { ...p, salesCount: (p.salesCount || 0) + item.quantity }
            : p
        )
      );
    });

    const existingCustomer = customers.find(
      (c) => c.phone === orderData.customerPhone || (c.email && c.email === orderData.customerEmail)
    );
    if (existingCustomer) {
      updateCustomer(existingCustomer.id, {
        totalSpent: existingCustomer.totalSpent + orderData.total,
        ordersCount: existingCustomer.ordersCount + 1,
        lastOrderDate: new Date().toISOString().split('T')[0],
      });
    } else {
      addCustomer({
        name: orderData.customerName,
        phone: orderData.customerPhone,
        email: orderData.customerEmail,
        city: orderData.city,
        notes: '',
        status: 'active',
        tags: [],
      });
    }

    showToast(`New order #${orderNum} created successfully!`, 'success');
  };

  const updateOrderStatus = (id: string, status: OrderStatus) => {
    const prevSnapshot = orders;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { data, error } = await updateOrderInDb(id, { status });
        if (error || !data) {
          setOrders(prevSnapshot);
          showToast(error?.message || 'Failed to update order status', 'error');
          return;
        }
        setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
        showToast(`Order status updated to "${status}"`, 'info');
      })();
      return;
    }

    showToast(`Order status updated to "${status}"`, 'info');
  };

  const updateOrderPaymentStatus = (id: string, paymentStatus: PaymentStatus) => {
    const prevSnapshot = orders;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, paymentStatus } : o)));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { data, error } = await updateOrderInDb(id, { paymentStatus });
        if (error || !data) {
          setOrders(prevSnapshot);
          showToast(error?.message || 'Failed to update order payment status', 'error');
          return;
        }
        setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
        showToast(`Payment status updated to "${paymentStatus}"`, 'info');
      })();
      return;
    }

    showToast(`Payment status updated to "${paymentStatus}"`, 'info');
  };

  const updateOrderTracking = (id: string, courierName: string, trackingCode: string) => {
    const targetOrder = orders.find((o) => o.id === id);
    const nextStatus: OrderStatus =
      targetOrder?.status === 'pending' ? 'shipped' : targetOrder?.status || 'shipped';
    const prevSnapshot = orders;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              courierName,
              trackingCode,
              status: nextStatus,
            }
          : o
      )
    );

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { data, error } = await updateOrderInDb(id, {
          courierName,
          trackingCode,
          status: nextStatus,
        });
        if (error || !data) {
          setOrders(prevSnapshot);
          showToast(error?.message || 'Failed to assign tracking code', 'error');
          return;
        }
        setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
        showToast(`Consignment ${trackingCode} assigned to ${courierName}`, 'success');
      })();
      return;
    }

    showToast(`Consignment ${trackingCode} assigned to ${courierName}`, 'success');
  };

  // Landing Page Builder
  const [landingPages, setLandingPages] = useState<LandingPage[]>(() =>
    isSupabaseConfigured ? [] : getStored('landingPages', INITIAL_LANDING_PAGES)
  );
  useEffect(() => setStored('landingPages', landingPages), [landingPages]);

  const createLandingPage = (
    pageData: Omit<LandingPage, 'id' | 'visitors' | 'conversions' | 'updatedAt'>
  ) => {
    const newPage: LandingPage = {
      ...pageData,
      id: `lp-${Date.now()}`,
      visitors: 0,
      conversions: 0,
      updatedAt: new Date().toISOString().split('T')[0],
    };
    setLandingPages((prev) => [newPage, ...prev]);
    showToast(`Landing page "${pageData.title}" created!`, 'success');
  };

  const updateLandingPage = (id: string, updated: Partial<LandingPage>) => {
    setLandingPages((prev) =>
      prev.map((lp) =>
        lp.id === id
          ? { ...lp, ...updated, updatedAt: new Date().toISOString().split('T')[0] }
          : lp
      )
    );
    showToast('Landing page settings saved', 'success');
  };

  const deleteLandingPage = (id: string) => {
    setLandingPages((prev) => prev.filter((lp) => lp.id !== id));
    showToast('Landing page removed', 'info');
  };

  const togglePublishLandingPage = (id: string) => {
    setLandingPages((prev) =>
      prev.map((lp) => (lp.id === id ? { ...lp, status: lp.status === 'published' ? 'draft' : 'published' } : lp))
    );
  };

  // Automations
  const [automations, setAutomations] = useState<AIAutomation[]>(() =>
    isSupabaseConfigured ? [] : getStored('automations', INITIAL_AUTOMATIONS)
  );
  useEffect(() => setStored('automations', automations), [automations]);

  const toggleAutomation = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const nextState = a.status === 'active' ? 'paused' : 'active';
          showToast(`Automation "${a.name}" is now ${nextState.toUpperCase()}`, 'info');
          return { ...a, status: nextState };
        }
        return a;
      })
    );
  };

  const updateAutomation = (id: string, data: Partial<AIAutomation>) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...data } : a))
    );
    showToast('Automation configured successfully', 'success');
  };

  const testRunAutomation = (id: string) => {
    const auto = automations.find((a) => a.id === id);
    if (auto) {
      showToast(`Test execution of "${auto.name}" completed. Message delivered to test recipient.`, 'success');
    }
  };

  // Website Requests
  const [websiteRequests, setWebsiteRequests] = useState<WebsiteRequest[]>(() =>
    isSupabaseConfigured ? [] : getStored('websiteRequests', INITIAL_WEBSITE_REQUESTS)
  );
  useEffect(() => setStored('websiteRequests', websiteRequests), [websiteRequests]);

  const addWebsiteRequest = (
    req: Omit<WebsiteRequest, 'id' | 'status' | 'createdAt'>
  ) => {
    const newReq: WebsiteRequest = {
      ...req,
      id: `wreq-${Date.now()}`,
      status: 'Pending',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setWebsiteRequests((prev) => [newReq, ...prev]);
    showToast('Your custom website inquiry has been logged for engineering review!', 'success');
  };

  const updateWebsiteRequestStatus = (id: string, status: WebsiteRequest['status']) => {
    setWebsiteRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
    showToast(`Request status updated to "${status}"`, 'info');
  };

  // Subscribed Websites (AMAAS Website Lite - ৳600/month recurring plan)
  const [websiteSubscriptionPlan, setWebsiteSubscriptionPlan] = useState<WebsiteSubscriptionPlanConfig>(() =>
    getStored('websiteSubscriptionPlan', DEFAULT_WEBSITE_SUBSCRIPTION_PLAN)
  );
  const [subscribedWebsites, setSubscribedWebsites] = useState<SubscribedWebsite[]>(() =>
    isSupabaseConfigured ? [] : getStored('subscribedWebsites', INITIAL_SUBSCRIBED_WEBSITES)
  );

  useEffect(() => {
    setStored('websiteSubscriptionPlan', websiteSubscriptionPlan);
  }, [websiteSubscriptionPlan]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_subscribedWebsites');
    } else {
      setStored('subscribedWebsites', subscribedWebsites);
    }
  }, [subscribedWebsites]);

  const updateWebsiteSubscriptionPlanConfig = (updates: Partial<WebsiteSubscriptionPlanConfig>) => {
    setWebsiteSubscriptionPlan((prev) => ({ ...prev, ...updates }));
    showToast('Website subscription plan configuration updated', 'success');
  };

  const checkSubdomainAvailability = (rawSubdomain: string, excludeId?: string): { available: boolean; reason?: string } => {
    const validation = validateSubdomainFormat(rawSubdomain);
    if (!validation.valid) {
      return { available: false, reason: validation.reason };
    }
    const clean = validation.clean;
    const isTaken = subscribedWebsites.some(
      (w) => w.subdomain.toLowerCase() === clean && w.id !== excludeId
    );
    if (isTaken) {
      return { available: false, reason: `"${clean}.amaas.xyz" is already registered by another merchant.` };
    }
    return { available: true };
  };

  const [isWebsitesLoading, setIsWebsitesLoading] = useState(false);

  const refreshSubscribedWebsites = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    setIsWebsitesLoading(true);
    try {
      const { data, error } = await fetchUserSubscribedWebsitesFromDb();
      if (!error && data) {
        setSubscribedWebsites(data);
      } else if (error) {
        console.warn('[GoAMAAS] Failed to load websites from database:', error);
      }
    } catch (err) {
      console.warn('[GoAMAAS] Error loading websites:', err);
    } finally {
      setIsWebsitesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isSupabaseConfigured) {
      refreshSubscribedWebsites();
    }
  }, [user, activeStoreId, refreshSubscribedWebsites]);

  const checkSubdomainAvailabilityAsync = async (
    rawSubdomain: string,
    excludeId?: string
  ): Promise<{ available: boolean; reason?: string }> => {
    const local = checkSubdomainAvailability(rawSubdomain, excludeId);
    if (!local.available) {
      return local;
    }
    if (isSupabaseConfigured && supabase) {
      const remote = await checkRemoteSubdomainAvailability(rawSubdomain, excludeId);
      if (!remote.available) {
        return { available: false, reason: remote.reason };
      }
    }
    return { available: true };
  };

  const uploadWebsiteAsset = async (params: {
    file: File;
    folder: 'logos' | 'heroes' | 'banners' | 'products' | 'sections';
    websiteId?: string;
  }): Promise<{ publicUrl: string | null; error: Error | null }> => {
    const res = await uploadWebsiteAssetToStorage({
      file: params.file,
      folder: params.folder,
      websiteId: params.websiteId,
      storeId: activeStore?.id,
    });
    if (res.error) {
      showToast(res.error.message, 'error');
      return { publicUrl: null, error: res.error };
    }
    return { publicUrl: res.publicUrl, error: null };
  };

  const removeWebsiteAsset = async (publicUrl: string): Promise<void> => {
    if (!publicUrl) return;
    await deleteWebsiteAssetFromStorage(publicUrl);
  };

  const createSubscribedWebsite = async (
    data: CreateSubscribedWebsiteInput
  ): Promise<SubscribedWebsite> => {
    const subCheck = validateSubdomainFormat(data.subdomain);
    if (!subCheck.valid) {
      const validationMsg = subCheck.reason || 'Please enter a valid subdomain.';
      showToast(validationMsg, 'error');
      const validationErr = new Error(validationMsg) as Error & { toastShown?: boolean };
      validationErr.toastShown = true;
      throw validationErr;
    }
    const cleanSub = subCheck.clean;

    let resolvedStoreId: string | undefined;
    if (isSupabaseConfigured && supabase) {
      const requestedStoreId = data.storeId?.trim();
      if (
        requestedStoreId &&
        UUID_REGEX.test(requestedStoreId) &&
        stores.some((s) => s.id === requestedStoreId)
      ) {
        resolvedStoreId = requestedStoreId;
      } else if (user?.id) {
        resolvedStoreId = await ensureMerchantStore(data.businessName);
      }
    } else {
      resolvedStoreId = data.storeId || activeStore?.id || 'store-1';
    }

    const websiteConfig: Record<string, any> = {
      headline: data.headline,
      subheadline: data.subheadline,
      heroCtaText: data.heroCtaText || 'Contact Us',
      heroCtaLink: data.heroCtaLink || '',
      secondaryCtaText: data.secondaryCtaText || '',
      secondaryCtaLink: data.secondaryCtaLink || '',
      heroImageUrl: data.heroImageUrl || '',
      bannerImageUrl: data.bannerImageUrl || '',
      bannerTitle: data.bannerTitle || '',
      bannerSubtitle: data.bannerSubtitle || '',
      bannerCtaText: data.bannerCtaText || '',
      bannerCtaLink: data.bannerCtaLink || '',
      aboutText: data.aboutText,
      brandColor: data.brandColor,
      logoUrl: data.logoUrl || '',
      phone: data.phone || '',
      whatsappNumber: data.whatsappNumber || '',
      address: data.address || '',
      servicesOrProducts: data.servicesOrProducts || [],
      socialLinks: data.socialLinks || {},
      customLinks: data.customLinks || [],
      sections: data.sections || [],
      themeSettings: data.themeSettings || {},
      customDomain: data.customDomain || '',
      ownerName: data.ownerName || user?.name || 'Store Owner',
      email: data.email || '',
      nicheLabel: data.nicheLabel || data.templateName || 'Business Storefront',
      templateId: data.templateId || 'tpl-modern-business',
      templateName: data.templateName || 'Modern Executive',
    };

    let newSite: SubscribedWebsite;

    if (isSupabaseConfigured && supabase) {
      const { data: dbSite, error: dbErr } = await createSubscribedWebsiteInDb({
        businessName: data.businessName,
        niche: data.niche,
        subdomain: cleanSub,
        storeId: resolvedStoreId,
        templateId: data.templateId,
        templateName: data.templateName,
        config: websiteConfig,
      });

      if (dbErr || !dbSite) {
        const errorMsg = dbErr?.message || 'Failed to save website to database.';
        showToast(errorMsg, 'error');
        const surfacedErr = new Error(errorMsg) as Error & { toastShown?: boolean };
        surfacedErr.toastShown = true;
        throw surfacedErr;
      }

      newSite = dbSite;

      // Persist initial website products into public.products linked to the inserted website & store
      const targetStoreId =
        newSite.storeId && UUID_REGEX.test(newSite.storeId) ? newSite.storeId : resolvedStoreId;

      if (
        targetStoreId &&
        UUID_REGEX.test(targetStoreId) &&
        Array.isArray(data.servicesOrProducts) &&
        data.servicesOrProducts.length > 0
      ) {
        const createdProducts: Product[] = [];
        let failedProductCount = 0;

        for (let idx = 0; idx < data.servicesOrProducts.length; idx++) {
          const item = data.servicesOrProducts[idx];
          if (!item.name?.trim()) continue;
          const numericPrice =
            typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric)
              ? item.priceNumeric
              : Number(String(item.price || '0').replace(/[^0-9.]/g, '')) || 0;
          const skuCode = `WEB-${newSite.subdomain.slice(0, 6).toUpperCase()}-${idx + 1}-${Math.floor(100 + Math.random() * 900)}`;
          const { data: dbProd, error: prodErr } = await createProductInDb(targetStoreId, {
            name: item.name.trim(),
            sku: skuCode,
            category: item.category || newSite.nicheLabel || 'Website Catalog',
            price: numericPrice,
            costPrice: 0,
            stock: 50,
            lowStockThreshold: 5,
            status: item.isVisible === false ? 'draft' : 'active',
            description: item.description || '',
            image: item.imageUrl || undefined,
            websiteId: newSite.id,
            isVisible: item.isVisible ?? true,
            sortOrder: idx,
          });
          if (prodErr || !dbProd) {
            failedProductCount++;
            console.warn(
              `[GoAMAAS] Initial catalog product "${item.name}" could not be saved:`,
              prodErr?.message
            );
          } else {
            createdProducts.push(dbProd);
          }
        }

        if (createdProducts.length > 0) {
          setProducts((prev) => [
            ...createdProducts,
            ...prev.filter((p) => !createdProducts.some((cp) => cp.id === p.id)),
          ]);
        }

        if (failedProductCount > 0) {
          showToast(
            `Website saved, but ${failedProductCount} initial catalog item(s) could not be synced. You can review them in the Website Editor.`,
            'warning'
          );
        }
      }
    } else {
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      const nextBillingDate = nextMonth.toISOString().split('T')[0];

      newSite = {
        ...data,
        userId: user?.id,
        storeId: resolvedStoreId || data.storeId || activeStore?.id || 'store-1',
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `site-${Date.now()}`,
        subdomain: cleanSub,
        fullDomainUrl: `${cleanSub}.amaas.xyz`,
        planName: websiteSubscriptionPlan.name,
        monthlyFee: websiteSubscriptionPlan.priceMonthly,
        subscriptionStatus: 'active',
        paymentStatus: 'pending',
        deploymentStatus: 'deploying',
        sslStatus: 'pending',
        nextBillingDate,
        createdAt: today,
        lastUpdatedAt: today,
        resourceUsage: {
          pagesCount: 1,
          pagesLimit: websiteSubscriptionPlan.limits.maxPages,
          storageUsedMb: 0,
          storageLimitMb: websiteSubscriptionPlan.limits.maxStorageMb,
          bandwidthUsedGb: 0,
          bandwidthLimitGb: websiteSubscriptionPlan.limits.maxBandwidthGb,
          monthlyUpdatesUsed: 0,
          monthlyUpdatesLimit: websiteSubscriptionPlan.limits.monthlyUpdateRequests,
        },
      };
    }

    setSubscribedWebsites((prev) => [newSite, ...prev.filter((s) => s.id !== newSite.id)]);

    const effectiveMonthlyFee = newSite.monthlyFee || websiteSubscriptionPlan.priceMonthly;
    const effectivePlanLabel = newSite.planName || websiteSubscriptionPlan.name;

    const todayStr = new Date().toISOString().split('T')[0];
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-AMAAS-SUB-${Math.floor(1000 + Math.random() * 9000)}`,
      date: todayStr,
      planName: `${effectivePlanLabel} (${newSite.fullDomainUrl})`,
      amount: effectiveMonthlyFee,
      status: 'Pending',
    };
    setInvoices((prev) => [newInvoice, ...prev]);

    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: 'Website Created — Payment Verification Required',
      message: `Your website "${newSite.businessName}" was saved. Submit your ৳${effectiveMonthlyFee} payment so our team can verify and automatically publish ${newSite.fullDomainUrl}.`,
      type: 'billing',
      read: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [notif, ...prev]);

    showToast(`Website "${newSite.businessName}" saved successfully!`, 'success');
    return newSite;
  };

  const updateSubscribedWebsite = async (
    id: string,
    updates: Partial<SubscribedWebsite>,
    options?: { saveAsDraftOnly?: boolean; silentToast?: boolean }
  ): Promise<{ success: boolean; error?: Error }> => {
    const today = new Date().toISOString().split('T')[0];
    const existingSite = subscribedWebsites.find((w) => w.id === id);
    const saveAsDraftOnly = Boolean(options?.saveAsDraftOnly && existingSite?.deploymentStatus === 'live');

    if (isSupabaseConfigured && supabase) {
      const { success, error } = await updateClientWebsiteInDb(id, updates, {
        saveAsDraftOnly,
        clearDraft: !saveAsDraftOnly,
      });
      if (!success && error) {
        showToast(error.message || 'Failed to update website in database', 'error');
        return { success: false, error };
      }
    }

    setSubscribedWebsites((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (saveAsDraftOnly) {
          return {
            ...w,
            hasUnpublishedDraft: true,
            draftConfig: {
              ...(w.draftConfig || {}),
              ...updates,
            },
            lastUpdatedAt: today,
          };
        }
        return {
          ...w,
          ...updates,
          hasUnpublishedDraft: false,
          draftConfig: undefined,
          lastUpdatedAt: today,
        };
      })
    );

    if (!options?.silentToast) {
      showToast(
        saveAsDraftOnly
          ? 'Draft saved! Live website remains unchanged until you click Publish Updates.'
          : 'Website configuration saved successfully',
        'success'
      );
    }
    return { success: true };
  };

  const saveWebsiteDraft = async (
    id: string,
    updates: Partial<SubscribedWebsite>
  ): Promise<{ success: boolean; error?: Error }> => {
    return updateSubscribedWebsite(id, updates, { saveAsDraftOnly: true });
  };

  const publishWebsiteUpdates = async (
    id: string,
    updates?: Partial<SubscribedWebsite>
  ): Promise<{ success: boolean; message: string }> => {
    const site = subscribedWebsites.find((s) => s.id === id);
    if (!site) {
      return { success: false, message: 'Website not found' };
    }

    const effectiveUpdates = updates || (site.draftConfig as Partial<SubscribedWebsite>) || {};
    if (Object.keys(effectiveUpdates).length > 0) {
      const saveRes = await updateSubscribedWebsite(id, effectiveUpdates, {
        saveAsDraftOnly: false,
        silentToast: true,
      });
      if (!saveRes.success) {
        return {
          success: false,
          message: saveRes.error?.message || 'Failed to save website updates before publishing.',
        };
      }
    }

    if (site.paymentStatus !== 'paid' && role !== 'admin') {
      const msg =
        'Draft saved! Submit and verify your ৳600 GoAMAAS Website payment to publish live automatically.';
      showToast(msg, 'info');
      return { success: false, message: msg };
    }

    return publishWebsite(id);
  };

  const [servicePricingCatalog, setServicePricingCatalog] = useState<ServicePricingCatalogEntry[]>([]);
  const [isPricingCatalogLoading, setIsPricingCatalogLoading] = useState<boolean>(false);
  const [isPricingCatalogLoaded, setIsPricingCatalogLoaded] = useState<boolean>(() => !isSupabaseConfigured);
  const [pricingCatalogError, setPricingCatalogError] = useState<string | null>(null);
  const [websiteLifecycleAuditLogs, setWebsiteLifecycleAuditLogs] = useState<WebsiteLifecycleAuditLog[]>([]);

  const refreshServicePricingCatalog = useCallback(async (): Promise<ServicePricingCatalogEntry[] | null> => {
    if (!isSupabaseConfigured || !supabase || !user?.id) {
      return null;
    }
    setIsPricingCatalogLoading(true);
    setPricingCatalogError(null);
    try {
      const { data, error } = await fetchServicePricingCatalogFromDb();
      if (error || !data) {
        const msg = error?.message || 'Unable to load active service pricing from database.';
        setPricingCatalogError(msg);
        setIsPricingCatalogLoaded(false);
        return null;
      }
      setServicePricingCatalog(data);
      setIsPricingCatalogLoaded(true);
      const liteEntry = data.find(
        (c) =>
          c.serviceType === 'website_subscription' &&
          c.serviceCode.trim().toLowerCase() === 'website_lite' &&
          c.isActive
      );
      if (liteEntry && liteEntry.priceBdt > 0) {
        setWebsiteSubscriptionPlan((prev) => ({
          ...prev,
          priceMonthly: liteEntry.priceBdt,
        }));
      }
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load active service pricing from database.';
      setPricingCatalogError(msg);
      setIsPricingCatalogLoaded(false);
      return null;
    } finally {
      setIsPricingCatalogLoading(false);
    }
  }, [user?.id]);

  const refreshWebsiteLifecycleAuditLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user?.id || role !== 'admin' || user.role !== 'admin') {
      return;
    }
    const { data, error } = await fetchWebsiteLifecycleAuditLogsFromDb(100);
    if (!error && data) {
      setWebsiteLifecycleAuditLogs(data);
    }
  }, [user?.id, user?.role, role]);

  useEffect(() => {
    if (isSupabaseConfigured && user?.id && role === 'admin' && user.role === 'admin') {
      void refreshWebsiteLifecycleAuditLogs();
    } else if (isSupabaseConfigured) {
      setWebsiteLifecycleAuditLogs([]);
    }
  }, [user?.id, user?.role, role, refreshWebsiteLifecycleAuditLogs]);

  const renewSubscribedWebsite = (id: string, reason?: string) => {
    const site = subscribedWebsites.find((w) => w.id === id);
    if (!site) return;

    if (site.paymentStatus !== 'paid') {
      showToast(
        'Cannot renew an unpaid website. Verify and approve a payment submission first.',
        'error'
      );
      return;
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      showToast('An explicit administrative reason is required to renew a website.', 'warning');
      return;
    }

    if (isSupabaseConfigured) {
      if (role !== 'admin' || user?.role !== 'admin') {
        showToast('Unauthorized: Only verified administrators can manually renew subscriptions.', 'error');
        return;
      }
      void (async () => {
        const res = await adminUpdateWebsiteLifecycleInDb(id, 'renew', cleanReason);
        if (!res.success) {
          showToast(res.message || 'Failed to renew website subscription', 'error');
          return;
        }
        await Promise.all([refreshSubscribedWebsites(), refreshWebsiteLifecycleAuditLogs()]);
        showToast(res.message || 'Subscription renewed for 30 days.', 'success');
      })();
      return;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const formattedNext = nextDate.toISOString().split('T')[0];

    void updateSubscribedWebsite(id, {
      subscriptionStatus: 'active',
      nextBillingDate: formattedNext,
      gracePeriodEndsAt: undefined,
      notes: cleanReason,
    });
    setWebsiteLifecycleAuditLogs((prev) => [
      {
        id: `audit-${Date.now()}`,
        websiteId: id,
        adminId: user?.id || 'admin',
        action: 'renew',
        reason: cleanReason,
        previousStatus: site.subscriptionStatus,
        newStatus: 'active',
        previousDeploymentStatus: site.deploymentStatus,
        newDeploymentStatus: site.deploymentStatus,
        paymentStatusSnapshot: site.paymentStatus,
        previousPeriodEnd: site.nextBillingDate,
        newPeriodEnd: formattedNext,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    showToast(`Subscription renewed for 30 days until ${formattedNext}`, 'success');
  };

  const suspendSubscribedWebsite = (id: string, reason?: string) => {
    const site = subscribedWebsites.find((w) => w.id === id);
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      showToast('An explicit administrative reason is required to suspend a website.', 'warning');
      return;
    }

    if (isSupabaseConfigured) {
      if (role !== 'admin' || user?.role !== 'admin') {
        showToast('Unauthorized: Only verified administrators can suspend websites.', 'error');
        return;
      }
      void (async () => {
        const res = await adminUpdateWebsiteLifecycleInDb(id, 'suspend', cleanReason);
        if (!res.success) {
          showToast(res.message || 'Failed to suspend website', 'error');
          return;
        }
        await Promise.all([refreshSubscribedWebsites(), refreshWebsiteLifecycleAuditLogs()]);
        showToast(`Website has been suspended: ${cleanReason}`, 'warning');
      })();
      return;
    }

    void updateSubscribedWebsite(id, {
      subscriptionStatus: 'suspended',
      deploymentStatus: 'suspended',
      notes: cleanReason,
    });
    setWebsiteLifecycleAuditLogs((prev) => [
      {
        id: `audit-${Date.now()}`,
        websiteId: id,
        adminId: user?.id || 'admin',
        action: 'suspend',
        reason: cleanReason,
        previousStatus: site?.subscriptionStatus || null,
        newStatus: 'suspended',
        previousDeploymentStatus: site?.deploymentStatus || null,
        newDeploymentStatus: 'suspended',
        paymentStatusSnapshot: site?.paymentStatus || null,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    showToast(`Website has been suspended: ${cleanReason}`, 'warning');
  };

  const reactivateSubscribedWebsite = (id: string, reason?: string) => {
    const site = subscribedWebsites.find((w) => w.id === id);
    if (site && site.paymentStatus !== 'paid') {
      showToast(
        'Cannot reactivate an unpaid website. Verify and approve a payment submission first.',
        'error'
      );
      return;
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      showToast('An explicit administrative reason is required to reactivate a website.', 'warning');
      return;
    }

    if (isSupabaseConfigured) {
      if (role !== 'admin' || user?.role !== 'admin') {
        showToast('Unauthorized: Only verified administrators can reactivate websites.', 'error');
        return;
      }
      void (async () => {
        const res = await adminUpdateWebsiteLifecycleInDb(id, 'reactivate', cleanReason);
        if (!res.success) {
          showToast(res.message || 'Failed to reactivate website', 'error');
          return;
        }
        await Promise.all([refreshSubscribedWebsites(), refreshWebsiteLifecycleAuditLogs()]);
        showToast('Website has been reactivated and brought online', 'success');
      })();
      return;
    }

    void updateSubscribedWebsite(id, {
      subscriptionStatus: 'active',
      deploymentStatus: 'live',
      notes: cleanReason,
    });
    setWebsiteLifecycleAuditLogs((prev) => [
      {
        id: `audit-${Date.now()}`,
        websiteId: id,
        adminId: user?.id || 'admin',
        action: 'reactivate',
        reason: cleanReason,
        previousStatus: site?.subscriptionStatus || null,
        newStatus: 'active',
        previousDeploymentStatus: site?.deploymentStatus || null,
        newDeploymentStatus: 'live',
        paymentStatusSnapshot: site?.paymentStatus || null,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    showToast('Website has been reactivated and brought online', 'success');
  };

  const adminDeleteSubscribedWebsite = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    if (role !== 'admin' || (isSupabaseConfigured && user?.role !== 'admin')) {
      const msg = 'Unauthorized: Only verified administrators can delete websites.';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }

    if (isSupabaseConfigured) {
      const res = await adminDeleteSubscribedWebsiteInDb(id);
      if (!res.success) {
        const msg = res.message || res.error?.message || 'Failed to delete website';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      await refreshSubscribedWebsites();
      showToast('Website record deleted permanently.', 'info');
      return { success: true, message: res.message || 'Website deleted' };
    }

    const hasPayments = paymentRequests.some(
      (r) =>
        (r.serviceType === 'website_subscription' || r.serviceType === 'website_package') &&
        r.serviceId === id
    );
    if (hasPayments) {
      const msg =
        'Cannot delete website with payment history. Suspend or cancel the subscription instead to preserve financial audit records.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    setSubscribedWebsites((prev) => prev.filter((w) => w.id !== id));
    showToast('Website record deleted permanently.', 'info');
    return { success: true, message: 'Website deleted' };
  };

  const requestWebsiteContentUpdate = (websiteId: string, details: string) => {
    const site = subscribedWebsites.find((w) => w.id === idOrFallback(websiteId));
    if (!site) return;

    if (site.resourceUsage.monthlyUpdatesUsed >= site.resourceUsage.monthlyUpdatesLimit) {
      showToast(
        `Monthly update limit reached (${site.resourceUsage.monthlyUpdatesLimit} updates/month). Please contact support for additional updates.`,
        'error'
      );
      return;
    }

    const updatedUsage = {
      ...site.resourceUsage,
      monthlyUpdatesUsed: site.resourceUsage.monthlyUpdatesUsed + 1,
    };

    updateSubscribedWebsite(site.id, {
      resourceUsage: updatedUsage,
    });

    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: 'Content Update Requested',
      message: `Update request submitted for ${site.fullDomainUrl}: "${details.slice(0, 60)}..."`,
      type: 'system',
      read: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [notif, ...prev]);

    showToast('Content update request submitted to GoAMAAS engineering team.', 'success');
  };

  const idOrFallback = (id: string) => id;

  // Subscriptions & Billing
  const [currentPlan, setCurrentPlan] = useState<DashboardPlanId>(() =>
    isSupabaseConfigured ? 'starter' : 'pro'
  );
  const [trialDaysLeft, setTrialDaysLeft] = useState<number>(7);
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    isSupabaseConfigured ? [] : getStored('invoices', INITIAL_INVOICES)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_invoices');
    } else {
      setStored('invoices', invoices);
    }
  }, [invoices]);

  // ==============================================================================
  // Independent 7-Day Free Trial System For Every Service
  // ==============================================================================
  const [serviceTrials, setServiceTrials] = useState<ServiceTrialRecord[]>(() => {
    return getStored('service_trials', []);
  });
  const [isTrialsLoading, setIsTrialsLoading] = useState<boolean>(false);

  useEffect(() => {
    setStored('service_trials', serviceTrials);
  }, [serviceTrials]);

  // ==============================================================================
  // Payment Gateways & Manual Verification System
  // ==============================================================================
  const UNCONFIGURED_GATEWAY_SKELETONS: PaymentGatewayConfig[] = [
    {
      id: 'bkash',
      displayName: 'bKash Personal (Send Money)',
      isEnabled: false,
      accountNumber: '',
      accountName: '',
      instructions: '',
    },
    {
      id: 'nagad',
      displayName: 'Nagad Personal (Send Money)',
      isEnabled: false,
      accountNumber: '',
      accountName: '',
      instructions: '',
    },
    {
      id: 'bank_transfer',
      displayName: 'Official Bank Transfer',
      isEnabled: false,
      bankName: '',
      accountName: '',
      accountNumber: '',
      branchName: '',
      routingNumber: '',
      instructions: '',
    },
    {
      id: 'whatsapp_support',
      displayName: 'Official WhatsApp Billing & Domain Support',
      isEnabled: false,
      accountNumber: '',
      instructions: '',
    },
  ];

  const DEMO_OFFLINE_GATEWAY_CONFIGS: PaymentGatewayConfig[] = [
    {
      id: 'bkash',
      displayName: 'bKash Personal (Send Money)',
      isEnabled: true,
      accountNumber: '01700000000',
      accountName: 'Demo Merchant Account',
      instructions: 'Offline demo mode: enter any sample TrxID to test manual verification.',
    },
    {
      id: 'nagad',
      displayName: 'Nagad Personal (Send Money)',
      isEnabled: true,
      accountNumber: NAGAD_PERSONAL_NUMBER,
      accountName: NAGAD_ACCOUNT_TYPE_EN,
      instructions: NAGAD_DEFAULT_ADMIN_INSTRUCTIONS,
    },
    {
      id: 'bank_transfer',
      displayName: 'Official Bank Transfer',
      isEnabled: true,
      bankName: 'Demo Commercial Bank',
      accountName: 'DEMO MERCHANT',
      accountNumber: '0000000000000',
      branchName: 'Main Branch',
      routingNumber: '000000000',
      instructions: 'Offline demo mode: enter a sample deposit slip reference to test manual verification.',
    },
    {
      id: 'whatsapp_support',
      displayName: 'Official WhatsApp Billing & Domain Support',
      isEnabled: false,
      accountNumber: '',
      instructions: 'Configure official WhatsApp billing support number in Admin Console.',
    },
  ];

  const [paymentGatewayConfigs, setPaymentGatewayConfigs] = useState<PaymentGatewayConfig[]>(() => {
    if (isSupabaseConfigured) {
      return UNCONFIGURED_GATEWAY_SKELETONS;
    }
    const stored = getStored('payment_gateway_configs', DEMO_OFFLINE_GATEWAY_CONFIGS);
    return stored.map((gw) => {
      if (gw.id === 'nagad' && !gw.isEnabled && !gw.accountNumber?.trim()) {
        return {
          ...gw,
          displayName: 'Nagad Personal (Send Money)',
          isEnabled: true,
          accountNumber: NAGAD_PERSONAL_NUMBER,
          accountName: NAGAD_ACCOUNT_TYPE_EN,
          instructions: NAGAD_DEFAULT_ADMIN_INSTRUCTIONS,
        };
      }
      return gw;
    });
  });
  const latestGatewayConfigsRef = useRef<PaymentGatewayConfig[]>(paymentGatewayConfigs);
  const pendingGatewayUpdatesRef = useRef<Record<string, Partial<PaymentGatewayConfig>>>({});
  const gatewaySaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    latestGatewayConfigsRef.current = paymentGatewayConfigs;
    if (!isSupabaseConfigured) {
      setStored('payment_gateway_configs', paymentGatewayConfigs);
    } else {
      localStorage.removeItem('goamaas_payment_gateway_configs');
    }
  }, [paymentGatewayConfigs]);

  const refreshPaymentGatewayConfigs = useCallback(async (): Promise<PaymentGatewayConfig[] | null> => {
    if (!isSupabaseConfigured || !supabase || !user?.id) return null;
    const { data, error } = await fetchPaymentGatewayConfigsFromDb();
    if (!error && data && data.length > 0) {
      const normalized = data.map((gw) =>
        gw.id === 'nagad' &&
        gw.accountNumber?.replace(/\s+/g, '') === NAGAD_PERSONAL_NUMBER &&
        !gw.accountName?.trim()
          ? { ...gw, accountName: NAGAD_ACCOUNT_TYPE_EN }
          : gw
      );
      setPaymentGatewayConfigs(normalized);
      latestGatewayConfigsRef.current = normalized;
      return normalized;
    }
    return null;
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && isSupabaseConfigured) {
      void refreshPaymentGatewayConfigs();
    }
  }, [user?.id, refreshPaymentGatewayConfigs]);

  useEffect(() => {
    return () => {
      Object.values(gatewaySaveTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const publishWebsite = async (websiteId: string): Promise<{ success: boolean; message: string }> => {
    const site = subscribedWebsites.find((s) => s.id === websiteId);
    if (!site) {
      showToast('Website not found.', 'error');
      return { success: false, message: 'Website not found' };
    }

    if (site.paymentStatus !== 'paid' && role !== 'admin') {
      const msg = 'Payment verification required before public publishing can be enabled.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    if (isSupabaseConfigured) {
      const { success, message, error } = await publishClientWebsiteInDb(websiteId);
      if (!success && error) {
        showToast(message || error.message, 'error');
        return { success: false, message: message || error.message };
      }
      await refreshSubscribedWebsites();
    } else {
      setSubscribedWebsites((prev) =>
        prev.map((s) => (s.id === websiteId ? { ...s, deploymentStatus: 'live', subscriptionStatus: 'active' } : s))
      );
    }

    showToast(`🎉 Website published! Accessible at https://${site.fullDomainUrl}`, 'success');
    return { success: true, message: 'Website published successfully' };
  };

  const unpublishWebsite = async (websiteId: string): Promise<{ success: boolean; message: string }> => {
    if (isSupabaseConfigured) {
      const { success, message, error } = await unpublishClientWebsiteInDb(websiteId);
      if (!success && error) {
        showToast(message || error.message, 'error');
        return { success: false, message: message || error.message };
      }
      await refreshSubscribedWebsites();
    } else {
      setSubscribedWebsites((prev) =>
        prev.map((s) => (s.id === websiteId ? { ...s, deploymentStatus: 'suspended' } : s))
      );
    }
    showToast('Website unpublished. Public visitors will see the maintenance notice.', 'info');
    return { success: true, message: 'Website unpublished' };
  };

  const cancelWebsiteSubscription = async (websiteId: string): Promise<{ success: boolean; message: string }> => {
    if (isSupabaseConfigured) {
      const { success, message, error } = await cancelClientWebsiteSubscriptionInDb(websiteId);
      if (!success && error) {
        showToast(message || error.message, 'error');
        return { success: false, message: message || error.message };
      }
      await refreshSubscribedWebsites();
    } else {
      setSubscribedWebsites((prev) =>
        prev.map((s) => (s.id === websiteId ? { ...s, subscriptionStatus: 'cancelled', deploymentStatus: 'suspended' } : s))
      );
    }
    showToast('Website subscription cancelled and unpublished. Historical data preserved.', 'info');
    return { success: true, message: 'Website subscription cancelled' };
  };

  const resolvePublicWebsite = async (subdomain: string): Promise<{ site: SubscribedWebsite | null; notFound: boolean }> => {
    const clean = subdomain.toLowerCase().trim();

    // 1. Fetch from Supabase RPC first to ensure server-verified authorization and sanitized data projection
    if (isSupabaseConfigured) {
      const { data } = await fetchPublishedWebsiteBySubdomain(clean);
      if (data) {
        const mapped: SubscribedWebsite = {
          id: data.id || `site-${data.subdomain}`,
          storeId: data.storeId || data.store_id || 'store-tenant',
          businessName: data.businessName || data.business_name || 'Business',
          ownerName: data.ownerName || 'Merchant',
          email: data.email ?? data.config?.email ?? '',
          phone: data.phone ?? data.config?.phone ?? '',
          niche: data.niche || 'ecommerce',
          nicheLabel: data.nicheLabel || data.template_name || 'Business Storefront',
          templateId: data.templateId || data.template_id || data.config?.templateId || 'tpl-modern-business',
          templateName: data.templateName || data.template_name || 'Modern Executive',
          subdomain: data.subdomain,
          fullDomainUrl: data.fullDomainUrl || data.full_domain || `${data.subdomain}.amaas.xyz`,
          customDomain: data.customDomain || data.config?.customDomain || undefined,
          brandColor: data.brandColor || data.config?.brandColor || '#2563EB',
          logoUrl: data.logoUrl || data.config?.logoUrl || undefined,
          heroImageUrl: data.heroImageUrl || data.config?.heroImageUrl || undefined,
          heroCtaText: data.heroCtaText || data.config?.heroCtaText || undefined,
          heroCtaLink: data.heroCtaLink || data.config?.heroCtaLink || undefined,
          secondaryCtaText: data.secondaryCtaText || data.config?.secondaryCtaText || undefined,
          secondaryCtaLink: data.secondaryCtaLink || data.config?.secondaryCtaLink || undefined,
          bannerImageUrl: data.bannerImageUrl || data.config?.bannerImageUrl || undefined,
          bannerTitle: data.bannerTitle || data.config?.bannerTitle || undefined,
          bannerSubtitle: data.bannerSubtitle || data.config?.bannerSubtitle || undefined,
          bannerCtaText: data.bannerCtaText || data.config?.bannerCtaText || undefined,
          bannerCtaLink: data.bannerCtaLink || data.config?.bannerCtaLink || undefined,
          address: data.address ?? data.config?.address ?? '',
          headline: data.headline || data.config?.headline || 'Welcome to our official website',
          subheadline: data.subheadline ?? data.config?.subheadline ?? '',
          aboutText: data.aboutText ?? data.config?.aboutText ?? '',
          servicesOrProducts: (
            data.servicesOrProducts ||
            data.config?.servicesOrProducts ||
            data.config?.items ||
            []
          ).filter((item: any) => item && item.isVisible !== false),
          whatsappNumber: data.whatsappNumber ?? data.config?.whatsappNumber ?? data.phone ?? '',
          socialLinks: data.socialLinks || data.config?.socialLinks || {},
          customLinks: Array.isArray(data.customLinks)
            ? data.customLinks
            : Array.isArray(data.config?.customLinks)
            ? data.config.customLinks
            : [],
          sections: Array.isArray(data.sections)
            ? data.sections
            : Array.isArray(data.config?.sections)
            ? data.config.sections
            : undefined,
          themeSettings:
            (data.themeSettings && typeof data.themeSettings === 'object'
              ? data.themeSettings
              : data.config?.themeSettings) || undefined,
          planName: data.planName || data.plan_tier || 'GoAMAAS Website',
          monthlyFee: Number(data.monthlyFee || data.monthly_fee || 600),
          subscriptionStatus: data.subscriptionStatus || data.status || 'active',
          paymentStatus: data.paymentStatus || data.payment_status || 'paid',
          deploymentStatus: data.deploymentStatus || data.deployment_status || 'live',
          sslStatus: 'active',
          nextBillingDate: data.nextBillingDate || data.next_billing_date || '',
          createdAt: data.createdAt || data.created_at || new Date().toISOString(),
          lastUpdatedAt: data.lastUpdatedAt || data.updated_at || new Date().toISOString(),
          resourceUsage: data.resourceUsage || data.resource_usage || {
            pagesCount: 1,
            pagesLimit: 10,
            storageUsedMb: 12,
            storageLimitMb: 1024,
            bandwidthUsedGb: 1.2,
            bandwidthLimitGb: 25,
            monthlyUpdatesUsed: 0,
            monthlyUpdatesLimit: 999,
          },
        };
        return { site: mapped, notFound: false };
      }
      return { site: null, notFound: true };
    }

    // 2. Fallback to local state ONLY if Supabase is not configured (offline demo mode)
    const local = subscribedWebsites.find((s) => s.subdomain.toLowerCase() === clean);
    if (
      local &&
      (local.subscriptionStatus === 'active' || local.subscriptionStatus === 'grace_period') &&
      local.deploymentStatus === 'live' &&
      local.paymentStatus === 'paid' &&
      (!local.gracePeriodEndsAt || new Date(local.gracePeriodEndsAt).getTime() >= Date.now())
    ) {
      const linkedLocalProducts = products.filter((p) => p.websiteId === local.id);
      const resolvedProducts =
        linkedLocalProducts.length > 0
          ? linkedLocalProducts
              .filter((p) => p.status === 'active' && p.isVisible !== false)
              .map((p) => ({
                id: p.id,
                productId: p.id,
                name: p.name,
                price: `৳${p.price.toLocaleString()}`,
                priceNumeric: p.price,
                description: p.description,
                imageUrl: p.image,
                category: p.category,
                isVisible: true,
              }))
          : (local.servicesOrProducts || []).filter((item) => item.isVisible !== false);

      return {
        site: {
          ...local,
          servicesOrProducts: resolvedProducts,
          hasUnpublishedDraft: false,
          draftConfig: undefined,
        },
        notFound: false,
      };
    }

    return { site: null, notFound: true };
  };

  const updatePaymentGatewayConfig = async (
    id: string,
    updates: Partial<PaymentGatewayConfig>
  ): Promise<boolean> => {
    if (isSupabaseConfigured && (role !== 'admin' || user?.role !== 'admin')) {
      showToast('Unauthorized: Only verified administrators can update payment gateway settings.', 'error');
      return false;
    }

    const knownGatewayId =
      id === 'bkash' || id === 'nagad' || id === 'bank_transfer' || id === 'whatsapp_support'
        ? id
        : null;
    if (!knownGatewayId) return false;

    const currentGateway = latestGatewayConfigsRef.current.find((c) => c.id === knownGatewayId);
    const mergedGateway = currentGateway ? { ...currentGateway, ...updates } : updates;
    if (
      mergedGateway.isEnabled &&
      knownGatewayId !== 'whatsapp_support' &&
      !(mergedGateway.accountNumber || '').trim()
    ) {
      showToast('Please enter a valid receiving account number before enabling this gateway.', 'warning');
      return false;
    }

    if (!isSupabaseConfigured) {
      setPaymentGatewayConfigs((prev) => {
        const next = prev.map((c) => (c.id === knownGatewayId ? { ...c, ...updates } : c));
        latestGatewayConfigsRef.current = next;
        return next;
      });
      showToast('Payment gateway configuration saved and verified.', 'success');
      return true;
    }

    if (gatewaySaveTimersRef.current[knownGatewayId]) {
      clearTimeout(gatewaySaveTimersRef.current[knownGatewayId]);
      delete gatewaySaveTimersRef.current[knownGatewayId];
    }

    const delta: Partial<PaymentGatewayConfig> = {
      ...(pendingGatewayUpdatesRef.current[knownGatewayId] || {}),
      ...updates,
    };
    delete pendingGatewayUpdatesRef.current[knownGatewayId];

    const res = await adminUpdatePaymentGatewayConfigInDb(knownGatewayId, delta);
    if (!res.success) {
      showToast(res.message || 'Failed to save payment gateway configuration', 'error');
      await refreshPaymentGatewayConfigs();
      return false;
    }

    // Verify saved state from database before marking gateway enabled/verified in UI
    const verifiedConfigs = await refreshPaymentGatewayConfigs();
    const verifiedGateway = verifiedConfigs?.find((c) => c.id === knownGatewayId);
    if (
      !verifiedGateway ||
      (typeof delta.isEnabled === 'boolean' && verifiedGateway.isEnabled !== delta.isEnabled) ||
      (verifiedGateway.isEnabled &&
        knownGatewayId !== 'whatsapp_support' &&
        !(verifiedGateway.accountNumber || '').trim())
    ) {
      showToast(
        'Gateway configuration could not be verified after saving. Please review and try again.',
        'error'
      );
      return false;
    }

    showToast('Payment gateway configuration saved and verified.', 'success');
    return true;
  };

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>(() =>
    isSupabaseConfigured ? [] : getStored('payment_requests', [])
  );
  const [isPaymentsLoading, setIsPaymentsLoading] = useState<boolean>(false);
  const isSubmittingPaymentRef = useRef<boolean>(false);
  const processingPaymentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_payment_requests');
    } else {
      setStored('payment_requests', paymentRequests);
    }
  }, [paymentRequests]);

  const mapRawPaymentRow = (r: RawPaymentRequestRow): PaymentRequest => ({
    id: r.id,
    userId: r.user_id,
    storeId: r.store_id || undefined,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email,
    serviceType: r.service_type,
    serviceId: r.service_id,
    serviceName: r.service_name,
    planTier: r.plan_tier,
    amount: Number(r.amount),
    currency: r.currency || '৳',
    paymentMethod: r.payment_method,
    transactionId: r.transaction_id || undefined,
    senderNumber: r.sender_number || undefined,
    bankName: r.bank_name || undefined,
    bankAccountName: r.bank_account_name || undefined,
    bankReference: r.bank_reference || undefined,
    status: r.status,
    adminNotes: r.admin_notes || undefined,
    reviewedBy: r.reviewed_by || undefined,
    reviewedAt: r.reviewed_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const refreshPaymentRequests = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) return;
    setIsPaymentsLoading(true);
    try {
      const isVerifiedAdmin = role === 'admin' && user.role === 'admin';
      const { data, error } = await fetchUserPaymentRequests(isVerifiedAdmin ? undefined : user.id);
      if (!error && data) {
        setPaymentRequests(data.map(mapRawPaymentRow));
      }
    } catch (err) {
      console.warn('Failed to sync payment requests from Supabase:', err);
    } finally {
      setIsPaymentsLoading(false);
    }
  }, [user?.id, user?.role, role]);

  useEffect(() => {
    if (user?.id) {
      void refreshPaymentRequests();
    } else if (isSupabaseConfigured) {
      setPaymentRequests([]);
    }
  }, [user?.id, role, refreshPaymentRequests]);

  // Keep client dashboard synchronized when a payment request is pending verification
  // or approved while website publishing is transitioning to live.
  const hasActiveVerificationSyncNeed = paymentRequests.some((r) => {
    if (!user?.id) return false;
    if (role !== 'admin' && r.userId !== user.id) return false;
    if (r.status === 'pending') return true;
    if (r.status === 'approved' && isWebsitePaymentService(r.serviceType)) {
      const site = subscribedWebsites.find((w) => w.id === r.serviceId);
      return Boolean(site && !isWebsiteTrulyLive(site) && site.subscriptionStatus !== 'suspended');
    }
    return false;
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id || !hasActiveVerificationSyncNeed) return;

    const syncNow = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshPaymentRequests();
      void refreshSubscribedWebsites();
    };

    const intervalId = window.setInterval(syncNow, 15000);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', syncNow);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, [user?.id, hasActiveVerificationSyncNeed, refreshPaymentRequests, refreshSubscribedWebsites]);

  const submitPaymentRequest = async (params: {
    serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
    serviceId: string;
    serviceName: string;
    planTier: string;
    amount: number;
    paymentMethod: PaymentMethodType;
    transactionId?: string;
    senderNumber?: string;
    bankName?: string;
    bankAccountName?: string;
    bankReference?: string;
  }): Promise<{ success: boolean; message: string; request?: PaymentRequest }> => {
    if (isSubmittingPaymentRef.current) {
      const msg = 'A payment submission is already in progress. Please wait.';
      return { success: false, message: msg };
    }

    if (!user?.id) {
      const msg = 'Please sign in to submit a payment request.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    const cleanServiceId = (params.serviceId || '').trim();
    if (!cleanServiceId) {
      const msg = 'Missing target service ID for payment submission.';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }

    const submittedAmount = Number(params.amount);
    if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) {
      const msg = 'Invalid payment amount specified.';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }

    let resolvedServiceId = cleanServiceId;
    let resolvedPlanTier = (params.planTier || '').trim();

    if (params.serviceType === 'dashboard_plan') {
      const canonicalPlanId = normalizeDashboardPlanId(cleanServiceId);
      if (!canonicalPlanId) {
        const msg = 'Invalid or unrecognized dashboard plan selected.';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      resolvedServiceId = canonicalPlanId;
    } else if (params.serviceType === 'ai_automation') {
      resolvedServiceId = cleanServiceId.toLowerCase();
    }

    const isWebsitePayment =
      params.serviceType === 'website_subscription' || params.serviceType === 'website_package';

    let targetWebsite: SubscribedWebsite | undefined;
    if (isWebsitePayment) {
      if (isSupabaseConfigured && !UUID_REGEX.test(cleanServiceId)) {
        const msg = 'Invalid website ID. Please save your website first before submitting payment.';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      targetWebsite = subscribedWebsites.find((w) => w.id === cleanServiceId);
      if (!isSupabaseConfigured && !targetWebsite) {
        const msg = 'Target website not found. Please save your website before submitting payment.';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      if (targetWebsite && (!targetWebsite.userId || targetWebsite.userId !== user.id)) {
        const msg = 'Unauthorized: You can only submit a payment request for your own website.';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
    }

    // Enforce enabled payment gateway configuration across all payment methods
    const gatewayIdMap: Record<PaymentMethodType, string> = {
      bKash: 'bkash',
      Nagad: 'nagad',
      'Bank Transfer': 'bank_transfer',
    };
    const targetGatewayId = gatewayIdMap[params.paymentMethod];
    const targetGateway = paymentGatewayConfigs.find((c) => c.id === targetGatewayId);
    if (!targetGateway || !targetGateway.isEnabled || !(targetGateway.accountNumber || '').trim()) {
      const msg = `${params.paymentMethod} payment is currently disabled or unavailable. Please choose an active payment method.`;
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    // Validate required payment fields (method, Transaction ID, sender phone, amount, target service)
    const inputCheck = validateManualPaymentSubmissionInput({
      paymentMethod: params.paymentMethod,
      transactionId: params.transactionId,
      bankReference: params.bankReference,
      senderNumber: params.senderNumber,
      amount: submittedAmount,
      serviceId: resolvedServiceId,
    });
    if (!inputCheck.valid) {
      const msg = inputCheck.error || 'Please complete all required payment verification fields.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    const canonicalTrx = inputCheck.normalizedReference;
    const canonicalSender = inputCheck.normalizedSender;

    // Prevent duplicate pending requests for the same service before network submission
    const hasDuplicatePendingService = paymentRequests.some((r) => {
      if (r.userId !== user.id || r.serviceType !== params.serviceType || r.status !== 'pending') {
        return false;
      }
      if (params.serviceType === 'dashboard_plan') {
        return normalizeDashboardPlanId(r.serviceId) === resolvedServiceId;
      }
      return r.serviceId.trim() === resolvedServiceId;
    });
    if (hasDuplicatePendingService) {
      const msg = 'A payment request for this service is already pending admin verification.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    if (hasDuplicateActiveTransactionReference(paymentRequests, canonicalTrx)) {
      const msg = `Transaction ID "${canonicalTrx}" has already been submitted and is pending or approved.`;
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    // Resolve storeId safely to avoid invalid UUID or foreign-key errors
    const candidateStoreId = isWebsitePayment
      ? targetWebsite?.storeId || activeStoreId
      : activeStoreId;
    const resolvedStoreId =
      candidateStoreId &&
      UUID_REGEX.test(candidateStoreId) &&
      stores.some((s) => s.id === candidateStoreId)
        ? candidateStoreId
        : undefined;

    isSubmittingPaymentRef.current = true;
    try {
      // Refresh authoritative catalog from database when Supabase is configured (never trust stale/static prices)
      let activeCatalog: ServicePricingCatalogEntry[] | undefined = undefined;
      if (isSupabaseConfigured) {
        const freshCatalog = await refreshServicePricingCatalog();
        if (!freshCatalog) {
          const msg = 'Unable to verify active service pricing from the server. Please refresh and try again.';
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        activeCatalog = freshCatalog;
      }

      let authoritativeAmount: number | null = null;

      if (params.serviceType === 'dashboard_plan') {
        if (isSupabaseConfigured) {
          const planEntry = (activeCatalog || []).find(
            (entry) =>
              entry.serviceType === 'dashboard_plan' &&
              entry.serviceCode.trim().toLowerCase() === resolvedServiceId &&
              entry.isActive &&
              Number.isFinite(entry.priceBdt) &&
              entry.priceBdt > 0
          );
          if (!planEntry) {
            const msg = 'The selected dashboard plan is currently unavailable or inactive.';
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          if (submittedAmount !== planEntry.priceBdt) {
            const msg = `Payment amount (৳${submittedAmount}) does not match the active ${planEntry.planTierLabel} plan price (৳${planEntry.priceBdt}). Please refresh Billing and try again.`;
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          resolvedPlanTier = planEntry.planTierLabel;
          authoritativeAmount = planEntry.priceBdt;
        } else {
          const offlinePrice = resolveAuthoritativeServicePrice({
            serviceType: 'dashboard_plan',
            serviceId: resolvedServiceId,
          });
          if (offlinePrice === null || offlinePrice <= 0) {
            const msg = 'Invalid or unrecognized dashboard plan selected.';
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          if (submittedAmount !== offlinePrice) {
            const msg = `Payment amount (৳${submittedAmount}) does not match the selected plan price (৳${offlinePrice}).`;
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          resolvedPlanTier = getDashboardPlanById(resolvedServiceId)?.name || resolvedPlanTier;
          authoritativeAmount = offlinePrice;
        }
      } else if (params.serviceType === 'ai_automation') {
        const monthlyExpected = resolveAuthoritativeServicePrice({
          serviceType: 'ai_automation',
          serviceId: resolvedServiceId,
          includeSetupFee: false,
          catalog: activeCatalog,
          requireCatalog: isSupabaseConfigured,
        });
        const setupExpected = resolveAuthoritativeServicePrice({
          serviceType: 'ai_automation',
          serviceId: resolvedServiceId,
          includeSetupFee: true,
          catalog: activeCatalog,
          requireCatalog: isSupabaseConfigured,
        });
        if (monthlyExpected === null || monthlyExpected <= 0) {
          const msg = 'The selected automation package is currently unavailable or inactive.';
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        if (submittedAmount !== monthlyExpected && submittedAmount !== setupExpected) {
          const msg = `Payment amount (৳${submittedAmount}) does not match the active automation package price (৳${monthlyExpected}).`;
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        if (isSupabaseConfigured && activeCatalog) {
          const autoEntry = activeCatalog.find(
            (entry) =>
              entry.serviceType === 'ai_automation' &&
              entry.serviceCode.trim().toLowerCase() === resolvedServiceId &&
              entry.isActive
          );
          if (autoEntry?.planTierLabel) {
            resolvedPlanTier = resolvedPlanTier || autoEntry.planTierLabel;
          }
        }
        authoritativeAmount = submittedAmount;
      } else {
        const expectedWebsiteAmount = resolveAuthoritativeServicePrice({
          serviceType: params.serviceType,
          serviceId: resolvedServiceId,
          serviceName: params.serviceName,
          planTier: resolvedPlanTier,
          websiteMonthlyFee: targetWebsite?.monthlyFee,
          catalog: activeCatalog,
          requireCatalog: isSupabaseConfigured,
        });
        if (
          expectedWebsiteAmount === null ||
          !Number.isFinite(expectedWebsiteAmount) ||
          expectedWebsiteAmount <= 0
        ) {
          const msg = 'The selected website plan or package is currently unavailable or inactive.';
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        if (submittedAmount !== expectedWebsiteAmount) {
          const msg = `Payment amount (৳${submittedAmount}) does not match the authoritative service price (৳${expectedWebsiteAmount}).`;
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        if (
          params.serviceType === 'website_subscription' &&
          isSupabaseConfigured &&
          activeCatalog
        ) {
          const liteEntry = activeCatalog.find(
            (entry) =>
              entry.serviceType === 'website_subscription' &&
              entry.serviceCode.trim().toLowerCase() === 'website_lite' &&
              entry.isActive
          );
          if (liteEntry?.planTierLabel) {
            resolvedPlanTier = liteEntry.planTierLabel;
          }
        }
        authoritativeAmount = expectedWebsiteAmount;
      }

      const submitCustomerPhone =
        activeStore?.phone || onboarding.phone || canonicalSender || 'Not provided';
      const canonicalBankRef =
        params.paymentMethod === 'Bank Transfer'
          ? canonicalTrx
          : (params.bankReference || '').trim().toUpperCase() || undefined;

      if (isSupabaseConfigured) {
        const { data, error } = await createPaymentRequestInDb({
          userId: user.id,
          storeId: resolvedStoreId,
          customerName: user.name || 'Merchant',
          customerPhone: submitCustomerPhone,
          customerEmail: user.email || '',
          ...params,
          transactionId: canonicalTrx,
          senderNumber: canonicalSender,
          bankReference: canonicalBankRef,
          serviceId: resolvedServiceId,
          planTier: resolvedPlanTier,
          amount: authoritativeAmount,
        });

        if (error || !data) {
          const errorMsg = error?.message || 'Failed to submit payment request to database';
          showToast(errorMsg, 'error');
          return { success: false, message: errorMsg };
        }

        const newReq = mapRawPaymentRow(data);
        setPaymentRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)]);
        showToast('Payment submission received! Pending manual admin verification.', 'success');
        return { success: true, message: 'Payment submitted successfully', request: newReq };
      }

      // Local state fallback (only when Supabase credentials are completely unconfigured)
      const now = new Date().toISOString();
      const fallbackReq: PaymentRequest = {
        id: `req-${Date.now()}`,
        userId: user.id,
        storeId: resolvedStoreId || activeStoreId || undefined,
        customerName: user.name || 'Merchant',
        customerPhone: submitCustomerPhone,
        customerEmail: user.email || '',
        ...params,
        transactionId: canonicalTrx,
        senderNumber: canonicalSender,
        bankReference: canonicalBankRef,
        serviceId: resolvedServiceId,
        planTier: resolvedPlanTier,
        amount: authoritativeAmount,
        status: 'pending',
        currency: '৳',
        createdAt: now,
        updatedAt: now,
      };
      setPaymentRequests((prev) => [fallbackReq, ...prev]);
      showToast('Payment submission received! Pending manual admin verification.', 'success');
      return { success: true, message: 'Payment submitted successfully', request: fallbackReq };
    } finally {
      isSubmittingPaymentRef.current = false;
    }
  };

  const runAdminPaymentWorkflow = async (
    requestId: string,
    mode: 'approve_and_publish' | 'retry_publish',
    notes?: string
  ): Promise<ApproveAndPublishResult> => {
    const cleanId = (requestId || '').trim();
    if (role !== 'admin' || (isSupabaseConfigured && user?.role !== 'admin')) {
      return {
        success: false,
        paymentApproved: false,
        websitePublished: false,
        isWebsiteService: false,
        code: 'FORBIDDEN',
        message: 'Unauthorized: Verified platform administrator role is required.',
      };
    }

    if (!cleanId) {
      return {
        success: false,
        paymentApproved: false,
        websitePublished: false,
        isWebsiteService: false,
        code: 'INVALID_REQUEST_ID',
        message: 'Invalid payment request ID.',
      };
    }

    if (processingPaymentIdsRef.current.has(cleanId)) {
      return {
        success: false,
        paymentApproved: false,
        websitePublished: false,
        isWebsiteService: false,
        code: 'IN_FLIGHT',
        message: 'This payment request is already being processed. Please wait.',
      };
    }

    processingPaymentIdsRef.current.add(cleanId);
    try {
      let targetRequest = paymentRequests.find((r) => r.id === cleanId) || null;
      if (!targetRequest && isSupabaseConfigured) {
        const { data } = await fetchPaymentRequestByIdFromDb(cleanId);
        if (data) {
          targetRequest = mapRawPaymentRow(data);
        }
      }

      if (isSupabaseConfigured) {
        const result = await executeApproveAndPublishWorkflow({
          mode,
          request: targetRequest,
          notes,
          callerRole: user?.role === 'admin' ? 'admin' : 'merchant',
          callerUserId: user?.id,
          adapters: {
            requireUuidServiceId: true,
            approvePaymentRpc: (id, adminNotes) => adminApprovePaymentInDb(id, adminNotes),
            fetchPaymentRequestById: async (id) => {
              const { data } = await fetchPaymentRequestByIdFromDb(id);
              return data ? mapRawPaymentRow(data) : null;
            },
            fetchWebsiteById: async (websiteId) => {
              const { data } = await fetchSubscribedWebsiteByIdFromDb(websiteId);
              return data;
            },
            publishWebsiteRpc: (websiteId) => publishClientWebsiteInDb(websiteId),
          },
        });

        await Promise.all([refreshPaymentRequests(), refreshSubscribedWebsites()]);

        if (result.success) {
          showToast(result.message, result.suspendedHold ? 'warning' : 'success');
        } else if (result.partialFailure) {
          showToast(result.message, 'warning');
        } else {
          showToast(result.message, 'error');
        }
        return result;
      }

      // Offline / local fallback using the exact same workflow orchestrator
      let workingRequests = [...paymentRequests];
      let workingWebsites = [...subscribedWebsites];

      const result = await executeApproveAndPublishWorkflow({
        mode,
        request: targetRequest,
        notes,
        callerRole: role,
        callerUserId: user?.id,
        adapters: {
          requireUuidServiceId: false,
          approvePaymentRpc: async (id, adminNotes) => {
            const currentReq = workingRequests.find((r) => r.id === id);
            if (!currentReq) {
              return {
                success: false,
                code: 'NOT_FOUND',
                message: 'Payment request not found',
                error: new Error('Payment request not found'),
              };
            }
            if (currentReq.status !== 'pending') {
              return {
                success: false,
                code: 'ALREADY_SETTLED',
                message: `Payment request is already ${currentReq.status}`,
                error: new Error(`Payment request is already ${currentReq.status}`),
              };
            }
            if (isWebsitePaymentService(currentReq.serviceType)) {
              const targetId = (currentReq.serviceId || '').trim();
              const siteMatches = workingWebsites.filter((w) => w.id === targetId);
              if (siteMatches.length !== 1 || siteMatches[0].userId !== currentReq.userId) {
                return {
                  success: false,
                  code: 'TARGET_WEBSITE_INVALID',
                  message: 'Target website record is missing or ownership mismatched.',
                  error: new Error('Target website record is missing or ownership mismatched.'),
                };
              }
              const site = siteMatches[0];
              if (site.subscriptionStatus === 'cancelled') {
                return {
                  success: false,
                  code: 'WEBSITE_CANCELLED',
                  message: 'Cannot approve payment for a cancelled website subscription.',
                  error: new Error('Cannot approve payment for a cancelled website subscription.'),
                };
              }
              const existingMs =
                site.paymentStatus === 'paid' && site.nextBillingDate
                  ? new Date(site.nextBillingDate).getTime()
                  : 0;
              const baseMs =
                Number.isFinite(existingMs) && existingMs > Date.now() ? existingMs : Date.now();
              const nextPeriodMs = baseMs + 30 * 24 * 60 * 60 * 1000;
              const nextGraceMs = baseMs + 37 * 24 * 60 * 60 * 1000;
              const canAutoPublish =
                currentReq.serviceType === 'website_subscription' &&
                site.subscriptionStatus !== 'suspended' &&
                validateSubdomainFormat(site.subdomain).valid &&
                !workingWebsites.some(
                  (other) =>
                    other.id !== site.id &&
                    other.subdomain.toLowerCase() === site.subdomain.toLowerCase()
                );
              const promotedDraft = canAutoPublish && site.draftConfig ? site.draftConfig : {};

              workingWebsites = workingWebsites.map((w) =>
                w.id === targetId && w.userId === currentReq.userId
                  ? {
                      ...w,
                      ...promotedDraft,
                      hasUnpublishedDraft: canAutoPublish ? false : w.hasUnpublishedDraft,
                      draftConfig: canAutoPublish ? undefined : w.draftConfig,
                      subscriptionStatus:
                        w.subscriptionStatus === 'suspended' ? 'suspended' : 'active',
                      paymentStatus: 'paid',
                      deploymentStatus: canAutoPublish ? 'live' : w.deploymentStatus,
                      sslStatus: canAutoPublish ? 'active' : w.sslStatus,
                      nextBillingDate: new Date(nextPeriodMs).toISOString().split('T')[0],
                      gracePeriodEndsAt: new Date(nextGraceMs).toISOString(),
                    }
                  : w
              );
            }

            const nowIso = new Date().toISOString();
            workingRequests = workingRequests.map((r) =>
              r.id === id
                ? {
                    ...r,
                    status: 'approved',
                    adminNotes: (adminNotes || '').trim() || r.adminNotes,
                    reviewedBy: user?.id,
                    reviewedAt: nowIso,
                    updatedAt: nowIso,
                  }
                : r
            );

            return {
              success: true,
              code: 'APPROVED',
              message: 'Payment approved successfully.',
              requestId: id,
              error: null,
            };
          },
          fetchPaymentRequestById: async (id) => workingRequests.find((r) => r.id === id) || null,
          fetchWebsiteById: async (websiteId) =>
            workingWebsites.find((w) => w.id === websiteId) || null,
          publishWebsiteRpc: async (websiteId) => {
            const site = workingWebsites.find((w) => w.id === websiteId);
            if (!site) {
              return {
                success: false,
                message: 'Website record not found.',
                error: new Error('Website record not found.'),
              };
            }
            if (site.paymentStatus !== 'paid') {
              return {
                success: false,
                message: 'Verified payment approval required before publishing.',
                error: new Error('Verified payment approval required before publishing.'),
              };
            }
            if (
              site.subscriptionStatus !== 'active' &&
              site.subscriptionStatus !== 'grace_period'
            ) {
              return {
                success: false,
                message: 'Cannot publish website while subscription is inactive or suspended.',
                error: new Error('Cannot publish website while subscription is inactive or suspended.'),
              };
            }
            const subValidation = validateSubdomainFormat(site.subdomain);
            if (!subValidation.valid) {
              return {
                success: false,
                message: subValidation.reason || 'Invalid subdomain format.',
                error: new Error(subValidation.reason || 'Invalid subdomain format.'),
              };
            }
            const collision = workingWebsites.some(
              (other) =>
                other.id !== site.id &&
                other.subdomain.toLowerCase() === subValidation.clean.toLowerCase()
            );
            if (collision) {
              return {
                success: false,
                message: 'Subdomain is already registered by another merchant.',
                error: new Error('Subdomain is already registered by another merchant.'),
              };
            }
            const promotedDraft = site.draftConfig || {};
            workingWebsites = workingWebsites.map((w) =>
              w.id === websiteId
                ? {
                    ...w,
                    ...promotedDraft,
                    hasUnpublishedDraft: false,
                    draftConfig: undefined,
                    deploymentStatus: 'live',
                    sslStatus: 'active',
                  }
                : w
            );
            return {
              success: true,
              message: `Website published at https://${site.fullDomainUrl}`,
              error: null,
            };
          },
        },
      });

      setPaymentRequests(workingRequests);
      setSubscribedWebsites(workingWebsites);

      if (result.success) {
        showToast(result.message, result.suspendedHold ? 'warning' : 'success');
      } else if (result.partialFailure) {
        showToast(result.message, 'warning');
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } finally {
      processingPaymentIdsRef.current.delete(cleanId);
    }
  };

  const adminApproveAndPublishPayment = async (
    requestId: string,
    notes?: string
  ): Promise<ApproveAndPublishResult> => {
    return runAdminPaymentWorkflow(requestId, 'approve_and_publish', notes);
  };

  const adminRetryPublishForPayment = async (
    requestId: string
  ): Promise<ApproveAndPublishResult> => {
    return runAdminPaymentWorkflow(requestId, 'retry_publish');
  };

  const adminApprovePayment = async (
    requestId: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await runAdminPaymentWorkflow(requestId, 'approve_and_publish', notes);
    return { success: res.success, message: res.message };
  };

  const adminRejectPayment = async (
    requestId: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> => {
    if (role !== 'admin' || (isSupabaseConfigured && user?.role !== 'admin')) {
      return { success: false, message: 'Unauthorized. Admin role required.' };
    }

    const cleanId = (requestId || '').trim();
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      const msg = 'Please enter a rejection reason so the merchant knows how to resolve it.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    if (processingPaymentIdsRef.current.has(cleanId)) {
      return { success: false, message: 'This payment request is already being processed.' };
    }

    processingPaymentIdsRef.current.add(cleanId);
    try {
      if (isSupabaseConfigured) {
        const { success, error } = await adminRejectPaymentInDb(cleanId, cleanReason);
        if (!success) {
          const msg = error?.message || 'Payment rejection failed';
          showToast(msg, 'error');
          return { success: false, message: msg };
        }
        await refreshPaymentRequests();
        showToast('Payment rejected and reason recorded.', 'info');
        return { success: true, message: 'Payment rejected' };
      }

      const req = paymentRequests.find((r) => r.id === cleanId);
      if (!req) {
        const msg = 'Payment request not found';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }

      if (req.status !== 'pending') {
        const msg = `Payment request is already ${req.status}`;
        showToast(msg, 'warning');
        return { success: false, message: msg };
      }

      const nowIso = new Date().toISOString();
      setPaymentRequests((prev) =>
        prev.map((r) => {
          if (r.id === cleanId) {
            return {
              ...r,
              status: 'rejected',
              adminNotes: cleanReason,
              reviewedBy: user?.id,
              reviewedAt: nowIso,
              updatedAt: nowIso,
            };
          }
          return r;
        })
      );

      showToast('Payment rejected and reason recorded.', 'info');
      return { success: true, message: 'Payment rejected' };
    } finally {
      processingPaymentIdsRef.current.delete(cleanId);
    }
  };

  // Synchronize trials with Supabase when authenticated user is present
  const refreshServiceTrials = async () => {
    if (!user?.id || !isSupabaseConfigured) return;
    setIsTrialsLoading(true);
    try {
      const { data, error } = await fetchUserServiceTrials(user.id);
      if (!error && data) {
        const mapped: ServiceTrialRecord[] = data.map((row: RawServiceTrialRow) => ({
          id: row.id,
          userId: row.user_id,
          storeId: row.store_id || undefined,
          serviceId: row.service_id,
          serviceName: row.service_name,
          serviceCategory: row.service_category,
          status: row.status,
          startedAt: row.started_at,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
        setServiceTrials(mapped);
      }
    } catch (err) {
      console.warn('Failed to sync service trials from remote database:', err);
    } finally {
      setIsTrialsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshServiceTrials();
    }
  }, [user?.id]);

  // Evaluates real-time access status for any individual service module
  const getServiceAccess = (
    serviceId: string,
    serviceName: string,
    category: ServiceTrialCategory
  ): ServiceAccessStatus => {
    // 1. Super admin always has full unrestricted access
    if (role === 'admin') {
      return {
        serviceId,
        serviceName,
        serviceCategory: category,
        status: 'subscribed',
        hasAccess: true,
        isExpired: false,
      };
    }

    // 2. Check verified approved payment requests & paid website subscriptions first
    if (user?.id) {
      const normalizedId = (serviceId || '').trim().toLowerCase();
      const userApprovedPayments = paymentRequests.filter(
        (r) => r.userId === user.id && r.status === 'approved'
      );

      if (category === 'dashboard') {
        const targetPlan = normalizeDashboardPlanId(normalizedId);
        const hasApprovedDashboard = userApprovedPayments.some((r) => {
          if (r.serviceType !== 'dashboard_plan') return false;
          const reqCode = r.serviceId.trim().toLowerCase();
          const approvedPlan =
            normalizeDashboardPlanId(reqCode) || normalizeDashboardPlanId(r.planTier);
          if (normalizedId === 'dashboard_business' && approvedPlan !== null) {
            return true;
          }
          if (targetPlan && approvedPlan) {
            return targetPlan === approvedPlan;
          }
          return reqCode === normalizedId;
        });
        if (hasApprovedDashboard) {
          return {
            serviceId,
            serviceName,
            serviceCategory: category,
            status: 'subscribed',
            hasAccess: true,
            isExpired: false,
          };
        }
      } else if (category === 'ai_automation') {
        const hasApprovedAuto = userApprovedPayments.some(
          (r) =>
            r.serviceType === 'ai_automation' &&
            (r.serviceId.trim().toLowerCase() === normalizedId ||
              normalizedId === 'ai_automations')
        );
        if (hasApprovedAuto) {
          return {
            serviceId,
            serviceName,
            serviceCategory: category,
            status: 'subscribed',
            hasAccess: true,
            isExpired: false,
          };
        }
      } else if (category === 'landing_pages') {
        const hasApprovedLandingPlan = userApprovedPayments.some((r) => {
          if (r.serviceType !== 'dashboard_plan') return false;
          const reqCode = r.serviceId.trim().toLowerCase();
          const approvedPlan =
            normalizeDashboardPlanId(reqCode) || normalizeDashboardPlanId(r.planTier);
          return (
            approvedPlan === 'pro' ||
            approvedPlan === 'enterprise' ||
            approvedPlan === 'business'
          );
        });
        if (hasApprovedLandingPlan) {
          return {
            serviceId,
            serviceName,
            serviceCategory: category,
            status: 'subscribed',
            hasAccess: true,
            isExpired: false,
          };
        }
      } else if (category === 'website') {
        const hasPaidSite = subscribedWebsites.some(
          (w) =>
            w.userId === user.id &&
            w.paymentStatus === 'paid' &&
            (w.subscriptionStatus === 'active' || w.subscriptionStatus === 'grace_period')
        );
        if (hasPaidSite) {
          return {
            serviceId,
            serviceName,
            serviceCategory: category,
            status: 'subscribed',
            hasAccess: true,
            isExpired: false,
          };
        }
      }
    }

    // Website Service strictly requires verified payment — never grant access via free trial records
    if (category === 'website') {
      return {
        serviceId,
        serviceName,
        serviceCategory: category,
        status: 'available',
        hasAccess: false,
        isExpired: false,
      };
    }

    // 3. Check if a trial record exists for this specific service
    const record = serviceTrials.find((t) => t.serviceId === serviceId && (!t.userId || t.userId === user?.id));

    if (!record) {
      return {
        serviceId,
        serviceName,
        serviceCategory: category,
        status: 'available',
        hasAccess: false,
        isExpired: false,
      };
    }

    const now = new Date();
    const expiresAt = new Date(record.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();
    const isExpired = diffMs <= 0 || record.status === 'expired';

    if (isExpired) {
      return {
        serviceId,
        serviceName,
        serviceCategory: category,
        status: 'trial_expired',
        hasAccess: false,
        trialRecord: record,
        daysRemaining: 0,
        hoursRemaining: 0,
        formattedExpiresAt: expiresAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        isExpired: true,
      };
    }

    const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

    return {
      serviceId,
      serviceName,
      serviceCategory: category,
      status: 'trial_active',
      hasAccess: true,
      trialRecord: record,
      daysRemaining,
      hoursRemaining,
      formattedExpiresAt: expiresAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
      isExpired: false,
    };
  };

  // Activates a dedicated 7-day free trial for a specific service
  const activateServiceTrial = async (
    serviceId: string,
    serviceName: string,
    category: ServiceTrialCategory
  ): Promise<{ success: boolean; message: string; trial?: ServiceTrialRecord }> => {
    const normalizedServiceId = (serviceId || '').trim().toLowerCase();
    if (
      category === 'website' ||
      normalizedServiceId === 'website_lite' ||
      normalizedServiceId === 'business_website_lite' ||
      normalizedServiceId === 'bespoke_web_dev'
    ) {
      const msg = 'Free trials are not available for Website Service. Paid verification is required.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    // Enforce authentication
    if (!user?.id) {
      const msg = 'Please sign in or register to activate your 7-day free trial.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    // Client-side quick check
    const existing = serviceTrials.find((t) => t.serviceId === serviceId && t.userId === user.id);
    if (existing) {
      const msg = `You have already activated your 7-day free trial for ${serviceName}.`;
      showToast(msg, 'info');
      return { success: false, message: msg, trial: existing };
    }

    const validStoreId = activeStoreId && UUID_REGEX.test(activeStoreId) ? activeStoreId : undefined;

    // Server-side database activation in Supabase (never fall back to synthetic local trial on error)
    if (isSupabaseConfigured) {
      const { data, error, alreadyUsed } = await activateServiceTrialInDb({
        serviceId,
        serviceName,
        serviceCategory: category,
        userId: user.id,
        storeId: validStoreId,
      });

      if (alreadyUsed) {
        const msg = `You have already activated the 7-day free trial for ${serviceName}.`;
        showToast(msg, 'info');
        return { success: false, message: msg };
      }

      if (!error && data) {
        const newRecord: ServiceTrialRecord = {
          id: data.id,
          userId: data.user_id,
          storeId: data.store_id || undefined,
          serviceId: data.service_id,
          serviceName: data.service_name,
          serviceCategory: data.service_category,
          status: data.status,
          startedAt: data.started_at,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        setServiceTrials((prev) => [newRecord, ...prev.filter((t) => t.serviceId !== serviceId)]);
        showToast(`7-Day Free Trial activated for ${serviceName}!`, 'success');
        return { success: true, message: 'Trial activated successfully', trial: newRecord };
      }

      const errMsg = error?.message || `Failed to activate 7-day free trial for ${serviceName}.`;
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }

    // Local state fallback ONLY when Supabase is not configured (offline demo mode)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const fallbackRecord: ServiceTrialRecord = {
      id: `trial-${Date.now()}`,
      userId: user.id,
      storeId: validStoreId,
      serviceId,
      serviceName,
      serviceCategory: category,
      status: 'active',
      startedAt: now.toISOString(),
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setServiceTrials((prev) => [fallbackRecord, ...prev.filter((t) => t.serviceId !== serviceId)]);
    showToast(`7-Day Free Trial activated for ${serviceName}!`, 'success');
    return { success: true, message: 'Trial activated successfully', trial: fallbackRecord };
  };

  // Derive currentPlan and verified invoices from approved payment_requests in Supabase mode
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!user?.id) {
      setCurrentPlan('starter');
      setInvoices([]);
      return;
    }

    const approvedDashboardReqs = paymentRequests
      .filter((r) => r.userId === user.id && r.status === 'approved' && r.serviceType === 'dashboard_plan')
      .sort((a, b) => new Date(b.reviewedAt || b.updatedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.updatedAt || a.createdAt).getTime());

    if (approvedDashboardReqs.length > 0) {
      const latestReq = approvedDashboardReqs[0];
      const resolvedPlan =
        normalizeDashboardPlanId(latestReq.serviceId) ||
        normalizeDashboardPlanId(latestReq.planTier) ||
        'starter';
      setCurrentPlan(resolvedPlan);
    } else {
      setCurrentPlan('starter');
    }

    const derivedInvoices: Invoice[] = paymentRequests
      .filter((r) =>
        role === 'admin'
          ? r.status === 'approved'
          : r.userId === user.id &&
            (r.status === 'approved' || r.status === 'pending' || r.status === 'rejected')
      )
      .map((r) => ({
        id: r.id,
        invoiceNumber: `INV-${r.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        date: (r.reviewedAt || r.createdAt || new Date().toISOString()).split('T')[0],
        planName: `${r.serviceName} (${r.planTier})`,
        amount: r.amount,
        status: r.status === 'approved' ? 'Paid' : r.status === 'pending' ? 'Pending' : 'Failed',
      }));
    setInvoices(derivedInvoices);
  }, [paymentRequests, user?.id, role]);

  const updatePlan = (newPlan: DashboardPlanId | Uppercase<DashboardPlanId>) => {
    if (isSupabaseConfigured) {
      showToast('Plan upgrades require verified payment approval in Billing.', 'warning');
      return;
    }
    const normalized = normalizeDashboardPlanId(newPlan);
    if (!normalized) {
      showToast('Invalid dashboard plan selected.', 'error');
      return;
    }
    const planLabel = getDashboardPlanById(normalized)?.name || normalized;
    setCurrentPlan(normalized);
    showToast(`Upgraded subscription to ${planLabel} plan!`, 'success');
  };

  const cancelSubscription = () => {
    showToast('Subscription set to cancel at end of current billing cycle.', 'info');
  };

  // Team (Multi-tenant store_members in Supabase mode)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    isSupabaseConfigured ? [] : getStored('teamMembers', INITIAL_TEAM_MEMBERS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_teamMembers');
    } else {
      setStored('teamMembers', teamMembers);
    }
  }, [teamMembers]);

  const addTeamMember = (member: Omit<TeamMember, 'id' | 'joinedAt'>) => {
    if (isSupabaseConfigured && user?.id) {
      if (!UUID_REGEX.test(activeStore.id)) {
        showToast('Store workspace is still initializing. Please try again in a moment.', 'warning');
        return;
      }
      void (async () => {
        const { data, error } = await inviteStoreMemberInDb(activeStore.id, {
          name: member.name,
          email: member.email,
          role: member.role,
        });
        if (error || !data) {
          showToast(error?.message || 'Failed to invite team member', 'error');
          return;
        }
        setTeamMembers((prev) => [...prev.filter((m) => m.id !== data.id), data]);
        showToast(`Team invitation recorded for ${data.email}`, 'success');
      })();
      return;
    }

    const newMember: TeamMember = {
      ...member,
      id: `team-${Date.now()}`,
      joinedAt: new Date().toISOString().split('T')[0],
    };
    setTeamMembers((prev) => [...prev, newMember]);
    showToast(`Team invitation sent to ${member.email}`, 'success');
  };

  const removeTeamMember = (id: string) => {
    const prevSnapshot = teamMembers;
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(id)) {
      void (async () => {
        const { error } = await removeStoreMemberInDb(id);
        if (error) {
          setTeamMembers(prevSnapshot);
          showToast(error.message || 'Failed to revoke team member access', 'error');
          return;
        }
        showToast('Team member access revoked', 'info');
      })();
      return;
    }

    showToast('Team member access revoked', 'info');
  };

  // Support Tickets (Multi-tenant support_tickets in Supabase mode)
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() =>
    isSupabaseConfigured ? [] : getStored('supportTickets', INITIAL_SUPPORT_TICKETS)
  );
  useEffect(() => {
    if (isSupabaseConfigured) {
      localStorage.removeItem('goamaas_supportTickets');
    } else {
      setStored('supportTickets', supportTickets);
    }
  }, [supportTickets]);

  const createSupportTicket = (
    subject: string,
    category: SupportTicket['category'],
    priority: SupportTicket['priority'],
    text: string
  ) => {
    const ticketNum = `AMAAS-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 90)}`;
    const initialMsg: SupportTicketMessage = {
      id: `msg-${Date.now()}`,
      sender: user?.name || (user?.email ? user.email.split('@')[0] : 'Store Merchant'),
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStaff: role === 'admin',
    };

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(user.id)) {
      void (async () => {
        const { data, error } = await createSupportTicketInDb({
          userId: user.id,
          ticketNumber: ticketNum,
          subject,
          category,
          priority,
          messages: [initialMsg],
        });
        if (error || !data) {
          showToast(error?.message || 'Failed to submit support ticket', 'error');
          return;
        }
        setSupportTickets((prev) => [data, ...prev.filter((t) => t.id !== data.id)]);
        showToast(`Support ticket #${data.ticketNumber} created!`, 'success');
      })();
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newTicket: SupportTicket = {
      id: `tkt-${Date.now()}`,
      ticketNumber: ticketNum,
      subject,
      category,
      priority,
      status: 'open',
      createdAt: today,
      updatedAt: today,
      messages: [initialMsg],
    };
    setSupportTickets((prev) => [newTicket, ...prev]);
    showToast(`Support ticket #${newTicket.ticketNumber} created!`, 'success');
  };

  const replySupportTicket = (ticketId: string, text: string) => {
    const target = supportTickets.find((t) => t.id === ticketId);
    if (!target) return;

    const newMsg: SupportTicketMessage = {
      id: `msg-${Date.now()}`,
      sender: user?.name || (user?.email ? user.email.split('@')[0] : 'Store Merchant'),
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStaff: role === 'admin',
    };
    const nextMessages = [...target.messages, newMsg];
    const prevSnapshot = supportTickets;

    setSupportTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              updatedAt: new Date().toISOString().split('T')[0],
              messages: nextMessages,
            }
          : t
      )
    );

    if (isSupabaseConfigured && user?.id && UUID_REGEX.test(ticketId)) {
      void (async () => {
        const { data, error } = await updateSupportTicketInDb(ticketId, { messages: nextMessages });
        if (error || !data) {
          setSupportTickets(prevSnapshot);
          showToast(error?.message || 'Failed to send ticket reply', 'error');
          return;
        }
        setSupportTickets((prev) => prev.map((t) => (t.id === ticketId ? data : t)));
        showToast('Reply dispatched to ticket', 'success');
      })();
      return;
    }

    showToast('Reply dispatched to ticket', 'success');
  };

  // Synchronize store-scoped tables (products, orders, customers, inventory_movements, store_members)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id || !UUID_REGEX.test(activeStore.id)) {
      return;
    }

    let cancelled = false;
    (async () => {
      const extraWebsiteStoreIds = Array.from(
        new Set(
          subscribedWebsites
            .map((w) => w.storeId)
            .filter((sid): sid is string => Boolean(sid && UUID_REGEX.test(sid) && sid !== activeStore.id))
        )
      );

      const [prodRes, extraProdResults, ordRes, custRes, invRes, teamRes] = await Promise.all([
        fetchStoreProductsFromDb(activeStore.id),
        Promise.all(extraWebsiteStoreIds.map((sid) => fetchStoreProductsFromDb(sid))),
        fetchStoreOrdersFromDb(activeStore.id),
        fetchStoreCustomersFromDb(activeStore.id),
        fetchStoreInventoryMovementsFromDb(activeStore.id),
        fetchStoreMembersFromDb(activeStore.id),
      ]);
      if (cancelled) return;

      if (!prodRes.error && prodRes.data) {
        const mergedMap = new Map<string, Product>();
        for (const p of prodRes.data) mergedMap.set(p.id, p);
        for (const extra of extraProdResults) {
          if (!extra.error && extra.data) {
            for (const p of extra.data) {
              if (!mergedMap.has(p.id)) mergedMap.set(p.id, p);
            }
          }
        }
        setProducts(Array.from(mergedMap.values()));
      }
      if (!ordRes.error && ordRes.data) setOrders(ordRes.data);
      if (!custRes.error && custRes.data) setCustomers(custRes.data);
      if (!invRes.error && invRes.data) setInventoryLogs(invRes.data);
      if (!teamRes.error && teamRes.data) setTeamMembers(teamRes.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeStore.id, subscribedWebsites]);

  // Synchronize user-scoped support tickets & authoritative service pricing catalog
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id) {
      return;
    }

    let cancelled = false;
    (async () => {
      const [ticketsRes] = await Promise.all([
        fetchSupportTicketsFromDb(),
        refreshServicePricingCatalog(),
      ]);
      if (cancelled) return;

      if (!ticketsRes.error && ticketsRes.data) {
        setSupportTickets(ticketsRes.data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, refreshServicePricingCatalog]);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    isSupabaseConfigured ? [] : getStored('notifications', INITIAL_NOTIFICATIONS)
  );
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStored('notifications', notifications);
    }
  }, [notifications]);

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast('All notifications marked as read', 'info');
  };

  const clearNotifications = () => {
    setNotifications([]);
    showToast('Notifications cleared', 'info');
  };

  // Reset demo data
  const resetDemoData = () => {
    localStorage.clear();
    setProducts(INITIAL_PRODUCTS);
    setOrders(INITIAL_ORDERS);
    setCustomers(INITIAL_CUSTOMERS);
    setInventoryLogs(INITIAL_INVENTORY_LOGS);
    setLandingPages(INITIAL_LANDING_PAGES);
    setAutomations(INITIAL_AUTOMATIONS);
    setWebsiteRequests(INITIAL_WEBSITE_REQUESTS);
    setWebsiteSubscriptionPlan(DEFAULT_WEBSITE_SUBSCRIPTION_PLAN);
    setSubscribedWebsites(INITIAL_SUBSCRIBED_WEBSITES);
    setTeamMembers(INITIAL_TEAM_MEMBERS);
    setSupportTickets(INITIAL_SUPPORT_TICKETS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setInvoices(INITIAL_INVOICES);
    setStores(INITIAL_STORES);
    setUser(INITIAL_USER);
    setRole('merchant');
    setCurrentPlan('pro');
    setOnboarding(INITIAL_ONBOARDING);
    showToast('Workspace reset to empty state.', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        user,
        role,
        isAuthenticated: !!user,
        isAuthLoading,
        setAuthenticatedUser,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        requestPasswordReset,
        updatePassword,
        resendVerification,
        logout,
        switchRole,
        stores,
        activeStore,
        activeStoreId,
        setActiveStoreId,
        updateActiveStore,
        onboarding,
        updateOnboarding,
        completeOnboarding,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustProductStock,
        ensureMerchantStore,
        orders,
        addOrder,
        updateOrderStatus,
        updateOrderPaymentStatus,
        updateOrderTracking,
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addCustomerNote,
        inventoryLogs,
        landingPages,
        createLandingPage,
        updateLandingPage,
        deleteLandingPage,
        togglePublishLandingPage,
        automations,
        toggleAutomation,
        updateAutomation,
        testRunAutomation,
        websiteRequests,
        addWebsiteRequest,
        updateWebsiteRequestStatus,
        websiteSubscriptionPlan,
        updateWebsiteSubscriptionPlanConfig,
        subscribedWebsites,
        isWebsitesLoading,
        createSubscribedWebsite,
        updateSubscribedWebsite,
        saveWebsiteDraft,
        publishWebsiteUpdates,
        uploadWebsiteAsset,
        removeWebsiteAsset,
        renewSubscribedWebsite,
        suspendSubscribedWebsite,
        reactivateSubscribedWebsite,
        adminDeleteSubscribedWebsite,
        websiteLifecycleAuditLogs,
        refreshWebsiteLifecycleAuditLogs,
        servicePricingCatalog,
        isPricingCatalogLoading,
        isPricingCatalogLoaded,
        pricingCatalogError,
        refreshServicePricingCatalog,
        checkSubdomainAvailability,
        checkSubdomainAvailabilityAsync,
        refreshSubscribedWebsites,
        requestWebsiteContentUpdate,
        currentPlan,
        trialDaysLeft,
        invoices,
        updatePlan,
        cancelSubscription,
        serviceTrials,
        isTrialsLoading,
        getServiceAccess,
        activateServiceTrial,
        refreshServiceTrials,
        paymentRequests,
        isPaymentsLoading,
        paymentGatewayConfigs,
        submitPaymentRequest,
        adminApprovePayment,
        adminApproveAndPublishPayment,
        adminRetryPublishForPayment,
        adminRejectPayment,
        refreshPaymentRequests,
        updatePaymentGatewayConfig,
        publishWebsite,
        unpublishWebsite,
        cancelWebsiteSubscription,
        resolvePublicWebsite,
        teamMembers,
        addTeamMember,
        removeTeamMember,
        supportTickets,
        createSupportTicket,
        replySupportTicket,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
        toasts,
        showToast,
        removeToast,
        resetDemoData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
