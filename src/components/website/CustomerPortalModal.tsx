import React, { useEffect, useState, useCallback } from 'react';
import {
  CustomerPortalProfile,
  CustomerSavedAddress,
  Order,
  SubscribedWebsite,
  User,
} from '../../types';
import {
  fetchCustomerOrderDetailFromPortal,
  fetchCustomerOrdersFromPortal,
  fetchCustomerProfileFromPortal,
  StorefrontLang,
  updateCustomerProfileInPortal,
} from '../../lib/customerPortal';
import { CustomerOrderTracker } from './CustomerOrderTracker';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';

export type CustomerPortalTab = 'orders' | 'track' | 'account';

interface CustomerPortalModalProps {
  isOpen: boolean;
  initialTab?: CustomerPortalTab;
  initialOrderQuery?: string | null;
  site: Partial<SubscribedWebsite>;
  subdomain: string;
  user: User | null;
  accessToken: string | null;
  lang: StorefrontLang;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onProfileSynced?: (profile: CustomerPortalProfile) => void;
  onOpenInvoice: (order: Order) => void;
  onStartBusiness?: () => Promise<void> | void;
}

const PORTAL_COPY = {
  en: {
    signInTitle: 'Customer Account',
    signInSubtitle: 'Sign in with Google to access your saved delivery addresses, cart across devices, order history, and downloadable invoices.',
    googleBtn: 'Continue with Google',
    guestNote: 'Prefer guest checkout? You can add items and place orders without signing in.',
    tabs: {
      orders: 'My Orders',
      account: 'My Account',
    },
    backToOrders: 'Back to Orders',
    noOrders: 'You have not placed any orders with this store yet.',
    browseCatalog: 'Browse Products',
    loadingOrders: 'Loading your orders...',
    trackBtn: 'Track',
    invoiceBtn: 'Invoice',
    profileSection: 'Personal Details',
    fullName: 'Full Name',
    emailLabel: 'Google Email',
    phoneLabel: 'Phone Number',
    saveProfile: 'Save Profile',
    saving: 'Saving...',
    savedToast: 'Profile updated successfully.',
    addressesTitle: 'Saved Delivery Addresses',
    addAddressBtn: 'Add New Address',
    addressLabel: 'Label (e.g. Home, Office)',
    recipientName: 'Recipient Name',
    addressPhone: 'Phone Number',
    streetAddress: 'Full Address',
    cityLabel: 'District / City',
    areaLabel: 'Area / Thana',
    setDefault: 'Default Address',
    saveAddress: 'Save Address',
    cancel: 'Cancel',
    noAddresses: 'No saved addresses yet.',
    signOut: 'Sign Out',
    startBusinessTitle: 'Ready to Start Your Own Business?',
    startBusinessDescription:
      'Turn your business idea into reality. Create your own branded website and manage your business with GoAMAAS.',
    startBusinessCta: 'Start Your Business',
    startingBusiness: 'Opening Setup...',
    poweredByBadge: 'GoAMAAS Merchant Platform',
  },
  bn: {
    signInTitle: 'গ্রাহক অ্যাকাউন্ট',
    signInSubtitle: 'আপনার অর্ডার ইতিহাস, লাইভ ট্র্যাকিং, ডাউনলোডযোগ্য ইনভয়েস এবং সংরক্ষিত ঠিকানা ব্যবহার করতে Google দিয়ে সাইন ইন করুন।',
    googleBtn: 'Google দিয়ে চালিয়ে যান',
    guestNote: 'অথবা অতিথি হিসেবেই লগইন ছাড়া সরাসরি অর্ডার সম্পন্ন করতে পারেন।',
    tabs: {
      orders: 'আমার অর্ডার',
      account: 'আমার অ্যাকাউন্ট',
    },
    backToOrders: 'সব অর্ডারে ফিরুন',
    noOrders: 'এই দোকানে আপনার এখনো কোনো অর্ডার নেই।',
    browseCatalog: 'পণ্য দেখুন',
    loadingOrders: 'আপনার অর্ডার লোড হচ্ছে...',
    trackBtn: 'ট্র্যাক করুন',
    invoiceBtn: 'ইনভয়েস',
    profileSection: 'ব্যক্তিগত তথ্য',
    fullName: 'পুরো নাম',
    emailLabel: 'ইমেইল',
    phoneLabel: 'মোবাইল নম্বর',
    saveProfile: 'প্রোফাইল সেভ করুন',
    saving: 'সেভ হচ্ছে...',
    savedToast: 'আপনার তথ্য আপডেট করা হয়েছে।',
    addressesTitle: 'সংরক্ষিত ডেলিভারি ঠিকানা',
    addAddressBtn: 'নতুন ঠিকানা যোগ করুন',
    addressLabel: 'ঠিকানার নাম (যেমন: বাসা, অফিস)',
    recipientName: 'প্রাপকের নাম',
    addressPhone: 'মোবাইল নম্বর',
    streetAddress: 'বিস্তারিত ঠিকানা',
    cityLabel: 'জেলা / শহর',
    areaLabel: 'এলাকা / থানা',
    setDefault: 'প্রধান ঠিকানা',
    saveAddress: 'ঠিকানা সেভ করুন',
    cancel: 'বাতিল',
    noAddresses: 'এখনো কোনো ঠিকানা সেভ করা হয়নি।',
    signOut: 'সাইন আউট',
    startBusinessTitle: 'নিজের ব্যবসা শুরু করতে প্রস্তুত?',
    startBusinessDescription:
      'আপনার ব্যবসার আইডিয়াকে বাস্তবে রূপ দিন। GoAMAAS-এ নিজের ব্র্যান্ডেড ওয়েবসাইট তৈরি করুন এবং সহজেই ব্যবসা পরিচালনা করুন।',
    startBusinessCta: 'ব্যবসা শুরু করুন',
    startingBusiness: 'চালু হচ্ছে...',
    poweredByBadge: 'GoAMAAS মার্চেন্ট প্ল্যাটফর্ম',
  },
};

