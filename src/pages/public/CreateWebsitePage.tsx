import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
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
} from 'lucide-react';

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
    createSubscribedWebsite,
    updateSubscribedWebsite,
    uploadWebsiteAsset,
    checkSubdomainAvailability,
    checkSubdomainAvailabilityAsync,
    paymentGatewayConfigs,
    showToast,
  } = useApp();

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

  // Payment Modal & Draft Submission Lock
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [createdSiteId, setCreatedSiteId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingDraftRef = useRef<boolean>(false);

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
      setSubdomainError('Subdomain must be at least 3 characters.');
      setIsSubdomainChecking(false);
      return;
    }

    const localCheck = checkSubdomainAvailability(clean, createdSiteId || undefined);
    if (!localCheck.available) {
      setSubdomainError(localCheck.reason || 'This subdomain is already taken or reserved.');
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
            setSubdomainError(remoteCheck.reason || 'This subdomain is already taken or reserved.');
          } else {
            setSubdomainError(null);
          }
        }
      } catch {
        if (active) {
          setSubdomainError('Could not verify subdomain uniqueness. Please try again.');
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
  }, [subdomain, createdSiteId, checkSubdomainAvailability, checkSubdomainAvailabilityAsync]);

  // Auto-generate compact subdomain from business name (e.g. "Urban Fashion" -> "urbanfashion")
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
      showToast('Please sign in first to upload media to cloud storage.', 'warning');
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
        showToast(error?.message || 'Failed to upload image.', 'error');
        return;
      }
      onUploaded(publicUrl);
      showToast('Image uploaded to cloud storage.', 'success');
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
      showToast('Keep at least one product or offering, or edit the existing item.', 'warning');
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

    if (!isAuthenticated) {
      showToast('Please sign in to save and publish your website.', 'warning');
      navigate('/login?redirect=/create-website');
      return;
    }
    if (!businessName.trim()) {
      showToast('Please enter your business name.', 'warning');
      setStep(2);
      return;
    }
    if (isSubdomainChecking) {
      showToast('Verifying subdomain availability, please wait a moment.', 'info');
      return;
    }
    if (!subdomain.trim() || subdomainError) {
      showToast('Please choose an available .amaas.xyz subdomain.', 'warning');
      setStep(2);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (!items[i].name.trim()) {
        showToast(`Item #${i + 1} needs a product or service name.`, 'warning');
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
        if (!updateRes.success) return;

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
            const skuCode = `WEB-${subdomain.slice(0, 6).toUpperCase()}-${idx + 1}-${Math.floor(100 + Math.random() * 900)}`;
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
        const reason = subCheck.reason || 'This subdomain is already taken or reserved.';
        setSubdomainError(reason);
        showToast(reason, 'error');
        setStep(2);
        return;
      }

      const newSite = await createSubscribedWebsite({
        storeId: activeStore?.id || '',
        businessName: businessName.trim(),
        ownerName: user?.name || businessName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        niche: selectedCategory.id,
        nicheLabel: selectedCategory.label,
        templateId: 'tpl-modern-business',
        templateName: `${selectedCategory.label}`,
        subdomain,
        fullDomainUrl: `${subdomain}.amaas.xyz`,
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
        planName: 'GoAMAAS Website',
        monthlyFee: websiteSubscriptionPlan.priceMonthly,
        subscriptionStatus: 'active',
        paymentStatus: 'pending',
        deploymentStatus: 'provisioning',
        sslStatus: 'active',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
      });

      setCreatedSiteId(newSite.id);
      setStep(5);
    } catch (err: any) {
      console.error('Failed to create website draft:', err);
      showToast(err.message || 'Failed to save website. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
      submittingDraftRef.current = false;
    }
  };

  const filteredCategories = CATEGORY_SPECS.filter((cat) => {
    const matchesSearch =
      cat.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
      cat.shortDesc.toLowerCase().includes(categorySearch.toLowerCase());
    const matchesGroup = selectedGroup === 'All' || cat.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Plan Identity Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div>
            <strong className="text-slate-900 dark:text-white font-bold">GoAMAAS Website</strong>
            <span className="mx-2">·</span>
            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
              ৳{websiteSubscriptionPlan.priceMonthly} BDT / month
            </span>
            <span className="mx-2">·</span>
            <span>30-day billing period · Free GoAMAAS hosting &amp; subdomain</span>
          </div>
          {isAuthenticated && (
            <Link
              to="/dashboard/subscribed-website"
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Open Visual Website Editor →
            </Link>
          )}
        </div>

        {/* Wizard Progress Stepper */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between max-w-3xl mx-auto text-xs font-semibold">
            {[
              { num: 1, label: '1. Industry' },
              { num: 2, label: '2. Business & Domain' },
              { num: 3, label: '3. Products' },
              { num: 4, label: '4. Design & Preview' },
              { num: 5, label: '5. Activate & Publish' },
            ].map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num <= step) setStep(s.num as any);
                }}
                className={`flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                  step === s.num
                    ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60'
                    : step > s.num
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 opacity-60'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    step === s.num
                      ? 'bg-blue-600 text-white'
                      : step > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 1: CATEGORY SELECTION */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-semibold text-blue-600">Step 1 of 5</span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Select Your Business Category
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Choose the industry layout that best fits your business. You can customize every section, image, and product later in the Visual Website Editor.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search industries (e.g. fashion, cafe, clinic)..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 text-xs">
                {[
                  'All',
                  'Commerce',
                  'Food & Hospitality',
                  'Property & Construction',
                  'Health & Personal Care',
                  'Professional Services',
                ].map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroup(grp)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedGroup === grp
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((cat) => {
                const isSelected = selectedCategory.id === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat)}
                    className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer flex flex-col justify-between space-y-4 hover:shadow-md ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{cat.group}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {cat.itemTypeLabel}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {cat.label}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{cat.shortDesc}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-blue-600">
                      <span>Select &amp; Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS INFORMATION & SUBDOMAIN */}
        {step === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <span className="text-xs font-semibold text-blue-600">
                Step 2 of 5 · {selectedCategory.label}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Business Identity &amp; Free Subdomain
              </h2>
              <p className="text-xs text-slate-500">
                Claim your free <code className="font-mono text-blue-600">businessname.amaas.xyz</code> subdomain. Optional contact fields left blank are cleanly omitted from your published site.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Business / Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Urban Fashion"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                />
              </div>

              {/* Subdomain Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Free GoAMAAS Subdomain (businessname.amaas.xyz) *
                </label>
                <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                  <span className="px-3 text-slate-400 font-mono text-xs">https://</span>
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
                    className={`flex-1 py-2.5 bg-transparent font-mono text-xs font-bold text-blue-600 outline-none ${
                      createdSiteId ? 'opacity-75 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="px-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono text-xs border-l border-slate-200 dark:border-slate-600">
                    .amaas.xyz
                  </span>
                </div>
                {createdSiteId ? (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-blue-600" />
                    <span>Subdomain https://{subdomain}.amaas.xyz is reserved for your saved website.</span>
                  </p>
                ) : isSubdomainChecking ? (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                    <span>Checking availability...</span>
                  </p>
                ) : subdomainError ? (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{subdomainError}</span>
                  </p>
                ) : subdomain ? (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>https://{subdomain}.amaas.xyz is available!</span>
                  </p>
                ) : null}
              </div>

              {/* Optional Custom Domain */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Optional Custom Domain (if you own one)
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="e.g. www.urbanfashionbd.com (domain registration paid separately)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Free hosting &amp; <code className="font-mono">.amaas.xyz</code> subdomain are included in your ৳600/mo plan. Custom domain registration is paid separately to your domain registrar.
                </p>
              </div>

              {/* Phone, WhatsApp, Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1XXXXXXXXX"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp Orders / Inquiry Number
                  </label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+880 1XXXXXXXXX"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Public Business Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hello@yourbusiness.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Physical Store / Office Address (Optional)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Road 11, Banani, Dhaka"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              {/* Optional Social Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Facebook Page URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/yourpage"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Instagram Profile URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/yourhandle"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              {/* Hero Copy & CTA */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hero Headline
                  </label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hero Description / Subheadline
                  </label>
                  <textarea
                    rows={2}
                    value={subheadline}
                    onChange={(e) => setSubheadline(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Primary CTA Button Text
                    </label>
                    <input
                      type="text"
                      value={heroCtaText}
                      onChange={(e) => setHeroCtaText(e.target.value)}
                      placeholder="e.g. Order on WhatsApp"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Primary CTA Destination
                    </label>
                    <select
                      value={heroCtaLink}
                      onChange={(e) => setHeroCtaLink(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    >
                      <option value="whatsapp">Direct WhatsApp Inquiry</option>
                      <option value="#services">Scroll to Products / Catalog</option>
                      <option value="#contact">Scroll to Contact Section</option>
                      <option value="#about">Scroll to About Section</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Category</span>
              </button>
              <button
                type="button"
                disabled={!businessName.trim() || !subdomain.trim() || !!subdomainError || isSubdomainChecking}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>Continue to Products</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OFFERINGS & PRODUCTS */}
        {step === 3 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center space-y-2">
              <span className="text-xs font-semibold text-blue-600">
                Step 3 of 5 · {selectedCategory.label}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Add Featured {selectedCategory.itemTypeLabel}
              </h2>
              <p className="text-xs text-slate-500">
                Add products or services with prices, descriptions, and photos. These are saved to your database catalog and can be updated anytime.
              </p>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Product / Service Name *
                      </label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Price *
                      </label>
                      <input
                        type="text"
                        value={item.price || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                        placeholder="e.g. ৳1,850"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed"
                    />
                  </div>

                  {/* Product Image Upload */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {item.imageUrl ? (
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                          Product photo attached
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(item.id, 'imageUrl', '')}
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Remove image"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        {uploadingAssetKey === `prod-${item.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        <span>
                          {uploadingAssetKey === `prod-${item.id}`
                            ? 'Uploading...'
                            : 'Upload Product Image'}
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
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Another Product / Service</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Design &amp; Preview</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: BRAND ASSETS, THEME & LIVE DESKTOP/MOBILE PREVIEW */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-semibold text-blue-600">
                Step 4 of 5 · Design, Media &amp; Live Preview
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Customize Branding &amp; Preview Before Publishing
              </h2>
              <p className="text-xs text-slate-500">
                Upload your logo and hero banner, select colors and typography, and inspect both Desktop and Mobile layouts live.
              </p>
            </div>

            {/* Brand Logo, Hero Image & Layout Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs text-xs">
              {/* Logo Upload */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Business Logo (Optional)
                </label>
                {logoUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-rose-600 font-semibold hover:underline cursor-pointer"
                    >
                      Remove Logo
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                    {uploadingAssetKey === 'logo' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Upload className="w-4 h-4 text-blue-600" />
                    )}
                    <span>{uploadingAssetKey === 'logo' ? 'Uploading...' : 'Upload Logo (PNG/JPG)'}</span>
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
                  Hero Banner Image (Optional)
                </label>
                {heroImageUrl ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <img
                      src={heroImageUrl}
                      alt="Hero"
                      className="w-14 h-10 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setHeroImageUrl('')}
                      className="text-rose-600 font-semibold hover:underline cursor-pointer"
                    >
                      Remove Hero
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                    {uploadingAssetKey === 'hero' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                    )}
                    <span>{uploadingAssetKey === 'hero' ? 'Uploading...' : 'Upload Hero Image'}</span>
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
                    Hero Layout
                  </label>
                  <select
                    value={heroLayout}
                    onChange={(e) => setHeroLayout(e.target.value as any)}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="split">Split</option>
                    <option value="centered">Centered</option>
                    <option value="cover">Cover</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Typography
                  </label>
                  <select
                    value={fontStyle}
                    onChange={(e) => setFontStyle(e.target.value as any)}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="modern">Modern</option>
                    <option value="editorial">Editorial</option>
                    <option value="bold">Bold</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Buttons
                  </label>
                  <select
                    value={buttonStyle}
                    onChange={(e) => setButtonStyle(e.target.value as any)}
                    className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="rounded">Rounded</option>
                    <option value="pill">Pill</option>
                    <option value="sharp">Sharp</option>
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
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    brandColor.toLowerCase() === pal.brandColor.toLowerCase()
                      ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full shadow-xs mb-2"
                    style={{ backgroundColor: pal.brandColor }}
                  />
                  <span className="font-bold text-[11px] text-slate-900 dark:text-white block truncate">
                    {pal.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                    {pal.brandColor}
                  </span>
                </button>
              ))}
            </div>

            {/* Device Switcher for Preview */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Live Preview: <span className="font-mono text-blue-600">https://{subdomain || 'yourbusiness'}.amaas.xyz</span>
              </div>
              <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-900 shadow-xs text-blue-600 font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-2.5 py-1.5 rounded-md flex items-center gap-1 cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-900 shadow-xs text-blue-600 font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            {/* Live Rendered Preview */}
            <div className="p-4 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <WebsitePreviewRenderer site={draftSite} viewMode={previewDevice} />
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting || !!subdomainError || isSubdomainChecking}
                onClick={() => void handleCompleteDraft()}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Website...</span>
                  </>
                ) : (
                  <>
                    <span>Save Website &amp; Proceed to Subscription</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Website Saved &amp; Subdomain Reserved
              </h2>
              <p className="text-xs text-slate-500">
                Your website is saved at{' '}
                <strong className="font-mono text-blue-600">https://{subdomain}.amaas.xyz</strong>.
              </p>
            </div>

            {/* Subscription Terms Disclosure */}
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>GoAMAAS Website Subscription — Automatic Live Publishing</span>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-800 dark:text-amber-300">
                Submit your <strong>৳{websiteSubscriptionPlan.priceMonthly} BDT</strong> monthly payment via bKash, Nagad, or Bank Transfer below. As soon as your payment is verified by our operations team, your website automatically goes live at <strong>https://{subdomain}.amaas.xyz</strong> for a full <strong>30-day billing period</strong>.
              </p>
            </div>

            {/* Plan Fee Breakdown Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    GoAMAAS Website
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    https://{subdomain}.amaas.xyz · 30-day billing period
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-blue-600 font-mono tabular-nums">
                    ৳{websiteSubscriptionPlan.priceMonthly}
                  </span>
                  <span className="text-xs text-slate-400"> / month</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Free <code className="font-mono text-blue-600">{subdomain}.amaas.xyz</code> subdomain &amp; free hosting on GoAMAAS infrastructure
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Full Visual Website Editor (sections, logo, hero banner, theme, products &amp; images)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Optional custom domain support (domain registration paid separately by customer)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Direct WhatsApp customer inquiry &amp; 30-day cumulative renewal cycle
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full sm:flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Submit ৳{websiteSubscriptionPlan.priceMonthly} Payment (bKash / Nagad / Bank)</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/subscribed-website')}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  Open Visual Website Editor
                </button>
              </div>
            </div>

            {/* Custom Domain Support Callout */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Connecting your own custom domain?
                </span>
                <span className="text-[11px] text-slate-500">
                  Point your domain CNAME to <code className="font-mono">cname.amaas.xyz</code> inside the Website Editor. Domain purchase is paid separately.
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
                        `Hello GoAMAAS! I created a website for "${businessName}" (${subdomain}.amaas.xyz) and need assistance with custom domain DNS setup.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp Support</span>
                    </a>
                  );
                }
                return (
                  <Link
                    to="/dashboard/support"
                    className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Support Desk</span>
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
        serviceId={createdSiteId}
        serviceName={`GoAMAAS Website (${subdomain}.amaas.xyz)`}
        planTier="GoAMAAS Website"
        amount={websiteSubscriptionPlan.priceMonthly}
        onSuccess={() => {
          showToast(
            'Payment submitted! Your website will publish live automatically as soon as your payment is verified.',
            'success'
          );
          navigate('/dashboard/subscribed-website');
        }}
      />
    </div>
  );
};
