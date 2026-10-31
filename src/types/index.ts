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
  websiteId?: string;
  isVisible?: boolean;
  sortOrder?: number;
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
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
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
  status: 'Paid' | 'Pending' | 'Failed';
  downloadUrl?: string;
}

export interface OnboardingData {
  businessName: string;
  businessType: string;
  category: string;
  currency?: string;
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
  | 'fashion'
  | 'gym'
  | 'salon'
  | 'clinic'
  | 'real_estate'
  | 'architecture'
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

export type WebsiteSectionType =
  | 'hero'
  | 'banner'
  | 'about'
  | 'highlights'
  | 'products'
  | 'testimonials'
  | 'faq'
  | 'contact';

export interface WebsiteSectionItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  role?: string;
  imageUrl?: string;
}

export interface WebsiteSectionConfig {
  id: string;
  type: WebsiteSectionType;
  title: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaLink?: string;
  enabled: boolean;
  order: number;
  items?: WebsiteSectionItem[];
}

export interface WebsiteThemeSettings {
  paletteId?: string;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  fontStyle?: 'modern' | 'editorial' | 'bold' | 'minimal';
  buttonStyle?: 'rounded' | 'pill' | 'sharp';
  heroLayout?: 'split' | 'centered' | 'cover';
}

export interface WebsiteCustomLink {
  id: string;
  label: string;
  url: string;
}

export interface WebsiteProductItem {
  id: string;
  productId?: string;
  name: string;
  price?: string;
  priceNumeric?: number;
  description: string;
  imageUrl?: string;
  category?: string;
  isVisible?: boolean;
}

export interface WebsiteEditableFields {
  businessName?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  headline?: string;
  subheadline?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bannerImageUrl?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCtaText?: string;
  bannerCtaLink?: string;
  aboutText?: string;
  phone?: string;
  email?: string;
  address?: string;
  whatsappNumber?: string;
  brandColor?: string;
  templateId?: string;
  templateName?: string;
  servicesOrProducts?: WebsiteProductItem[];
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  customLinks?: WebsiteCustomLink[];
  sections?: WebsiteSectionConfig[];
  themeSettings?: WebsiteThemeSettings;
  customDomain?: string;
}

export interface SubscribedWebsite {
  id: string;
  userId?: string;
  storeId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  niche: BusinessNiche;
  nicheLabel: string;
  templateId: string;
  templateName: string;
  subdomain: string; // e.g. "urbanfashion"
  fullDomainUrl: string; // "urbanfashion.amaas.xyz"
  customDomain?: string;
  brandColor: string;
  logoUrl?: string;
  heroImageUrl?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bannerImageUrl?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCtaText?: string;
  bannerCtaLink?: string;
  address: string;
  headline: string;
  subheadline: string;
  aboutText: string;
  servicesOrProducts: WebsiteProductItem[];
  whatsappNumber: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  customLinks?: WebsiteCustomLink[];
  sections?: WebsiteSectionConfig[];
  themeSettings?: WebsiteThemeSettings;
  hasUnpublishedDraft?: boolean;
  draftConfig?: WebsiteEditableFields;
  planName: string; // 'GoAMAAS Website'
  monthlyFee: number; // 600
  subscriptionStatus: 'active' | 'grace_period' | 'past_due' | 'suspended' | 'cancelled' | 'draft';
  paymentStatus: 'paid' | 'pending' | 'failed' | 'pending_review';
  deploymentStatus:
    | 'live'
    | 'deploying'
    | 'ready'
    | 'provisioning'
    | 'maintenance'
    | 'suspended'
    | 'draft'
    | 'failed';
  sslStatus: 'active' | 'pending';
  nextBillingDate: string;
  gracePeriodEndsAt?: string;
  createdAt: string;
  lastUpdatedAt: string;
  resourceUsage: WebsiteResourceUsage;
  notes?: string;
}