export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  isOpen,
  initialTab = 'orders',
  initialOrderQuery,
  site,
  subdomain,
  user,
  accessToken,
  lang,
  onClose,
  onGoogleSignIn,
  onSignOut,
  onProfileSynced,
  onOpenInvoice,
  onStartBusiness,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'account'>(
    initialTab === 'account' ? 'account' : 'orders'
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [profile, setProfile] = useState<CustomerPortalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [fullNameInput, setFullNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrRecipient, setAddrRecipient] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrCity, setAddrCity] = useState('Dhaka');
  const [addrArea, setAddrArea] = useState('');
  const [addrDefault, setAddrDefault] = useState(false);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isStartingBusiness, setIsStartingBusiness] = useState(false);

  const handleStartBusinessClick = async () => {
    if (!onStartBusiness || isStartingBusiness) return;
    setIsStartingBusiness(true);
    try {
      await onStartBusiness();
    } finally {
      setIsStartingBusiness(false);
    }
  };

  const renderStartBusinessCard = () => {
    if (!onStartBusiness) return null;
    return (
      <section
        aria-label={t.startBusinessTitle}
        className="mt-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-5 text-white shadow-md"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 text-left">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-300 tracking-wide">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{t.poweredByBadge}</span>
            </div>
            <h4 className="text-base font-extrabold text-white tracking-tight">
              {t.startBusinessTitle}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md">
              {t.startBusinessDescription}
            </p>
          </div>

          <button
            type="button"
            disabled={isStartingBusiness}
            onClick={() => void handleStartBusinessClick()}
            className="min-h-[42px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isStartingBusiness ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <StoreIcon className="w-4 h-4 shrink-0" />
            )}
            <span>{isStartingBusiness ? t.startingBusiness : t.startBusinessCta}</span>
            {!isStartingBusiness && <ArrowRight className="w-3.5 h-3.5 shrink-0" />}
          </button>
        </div>
      </section>
    );
  };

  const t = PORTAL_COPY[lang];
  const brandColor = site.themeSettings?.primaryColor || site.brandColor || '#2563EB';
  const businessName = (site.businessName || '').trim() || 'Storefront';

  useEffect(() => {
    if (!isOpen) return;
    if (initialTab === 'account') {
      setActiveTab('account');
      setSelectedOrder(null);
    } else {
      setActiveTab('orders');
    }
  }, [isOpen, initialTab]);

  const loadPortalData = useCallback(async () => {
    if (!isOpen || !accessToken || !user) return;
    setOrdersLoading(true);
    setProfileLoading(true);
    setOrdersError(null);
    try {
      const [ordRes, profRes] = await Promise.all([
        fetchCustomerOrdersFromPortal(subdomain, accessToken),
        fetchCustomerProfileFromPortal(subdomain, accessToken),
      ]);
      if (ordRes.error) {
        setOrdersError(ordRes.error.message);
      } else {
        setOrders(ordRes.orders);
        if (initialOrderQuery) {
          const match = ordRes.orders.find(
            (o) => o.id === initialOrderQuery || o.orderNumber === initialOrderQuery
          );
          if (match) {
            setSelectedOrder(match);
          } else {
            const detailRes = await fetchCustomerOrderDetailFromPortal(
              subdomain,
              initialOrderQuery,
              accessToken
            );
            if (detailRes.order) {
              setSelectedOrder(detailRes.order);
            }
          }
        }
      }

      if (profRes.profile) {
        setProfile(profRes.profile);
        setFullNameInput(profRes.profile.fullName || user.name || '');
        setPhoneInput(profRes.profile.phone || '');
        setAddrRecipient(profRes.profile.fullName || user.name || '');
        setAddrPhone(profRes.profile.phone || '');
        onProfileSynced?.(profRes.profile);
      } else {
        setFullNameInput(user.name || '');
        setAddrRecipient(user.name || '');
      }
    } finally {
      setOrdersLoading(false);
      setProfileLoading(false);
    }
  }, [isOpen, accessToken, user, subdomain, initialOrderQuery, onProfileSynced]);

  useEffect(() => {
    void loadPortalData();
  }, [loadPortalData]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await updateCustomerProfileInPortal(subdomain, accessToken, {
        fullName: fullNameInput.trim(),
        phone: phoneInput.trim(),
      });
      if (res.profile) {
        setProfile(res.profile);
        onProfileSynced?.(res.profile);
        setProfileMessage(t.savedToast);
      } else if (res.error) {
        setProfileMessage(res.error.message);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    const newAddr: CustomerSavedAddress = {
      id: `addr-${Date.now().toString(36)}`,
      label: addrLabel.trim() || 'Address',
      recipientName: addrRecipient.trim() || fullNameInput.trim() || user?.name || '',
      phone: addrPhone.trim() || phoneInput.trim(),
      shippingAddress: addrStreet.trim(),
      city: addrCity.trim() || 'Dhaka',
      deliveryArea: addrArea.trim() || undefined,
      isDefault: addrDefault || (profile?.savedAddresses?.length || 0) === 0,
    };
    const existing = profile?.savedAddresses || [];
    const nextList = [
      ...existing.map((a) => (newAddr.isDefault ? { ...a, isDefault: false } : a)),
      newAddr,
    ];

    setIsSavingProfile(true);
    try {
      const res = await updateCustomerProfileInPortal(subdomain, accessToken, {
        savedAddresses: nextList,
      });
      if (res.profile) {
        setProfile(res.profile);
        onProfileSynced?.(res.profile);
        setShowAddAddress(false);
        setAddrStreet('');
        setAddrArea('');
        setAddrDefault(false);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (!accessToken || !profile) return;
    const nextList = profile.savedAddresses.filter((a) => a.id !== addrId);
    setIsSavingProfile(true);
    try {
      const res = await updateCustomerProfileInPortal(subdomain, accessToken, {
        savedAddresses: nextList,
      });
      if (res.profile) {
        setProfile(res.profile);
        onProfileSynced?.(res.profile);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSetDefaultAddress = async (addrId: string) => {
    if (!accessToken || !profile) return;
    const nextList = profile.savedAddresses.map((a) => ({
      ...a,
      isDefault: a.id === addrId,
    }));
    setIsSavingProfile(true);
    try {
      const res = await updateCustomerProfileInPortal(subdomain, accessToken, {
        savedAddresses: nextList,
      });
      if (res.profile) {
        setProfile(res.profile);
        onProfileSynced?.(res.profile);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Merchant-themed Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {(user?.name || businessName).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 truncate">
                {user ? user.name : businessName}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {user ? user.email : t.signInTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unauthenticated Sign-In View */}
        {!user || !accessToken ? (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: brandColor }}
            >
              <UserIcon className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h4 className="text-lg font-extrabold text-slate-900">{t.signInTitle}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{t.signInSubtitle}</p>
            </div>
            <div className="max-w-xs mx-auto space-y-3">
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => {
                  setIsSigningIn(true);
                  void onGoogleSignIn().finally(() => setIsSigningIn(false));
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs shadow-xs flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                )}
                <span>{t.googleBtn}</span>
              </button>
              <p className="text-[11px] text-slate-400">{t.guestNote}</p>
            </div>
            {renderStartBusinessCard()}
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="px-5 border-b border-slate-200 flex items-center justify-between gap-2 bg-white shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('orders');
                    setSelectedOrder(null);
                  }}
                  className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    activeTab === 'orders'
                      ? 'border-current text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  style={activeTab === 'orders' ? { color: brandColor } : undefined}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>{t.tabs.orders}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('account');
                    setSelectedOrder(null);
                  }}
                  className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    activeTab === 'account'
                      ? 'border-current text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  style={activeTab === 'account' ? { color: brandColor } : undefined}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>{t.tabs.account}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => void onSignOut()}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-rose-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.signOut}</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {activeTab === 'orders' && selectedOrder ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t.backToOrders}</span>
                  </button>
                  <CustomerOrderTracker
                    order={selectedOrder}
                    subdomain={subdomain}
                    accessToken={accessToken}
                    site={site}
                    lang={lang}
                    onOrderRefreshed={(updated) => {
                      setSelectedOrder(updated);
                      setOrders((prev) =>
                        prev.map((o) => (o.id === updated.id ? updated : o))
                      );
                    }}
                    onOpenInvoice={onOpenInvoice}
                  />
                </div>
              ) : activeTab === 'orders' ? (
                <div className="space-y-3">
                  {ordersLoading ? (
                    <div className="py-12 text-center space-y-2 text-xs text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      <p>{t.loadingOrders}</p>
                    </div>
                  ) : ordersError ? (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      {ordersError}
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="py-12 text-center space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6">
                      <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-500">{t.noOrders}</p>
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer"
                        style={{ backgroundColor: brandColor }}
                      >
                        {t.browseCatalog}
                      </button>
                    </div>
                  ) : (
                    orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">
                              #{ord.orderNumber}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 capitalize">
                              {ord.status}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(ord.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate">
                            {ord.items.map((it) => `${it.name} × ${it.quantity}`).join(', ')}
                          </p>
                          <p className="text-xs font-mono font-extrabold tabular-nums text-slate-900">
                            ৳{Number(ord.total || 0).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(ord)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t.invoiceBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
                            style={{ backgroundColor: brandColor }}
                          >
                            {t.trackBtn}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  {renderStartBusinessCard()}
                </div>
              ) : (
                <div className="space-y-6 text-xs">
                  {profileLoading ? (
                    <div className="py-10 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </div>
                  ) : (
                    <>
                      {/* Personal Details Form */}
                      <form
                        onSubmit={(e) => void handleSaveProfile(e)}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5"
                      >
                        <div className="font-bold text-sm text-slate-900">
                          {t.profileSection}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              {t.fullName}
                            </label>
                            <input
                              type="text"
                              required
                              value={fullNameInput}
                              onChange={(e) => setFullNameInput(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              {t.phoneLabel}
                            </label>
                            <input
                              type="tel"
                              value={phoneInput}
                              onChange={(e) => setPhoneInput(e.target.value)}
                              placeholder="017XXXXXXXX"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 font-mono outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            {t.emailLabel}
                          </label>
                          <input
                            type="email"
                            readOnly
                            value={profile?.email || user.email}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                          />
                        </div>

                        {profileMessage && (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{profileMessage}</span>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isSavingProfile}
                            className="px-4 py-2 rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                            style={{ backgroundColor: brandColor }}
                          >
                            {isSavingProfile ? t.saving : t.saveProfile}
                          </button>
                        </div>
                      </form>

                      {/* Saved Delivery Addresses */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-sm text-slate-900">
                            {t.addressesTitle}
                          </div>
                          {!showAddAddress && (
                            <button
                              type="button"
                              onClick={() => setShowAddAddress(true)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{t.addAddressBtn}</span>
                            </button>
                          )}
                        </div>

                        {showAddAddress && (
                          <form
                            onSubmit={(e) => void handleSaveNewAddress(e)}
                            className="p-4 rounded-xl border border-slate-300 bg-white space-y-3"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  {t.addressLabel}
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={addrLabel}
                                  onChange={(e) => setAddrLabel(e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  {t.recipientName}
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={addrRecipient}
                                  onChange={(e) => setAddrRecipient(e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  {t.addressPhone}
                                </label>
                                <input
                                  type="tel"
                                  required
                                  value={addrPhone}
                                  onChange={(e) => setAddrPhone(e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  {t.cityLabel}
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={addrCity}
                                  onChange={(e) => setAddrCity(e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  {t.areaLabel}
                                </label>
                                <input
                                  type="text"
                                  value={addrArea}
                                  onChange={(e) => setAddrArea(e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                {t.streetAddress}
                              </label>
                              <textarea
                                rows={2}
                                required
                                value={addrStreet}
                                onChange={(e) => setAddrStreet(e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50"
                              />
                            </div>

                            <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={addrDefault}
                                onChange={(e) => setAddrDefault(e.target.checked)}
                              />
                              <span>{t.setDefault}</span>
                            </label>

                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowAddAddress(false)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 cursor-pointer"
                              >
                                {t.cancel}
                              </button>
                              <button
                                type="submit"
                                disabled={isSavingProfile}
                                className="px-4 py-1.5 rounded-lg text-white font-semibold cursor-pointer"
                                style={{ backgroundColor: brandColor }}
                              >
                                {t.saveAddress}
                              </button>
                            </div>
                          </form>
                        )}

                        {(!profile?.savedAddresses || profile.savedAddresses.length === 0) ? (
                          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-500 text-center">
                            {t.noAddresses}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {profile.savedAddresses.map((addr) => (
                              <div
                                key={addr.id}
                                className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5" style={{ color: brandColor }} />
                                    <span className="font-bold text-slate-900">{addr.label}</span>
                                    {addr.isDefault && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {t.setDefault}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-700">
                                    {addr.recipientName} ·{' '}
                                    <span className="font-mono">{addr.phone}</span>
                                  </p>
                                  <p className="text-slate-500">
                                    {addr.shippingAddress}
                                    {addr.deliveryArea ? `, ${addr.deliveryArea}` : ''}, {addr.city}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!addr.isDefault && (
                                    <button
                                      type="button"
                                      onClick={() => void handleSetDefaultAddress(addr.id)}
                                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 cursor-pointer"
                                    >
                                      Default
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteAddress(addr.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {renderStartBusinessCard()}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
