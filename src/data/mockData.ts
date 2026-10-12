import {
  Product,
  Order,
  Customer,
  InventoryMovement,
  LandingPage,
  AIAutomation,
  WebsiteRequest,
  TeamMember,
  SupportTicket,
  AppNotification,
  Invoice,
  Store,
  User,
  OnboardingData,
  SubscribedWebsite,
} from '../types';

/**
 * Initial empty schemas for real GoAMAAS user records.
 * All fake/invented records (fake users, fake sales, fake orders, dummy customers, fake websites) have been removed.
 */

export const INITIAL_STORES: Store[] = [];

export const INITIAL_USER: User | null = null;

export const INITIAL_ONBOARDING: OnboardingData = {
  businessName: '',
  businessType: '',
  category: '',
  phone: '',
  city: '',
  productsOffered: '',
  primaryGoal: '',
  completed: false,
};

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_INVENTORY_LOGS: InventoryMovement[] = [];

export const INITIAL_LANDING_PAGES: LandingPage[] = [];

export const INITIAL_AUTOMATIONS: AIAutomation[] = [];

export const INITIAL_WEBSITE_REQUESTS: WebsiteRequest[] = [];

export const INITIAL_TEAM_MEMBERS: TeamMember[] = [];

export const INITIAL_SUPPORT_TICKETS: SupportTicket[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

export const INITIAL_SUBSCRIBED_WEBSITES: SubscribedWebsite[] = [];
