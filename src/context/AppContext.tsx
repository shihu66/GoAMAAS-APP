import React, { createContext, useContext, useState, useEffect } from 'react';
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
  WebsiteSubscriptionPlanConfig,
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
import { DEFAULT_WEBSITE_SUBSCRIPTION_PLAN } from '../data/pricingConfig';
import {
  supabase,
  isSupabaseConfigured,
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
  createPaymentRequestInDb,
  adminApprovePaymentInDb,
  adminRejectPaymentInDb,
  RawPaymentRequestRow,
  fetchPublishedWebsiteBySubdomain,
  publishClientWebsiteInDb,
  updateClientWebsiteInDb,
  unpublishClientWebsiteInDb,
} from '../lib/supabase';

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
  completeOnboarding: () => void;

  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'salesCount' | 'rating'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustProductStock: (id: string, delta: number, reason: string) => void;

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

  // Subscribed Websites (AMAAS Website Lite - ৳600/month recurring plan)
  websiteSubscriptionPlan: WebsiteSubscriptionPlanConfig;
  updateWebsiteSubscriptionPlanConfig: (updates: Partial<WebsiteSubscriptionPlanConfig>) => void;
  subscribedWebsites: SubscribedWebsite[];
  createSubscribedWebsite: (data: Omit<SubscribedWebsite, 'id' | 'createdAt' | 'lastUpdatedAt' | 'resourceUsage'>) => SubscribedWebsite;
  updateSubscribedWebsite: (id: string, updates: Partial<SubscribedWebsite>) => void;
  renewSubscribedWebsite: (id: string) => void;
  suspendSubscribedWebsite: (id: string, reason?: string) => void;
  reactivateSubscribedWebsite: (id: string) => void;
  checkSubdomainAvailability: (subdomain: string, excludeId?: string) => { available: boolean; reason?: string };
  requestWebsiteContentUpdate: (websiteId: string, details: string) => void;

  // Subscriptions & Billing
  currentPlan: 'STARTER' | 'BUSINESS' | 'PRO' | 'ENTERPRISE';
  trialDaysLeft: number;
  invoices: Invoice[];
  updatePlan: (plan: 'STARTER' | 'BUSINESS' | 'PRO' | 'ENTERPRISE') => void;
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
  adminRejectPayment: (requestId: string, reason: string) => Promise<{ success: boolean; message: string }>;
  refreshPaymentRequests: () => Promise<void>;
  updatePaymentGatewayConfig: (id: string, updates: Partial<PaymentGatewayConfig>) => void;
  publishWebsite: (websiteId: string) => Promise<{ success: boolean; message: string }>;
  unpublishWebsite: (websiteId: string) => Promise<{ success: boolean; message: string }>;
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

  // User & Auth State (Real authentication, no fake Tanvir Hossain by default)
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(() => getStored('user', INITIAL_USER));
  const [role, setRole] = useState<UserRole>(() => user?.role || 'merchant');

  // Helper to construct User object from Supabase user and profile
  const buildUserFromSession = async (sessionUser: any): Promise<User> => {
    const userId = sessionUser.id;
    const meta = sessionUser.user_metadata || {};
    const { profile } = await getUserProfile(userId);

    const fullName = profile?.full_name || meta.full_name || meta.name || sessionUser.email?.split('@')[0] || 'Merchant';
    const userRole = (profile?.role || meta.role || 'merchant') as UserRole;
    const storeId = profile?.store_id || meta.store_id || `store-${userId.substring(0, 8)}`;

    if (profile?.onboarding_completed || meta.onboarding_completed) {
      setOnboarding((prev) => ({ ...prev, completed: true }));
    }

    return {
      id: userId,
      name: fullName,
      email: sessionUser.email || '',
      role: userRole,
      storeId,
    };
  };

  // Supabase Auth Listener & Persistent Session Initialization
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(async ({ data: { session }, error }) => {
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
          }
        } else {
          setUser(null);
        }
        setIsAuthLoading(false);
      }).catch(() => {
        setIsAuthLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          try {
            const parsedUser = await buildUserFromSession(session.user);
            setUser(parsedUser);
            setRole(parsedUser.role);
          } catch (e) {
            console.error('Error during onAuthStateChange user sync:', e);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('goamaas_user');
        }
        setIsAuthLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    setStored('user', user);
    if (user) {
      setRole(user.role);
    }
  }, [user]);

  const setAuthenticatedUser = (newUser: User) => {
    setUser(newUser);
    setRole(newUser.role);
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

    const { user: authUser, session, error } = await signInWithEmail(email, password);
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

    const { user: authUser, session, needsEmailConfirmation, error } = await signUpWithEmail(
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

    // Upsert initial profile into Supabase PostgreSQL
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

    if (needsEmailConfirmation) {
      showToast('Registration successful! Please check your email to verify your account.', 'info');
      return { user: null, needsEmailConfirmation: true, error: null };
    }

    const parsedUser: User = {
      id: authUser.id,
      name: name.trim(),
      email: email.trim(),
      role: 'merchant',
      storeId: `store-${authUser.id.substring(0, 8)}`,
    };

    setUser(parsedUser);
    setRole('merchant');
    updateOnboarding({ businessName, completed: false });

    // Initialize their real store in merchant catalogue
    const newStore: Store = {
      id: parsedUser.storeId,
      name: businessName,
      slug: businessName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      category: 'General E-Commerce',
      currency: '৳',
      phone: '',
      address: '',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setStores([newStore]);
    setActiveStoreIdState(newStore.id);

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
    setUser(null);
    localStorage.removeItem('goamaas_user');
    showToast('Signed out of GoAMAAS session', 'info');
  };

  const switchRole = (newRole: UserRole) => {
    setRole(newRole);
    if (user) {
      setUser({ ...user, role: newRole });
    }
    showToast(`Switched view to ${newRole.toUpperCase()} mode`, 'info');
  };

  // Real Stores (tied to authenticated user)
  const [stores, setStores] = useState<Store[]>(() => getStored('stores', INITIAL_STORES));
  const [activeStoreId, setActiveStoreIdState] = useState<string>(() => getStored('activeStoreId', ''));

  useEffect(() => {
    setStored('stores', stores);
  }, [stores]);

  useEffect(() => {
    setStored('activeStoreId', activeStoreId);
  }, [activeStoreId]);

  // Clean fallback store to prevent undefined errors in UI components
  const fallbackStore: Store = {
    id: user?.storeId || 'default-store',
    name: user?.name ? `${user.name}'s Store` : 'My Store',
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
    setStores((prev) => {
      const exists = prev.some((s) => s.id === activeStore.id);
      if (exists) {
        return prev.map((s) => (s.id === activeStore.id ? { ...s, ...updated } : s));
      }
      return [{ ...activeStore, ...updated }];
    });
    showToast('Store settings updated successfully', 'success');
  };

  // Onboarding
  const [onboarding, setOnboarding] = useState<OnboardingData>(() => getStored('onboarding', INITIAL_ONBOARDING));

  useEffect(() => {
    setStored('onboarding', onboarding);
  }, [onboarding]);

  const updateOnboarding = (data: Partial<OnboardingData>) => {
    setOnboarding((prev) => ({ ...prev, ...data }));
  };

  const completeOnboarding = async () => {
    setOnboarding((prev) => ({ ...prev, completed: true }));
    if (user && isSupabaseConfigured && supabase) {
      const { error: profileError } = await upsertUserProfile({
        id: user.id,
        onboarding_completed: true,
        store_id: activeStoreId || undefined,
      });
      if (profileError) {
        console.error('Failed to update profile onboarding status:', profileError);
        showToast('Warning: Profile update failed: ' + profileError.message, 'warning');
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { onboarding_completed: true, store_id: activeStoreId || undefined },
      });
      if (authError) {
        console.error('Failed to update auth metadata onboarding status:', authError);
      }
    }
    showToast('Onboarding completed! Welcome to your dashboard.', 'success');
  };

  // Products (Real user catalog)
  const [products, setProducts] = useState<Product[]>(() => getStored('products', INITIAL_PRODUCTS));
  useEffect(() => setStored('products', products), [products]);

  const addProduct = (prodData: Omit<Product, 'id' | 'salesCount' | 'rating'>) => {
    const newProduct: Product = {
      ...prodData,
      id: `prod-${Date.now()}`,
      salesCount: 0,
      rating: 5.0,
    };
    setProducts((prev) => [newProduct, ...prev]);
    showToast(`Added product "${prodData.name}"`, 'success');
  };

  const updateProduct = (id: string, updated: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    showToast('Product details updated', 'success');
  };

  const deleteProduct = (id: string) => {
    const prod = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    showToast(`Deleted product "${prod?.name || id}"`, 'info');
  };

  const adjustProductStock = (id: string, delta: number, reason: string) => {
    const prod = products.find((p) => p.id === id);
    if (!prod) return;

    const previousStock = prod.stock;
    const newStock = Math.max(0, previousStock + delta);

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: newStock } : p))
    );

    const log: InventoryMovement = {
      id: `inv-${Date.now()}`,
      productId: id,
      productName: prod.name,
      sku: prod.sku,
      type: delta > 0 ? 'restock' : 'adjustment',
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

  // Orders (Real user orders)
  const [orders, setOrders] = useState<Order[]>(() => getStored('orders', INITIAL_ORDERS));
  useEffect(() => setStored('orders', orders), [orders]);

  const addOrder = (orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>) => {
    const orderNum = `ORD-${Date.now().toString().slice(-6)}`;
    const newOrder: Order = {
      ...orderData,
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [newOrder, ...prev]);

    // Update customer records and product sales counts
    orderData.items.forEach((item) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.productId
            ? { ...p, salesCount: (p.salesCount || 0) + item.quantity }
            : p
        )
      );
    });

    // Check if customer exists
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
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    showToast(`Order status updated to "${status}"`, 'info');
  };

  const updateOrderPaymentStatus = (id: string, paymentStatus: PaymentStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, paymentStatus } : o)));
    showToast(`Payment status updated to "${paymentStatus}"`, 'info');
  };

  const updateOrderTracking = (id: string, courierName: string, trackingCode: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              courierName,
              trackingCode,
              status: o.status === 'pending' ? 'shipped' : o.status,
            }
          : o
      )
    );
    showToast(`Consignment ${trackingCode} assigned to ${courierName}`, 'success');
  };

  // Customers (Real user customer list)
  const [customers, setCustomers] = useState<Customer[]>(() => getStored('customers', INITIAL_CUSTOMERS));
  useEffect(() => setStored('customers', customers), [customers]);

  const addCustomer = (
    custData: Omit<Customer, 'id' | 'totalSpent' | 'ordersCount' | 'lastOrderDate' | 'createdAt'>
  ) => {
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
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
  };

  const deleteCustomer = (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    showToast('Customer record removed', 'info');
  };

  const addCustomerNote = (id: string, note: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, notes: note } : c))
    );
    showToast('Customer note updated', 'success');
  };

  // Inventory Logs
  const [inventoryLogs, setInventoryLogs] = useState<InventoryMovement[]>(() =>
    getStored('inventoryLogs', INITIAL_INVENTORY_LOGS)
  );
  useEffect(() => setStored('inventoryLogs', inventoryLogs), [inventoryLogs]);

  // Landing Page Builder
  const [landingPages, setLandingPages] = useState<LandingPage[]>(() =>
    getStored('landingPages', INITIAL_LANDING_PAGES)
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
    getStored('automations', INITIAL_AUTOMATIONS)
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
    getStored('websiteRequests', INITIAL_WEBSITE_REQUESTS)
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
    getStored('subscribedWebsites', INITIAL_SUBSCRIBED_WEBSITES)
  );

  useEffect(() => {
    setStored('websiteSubscriptionPlan', websiteSubscriptionPlan);
  }, [websiteSubscriptionPlan]);

  useEffect(() => {
    setStored('subscribedWebsites', subscribedWebsites);
  }, [subscribedWebsites]);

  const updateWebsiteSubscriptionPlanConfig = (updates: Partial<WebsiteSubscriptionPlanConfig>) => {
    setWebsiteSubscriptionPlan((prev) => ({ ...prev, ...updates }));
    showToast('Website subscription plan configuration updated', 'success');
  };

  const checkSubdomainAvailability = (rawSubdomain: string, excludeId?: string): { available: boolean; reason?: string } => {
    const clean = rawSubdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (!clean) {
      return { available: false, reason: 'Subdomain cannot be empty.' };
    }
    if (clean.length < 3) {
      return { available: false, reason: 'Subdomain must be at least 3 characters long.' };
    }
    if (clean.length > 30) {
      return { available: false, reason: 'Subdomain cannot exceed 30 characters.' };
    }
    const reservedWords = [
      'admin', 'api', 'app', 'billing', 'dashboard', 'amaas', 'auth',
      'support', 'staging', 'test', 'demo', 'www', 'root', 'mail', 'ns1', 'ns2',
    ];
    if (reservedWords.includes(clean)) {
      return { available: false, reason: `"${clean}" is a reserved system keyword.` };
    }
    const isTaken = subscribedWebsites.some(
      (w) => w.subdomain.toLowerCase() === clean && w.id !== excludeId
    );
    if (isTaken) {
      return { available: false, reason: `"${clean}.amaas.xyz" is already registered by another merchant.` };
    }
    return { available: true };
  };

  const createSubscribedWebsite = (
    data: Omit<SubscribedWebsite, 'id' | 'createdAt' | 'lastUpdatedAt' | 'resourceUsage'>
  ): SubscribedWebsite => {
    const cleanSub = data.subdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const nextBillingDate = nextMonth.toISOString().split('T')[0];

    const newSite: SubscribedWebsite = {
      ...data,
      id: `site-${Date.now()}`,
      subdomain: cleanSub,
      fullDomainUrl: `${cleanSub}.amaas.xyz`,
      monthlyFee: websiteSubscriptionPlan.priceMonthly,
      subscriptionStatus: 'active',
      paymentStatus: 'pending', // Verified payment approval required before publishing
      deploymentStatus: 'provisioning',
      sslStatus: 'pending',
      nextBillingDate,
      createdAt: today,
      lastUpdatedAt: today,
      resourceUsage: {
        pagesCount: 0,
        pagesLimit: websiteSubscriptionPlan.limits.maxPages,
        storageUsedMb: 0,
        storageLimitMb: websiteSubscriptionPlan.limits.maxStorageMb,
        bandwidthUsedGb: 0,
        bandwidthLimitGb: websiteSubscriptionPlan.limits.maxBandwidthGb,
        monthlyUpdatesUsed: 0,
        monthlyUpdatesLimit: websiteSubscriptionPlan.limits.monthlyUpdateRequests,
      },
    };

    setSubscribedWebsites((prev) => [newSite, ...prev]);

    // Record invoice
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-AMAAS-SUB-${Math.floor(1000 + Math.random() * 9000)}`,
      date: today,
      planName: `AMAAS Website Lite (${cleanSub}.amaas.xyz)`,
      amount: websiteSubscriptionPlan.priceMonthly,
      status: 'Pending',
    };
    setInvoices((prev) => [newInvoice, ...prev]);

    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: 'Website Created — Payment Approval Pending',
      message: `Your business website "${newSite.businessName}" was created. Please submit payment verification to publish live at ${newSite.fullDomainUrl}.`,
      type: 'billing',
      read: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [notif, ...prev]);

    showToast(`Website "${newSite.businessName}" created! Submit payment to publish live.`, "info");
    return newSite;
  };

  const updateSubscribedWebsite = (id: string, updates: Partial<SubscribedWebsite>) => {
    const today = new Date().toISOString().split('T')[0];
    setSubscribedWebsites((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates, lastUpdatedAt: today } : w))
    );
    if (isSupabaseConfigured) {
      updateClientWebsiteInDb(id, updates).catch((err) => {
        console.warn('[GoAMAAS Website] Failed to sync update to database:', err);
      });
    }
    showToast('Website configuration saved successfully', 'success');
  };

  const renewSubscribedWebsite = (id: string) => {
    const site = subscribedWebsites.find((w) => w.id === id);
    if (!site) return;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const formattedNext = nextDate.toISOString().split('T')[0];

    updateSubscribedWebsite(id, {
      subscriptionStatus: 'active',
      paymentStatus: 'paid',
      nextBillingDate: formattedNext,
      gracePeriodEndsAt: undefined,
    });
    showToast(`Subscription renewed for 30 days until ${formattedNext}`, 'success');
  };

  const suspendSubscribedWebsite = (id: string, reason = 'Administrative action') => {
    updateSubscribedWebsite(id, {
      subscriptionStatus: 'suspended',
      deploymentStatus: 'suspended',
      notes: reason,
    });
    showToast(`Website has been suspended: ${reason}`, 'warning');
  };

  const reactivateSubscribedWebsite = (id: string) => {
    updateSubscribedWebsite(id, {
      subscriptionStatus: 'active',
      deploymentStatus: 'live',
      notes: undefined,
    });
    showToast('Website has been reactivated and brought online', 'success');
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
  const [currentPlan, setCurrentPlan] = useState<'STARTER' | 'BUSINESS' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [trialDaysLeft, setTrialDaysLeft] = useState<number>(7);
  const [invoices, setInvoices] = useState<Invoice[]>(() => getStored('invoices', INITIAL_INVOICES));
  useEffect(() => setStored('invoices', invoices), [invoices]);

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
  const INITIAL_GATEWAY_CONFIGS: PaymentGatewayConfig[] = [
    {
      id: 'bkash',
      displayName: 'bKash Personal (Send Money)',
      isEnabled: true,
      accountNumber: '+8801822332020',
      accountName: 'AMAAS Official Merchant',
      instructions: 'Send Money the exact payable amount to this personal bKash number, then submit your transaction ID below.',
    },
    {
      id: 'nagad',
      displayName: 'Nagad Personal (Send Money)',
      isEnabled: false,
      accountNumber: '',
      instructions: 'Nagad payment channel is currently being provisioned. Please use bKash or Bank Transfer.',
    },
    {
      id: 'bank_transfer',
      displayName: 'Official Bank Transfer',
      isEnabled: true,
      bankName: 'City Bank PLC',
      accountName: 'AMAAS TECHNOLOGIES',
      accountNumber: '1503892019001',
      branchName: 'Gulshan Avenue Branch',
      routingNumber: '225261783',
      instructions: 'Deposit or transfer the exact payable amount. Send your deposit receipt or transfer screenshot to our official WhatsApp contact for manual clearance.',
    },
    {
      id: 'whatsapp_support',
      displayName: 'Official WhatsApp Billing & Domain Support',
      isEnabled: true,
      accountNumber: '+8801822332020',
      instructions: 'Contact for instant manual verification, bank receipts, and custom domain setup.',
    },
  ];

  const [paymentGatewayConfigs, setPaymentGatewayConfigs] = useState<PaymentGatewayConfig[]>(() =>
    getStored('payment_gateway_configs', INITIAL_GATEWAY_CONFIGS)
  );
  useEffect(() => setStored('payment_gateway_configs', paymentGatewayConfigs), [paymentGatewayConfigs]);

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
    }

    setSubscribedWebsites((prev) =>
      prev.map((s) => (s.id === websiteId ? { ...s, deploymentStatus: 'live', subscriptionStatus: 'active' } : s))
    );
    showToast(`🎉 Website published! Accessible at https://${site.fullDomainUrl}`, 'success');
    return { success: true, message: 'Website published successfully' };
  };

  const unpublishWebsite = async (websiteId: string): Promise<{ success: boolean; message: string }> => {
    setSubscribedWebsites((prev) =>
      prev.map((s) => (s.id === websiteId ? { ...s, deploymentStatus: 'suspended' } : s))
    );
    if (isSupabaseConfigured) {
      await unpublishClientWebsiteInDb(websiteId);
    }
    showToast('Website unpublished. Public visitors will see the maintenance notice.', 'info');
    return { success: true, message: 'Website unpublished' };
  };

  const resolvePublicWebsite = async (subdomain: string): Promise<{ site: SubscribedWebsite | null; notFound: boolean }> => {
    const clean = subdomain.toLowerCase().trim();
    // 1. Check local state first
    const local = subscribedWebsites.find((s) => s.subdomain.toLowerCase() === clean);
    if (local && local.deploymentStatus === 'live' && local.paymentStatus === 'paid') {
      return { site: local, notFound: false };
    }

    // 2. Fetch from Supabase
    if (isSupabaseConfigured) {
      const { data, notFound } = await fetchPublishedWebsiteBySubdomain(clean);
      if (data) {
        const mapped: SubscribedWebsite = {
          id: data.id || `site-${data.subdomain}`,
          storeId: data.storeId || data.store_id || 'store-tenant',
          businessName: data.businessName || data.business_name || 'Business',
          ownerName: data.ownerName || 'Merchant',
          email: data.email || data.config?.email || '',
          phone: data.phone || data.config?.phone || '',
          niche: data.niche || 'ecommerce',
          nicheLabel: data.nicheLabel || data.template_name || 'Business Storefront',
          templateId: data.templateId || data.template_id || data.config?.templateId || 'tpl-modern-business',
          templateName: data.templateName || data.template_name || 'Modern Executive',
          subdomain: data.subdomain,
          fullDomainUrl: data.fullDomainUrl || data.full_domain || `${data.subdomain}.amaas.xyz`,
          brandColor: data.brandColor || data.config?.brandColor || '#2563EB',
          address: data.address || data.config?.address || '',
          headline: data.headline || data.config?.headline || 'Welcome to our official website',
          subheadline: data.subheadline || data.config?.subheadline || 'Explore our catalog and connect with our team.',
          aboutText: data.aboutText || data.config?.aboutText || '',
          servicesOrProducts: data.servicesOrProducts || data.config?.servicesOrProducts || data.config?.items || [],
          whatsappNumber: data.whatsappNumber || data.config?.whatsappNumber || data.phone || data.config?.phone || '',
          socialLinks: data.socialLinks || data.config?.socialLinks || {},
          planName: data.planName || data.plan_tier || 'AMAAS Website Lite',
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
            pagesLimit: 5,
            storageUsedMb: 12,
            storageLimitMb: 500,
            bandwidthUsedGb: 1.2,
            bandwidthLimitGb: 25,
            monthlyUpdatesUsed: 0,
            monthlyUpdatesLimit: 2,
          },
        };
        return { site: mapped, notFound: false };
      }
      if (notFound) return { site: null, notFound: true };
    }

    if (local) {
      return { site: local, notFound: false };
    }
    return { site: null, notFound: true };
  };

  const updatePaymentGatewayConfig = (id: string, updates: Partial<PaymentGatewayConfig>) => {
    setPaymentGatewayConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    showToast('Payment gateway configuration saved.', 'success');
  };

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>(() =>
    getStored('payment_requests', [])
  );
  const [isPaymentsLoading, setIsPaymentsLoading] = useState<boolean>(false);

  useEffect(() => {
    setStored('payment_requests', paymentRequests);
  }, [paymentRequests]);

  const refreshPaymentRequests = async () => {
    if (!user?.id || !isSupabaseConfigured) return;
    setIsPaymentsLoading(true);
    try {
      const { data, error } = await fetchUserPaymentRequests(role === 'admin' ? undefined : user.id);
      if (!error && data) {
        const mapped: PaymentRequest[] = data.map((r: RawPaymentRequestRow) => ({
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
        }));
        setPaymentRequests(mapped);
      }
    } catch (err) {
      console.warn('Failed to sync payment requests from Supabase:', err);
    } finally {
      setIsPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshPaymentRequests();
    }
  }, [user?.id, role]);

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
    if (!user?.id) {
      const msg = 'Please sign in to submit a payment request.';
      showToast(msg, 'warning');
      return { success: false, message: msg };
    }

    if (params.paymentMethod === 'Nagad') {
      const nagadConfig = paymentGatewayConfigs.find((c) => c.id === 'nagad');
      if (!nagadConfig || !nagadConfig.isEnabled || !nagadConfig.accountNumber) {
        const msg = 'Nagad payment is currently not configured or available. Please use bKash or Bank Transfer.';
        showToast(msg, 'warning');
        return { success: false, message: msg };
      }
    }

    if (isSupabaseConfigured) {
      const { data, error } = await createPaymentRequestInDb({
        userId: user.id,
        storeId: activeStoreId || undefined,
        customerName: user.name || 'Merchant',
        customerPhone: activeStore?.phone || '+880 1711-000000',
        customerEmail: user.email || '',
        ...params,
      });

      if (!error && data) {
        const newReq: PaymentRequest = {
          id: data.id,
          userId: data.user_id,
          storeId: data.store_id || undefined,
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerEmail: data.customer_email,
          serviceType: data.service_type,
          serviceId: data.service_id,
          serviceName: data.service_name,
          planTier: data.plan_tier,
          amount: Number(data.amount),
          currency: data.currency,
          paymentMethod: data.payment_method,
          transactionId: data.transaction_id || undefined,
          senderNumber: data.sender_number || undefined,
          bankName: data.bank_name || undefined,
          bankAccountName: data.bank_account_name || undefined,
          bankReference: data.bank_reference || undefined,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        setPaymentRequests((prev) => [newReq, ...prev]);
        showToast('Payment submission received! Pending manual admin verification.', 'success');
        return { success: true, message: 'Payment submitted successfully', request: newReq };
      }
    }

    // Local state fallback
    const now = new Date().toISOString();
    const fallbackReq: PaymentRequest = {
      id: `req-${Date.now()}`,
      userId: user.id,
      storeId: activeStoreId || undefined,
      customerName: user.name || 'Merchant',
      customerPhone: activeStore?.phone || '+880 1711-000000',
      customerEmail: user.email || '',
      ...params,
      status: 'pending',
      currency: '৳',
      createdAt: now,
      updatedAt: now,
    };
    setPaymentRequests((prev) => [fallbackReq, ...prev]);
    showToast('Payment submission received! Pending manual admin verification.', 'success');
    return { success: true, message: 'Payment submitted successfully', request: fallbackReq };
  };

  const adminApprovePayment = async (requestId: string, notes?: string): Promise<{ success: boolean; message: string }> => {
    if (role !== 'admin') {
      return { success: false, message: 'Unauthorized. Admin role required.' };
    }

    if (isSupabaseConfigured) {
      const { success, error } = await adminApprovePaymentInDb(requestId, notes);
      if (!success && error) {
        showToast(error.message, 'error');
        return { success: false, message: error.message };
      }
    }

    // Update local state atomically
    setPaymentRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          return {
            ...r,
            status: 'approved',
            adminNotes: notes || r.adminNotes,
            reviewedBy: user?.id,
            reviewedAt: new Date().toISOString(),
          };
        }
        return r;
      })
    );

    // If website subscription, activate website status
    const req = paymentRequests.find((r) => r.id === requestId);
    if (req && req.serviceType === 'website_subscription') {
      setSubscribedWebsites((prev) =>
        prev.map((w) => {
          if (w.id === req.serviceId || w.storeId === req.storeId) {
            return {
              ...w,
              subscriptionStatus: 'active',
              paymentStatus: 'paid',
              deploymentStatus: 'live',
              nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            };
          }
          return w;
        })
      );
    }

    showToast('Payment approved. Service subscription activated!', 'success');
    return { success: true, message: 'Payment approved successfully' };
  };

  const adminRejectPayment = async (requestId: string, reason: string): Promise<{ success: boolean; message: string }> => {
    if (role !== 'admin') {
      return { success: false, message: 'Unauthorized. Admin role required.' };
    }

    if (isSupabaseConfigured) {
      const { success, error } = await adminRejectPaymentInDb(requestId, reason);
      if (!success && error) {
        showToast(error.message, 'error');
        return { success: false, message: error.message };
      }
    }

    setPaymentRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId) {
          return {
            ...r,
            status: 'rejected',
            adminNotes: reason,
            reviewedBy: user?.id,
            reviewedAt: new Date().toISOString(),
          };
        }
        return r;
      })
    );

    showToast('Payment rejected and reason recorded.', 'info');
    return { success: true, message: 'Payment rejected' };
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

    // 2. Check if a trial record exists for this specific service
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

    // Server-side database activation in Supabase
    if (isSupabaseConfigured) {
      const { data, error, alreadyUsed } = await activateServiceTrialInDb({
        serviceId,
        serviceName,
        serviceCategory: category,
        userId: user.id,
        storeId: activeStoreId || undefined,
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
        showToast(`🎉 7-Day Free Trial activated for ${serviceName}!`, 'success');
        return { success: true, message: 'Trial activated successfully', trial: newRecord };
      }
    }

    // Local state fallback if Supabase table is not yet provisioned
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const fallbackRecord: ServiceTrialRecord = {
      id: `trial-${Date.now()}`,
      userId: user.id,
      storeId: activeStoreId || undefined,
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
    showToast(`🎉 7-Day Free Trial activated for ${serviceName}!`, 'success');
    return { success: true, message: 'Trial activated successfully', trial: fallbackRecord };
  };

  const updatePlan = (newPlan: 'STARTER' | 'BUSINESS' | 'PRO' | 'ENTERPRISE') => {
    setCurrentPlan(newPlan);
    showToast(`Upgraded subscription to ${newPlan} plan!`, 'success');
  };

  const cancelSubscription = () => {
    showToast('Subscription set to cancel at end of current billing cycle.', 'info');
  };

  // Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    getStored('teamMembers', INITIAL_TEAM_MEMBERS)
  );
  useEffect(() => setStored('teamMembers', teamMembers), [teamMembers]);

  const addTeamMember = (member: Omit<TeamMember, 'id' | 'joinedAt'>) => {
    const newMember: TeamMember = {
      ...member,
      id: `team-${Date.now()}`,
      joinedAt: new Date().toISOString().split('T')[0],
    };
    setTeamMembers((prev) => [...prev, newMember]);
    showToast(`Team invitation sent to ${member.email}`, 'success');
  };

  const removeTeamMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    showToast('Team member access revoked', 'info');
  };

  // Support Tickets
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() =>
    getStored('supportTickets', INITIAL_SUPPORT_TICKETS)
  );
  useEffect(() => setStored('supportTickets', supportTickets), [supportTickets]);

  const createSupportTicket = (
    subject: string,
    category: SupportTicket['category'],
    priority: SupportTicket['priority'],
    text: string
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const newTicket: SupportTicket = {
      id: `tkt-${Date.now()}`,
      ticketNumber: `AMAAS-${Math.floor(1000 + Math.random() * 9000)}`,
      subject,
      category,
      priority,
      status: 'open',
      createdAt: today,
      updatedAt: today,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: user?.name || (user?.email ? user.email.split('@')[0] : 'Store Merchant'),
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isStaff: false,
        },
      ],
    };
    setSupportTickets((prev) => [newTicket, ...prev]);
    showToast(`Support ticket #${newTicket.ticketNumber} created!`, 'success');
  };

  const replySupportTicket = (ticketId: string, text: string) => {
    setSupportTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          const newMsg: SupportTicketMessage = {
            id: `msg-${Date.now()}`,
            sender: user?.name || (user?.email ? user.email.split('@')[0] : 'Store Merchant'),
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isStaff: false,
          };
          return {
            ...t,
            updatedAt: new Date().toISOString().split('T')[0],
            messages: [...t.messages, newMsg],
          };
        }
        return t;
      })
    );
    showToast('Reply dispatched to ticket', 'success');
  };

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getStored('notifications', INITIAL_NOTIFICATIONS)
  );
  useEffect(() => setStored('notifications', notifications), [notifications]);

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
    setCurrentPlan('PRO');
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
        createSubscribedWebsite,
        updateSubscribedWebsite,
        renewSubscribedWebsite,
        suspendSubscribedWebsite,
        reactivateSubscribedWebsite,
        checkSubdomainAvailability,
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
        adminRejectPayment,
        refreshPaymentRequests,
        updatePaymentGatewayConfig,
        publishWebsite,
        unpublishWebsite,
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
