import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import {
  SubscribedWebsite,
  WebsiteProductItem,
  WebsiteThemeSettings,
} from '../../types';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { ManualPaymentModal } from '../../components/payment/ManualPaymentModal';
import { CATEGORY_SPECS, THEME_PALETTES, CategorySpec } from '../../data/websiteBuilderConfig';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Monitor,
  ShieldCheck,
  CreditCard,
  Plus,
  Trash2,
  Lock,
  MessageSquare,
  Search,
  Loader2,
  Image as ImageIcon,
  Upload,
  XCircle,
  Check,
} from 'lucide-react';

const GROUP_FILTER_KEYS = [
  'All',
  'Commerce',
  'Food & Hospitality',
  'Property & Construction',
  'Health & Personal Care',
  'Professional Services',
] as const;

export const CreateWebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    activeStore,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    websiteSubscriptionPlan,
    subscribedWebsites,
    createSubscribedWebsite,
    updateSubscribedWebsite,
    uploadWebsiteAsset,
    checkSubdomainAvailability,
    checkSubdomainAvailabilityAsync,
    paymentGatewayConfigs,
    showToast,
  } = useApp();

  const { t } = useLanguage();
  const cw = t.createWebsitePage;

  usePageSeo({
    title: cw.seoTitle,
    description: cw.seoDescription,
  });

  // Wizard Step
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Search & Filter for Step 1 Categories
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');

  // Form State
  const [selectedCategory, setSelectedCategory] = useState<CategorySpec>(CATEGORY_SPECS[0]);
  const [businessName, setBusinessName] = useState(activeStore?.name || '');
  const [subdomain, setSubdomain] = useState(() =>
    (activeStore?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
  );
  const [isSubdomainManual, setIsSubdomainManual] = useState(false);
  const [isSubdomainChecking, setIsSubdomainChecking] = useState(false);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState('');

  // Business Contact & Socials (Optional — never populate fake social URLs)
  const [phone, setPhone] = useState(activeStore?.phone || '');
  const [whatsappNumber, setWhatsappNumber] = useState(activeStore?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(activeStore?.address || '');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');

  // Hero & Story Copy
  const [headline, setHeadline] = useState('Premium Quality & Exceptional Service');
  const [subheadline, setSubheadline] = useState(
    'Explore our curated offerings and connect directly with our team.'
  );
  const [aboutText, setAboutText] = useState(
    'We are dedicated to authentic quality, transparent pricing, and responsive customer service.'
  );
  const [heroCtaText, setHeroCtaText] = useState(
    CATEGORY_SPECS[0].primaryCtaOptions[0] || 'Order on WhatsApp'
  );
  const [heroCtaLink, setHeroCtaLink] = useState('whatsapp');

  // Media Assets (Uploaded via Supabase Storage website-assets)
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [uploadingAssetKey, setUploadingAssetKey] = useState<string | null>(null);

  // Visual Theme & Layout Settings
  const [brandColor, setBrandColor] = useState(THEME_PALETTES[0].brandColor);
  const [fontStyle, setFontStyle] = useState<NonNullable<WebsiteThemeSettings['fontStyle']>>('modern');
  const [buttonStyle, setButtonStyle] = useState<NonNullable<WebsiteThemeSettings['buttonStyle']>>('rounded');
  const [heroLayout, setHeroLayout] = useState<NonNullable<WebsiteThemeSettings['heroLayout']>>('split');

  useEffect(() => {
    if (activeStore?.name && !businessName) {
      setBusinessName(activeStore.name);
      if (!isSubdomainManual && !subdomain) {
        setSubdomain(activeStore.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24));
      }
    }
    if (activeStore?.phone) {
      setPhone((prev) => prev || activeStore.phone);
      setWhatsappNumber((prev) => prev || activeStore.phone);
    }
    if (activeStore?.address && !address) {
      setAddress(activeStore.address);
    }
  }, [activeStore?.id, activeStore?.name, activeStore?.phone, activeStore?.address]);

  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  // Initial Products / Offerings
  const [items, setItems] = useState<WebsiteProductItem[]>([
    {
      id: '1',
      name: selectedCategory.defaultItems[0]?.name || 'Featured Product',
      price: selectedCategory.defaultItems[0]?.price || '৳1,500',
      description: selectedCategory.defaultItems[0]?.description || 'High-grade craftsmanship and quality.',
      category: selectedCategory.label,
      isVisible: true,
    },
    {
      id: '2',
      name: selectedCategory.defaultItems[1]?.name || 'Signature Offering',
      price: selectedCategory.defaultItems[1]?.price || '৳2,500',
      description: selectedCategory.defaultItems[1]?.description || 'Popular customer favorite.',
      category: selectedCategory.label,
      isVisible: true,
    },
  ]);

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Payment Modal, Persisted Site Result & Draft Submission Lock
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [createdSiteId, setCreatedSiteId] = useState<string>('');
  const [createdSite, setCreatedSite] = useState<SubscribedWebsite | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingDraftRef = useRef<boolean>(false);

  const persistedSite =
    (createdSiteId ? subscribedWebsites.find((s) => s.id === createdSiteId) : undefined) ||
    createdSite;
  const effectiveSubdomain = persistedSite?.subdomain || subdomain;
  const effectiveFullDomain = persistedSite?.fullDomainUrl || `${effectiveSubdomain}.amaas.xyz`;
  const effectivePlanName = persistedSite?.planName || 'GoAMAAS Website';
  const effectiveMonthlyFee = persistedSite?.monthlyFee || websiteSubscriptionPlan.priceMonthly;

  const localizedSelectedCat = cw.categories[selectedCategory.id] || {
    label: selectedCategory.label,
    groupLabel: selectedCategory.group,
    shortDesc: selectedCategory.shortDesc,
    itemTypeLabel: selectedCategory.itemTypeLabel,
  };

  // Update defaults when category changes
  const handleSelectCategory = (cat: CategorySpec) => {
    setSelectedCategory(cat);
    if (!headline || headline === 'Premium Quality & Exceptional Service') {
      setHeadline(`Welcome to Our Official ${cat.label} Storefront`);
    }
    setHeroCtaText(cat.primaryCtaOptions[0] || 'Contact Us');
    setItems([
      {
        id: '1',
        name: cat.defaultItems[0]?.name || 'Core Product',
        price: cat.defaultItems[0]?.price || '৳1,500',
        description: cat.defaultItems[0]?.description || 'High quality offering.',
        category: cat.label,
        isVisible: true,
      },
      {
        id: '2',
        name: cat.defaultItems[1]?.name || 'Popular Service',
        price: cat.defaultItems[1]?.price || '৳2,500',
        description: cat.defaultItems[1]?.description || 'Recommended customer choice.',
        category: cat.label,
        isVisible: true,
      },
    ]);
    setStep(2);
  };

  // Subdomain validation with debounced remote check
  useEffect(() => {
    if (!subdomain.trim()) {
      setSubdomainError(null);
      setIsSubdomainChecking(false);
      return;
    }
    const clean = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean !== subdomain) {
      setSubdomain(clean);
      return;
    }
    if (clean.length < 3) {
      setSubdomainError(cw.step2.subdomainMinChars);
      setIsSubdomainChecking(false);
      return;
    }

    const localCheck = checkSubdomainAvailability(clean, createdSiteId || undefined);
    if (!localCheck.available) {
      setSubdomainError(localCheck.reason || cw.step2.subdomainTaken);
      setIsSubdomainChecking(false);
      return;
    }

    setIsSubdomainChecking(true);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const remoteCheck = await checkSubdomainAvailabilityAsync(clean, createdSiteId || undefined);
        if (active) {
          if (!remoteCheck.available) {
            setSubdomainError(remoteCheck.reason || cw.step2.subdomainTaken);
          } else {
            setSubdomainError(null);
          }
        }
      } catch {
        if (active) {
          setSubdomainError(cw.step2.subdomainVerifyError);
        }
      } finally {
        if (active) {
          setIsSubdomainChecking(false);
        }
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    subdomain,
    createdSiteId,
    checkSubdomainAvailability,
    checkSubdomainAvailabilityAsync,
    cw.step2.subdomainMinChars,
    cw.step2.subdomainTaken,
    cw.step2.subdomainVerifyError,
  ]);

  const handleNameChange = (val: string) => {
    setBusinessName(val);
    if (!isSubdomainManual && !createdSiteId) {
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
      setSubdomain(slug);
    }
  };

  const handleAssetFileUpload = async (
    file: File | undefined,
    folder: 'logos' | 'heroes' | 'products',
    key: string,
    onUploaded: (url: string) => void
  ) => {
    if (!file) return;
    if (!isAuthenticated) {
      showToast(cw.toasts.signInUpload, 'warning');
      navigate('/login?redirect=/create-website');
      return;
    }
    setUploadingAssetKey(key);
    try {
      const { publicUrl, error } = await uploadWebsiteAsset({
        file,
        folder,
        websiteId: createdSiteId || undefined,
      });
      if (error || !publicUrl) {
        showToast(error?.message || cw.toasts.uploadFailed, 'error');
        return;
      }
      onUploaded(publicUrl);
      showToast(cw.toasts.uploadSuccess, 'success');
    } finally {
      setUploadingAssetKey(null);
    }
  };

  const handleAddItem = () => {
    const nextId = String(Date.now());
    setItems((prev) => [
      ...prev,
      {
        id: nextId,
        name: `New ${selectedCategory.itemTypeLabel.replace(/s$/, '')}`,
        price: '৳1,000',
        description: 'Key product specifications and details.',
        category: selectedCategory.label,
        isVisible: true,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      showToast(cw.toasts.keepOneItem, 'warning');
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateItem = (
    id: string,
    field: 'name' | 'price' | 'description' | 'imageUrl',
    value: string
  ) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const themeSettings: WebsiteThemeSettings = {
    primaryColor: brandColor,
    fontStyle,
    buttonStyle,
    heroLayout,
  };

  const cleanSocialLinks = {
    ...(facebookUrl.trim() ? { facebook: facebookUrl.trim() } : {}),
    ...(instagramUrl.trim() ? { instagram: instagramUrl.trim() } : {}),
  };

  // Construct draft website object for real-time Desktop & Mobile preview
  const draftSite: Partial<SubscribedWebsite> = {
    businessName: businessName || 'Your Business Name',
    niche: selectedCategory.id,
    nicheLabel: selectedCategory.label,
    brandColor,
    logoUrl: logoUrl || undefined,
    heroImageUrl: heroImageUrl || undefined,
    heroCtaText,
    heroCtaLink,
    subdomain: subdomain || 'yourbusiness',
    fullDomainUrl: `${subdomain || 'yourbusiness'}.amaas.xyz`,
    customDomain: customDomain.trim() || undefined,
    headline,
    subheadline,
    aboutText,
    phone: phone.trim(),
    email: email.trim(),
    whatsappNumber: whatsappNumber.trim(),
    address: address.trim(),
    socialLinks: cleanSocialLinks,
    servicesOrProducts: items,
    themeSettings,
    planName: 'GoAMAAS Website',
    monthlyFee: websiteSubscriptionPlan.priceMonthly,
    subscriptionStatus: 'active',
    deploymentStatus: 'live',
  };

  const handleCompleteDraft = async () => {
    if (submittingDraftRef.current) return;

    setSubmitError(null);

    if (!isAuthenticated) {
      showToast(cw.toasts.signInSave, 'warning');
      navigate('/login?redirect=/create-website');
      return;
    }
    if (!businessName.trim()) {
      showToast(cw.toasts.enterBusinessName, 'warning');
      setStep(2);
      return;
    }
    if (isSubdomainChecking) {
      showToast(cw.toasts.checkingSubdomain, 'info');
      return;
    }
    if (!subdomain.trim() || subdomainError) {
      showToast(cw.toasts.chooseValidSubdomain, 'warning');
      setStep(2);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (!items[i].name.trim()) {
        showToast(cw.toasts.itemNeedsName(i + 1), 'warning');
        setStep(3);
        return;
      }
    }

    submittingDraftRef.current = true;
    setIsSubmitting(true);
    try {
      const normalizedCustomDomain = customDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');

      if (createdSiteId) {
        const updateRes = await updateSubscribedWebsite(createdSiteId, {
          businessName: businessName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          whatsappNumber: whatsappNumber.trim(),
          address: address.trim(),
          customDomain: normalizedCustomDomain || undefined,
          niche: selectedCategory.id,
          nicheLabel: selectedCategory.label,
          templateId: 'tpl-modern-business',
          templateName: `${selectedCategory.label}`,
          brandColor,
          logoUrl: logoUrl || undefined,
          heroImageUrl: heroImageUrl || undefined,
          heroCtaText: heroCtaText.trim(),
          heroCtaLink: heroCtaLink.trim(),
          headline: headline.trim(),
          subheadline: subheadline.trim(),
          aboutText: aboutText.trim(),
          servicesOrProducts: items,
          socialLinks: cleanSocialLinks,
          themeSettings,
        });
        if (!updateRes.success) {
          setSubmitError(updateRes.error?.message || 'Failed to update website configuration.');
          return;
        }

        // Keep public.products rows in sync if the user returned to Step 3 to edit offerings
        const existingSiteProducts = products
          .filter((p) => p.websiteId === createdSiteId)
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        const validItems = items.filter((it) => it.name?.trim());

        for (let idx = 0; idx < validItems.length; idx++) {
          const item = validItems[idx];
          const numericPrice =
            typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric)
              ? item.priceNumeric
              : Number(String(item.price || '0').replace(/[^0-9.]/g, '')) || 0;
          const existingProd = existingSiteProducts[idx];
          if (existingProd) {
            await updateProduct(existingProd.id, {
              name: item.name.trim(),
              category: item.category || selectedCategory.label || 'Website Catalog',
              price: numericPrice,
              description: item.description || '',
              image: item.imageUrl || '',
              isVisible: item.isVisible ?? true,
              status: item.isVisible === false ? 'draft' : 'active',
              sortOrder: idx,
            });
          } else {
            const skuCode = `WEB-${effectiveSubdomain.slice(0, 6).toUpperCase()}-${idx + 1}-${Math.floor(100 + Math.random() * 900)}`;
            await addProduct({
              name: item.name.trim(),
              sku: skuCode,
              category: item.category || selectedCategory.label || 'Website Catalog',
              price: numericPrice,
              costPrice: 0,
              stock: 50,
              lowStockThreshold: 5,
              status: item.isVisible === false ? 'draft' : 'active',
              description: item.description || '',
              image: item.imageUrl || undefined,
              websiteId: createdSiteId,
              isVisible: item.isVisible ?? true,
              sortOrder: idx,
            });
          }
        }

        for (let extraIdx = validItems.length; extraIdx < existingSiteProducts.length; extraIdx++) {
          await deleteProduct(existingSiteProducts[extraIdx].id);
        }

        setStep(5);
        return;
      }

      const subCheck = await checkSubdomainAvailabilityAsync(subdomain);
      if (!subCheck.available) {
        const reason = subCheck.reason || cw.step2.subdomainTaken;
        setSubdomainError(reason);
        setSubmitError(reason);
        showToast(reason, 'error');
        setStep(2);
        return;
      }

      const savedSite = await createSubscribedWebsite({
        storeId: activeStore?.id || undefined,
        businessName: businessName.trim(),
        ownerName: user?.name || businessName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        niche: selectedCategory.id,
        nicheLabel: selectedCategory.label,
        templateId: 'tpl-modern-business',
        templateName: `${selectedCategory.label}`,
        subdomain,
        customDomain: normalizedCustomDomain || undefined,
        brandColor,
        logoUrl: logoUrl || undefined,
        heroImageUrl: heroImageUrl || undefined,
        heroCtaText: heroCtaText.trim(),
        heroCtaLink: heroCtaLink.trim(),
        address: address.trim(),
        headline: headline.trim(),
        subheadline: subheadline.trim(),
        aboutText: aboutText.trim(),
        servicesOrProducts: items,
        whatsappNumber: whatsappNumber.trim(),
        socialLinks: cleanSocialLinks,
        themeSettings,
      });

      if (!savedSite?.id) {
        throw new Error('Website record could not be confirmed by the database. Please try again.');
      }

      setCreatedSite(savedSite);
      setCreatedSiteId(savedSite.id);
      if (savedSite.subdomain && savedSite.subdomain !== subdomain) {
        setSubdomain(savedSite.subdomain);
      }
      setStep(5);
    } catch (err: unknown) {
      console.error('Failed to create website draft:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to save website. Please try again.';
      setSubmitError(message);
      const alreadyToasted = Boolean(
        err && typeof err === 'object' && 'toastShown' in err && (err as { toastShown?: boolean }).toastShown
      );
      if (!alreadyToasted) {
        showToast(message, 'error');
      }
    } finally {
      setIsSubmitting(false);
      submittingDraftRef.current = false;
    }
  };

  const normalizedQuery = categorySearch.trim().toLowerCase();
  const filteredCategories = CATEGORY_SPECS.filter((cat) => {
    const loc = cw.categories[cat.id];
    const matchesSearch =
      !normalizedQuery ||
      cat.label.toLowerCase().includes(normalizedQuery) ||
      cat.shortDesc.toLowerCase().includes(normalizedQuery) ||
      (loc?.label || '').toLowerCase().includes(normalizedQuery) ||
      (loc?.shortDesc || '').toLowerCase().includes(normalizedQuery);
    const matchesGroup = selectedGroup === 'All' || cat.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 sm:py-14 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Plan Identity Bar (clean unboxed metadata) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-slate-950 dark:text-white font-bold">GoAMAAS Website</strong>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              ৳{websiteSubscriptionPlan.priceMonthly} BDT
            </span>
            <span aria-hidden="true">·</span>
            <span>{cw.planBarPeriod}</span>
          </div>
          {isAuthenticated && (
            <Link
              to="/dashboard/subscribed-website"
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline whitespace-nowrap"
            >
              {cw.openVisualEditor}
            </Link>
          )}
        </div>

        {/* Wizard Progress Stepper */}
        <div className="p-3 sm:p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800">
          <div className="flex items-center justify-between max-w-3xl mx-auto text-xs font-semibold gap-1">
            {[1, 2, 3, 4, 5].map((num) => {
              const label = cw.steps[num - 1];
              const isCurrent = step === num;
              const isDone = step > num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (num <= step) setStep(num as 1 | 2 | 3 | 4 | 5);
                  }}
                  className={`min-h-[38px] flex items-center gap-2 py-1.5 px-2.5 rounded-xl transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'text-blue-600 dark:text-blue-400 font-bold bg-white dark:bg-slate-950 shadow-xs cursor-pointer'
                      : isDone
                      ? 'text-emerald-600 dark:text-emerald-400 cursor-pointer'
                      : 'text-slate-400 dark:text-slate-500 cursor-default'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono tabular-nums shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-3 h-3" /> : num}
                  </span>
                  <span className="hidden md:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 1: CATEGORY SELECTION */}
        {step === 1 && (
          <div className="space-y-7">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {cw.stepOf(1, 5)}
              </p>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight text-balance">
                {cw.step1.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {cw.step1.subtitle}
              </p>
            </div>

            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="relative w-full lg:w-80 shrink-0">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={cw.step1.searchPlaceholder}
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {GROUP_FILTER_KEYS.map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroup(grp)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      selectedGroup === grp
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cw.groups[grp] || grp}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCategories.map((cat) => {
                const isSelected = selectedCategory.id === cat.id;
                const loc = cw.categories[cat.id];
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat)}
                    className={`p-6 rounded-2xl text-left border transition-colors cursor-pointer flex flex-col justify-between gap-5 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20'
                        : 'border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{loc?.groupLabel || cat.group}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {loc?.itemTypeLabel || cat.itemTypeLabel}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-slate-950 dark:text-white tracking-tight">
                        {loc?.label || cat.label}
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {loc?.shortDesc || cat.shortDesc}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 w-full flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                      <span>{cw.step1.selectContinue}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS INFORMATION & SUBDOMAIN */}
        {step === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {cw.stepOf(2, 5)} · {localizedSelectedCat.label}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white tracking-tight">
                {cw.step2.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {cw.step2.subtitlePrefix}{' '}
                <code className="font-mono text-blue-600 dark:text-blue-400">
                  businessname.amaas.xyz
                </code>{' '}
                {cw.step2.subtitleSuffix}
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {cw.step2.businessNameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={cw.step2.businessNamePlaceholder}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>

              {/* Subdomain Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {cw.step2.subdomainLabel}
                </label>
                <div className="flex items-center min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                  <span className="px-3 text-slate-400 font-mono text-xs select-none">https://</span>
                  <input
                    type="text"
                    required
                    readOnly={Boolean(createdSiteId)}
                    value={subdomain}
                    onChange={(e) => {
                      if (!createdSiteId) {
                        setIsSubdomainManual(true);
                        setSubdomain(e.target.value);
                      }
                    }}
                    placeholder="urbanfashion"
                    className={`flex-1 py-2.5 bg-transparent font-mono text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 outline-none ${
                      createdSiteId ? 'opacity-75 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="px-3 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono text-xs border-l border-slate-200 dark:border-slate-600 select-none">
                    .amaas.xyz
                  </span>
                </div>
                {createdSiteId ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{cw.step2.subdomainReserved(subdomain)}</span>
                  </p>
                ) : isSubdomainChecking ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{cw.step2.subdomainChecking}</span>
                  </p>
                ) : subdomainError ? (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{subdomainError}</span>
                  </p>
                ) : subdomain ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{cw.step2.subdomainAvailable(subdomain)}</span>
                  </p>
                ) : null}
              </div>

              {/* Optional Custom Domain */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {cw.step2.customDomainLabel}
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder={cw.step2.customDomainPlaceholder}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {cw.step2.customDomainNote}
                </p>
              </div>

              {/* Phone & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.phoneLabel}
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1XXXXXXXXX"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.whatsappLabel}
                  </label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+880 1XXXXXXXXX"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono"
                  />
                </div>
              </div>

              {/* Email & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.emailLabel}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hello@yourbusiness.com"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.addressLabel}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={cw.step2.addressPlaceholder}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Optional Social Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.facebookLabel}
                  </label>
                  <input
                    type="url"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/yourpage"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.instagramLabel}
                  </label>
                  <input
                    type="url"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/yourhandle"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Hero Copy & CTA */}
              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.heroHeadlineLabel}
                  </label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {cw.step2.heroSubheadlineLabel}
                  </label>
                  <textarea
                    rows={2}
                    value={subheadline}
                    onChange={(e) => setSubheadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {cw.step2.primaryCtaTextLabel}
                    </label>
                    <input
                      type="text"
                      value={heroCtaText}
                      onChange={(e) => setHeroCtaText(e.target.value)}
                      placeholder="Order on WhatsApp"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {cw.step2.primaryCtaDestLabel}
                    </label>
                    <select
                      value={heroCtaLink}
                      onChange={(e) => setHeroCtaLink(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm"
                    >
                      <option value="whatsapp">{cw.step2.destWhatsapp}</option>
                      <option value="#services">{cw.step2.destCatalog}</option>
                      <option value="#contact">{cw.step2.destContact}</option>
                      <option value="#about">{cw.step2.destAbout}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{cw.step2.changeCategory}</span>
              </button>
              <button
                type="button"
                disabled={!businessName.trim() || !subdomain.trim() || !!subdomainError || isSubdomainChecking}
                onClick={() => setStep(3)}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{cw.step2.continueProducts}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OFFERINGS & PRODUCTS */}
        {step === 3 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {cw.stepOf(3, 5)} · {localizedSelectedCat.label}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white tracking-tight">
                {cw.step3.title(localizedSelectedCat.itemTypeLabel)}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {cw.step3.subtitle}
              </p>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-5 sm:p-6 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                      {cw.step3.itemNumber(idx + 1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title={cw.step3.removeItemTitle}
                      aria-label={cw.step3.removeItemTitle}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {cw.step3.itemNameLabel}
                      </label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {cw.step3.priceLabel}
                      </label>
                      <input
                        type="text"
                        value={item.price || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                        placeholder="৳1,850"
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {cw.step3.descLabel}
                    </label>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm leading-relaxed"
                    />
                  </div>

                  {/* Product Image Upload */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {item.imageUrl ? (
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {cw.step3.photoAttached}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(item.id, 'imageUrl', '')}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title={cw.step3.removeItemTitle}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        {uploadingAssetKey === `prod-${item.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        )}
                        <span>
                          {uploadingAssetKey === `prod-${item.id}`
                            ? cw.step3.uploading
                            : cw.step3.uploadProductImage}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            void handleAssetFileUpload(
                              e.target.files?.[0],
                              'products',
                              `prod-${item.id}`,
                              (url) => handleUpdateItem(item.id, 'imageUrl', url)
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full min-h-[48px] py-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{cw.step3.addAnother}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{cw.step3.back}</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <span>{cw.step3.continueDesign}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: BRAND ASSETS, THEME & LIVE DESKTOP/MOBILE PREVIEW */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {cw.stepOf(4, 5)} · {cw.step4.subtitleBadge}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white tracking-tight">
                {cw.step4.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {cw.step4.subtitle}
              </p>
            </div>

            {/* Brand Logo, Hero Image & Layout Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 sm:p-6 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 text-xs">
              {/* Logo Upload */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  {cw.step4.logoLabel}
                </label>
                {logoUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <img
                      src={logoUrl}
                      alt="Business Logo"
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-rose-600 font-semibold hover:underline cursor-pointer"
                    >
                      {cw.step4.removeLogo}
                    </button>
                  </div>
                ) : (
                  <label className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-blue-500 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                    {uploadingAssetKey === 'logo' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )}
                    <span>
                      {uploadingAssetKey === 'logo' ? cw.step3.uploading : cw.step4.uploadLogo}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        void handleAssetFileUpload(e.target.files?.[0], 'logos', 'logo', setLogoUrl)
                      }
                    />
                  </label>
                )}
              </div>

              {/* Hero Image Upload */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  {cw.step4.heroImageLabel}
                </label>
                {heroImageUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <img
                      src={heroImageUrl}
                      alt="Hero Banner"
                      referrerPolicy="no-referrer"
                      className="w-14 h-10 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setHeroImageUrl('')}
                      className="text-rose-600 font-semibold hover:underline cursor-pointer"
                    >
                      {cw.step4.removeHero}
                    </button>
                  </div>
                ) : (
                  <label className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-blue-500 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                    {uploadingAssetKey === 'hero' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )}
                    <span>
                      {uploadingAssetKey === 'hero' ? cw.step3.uploading : cw.step4.uploadHero}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        void handleAssetFileUpload(
                          e.target.files?.[0],
                          'heroes',
                          'hero',
                          setHeroImageUrl
                        )
                      }
                    />
                  </label>
                )}
              </div>

              {/* Layout, Font & Button Radius */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {cw.step4.heroLayoutLabel}
                  </label>
                  <select
                    value={heroLayout}
                    onChange={(e) =>
                      setHeroLayout(
                        e.target.value as NonNullable<WebsiteThemeSettings['heroLayout']>
                      )
                    }
                    className="w-full min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="split">{cw.step4.layoutSplit}</option>
                    <option value="centered">{cw.step4.layoutCentered}</option>
                    <option value="cover">{cw.step4.layoutCover}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {cw.step4.typographyLabel}
                  </label>
                  <select
                    value={fontStyle}
                    onChange={(e) =>
                      setFontStyle(
                        e.target.value as NonNullable<WebsiteThemeSettings['fontStyle']>
                      )
                    }
                    className="w-full min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="modern">{cw.step4.fontModern}</option>
                    <option value="editorial">{cw.step4.fontEditorial}</option>
                    <option value="bold">{cw.step4.fontBold}</option>
                    <option value="minimal">{cw.step4.fontMinimal}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {cw.step4.buttonsLabel}
                  </label>
                  <select
                    value={buttonStyle}
                    onChange={(e) =>
                      setButtonStyle(
                        e.target.value as NonNullable<WebsiteThemeSettings['buttonStyle']>
                      )
                    }
                    className="w-full min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="rounded">{cw.step4.btnRounded}</option>
                    <option value="pill">{cw.step4.btnPill}</option>
                    <option value="sharp">{cw.step4.btnSharp}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Palette Selection Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {THEME_PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => setBrandColor(pal.brandColor)}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    brandColor.toLowerCase() === pal.brandColor.toLowerCase()
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                      : 'border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full mb-2 border border-black/10"
                    style={{ backgroundColor: pal.brandColor }}
                  />
                  <span className="font-bold text-[11px] text-slate-900 dark:text-white block truncate">
                    {pal.name}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 block">
                    {pal.brandColor}
                  </span>
                </button>
              ))}
            </div>

            {/* Device Switcher for Preview */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {cw.step4.livePreviewLabel}{' '}
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  https://{subdomain || 'yourbusiness'}.amaas.xyz
                </span>
              </div>
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    previewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{cw.step4.desktop}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    previewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{cw.step4.mobile}</span>
                </button>
              </div>
            </div>

            {/* Live Rendered Preview */}
            <div className="p-3 sm:p-5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <WebsitePreviewRenderer site={draftSite} viewMode={previewDevice} />
            </div>

            {submitError && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="flex-1">
                  <span className="font-bold block">{cw.step4.saveErrorTitle}</span>
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setSubmitError(null);
                  setStep(3);
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{cw.step3.back}</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting || !!subdomainError || isSubdomainChecking}
                onClick={() => void handleCompleteDraft()}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{cw.step4.savingWebsite}</span>
                  </>
                ) : (
                  <>
                    <span>{cw.step4.saveAndProceed}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: LAUNCH, PRICING & PAYMENT */}
        {step === 5 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                {cw.step5.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {cw.step5.savedAtPrefix}{' '}
                <strong className="font-mono text-blue-600 dark:text-blue-400">
                  https://{effectiveFullDomain}
                </strong>
                .
              </p>
            </div>

            {/* Subscription Terms Disclosure */}
            <div className="p-4 sm:p-5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{cw.step5.autoPublishTitle(effectivePlanName)}</span>
              </div>
              <p className="leading-relaxed text-amber-800 dark:text-amber-300">
                {cw.step5.autoPublishBody(effectiveMonthlyFee, effectiveFullDomain)}
              </p>
            </div>

            {/* Plan Fee Breakdown Card */}
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-950 dark:text-white">
                    {effectivePlanName}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    https://{effectiveFullDomain} · {cw.step5.billingPeriod30}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                    ৳{effectiveMonthlyFee}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {cw.step5.perMonth}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>{cw.step5.bullet1(effectiveFullDomain)}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>{cw.step5.bullet2}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>{cw.step5.bullet3}</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>{cw.step5.bullet4}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  disabled={!persistedSite?.id && !createdSiteId}
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full sm:flex-1 min-h-[46px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>{cw.step5.submitPaymentBtn(effectiveMonthlyFee)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/subscribed-website')}
                  className="w-full sm:w-auto min-h-[46px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  {cw.step5.openEditorBtn}
                </button>
              </div>
            </div>

            {/* Custom Domain Support Callout */}
            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-950 dark:text-white block">
                  {cw.step5.customDomainTitle}
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed block">
                  {cw.step5.customDomainBody}
                </span>
              </div>
              {(() => {
                const whatsappGateway = paymentGatewayConfigs.find(
                  (g) =>
                    g.id === 'whatsapp_support' &&
                    g.isEnabled &&
                    (g.accountNumber || '').replace(/\D/g, '').length >= 8
                );
                if (whatsappGateway?.accountNumber) {
                  const cleanDigits = whatsappGateway.accountNumber.replace(/\D/g, '');
                  return (
                    <a
                      href={`https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                        `Hello GoAMAAS! I created a website for "${persistedSite?.businessName || businessName}" (${effectiveFullDomain}) and need assistance with custom domain DNS setup.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{cw.step5.whatsappSupport}</span>
                    </a>
                  );
                }
                return (
                  <Link
                    to="/dashboard/support"
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{cw.step5.supportDesk}</span>
                  </Link>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Manual Payment Verification Modal */}
      <ManualPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        serviceType="website_subscription"
        serviceId={persistedSite?.id || createdSiteId}
        serviceName={`${effectivePlanName} (${effectiveFullDomain})`}
        planTier={effectivePlanName}
        amount={effectiveMonthlyFee}
        onSuccess={() => {
          showToast(cw.step5.paymentSubmittedToast, 'success');
          navigate('/dashboard/subscribed-website');
        }}
      />
    </div>
  );
};