export interface CreateSubscribedWebsiteInput {
  storeId?: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  niche: BusinessNiche;
  nicheLabel: string;
  templateId: string;
  templateName: string;
  subdomain: string;
  customDomain?: string;
  brandColor: string;
  logoUrl?: string;
  heroImageUrl?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bannerImageUrl?: string;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCtaText?: string;
  bannerCtaLink?: string;
  address: string;
  headline: string;
  subheadline: string;
  aboutText: string;
  servicesOrProducts: WebsiteProductItem[];
  whatsappNumber: string;
  socialLinks: SubscribedWebsite['socialLinks'];
  customLinks?: WebsiteCustomLink[];
  sections?: WebsiteSectionConfig[];
  themeSettings?: WebsiteThemeSettings;
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

// ==============================================================================
// Service Trials System (Independent 7-Day Free Trial For Every Service)
// ==============================================================================
export type ServiceTrialCategory = 'dashboard' | 'ai_automation' | 'website' | 'landing_pages';

export type ServiceTrialStatus = 'active' | 'expired' | 'converted';

export interface ServiceTrialRecord {
  id: string;
  userId: string;
  storeId?: string | null;
  serviceId: string;
  serviceName: string;
  serviceCategory: ServiceTrialCategory;
  status: ServiceTrialStatus;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAccessStatus {
  serviceId: string;
  serviceName: string;
  serviceCategory: ServiceTrialCategory;
  status: 'available' | 'trial_active' | 'trial_expired' | 'subscribed';
  hasAccess: boolean;
  trialRecord?: ServiceTrialRecord;
  daysRemaining?: number;
  hoursRemaining?: number;
  formattedExpiresAt?: string;
  isExpired: boolean;
}

// ==============================================================================
// Payment Requests & Gateways System
// ==============================================================================
export type PaymentMethodType = 'bKash' | 'Nagad' | 'Bank Transfer';

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRequest {
  id: string;
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
  currency: string;
  paymentMethod: PaymentMethodType;
  transactionId?: string;
  senderNumber?: string;
  bankName?: string;
  bankAccountName?: string;
  bankReference?: string;
  status: PaymentRequestStatus;
  adminNotes?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentGatewayConfig {
  id: 'bkash' | 'nagad' | 'bank_transfer' | 'whatsapp_support';
  displayName: string;
  isEnabled: boolean;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  branchName?: string;
  routingNumber?: string;
  instructions: string;
}

export interface ServicePricingCatalogEntry {
  serviceType: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
  serviceCode: string;
  planTierLabel: string;
  priceBdt: number;
  setupFeeBdt: number;
  isActive: boolean;
  updatedAt?: string;
}

export interface WebsiteLifecycleAuditLog {
  id: string;
  websiteId: string;
  adminId: string;
  action: 'suspend' | 'reactivate' | 'renew';
  reason: string;
  verifiedPaymentRequestId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  previousDeploymentStatus?: string | null;
  newDeploymentStatus?: string | null;
  paymentStatusSnapshot?: string | null;
  previousPeriodEnd?: string | null;
  newPeriodEnd?: string | null;
  createdAt: string;
}

export interface AdminPaymentApprovalRpcResult {
  success: boolean;
  code?: string;
  message: string;
  requestId?: string;
  websiteId?: string;
  autoPublished?: boolean;
  deploymentStatus?: SubscribedWebsite['deploymentStatus'];
  currentPeriodEnd?: string;
  gracePeriodEnd?: string;
  error: Error | null;
}

export interface ApproveAndPublishResult {
  success: boolean;
  paymentApproved: boolean;
  websitePublished: boolean;
  isWebsiteService: boolean;
  partialFailure?: boolean;
  suspendedHold?: boolean;
  websiteId?: string;
  subdomain?: string;
  fullDomainUrl?: string;
  deploymentStatus?: SubscribedWebsite['deploymentStatus'];
  subscriptionStatus?: SubscribedWebsite['subscriptionStatus'];
  paymentStatus?: SubscribedWebsite['paymentStatus'];
  code?: string;
  message: string;
}
