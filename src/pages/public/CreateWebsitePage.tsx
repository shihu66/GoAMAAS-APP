import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SubscribedWebsite, BusinessNiche } from '../../types';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { ManualPaymentModal } from '../../components/payment/ManualPaymentModal';
import { CATEGORY_SPECS, THEME_PALETTES, CategorySpec } from '../../data/websiteBuilderConfig';
import {
  Globe,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Palette,
  Layout,
  Smartphone,
  Monitor,
  ShieldCheck,
  CreditCard,
  Zap,
  Building,
  Store,
  Utensils,
  Dumbbell,
  Scissors,
  Home,
  Briefcase,
  User,
  Plus,
  Trash2,
  Copy,
  Lock,
  MessageSquare,
  Search,
} from 'lucide-react';

export const CreateWebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user,
    isAuthenticated,
    activeStore,
    websiteSubscriptionPlan,
    createSubscribedWebsite,
    checkSubdomainAvailability,
    paymentRequests,
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
  const [subdomain, setSubdomain] = useState('');
  const [isSubdomainChecking, setIsSubdomainChecking] = useState(false);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);

  // Visual Theme & Palette
  const [selectedPalette, setSelectedPalette] = useState(THEME_PALETTES[0]);
  const [brandColor, setBrandColor] = useState(THEME_PALETTES[0].brandColor);
  const [headline, setHeadline] = useState('Premium Quality & Exceptional Service');
  const [subheadline, setSubheadline] = useState('Explore our curated collections and connect with our specialists today.');
  const [aboutText, setAboutText] = useState('We are a forward-thinking business dedicated to craftsmanship, authenticity, and attentive customer service.');
  const [phone, setPhone] = useState(activeStore?.phone || '+880 1822-332020');
  const [whatsappNumber, setWhatsappNumber] = useState(activeStore?.phone || '+880 1822-332020');
  const [address, setAddress] = useState(activeStore?.address || 'Dhaka, Bangladesh');

  // Category items
  const [items, setItems] = useState<Array<{ id: string; name: string; price: string; description: string }>>([
    { id: '1', name: selectedCategory.defaultItems[0]?.name || 'Flagship Item', price: selectedCategory.defaultItems[0]?.price || '৳1,500', description: selectedCategory.defaultItems[0]?.description || 'Top tier quality' },
    { id: '2', name: selectedCategory.defaultItems[1]?.name || 'Secondary Service', price: selectedCategory.defaultItems[1]?.price || '৳2,500', description: selectedCategory.defaultItems[1]?.description || 'Customer favorite' },
  ]);

  // CTA Selection
  const [primaryCta, setPrimaryCta] = useState(selectedCategory.primaryCtaOptions[0] || 'Order on WhatsApp');

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [createdSiteId, setCreatedSiteId] = useState<string>('');

  // Update defaults when category changes
  const handleSelectCategory = (cat: CategorySpec) => {
    setSelectedCategory(cat);
    if (!headline || headline === 'Premium Quality & Exceptional Service') {
      setHeadline(`Welcome to Our Official ${cat.label} Space`);
    }
    setPrimaryCta(cat.primaryCtaOptions[0] || 'Contact Us');
    setItems([
      { id: '1', name: cat.defaultItems[0]?.name || 'Core Product', price: cat.defaultItems[0]?.price || '৳1,500', description: cat.defaultItems[0]?.description || 'High quality' },
      { id: '2', name: cat.defaultItems[1]?.name || 'Popular Service', price: cat.defaultItems[1]?.price || '৳2,500', description: cat.defaultItems[1]?.description || 'Recommended choice' },
    ]);
    setStep(2);
  };

  // Subdomain validation
  useEffect(() => {
    if (!subdomain.trim()) {
      setSubdomainError(null);
      return;
    }
    const clean = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean !== subdomain) {
      setSubdomain(clean);
    }
    if (clean.length < 3) {
      setSubdomainError('Subdomain must be at least 3 characters.');
      return;
    }
    const available = checkSubdomainAvailability(clean);
    if (!available) {
      setSubdomainError('This subdomain is already taken or reserved.');
    } else {
      setSubdomainError(null);
    }
  }, [subdomain, checkSubdomainAvailability]);

  // Auto-generate subdomain from business name
  const handleNameChange = (val: string) => {
    setBusinessName(val);
    if (!subdomain) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18);
      setSubdomain(slug);
    }
  };

  const handleAddItem = () => {
    const nextId = String(Date.now());
    setItems((prev) => [
      ...prev,
      { id: nextId, name: `New ${selectedCategory.itemTypeLabel.slice(0, -1)}`, price: '৳1,000', description: 'Detailed specifications and highlights.' },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      showToast('You must keep at least one item or offering.', 'warning');
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: 'name' | 'price' | 'description', value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Construct draft website object for preview
  const draftSite: Partial<SubscribedWebsite> = {
    businessName: businessName || 'Your Business Name',
    niche: selectedCategory.id,
    nicheLabel: selectedCategory.label,
    brandColor,
    subdomain: subdomain || 'yourbusiness',
    fullDomainUrl: `${subdomain || 'yourbusiness'}.amaas.xyz`,
    headline,
    subheadline,
    aboutText,
    phone,
    whatsappNumber,
    address,
    servicesOrProducts: items,
    planName: 'AMAAS Website Lite',
    monthlyFee: websiteSubscriptionPlan.priceMonthly,
    subscriptionStatus: 'active',
    deploymentStatus: 'live',
  };

  const handleCompleteDraft = () => {
    if (!isAuthenticated) {
      showToast('Please sign in to save and launch your website.', 'warning');
      navigate('/login?redirect=/create-website');
      return;
    }
    if (!businessName.trim()) {
      showToast('Please enter your business name.', 'warning');
      setStep(2);
      return;
    }
    if (!subdomain.trim() || subdomainError) {
      showToast('Please choose an available AMAAS subdomain.', 'warning');
      setStep(2);
      return;
    }

    const newId = `web-${Date.now()}`;
    setCreatedSiteId(newId);

    // Save initial record as pending subscription payment
    createSubscribedWebsite({
      storeId: activeStore?.id || 'store-1',
      businessName,
      ownerName: user?.name || 'Store Owner',
      email: user?.email || 'contact@business.com',
      phone,
      niche: selectedCategory.id,
      nicheLabel: selectedCategory.label,
      templateId: 'tpl-modern-business',
      templateName: `${selectedCategory.label} Pro`,
      subdomain,
      fullDomainUrl: `${subdomain}.amaas.xyz`,
      brandColor,
      address,
      headline,
      subheadline,
      aboutText,
      servicesOrProducts: items,
      whatsappNumber,
      socialLinks: { facebook: 'https://facebook.com', instagram: 'https://instagram.com' },
      planName: 'AMAAS Website Lite',
      monthlyFee: websiteSubscriptionPlan.priceMonthly,
      subscriptionStatus: 'active',
      paymentStatus: 'pending',
      deploymentStatus: 'provisioning',
      sslStatus: 'active',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    setStep(5);
  };

  // Filtered categories
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
        {/* Wizard Progress Stepper */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between max-w-3xl mx-auto text-xs font-semibold">
            {[
              { num: 1, label: '1. Category' },
              { num: 2, label: '2. Business Info' },
              { num: 3, label: '3. Offerings & Items' },
              { num: 4, label: '4. Colors & Theme' },
              { num: 5, label: '5. Launch & Pay' },
            ].map((s) => (
              <button
                key={s.num}
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
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Step 1 of 5
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Select Your Business Industry
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Choose the category that best matches your trade. Your website forms, fields, and CTAs will adapt automatically.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search industries (e.g. food, clinic, fashion)..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 text-xs">
                {['All', 'Commerce', 'Food & Hospitality', 'Property & Construction', 'Health & Personal Care', 'Professional Services'].map((grp) => (
                  <button
                    key={grp}
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

            {/* Category Cards Grid */}
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
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cat.group}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 font-medium">
                          {cat.itemTypeLabel}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{cat.label}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{cat.shortDesc}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-blue-600">
                      <span>Select Industry & Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS INFORMATION */}
        {step === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Step 2 of 5 · {selectedCategory.label}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Tell Us About Your Business
              </h2>
              <p className="text-xs text-slate-500">
                Configure your brand name, official contact details, and free <code className="font-mono text-blue-600">.amaas.xyz</code> subdomain.
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
                  placeholder="e.g. Apex Lifestyle & Boutique"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                />
              </div>

              {/* Subdomain Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Free Subdomain (yourbusiness.amaas.xyz) *
                </label>
                <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                  <span className="px-3 text-slate-400 font-mono text-xs">https://</span>
                  <input
                    type="text"
                    required
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    placeholder="mybusiness"
                    className="flex-1 py-2.5 bg-transparent font-mono text-xs font-bold text-blue-600 outline-none"
                  />
                  <span className="px-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono text-xs border-l border-slate-200 dark:border-slate-600">
                    .amaas.xyz
                  </span>
                </div>
                {subdomainError ? (
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

              {/* Phone & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Phone Number *
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
                    WhatsApp Orders / Chat Number *
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

              {/* Office Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Physical Store / Office Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. House 42, Road 11, Banani, Dhaka"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              {/* Headline & Subheadline */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Homepage Hero Headline
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
                  Supporting Story / Subtitle
                </label>
                <textarea
                  rows={2}
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Category</span>
              </button>
              <button
                type="button"
                disabled={!businessName.trim() || !subdomain.trim() || !!subdomainError}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>Continue to Offerings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OFFERINGS & PRODUCTS */}
        {step === 3 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Step 3 of 5 · {selectedCategory.label}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Showcase Your {selectedCategory.itemTypeLabel}
              </h2>
              <p className="text-xs text-slate-500">
                Add featured items, services, or properties for your storefront with pricing and descriptions.
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
                      {selectedCategory.itemTypeLabel.slice(0, -1)} #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Title / Name *
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
                        Display Price / Fee *
                      </label>
                      <input
                        type="text"
                        value={item.price}
                        onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                        placeholder="e.g. ৳1,850 or Custom"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Highlight Description
                    </label>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>+ Add Another {selectedCategory.itemTypeLabel.slice(0, -1)}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Theme</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: COLOR THEME & PREVIEW */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Step 4 of 5 · Design & Live Preview
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Choose Brand Colors & Visual Theme
              </h2>
              <p className="text-xs text-slate-500">
                Personalize your storefront palette and verify how your website looks across mobile and desktop devices.
              </p>
            </div>

            {/* Palette Selection Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {THEME_PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => {
                    setSelectedPalette(pal);
                    setBrandColor(pal.brandColor);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    brandColor === pal.brandColor
                      ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full shadow-xs mb-2" style={{ backgroundColor: pal.brandColor }} />
                  <span className="font-bold text-[11px] text-slate-900 dark:text-white block truncate">{pal.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{pal.fontPairing}</span>
                </button>
              ))}
            </div>

            {/* Device Switcher for Preview */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Interactive Live Preview: https://{subdomain || 'yourbusiness'}.amaas.xyz</span>
              </div>
              <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-md flex items-center gap-1 ${
                    previewDevice === 'desktop' ? 'bg-white dark:bg-slate-900 shadow-xs text-blue-600 font-bold' : 'text-slate-500'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-md flex items-center gap-1 ${
                    previewDevice === 'mobile' ? 'bg-white dark:bg-slate-900 shadow-xs text-blue-600 font-bold' : 'text-slate-500'
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
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleCompleteDraft}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer"
              >
                <span>Save Draft & Proceed to Subscription</span>
                <ArrowRight className="w-3.5 h-3.5" />
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
                Website Draft Created Successfully!
              </h2>
              <p className="text-xs text-slate-500">
                Your website has been saved at <strong className="font-mono text-blue-600">https://{subdomain}.amaas.xyz</strong>.
              </p>
            </div>

            {/* Policy Disclosure Box: Website Service Free Trial Exclusion */}
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Website Service Subscription Terms (No Free Trial)</span>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-800 dark:text-amber-300">
                To guarantee zero downtime, dedicated SSL provisioning, and cloud hosting infrastructure, the <strong>AMAAS Website Lite</strong> service does not operate on a free trial. Public domain publishing is enabled immediately once your manual payment is verified by our administrative team.
              </p>
            </div>

            {/* Plan Fee Breakdown Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">AMAAS Website Lite Subscription</h3>
                  <span className="text-[11px] text-slate-400 font-mono">https://{subdomain}.amaas.xyz</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-blue-600 font-mono tabular-nums">৳600</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Free <code className="font-mono text-blue-600">{subdomain}.amaas.xyz</code> subdomain with instant SSL</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cloud SSD hosting with unlimited bandwidth</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Up to 2 monthly content update requests handled by AMAAS engineers</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cash on Delivery order capture and direct WhatsApp chat button</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full sm:flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Submit Payment (bKash / Nagad / Bank)</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/subscribed-website')}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  Go to Website Hub
                </button>
              </div>
            </div>

            {/* Custom Domain Request Callout */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Want to connect your own custom domain?</span>
                <span className="text-[11px] text-slate-500">
                  e.g. <strong className="font-mono">www.yourbrand.com</strong> instead of .amaas.xyz.
                </span>
              </div>
              <a
                href={`https://wa.me/8801822332020?text=${encodeURIComponent(`Hello AMAAS! I created a website draft for "${businessName}" (${subdomain}.amaas.xyz) and would like to connect a custom top-level domain.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Contact on WhatsApp</span>
              </a>
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
        serviceName={`AMAAS Website Lite (${businessName})`}
        planTier="৳600/month"
        amount={600}
        onSuccess={() => {
          showToast('Payment submitted for verification! Your website will be publicly active once approved.', 'success');
          navigate('/dashboard/subscribed-website');
        }}
      />
    </div>
  );
};
