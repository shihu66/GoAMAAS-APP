import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { CATEGORY_SPECS, CategorySpec } from '../../data/websiteBuilderConfig';
import {
  CURATED_WEBSITE_TEMPLATES,
  CuratedWebsiteTemplate,
} from '../../data/websiteTemplates';
import { WebsitePreviewRenderer } from '../website/WebsitePreviewRenderer';
import { validateAndNormalizeGoogleMapsUrl } from '../../lib/storefrontSync';
import { compressImageFileToCompactDataUrl } from '../../lib/supabase';
import {
  SubscribedWebsite,
  WebsiteProductItem,
  WebsiteSectionConfig,
  WebsiteThemeSettings,
} from '../../types';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertCircle,
  Upload,
  Trash2,
  Plus,
  Monitor,
  Smartphone,
  MapPin,
  Globe,
  Loader2,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';

export interface WizardDraftItem {
  id: string;
  name: string;
  price: string;
  stock: string;
  description: string;
  imageUrl?: string;
}

export interface GuidedWebsiteWizardProps {
  onSuccess: (createdWebsite: SubscribedWebsite) => void;
  onCancel?: () => void;
}

export const sanitizeSubdomainSlug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);

export const GuidedWebsiteWizard: React.FC<GuidedWebsiteWizardProps> = ({
  onSuccess,
  onCancel,
}) => {
  const {
    user,
    activeStore,
    websiteSubscriptionPlan,
    createSubscribedWebsite,
    addProduct,
    uploadWebsiteAsset,
    checkSubdomainAvailability,
    checkSubdomainAvailabilityAsync,
    showToast,
  } = useApp();
  const { t, lang } = useLanguage();
  const ob = t.workspace.onboarding;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Step 1: Business Info
  const [businessName, setBusinessName] = useState(activeStore?.name || '');
  const [selectedCategory, setSelectedCategory] = useState<CategorySpec>(CATEGORY_SPECS[0]);
  const [shortDescription, setShortDescription] = useState('');

  // Step 2: Brand & Design
  const [selectedTemplate, setSelectedTemplate] = useState<CuratedWebsiteTemplate>(
    CURATED_WEBSITE_TEMPLATES[0]
  );
  const [brandColor, setBrandColor] = useState(CURATED_WEBSITE_TEMPLATES[0].brandColor);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  // Step 3: First Products (Optional)
  const [items, setItems] = useState<WizardDraftItem[]>([
    {
      id: `item-${Date.now()}`,
      name: '',
      price: '',
      stock: '15',
      description: '',
    },
  ]);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  // Step 4: Contact & Map
  const [phone, setPhone] = useState(activeStore?.phone || '');
  const [whatsapp, setWhatsapp] = useState(activeStore?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(activeStore?.address || '');
  const [mapsShareUrl, setMapsShareUrl] = useState('');
  const [mapsError, setMapsError] = useState<string | null>(null);

  // Step 5: Subdomain
  const [subdomain, setSubdomain] = useState(() =>
    sanitizeSubdomainSlug(activeStore?.name || '')
  );
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);

  // Step 6: Preview & Submit
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!subdomainEdited && businessName) {
      setSubdomain(sanitizeSubdomainSlug(businessName));
    }
  }, [businessName, subdomainEdited]);

  // Live availability verification on Step 5
  useEffect(() => {
    const clean = sanitizeSubdomainSlug(subdomain);
    if (!clean || clean.length < 3) {
      setSubdomainStatus(null);
      return;
    }

    const syncCheck = checkSubdomainAvailability(clean);
    if (!syncCheck.available) {
      setSubdomainStatus({ available: false, reason: syncCheck.reason });
      return;
    }

    let cancelled = false;
    setIsCheckingSubdomain(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkSubdomainAvailabilityAsync(clean);
        if (!cancelled) {
          setSubdomainStatus(res);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSubdomain(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subdomain, checkSubdomainAvailability, checkSubdomainAvailabilityAsync]);

  const handleSelectTemplate = (tpl: CuratedWebsiteTemplate) => {
    setSelectedTemplate(tpl);
    setBrandColor(tpl.brandColor);
  };

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const { publicUrl, error } = await uploadWebsiteAsset({
        file,
        folder: 'logos',
      });
      if (publicUrl && !error) {
        setLogoUrl(publicUrl);
        return;
      }
      // Safe compact fallback if offline/unauthenticated preview
      const fallback = await compressImageFileToCompactDataUrl(file);
      if (fallback) setLogoUrl(fallback);
    } catch {
      showToast('Could not process logo image.', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleProductPhotoUpload = async (itemId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingItemId(itemId);
    try {
      const { publicUrl, error } = await uploadWebsiteAsset({
        file,
        folder: 'products',
      });
      if (publicUrl && !error) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, imageUrl: publicUrl } : it))
        );
        return;
      }
      const fallback = await compressImageFileToCompactDataUrl(file);
      if (fallback) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, imageUrl: fallback } : it))
        );
      }
    } catch {
      showToast('Could not upload product photo.', 'error');
    } finally {
      setUploadingItemId(null);
    }
  };

  const validEnteredItems = useMemo(
    () => items.filter((it) => it.name.trim().length > 0),
    [items]
  );

  const previewWebsiteObject: SubscribedWebsite = useMemo(() => {
    const cleanSub = sanitizeSubdomainSlug(subdomain) || 'yourbrand';
    const displayTitle = businessName.trim() || 'Your Business Name';
    const previewProducts: WebsiteProductItem[] =
      validEnteredItems.length > 0
        ? validEnteredItems.map((it, idx) => {
            const numeric = Number(String(it.price).replace(/[^0-9.]/g, '')) || 0;
            return {
              id: it.id,
              name: it.name.trim(),
              price: numeric > 0 ? `৳${numeric.toLocaleString()}` : it.price || '৳500',
              priceNumeric: numeric || 500,
              description: it.description.trim() || 'Quality product from our store.',
              imageUrl: it.imageUrl,
              category: selectedCategory.label,
              isVisible: true,
              sortOrder: idx,
            };
          })
        : selectedCategory.defaultItems.map((def, idx) => ({
            id: `sample-${idx}`,
            name: def.name,
            price: def.price,
            description: def.description,
            category: selectedCategory.label,
            isVisible: true,
            sortOrder: idx,
          }));

    const normalizedMap = mapsShareUrl.trim()
      ? validateAndNormalizeGoogleMapsUrl(mapsShareUrl.trim())
      : null;

    const themeSettings: WebsiteThemeSettings = {
      ...selectedTemplate.themeSettings,
      primaryColor: brandColor,
      accentColor: selectedTemplate.accentColor,
      backgroundColor: selectedTemplate.bgColor,
      surfaceColor: '#FFFFFF',
      textColor: selectedTemplate.textColor,
      location: normalizedMap?.valid
        ? {
            address: address.trim(),
            mapsShareUrl: normalizedMap.normalizedUrl || mapsShareUrl.trim(),
            latitude: normalizedMap.latitude,
            longitude: normalizedMap.longitude,
            placeName: displayTitle,
            showMap: true,
          }
        : address.trim()
        ? {
            address: address.trim(),
            placeName: displayTitle,
            showMap: true,
          }
        : undefined,
    };

    const nowIso = new Date().toISOString();
    const sections: WebsiteSectionConfig[] = [
      {
        id: 'sec-hero',
        type: 'hero',
        title: displayTitle,
        subtitle: shortDescription.trim() || selectedCategory.shortDesc,
        ctaText: selectedCategory.primaryCtaOptions[0] || 'Order Now',
        ctaLink: whatsapp.trim() || phone.trim() ? 'whatsapp' : '#services',
        enabled: true,
        order: 0,
      },
      {
        id: 'sec-about',
        type: 'about',
        title: 'About Our Business',
        content:
          shortDescription.trim() ||
          `Welcome to ${displayTitle}. Browse our latest offerings and order easily online.`,
        enabled: true,
        order: 1,
      },
      {
        id: 'sec-products',
        type: 'products',
        title: selectedCategory.itemTypeLabel || 'Featured Products',
        subtitle: 'Browse available items below and place your order online.',
        enabled: true,
        order: 2,
      },
      {
        id: 'sec-location',
        type: 'location',
        title: 'Visit Our Location',
        subtitle: address.trim() || undefined,
        enabled: Boolean(normalizedMap?.valid || address.trim()),
        order: 3,
      },
      {
        id: 'sec-contact',
        type: 'contact',
        title: 'Get in Touch',
        subtitle: 'Reach out directly for quick assistance or orders.',
        enabled: true,
        order: 4,
      },
    ];

    return {
      id: 'wizard-preview',
      userId: user?.id || 'preview',
      storeId: activeStore?.id || 'store-1',
      businessName: displayTitle,
      ownerName: user?.name || displayTitle,
      email: email.trim(),
      phone: phone.trim(),
      whatsappNumber: whatsapp.trim() || phone.trim(),
      address: address.trim(),
      niche: selectedCategory.id,
      nicheLabel: selectedCategory.label,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      subdomain: cleanSub,
      fullDomainUrl: `${cleanSub}.amaas.xyz`,
      brandColor,
      logoUrl: logoUrl || undefined,
      headline: displayTitle,
      subheadline: shortDescription.trim() || selectedCategory.shortDesc,
      aboutText:
        shortDescription.trim() ||
        `Welcome to ${displayTitle}. Browse our latest offerings and order easily online.`,
      heroCtaText: selectedCategory.primaryCtaOptions[0] || 'Order Now',
      heroCtaLink: whatsapp.trim() || phone.trim() ? 'whatsapp' : '#services',
      servicesOrProducts: previewProducts,
      socialLinks: {},
      sections,
      themeSettings,
      planName: websiteSubscriptionPlan.name || 'GoAMAAS Website',
      monthlyFee: websiteSubscriptionPlan.priceMonthly || 600,
      subscriptionStatus: 'draft',
      paymentStatus: 'pending',
      deploymentStatus: 'draft',
      sslStatus: 'pending',
      nextBillingDate: nowIso.split('T')[0],
      createdAt: nowIso.split('T')[0],
      lastUpdatedAt: nowIso,
      resourceUsage: {
        pagesCount: 1,
        pagesLimit: 10,
        storageUsedMb: 1,
        storageLimitMb: 1024,
        bandwidthUsedGb: 0,
        bandwidthLimitGb: 100,
        monthlyUpdatesUsed: 0,
        monthlyUpdatesLimit: 50,
      },
      hasUnpublishedDraft: false,
    };
  }, [
    subdomain,
    businessName,
    validEnteredItems,
    selectedCategory,
    selectedTemplate,
    whatsapp,
    phone,
    email,
    address,
    logoUrl,
    brandColor,
    shortDescription,
    mapsShareUrl,
    user?.id,
    user?.name,
    activeStore?.id,
    websiteSubscriptionPlan.name,
    websiteSubscriptionPlan.priceMonthly,
  ]);

  const validateCurrentStep = (): boolean => {
    setSubmitError(null);
    if (step === 1) {
      if (!businessName.trim()) {
        setSubmitError(t.createWebsitePage.toasts.enterBusinessName);
        return false;
      }
      return true;
    }
    if (step === 4 && mapsShareUrl.trim()) {
      const check = validateAndNormalizeGoogleMapsUrl(mapsShareUrl.trim());
      if (!check.valid) {
        setMapsError(check.error || 'Please paste a valid Google Maps URL.');
        return false;
      }
      setMapsError(null);
      return true;
    }
    if (step === 5) {
      const clean = sanitizeSubdomainSlug(subdomain);
      if (!clean || clean.length < 3) {
        setSubmitError(t.createWebsitePage.step2.subdomainMinChars);
        return false;
      }
      if (isCheckingSubdomain) {
        setSubmitError(ob.subdomainChecking);
        return false;
      }
      if (subdomainStatus && !subdomainStatus.available) {
        setSubmitError(subdomainStatus.reason || ob.subdomainTaken);
        return false;
      }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (step < 6) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4 | 5 | 6);
    }
  };

  const handleBack = () => {
    setSubmitError(null);
    if (step > 1) {
      setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5 | 6);
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleSkipProducts = () => {
    setSubmitError(null);
    setStep(4);
  };

  const handleCreateWebsite = async () => {
    if (isCreating) return;
    const clean = sanitizeSubdomainSlug(subdomain);
    if (!clean || clean.length < 3) {
      setStep(5);
      setSubmitError(t.createWebsitePage.step2.subdomainMinChars);
      return;
    }

    setIsCreating(true);
    setSubmitError(null);
    try {
      const availability = await checkSubdomainAvailabilityAsync(clean);
      if (!availability.available) {
        setStep(5);
        setSubmitError(availability.reason || ob.subdomainTaken);
        setIsCreating(false);
        return;
      }

      const created = await createSubscribedWebsite({
        expectedUserId: user?.id,
        storeId: activeStore?.id,
        businessName: previewWebsiteObject.businessName,
        ownerName: previewWebsiteObject.ownerName,
        email: previewWebsiteObject.email,
        phone: previewWebsiteObject.phone,
        niche: previewWebsiteObject.niche,
        nicheLabel: previewWebsiteObject.nicheLabel,
        templateId: previewWebsiteObject.templateId,
        templateName: previewWebsiteObject.templateName,
        subdomain: clean,
        brandColor: previewWebsiteObject.brandColor,
        logoUrl: previewWebsiteObject.logoUrl,
        heroCtaText: previewWebsiteObject.heroCtaText,
        heroCtaLink: previewWebsiteObject.heroCtaLink,
        address: previewWebsiteObject.address,
        headline: previewWebsiteObject.headline,
        subheadline: previewWebsiteObject.subheadline,
        aboutText: previewWebsiteObject.aboutText,
        servicesOrProducts: previewWebsiteObject.servicesOrProducts,
        whatsappNumber: previewWebsiteObject.whatsappNumber,
        socialLinks: previewWebsiteObject.socialLinks,
        sections: previewWebsiteObject.sections,
        themeSettings: previewWebsiteObject.themeSettings,
      });

      // Also sync any manually entered products into the merchant catalog
      for (let i = 0; i < validEnteredItems.length; i++) {
        const it = validEnteredItems[i];
        const numericPrice = Number(String(it.price).replace(/[^0-9.]/g, '')) || 0;
        const numericStock = Number(it.stock) || 10;
        await addProduct({
          name: it.name.trim(),
          sku: `SKU-${clean.toUpperCase().slice(0, 4)}-${101 + i}`,
          category: selectedCategory.label,
          price: numericPrice,
          costPrice: Math.round(numericPrice * 0.6),
          stock: numericStock,
          lowStockThreshold: 5,
          status: 'active',
          description: it.description.trim() || `${it.name.trim()} available at ${businessName.trim()}`,
          image: it.imageUrl,
          websiteId: created.id,
          isVisible: true,
          sortOrder: i,
          isFeatured: i === 0,
        });
      }

      showToast(
        lang === 'bn'
          ? 'আপনার ওয়েবসাইট সফলভাবে তৈরি হয়েছে!'
          : 'Your website has been created!',
        'success'
      );
      onSuccess(created);
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not create website. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Compact Beginner Step Progress */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {ob.stepOf(step, 6)}
          </span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {ob.stepLabels[step - 1]}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((idx) => {
            const done = idx < step;
            const current = idx === step;
            return (
              <div key={idx} className="space-y-1.5">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    done
                      ? 'bg-emerald-500'
                      : current
                      ? 'bg-blue-600'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                />
                <span className="hidden sm:block text-[11px] font-medium truncate text-slate-500 dark:text-slate-400">
                  {ob.stepLabels[idx - 1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Step Card */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-8 shadow-sm space-y-6">
        {submitError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs sm:text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* STEP 1: BUSINESS INFO */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {ob.step1Title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {ob.step1Subtitle}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {ob.businessNameLabel}
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={ob.businessNamePlaceholder}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {ob.categoryLabel}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {CATEGORY_SPECS.map((cat) => {
                  const active = selectedCategory.id === cat.id;
                  const localized = t.createWebsitePage.categories[cat.id];
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`p-3.5 rounded-xl border text-left transition-colors flex flex-col gap-1 cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {localized?.label || cat.label}
                        </span>
                        {active && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        {localized?.shortDesc || cat.shortDesc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {ob.descriptionLabel}
              </label>
              <textarea
                rows={3}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder={ob.descriptionPlaceholder}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* STEP 2: BRAND & DESIGN */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {ob.step2Title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {ob.step2Subtitle}
              </p>
            </div>

            {/* Logo Uploader */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {ob.logoUploadLabel}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    PNG, JPG or WebP — square or horizontal works best.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  {logoUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{logoUrl ? ob.logoReplaceBtn : ob.logoUploadBtn}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    {ob.logoRemoveBtn}
                  </button>
                )}
              </div>
            </div>

            {/* Visual Design Templates */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {ob.templateStyleLabel}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {CURATED_WEBSITE_TEMPLATES.map((tpl) => {
                  const active = selectedTemplate.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div
                        className="h-14 rounded-lg mb-3 p-2.5 flex items-end justify-between border border-black/5"
                        style={{ backgroundColor: tpl.bgColor }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-4 h-4 rounded-full border border-white/70 shadow-xs"
                            style={{ backgroundColor: tpl.brandColor }}
                          />
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: tpl.textColor }}
                          >
                            {businessName.trim() || 'Brand'}
                          </span>
                        </div>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded font-semibold text-white"
                          style={{ backgroundColor: tpl.brandColor }}
                        >
                          Shop
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {lang === 'bn' ? tpl.nameBn : tpl.name}
                        </span>
                        {active && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {lang === 'bn' ? tpl.descriptionBn : tpl.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Brand Color Quick Swatches */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {ob.colorStyleLabel}
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {['#2563EB', '#059669', '#D97706', '#7C3AED', '#E11D48', '#0F172A'].map(
                  (hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setBrandColor(hex)}
                      aria-label={`Select color ${hex}`}
                      className={`w-9 h-9 rounded-full border-2 transition-transform cursor-pointer ${
                        brandColor === hex
                          ? 'border-slate-900 dark:border-white scale-110'
                          : 'border-white dark:border-slate-800'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  )
                )}
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent p-0.5"
                  aria-label="Custom brand color picker"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: FIRST PRODUCTS (OPTIONAL + SKIP) */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {ob.step3Title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {ob.step3Subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSkipProducts}
                className="self-start sm:self-auto min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
              >
                {ob.skipProductsBtn}
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.filter((it) => it.id !== item.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        aria-label="Remove product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Photo */}
                    <div className="shrink-0">
                      <label className="w-24 h-24 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden hover:border-blue-500 transition-colors">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name || 'Product'}
                            className="w-full h-full object-cover"
                          />
                        ) : uploadingItemId === item.id ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-slate-400" />
                            <span className="text-[10px] font-medium text-slate-500 px-1 text-center">
                              {ob.uploadPhotoBtn}
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            void handleProductPhotoUpload(item.id, e.target.files?.[0])
                          }
                        />
                      </label>
                    </div>

                    {/* Fields */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id ? { ...it, name: e.target.value } : it
                              )
                            )
                          }
                          placeholder={ob.productNamePlaceholder}
                          className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
                        <input
                          type="text"
                          value={item.price}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id ? { ...it, price: e.target.value } : it
                              )
                            )
                          }
                          placeholder={ob.productPricePlaceholder}
                          className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? { ...it, description: e.target.value }
                                  : it
                              )
                            )
                          }
                          placeholder={ob.productDescPlaceholder}
                          className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  {
                    id: `item-${Date.now()}-${prev.length}`,
                    name: '',
                    price: '',
                    stock: '15',
                    description: '',
                  },
                ])
              }
              className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{ob.addProductBtn}</span>
            </button>
          </div>
        )}

        {/* STEP 4: CONTACT & MAP */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {ob.step4Title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {ob.step4Subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {ob.phoneLabel}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+880 1700-000000"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {ob.whatsappLabel}
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+880 1700-000000"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {ob.emailLabel}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@yourshop.com"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {ob.addressLabel}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Road 11, Banani, Dhaka"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>{ob.mapsUrlLabel}</span>
              </label>
              <input
                type="url"
                value={mapsShareUrl}
                onChange={(e) => {
                  setMapsShareUrl(e.target.value);
                  setMapsError(null);
                }}
                placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/..."
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {ob.mapsUrlHelper}
              </p>
              {mapsError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{mapsError}</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: WEBSITE ADDRESS */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {ob.step5Title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {ob.step5Subtitle}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 text-xs sm:text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
              {ob.subdomainExplainer}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {ob.subdomainLabel}
              </label>
              <div className="flex items-stretch rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500">
                <div className="pl-3.5 flex items-center text-slate-400">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => {
                    setSubdomainEdited(true);
                    setSubdomain(sanitizeSubdomainSlug(e.target.value));
                  }}
                  placeholder="yourbrand"
                  className="flex-1 min-h-[46px] px-3 py-2.5 text-sm font-mono bg-transparent text-slate-900 dark:text-white focus:outline-hidden"
                />
                <span className="px-3.5 bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex items-center text-xs sm:text-sm font-mono font-semibold text-slate-600 dark:text-slate-300">
                  .amaas.xyz
                </span>
              </div>

              <div className="mt-2.5 min-h-[20px] text-xs">
                {isCheckingSubdomain ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{ob.subdomainChecking}</span>
                  </span>
                ) : subdomainStatus?.available ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {ob.subdomainAvailable(`${sanitizeSubdomainSlug(subdomain)}.amaas.xyz`)}
                    </span>
                  </span>
                ) : subdomainStatus && !subdomainStatus.available ? (
                  <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{subdomainStatus.reason || ob.subdomainTaken}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: LIVE PREVIEW & CREATE */}
        {step === 6 && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {ob.step6Title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {ob.step6Subtitle}
                </p>
              </div>

              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{t.workspace.builder.desktopPreview}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{t.workspace.builder.mobilePreview}</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-100/80 dark:bg-slate-950 p-3 sm:p-4 overflow-hidden">
              <div
                className={`mx-auto transition-all duration-200 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-lg bg-white ${
                  previewDevice === 'mobile' ? 'max-w-[380px]' : 'w-full'
                }`}
              >
                <div className="h-[460px] overflow-y-auto scrollbar-thin">
                  <WebsitePreviewRenderer
                    site={previewWebsiteObject}
                    viewMode={previewDevice}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Action Bar */}
        <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isCreating}
            onClick={handleBack}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{ob.backBtn}</span>
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>{ob.nextBtn}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isCreating}
              onClick={() => void handleCreateWebsite()}
              className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{isCreating ? ob.creatingBtn : ob.createMyWebsiteBtn}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
