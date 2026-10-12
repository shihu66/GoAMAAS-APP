export type UserRole = 'merchant' | 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  storeId: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  category: string;
  currency: string;
  logo?: string;
  phone: string;
  address: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  status: 'active' | 'draft' | 'archived';
  description: string;
  rating: number;
  salesCount: number;
  image?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  sku: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  discount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: 'Cash on Delivery (COD)' | 'bKash' | 'Nagad' | 'Card' | 'Bank Transfer';
  shippingAddress: string;
  city: string;
  notes?: string;
  courierName?: string;
  trackingCode?: string;
  source?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  totalSpent: number;
  ordersCount: number;
  lastOrderDate: string;
  notes: string;
  status: 'active' | 'vip' | 'inactive';
  tags: string[];
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: 'restock' | 'sale' | 'adjustment' | 'return';
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  operator: string;
  date: string;
}

export interface LandingPageSection {
  hero: boolean;
  features: boolean;
  productHighlight: boolean;
  pricing: boolean;
  reviews: boolean;
  faq: boolean;
  contact: boolean;
}

export interface LandingPage {
  id: string;
  title: string;
  slug: string;
  templateId: 'fashion-chic' | 'tech-launch' | 'artisan-craft' | 'direct-order';
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
  themeColor: string;
  status: 'published' | 'draft';
  visitors: number;
  conversions: number;
  sections: LandingPageSection;
  updatedAt: string;
}

export interface AIAutomation {
  id: string;
  name: string;
  channel: 'WhatsApp' | 'Messenger' | 'SMS' | 'Email';
  description: string;
  status: 'active' | 'paused' | 'draft';
  trigger: string;
  action: string;
  executionCount: number;
  successRate: number;
  lastTriggered: string;
  config: {
    welcomeMessage?: string;
    autoReplyDelaySec?: number;
    fallbackEmail?: string;
    keywords?: string[];
  };
}

export interface WebsiteRequest {
  id: string;
  businessName: string;
  businessCategory: string;
  desiredType: 'E-Commerce Store' | 'Corporate Showcase' | 'Custom Web App' | 'Wholesale B2B';
  requiredFeatures: string[];
  budgetTier: 'Starter Website (৳8,000)' | 'Business Website (৳15,000)' | 'Advanced Website (৳25,000)' | string;
  contactName: string;
  phone: string;
  email: string;
  description: string;
  status: 'Pending' | 'Reviewing' | 'In Progress' | 'Completed';
  domainIncluded: boolean;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'staff';
  status: 'active' | 'invited';
  avatar?: string;
  joinedAt: string;
}

export interface SupportTicketMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isStaff: boolean;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: 'Billing' | 'Technical' | 'Integration' | 'Website Service' | 'General';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved';
  messages: SupportTicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'order' | 'inventory' | 'system' | 'billing';
  read: boolean;
  link?: string;
  timestamp: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  planName: string;
  amount: number;
  status: 'Paid' | 'Pending';
  downloadUrl?: string;
}

export interface OnboardingData {
  businessName: string;
  businessType: string;
  category: string;
  phone: string;
  city: string;
  productsOffered: string;
  primaryGoal: string;
  completed: boolean;
}

export type BusinessNiche =
  | 'restaurant'
  | 'cafe'
  | 'ecommerce'
  | 'gym'
  | 'salon'
  | 'real_estate'
  | 'agency'
  | 'portfolio'
  | 'other';

export interface WebsiteResourceUsage {
  pagesCount: number;
  pagesLimit: number;
  storageUsedMb: number;
  storageLimitMb: number;
  bandwidthUsedGb: number;
  bandwidthLimitGb: number;
  monthlyUpdatesUsed: number;
  monthlyUpdatesLimit: number;
}

export interface SubscribedWebsite {
  id: string;
  storeId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  niche: BusinessNiche;
  nicheLabel: string;
  templateId: string;
  templateName: string;
  subdomain: string; // e.g. "dhakabistro"
  fullDomainUrl: string; // "dhakabistro.amaas.xyz"
  brandColor: string;
  logoUrl?: string;
  address: string;
  headline: string;
  subheadline: string;
  aboutText: string;
  servicesOrProducts: Array<{
    id: string;
    name: string;
    price?: string;
    description: string;
    imageUrl?: string;
  }>;
  whatsappNumber: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
  };
  planName: string; // 'AMAAS Website Lite'
  monthlyFee: number; // 600
  subscriptionStatus: 'active' | 'grace_period' | 'past_due' | 'suspended';
  paymentStatus: 'paid' | 'pending' | 'failed';
  deploymentStatus: 'live' | 'provisioning' | 'maintenance' | 'suspended';
  sslStatus: 'active' | 'pending';
  nextBillingDate: string;
  gracePeriodEndsAt?: string;
  createdAt: string;
  lastUpdatedAt: string;
  resourceUsage: WebsiteResourceUsage;
  notes?: string;
}

export interface WebsiteSubscriptionPlanConfig {
  id: string;
  name: string;
  priceMonthly: number;
  badge: string;
  subtitle: string;
  description: string;
  subdomainFormat: string;
  features: string[];
  limits: {
    maxPages: number;
    maxStorageMb: number;
    maxBandwidthGb: number;
    monthlyUpdateRequests: number;
    gracePeriodDays: number;
  };
  disclosures: string[];
  isVisible: boolean;
}
