import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SubscribedWebsite, BusinessNiche } from '../../types';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
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
} from 'lucide-react';

const NICHES: Array<{ id: BusinessNiche; label: string; icon: any; defaultProducts: Array<{ name: string; price: string; description: string }> }> = [
  {
    id: 'restaurant',
    label: 'Restaurant & Dining',
    icon: Utensils,
    defaultProducts: [
      { name: 'Chef Special Biryani', price: '৳550', description: 'Fragrant basmati rice with slow-cooked tender meat.' },
      { name: 'Grilled Kebab Platter', price: '৳720', description: 'Assorted charcoal-grilled skewers with mint chutney.' },
    ],
  },
  {
    id: 'cafe',
    label: 'Café & Roastery',
    icon: Utensils,
    defaultProducts: [
      { name: 'Single Origin Pour-Over', price: '৳380', description: 'Freshly roasted Ethiopian beans with floral aroma.' },
      { name: 'French Croissant Basket', price: '৳450', description: 'Warm baked butter croissants with strawberry preserve.' },
    ],
  },
  {
    id: 'ecommerce',
    label: 'Retail & E-Commerce',
    icon: Store,
    defaultProducts: [
      { name: 'Signature Cotton Shirt', price: '৳1,850', description: '100% Egyptian combed breathable cotton.' },
      { name: 'Minimalist Automatic Watch', price: '৳4,200', description: 'Sleek brushed steel case with sapphire crystal.' },
    ],
  },
  {
    id: 'gym',
    label: 'Fitness & Gym Studio',
    icon: Dumbbell,
    defaultProducts: [
      { name: 'Monthly All-Access Pass', price: '৳3,500/mo', description: 'Full access to weight room, cardio, and saunas.' },
      { name: 'Personal Coaching (10 Sessions)', price: '৳10,000', description: 'Custom nutrition guidelines and 1-on-1 coaching.' },
    ],
  },
  {
    id: 'salon',
    label: 'Salon, Spa & Beauty',
    icon: Scissors,
    defaultProducts: [
      { name: 'Signature Hair Spa & Treatment', price: '৳2,200', description: 'Deep botanical conditioning and scalp massage.' },
      { name: 'Organic Facial Cleanse', price: '৳1,800', description: 'Herbal exfoliation with revitalizing clay mask.' },
    ],
  },
  {
    id: 'real_estate',
    label: 'Real Estate & Properties',
    icon: Home,
    defaultProducts: [
      { name: 'Luxury 3-Bed Gulshan Flat', price: '৳3.8 Cr', description: '2,400 sqft apartment with 2 parking spots and lake view.' },
      { name: 'Commercial Office Space Banani', price: '৳1.8L/mo', description: '1,800 sqft plug-and-play modern corporate suite.' },
    ],
  },
  {
    id: 'agency',
    label: 'Creative & Digital Agency',
    icon: Briefcase,
    defaultProducts: [
      { name: 'Brand Identity Package', price: '৳25,000', description: 'Complete typography, logo guide, and brand guidelines.' },
      { name: 'Social Media Growth Management', price: '৳18,000/mo', description: '16 high-converting monthly posts and ads manager.' },
    ],
  },
  {
    id: 'portfolio',
    label: 'Professional Portfolio',
    icon: User,
    defaultProducts: [
      { name: 'Consulting Session (1 Hour)', price: '৳5,000', description: 'Strategic business advisory and architecture review.' },
      { name: 'Full-Stack Development Project', price: 'Custom', description: 'Custom tailored software development per scope.' },
    ],
  },
];

const TEMPLATES = [
  {
    id: 'tpl-modern-business',
    name: 'Modern Executive',
    description: 'Clean typography, high-impact hero, and elegant card grids.',
    previewColor: '#2563EB',
  },
  {
    id: 'tpl-warm-bistro',
    name: 'Warm Culinary & Boutique',
    description: 'Earthy luxury tones, menu item highlights, and instant WhatsApp chat.',
    previewColor: '#D97706',
  },
  {
    id: 'tpl-vibrant-power',
    name: 'Vibrant Dynamic',
    description: 'Energetic, bold contrasts for fitness studios, gadgets, and active brands.',
    previewColor: '#EF4444',
  },
  {
    id: 'tpl-minimal-emerald',
    name: 'Botanical Organic',
    description: 'Serene, clean layout designed for wellness, spas, organics, and eco-brands.',
    previewColor: '#059669',
  },
];

const BRAND_COLORS = [
  { name: 'Electric Blue', hex: '#2563EB' },
  { name: 'Emerald Forest', hex: '#059669' },
  { name: 'Warm Amber', hex: '#D97706' },
  { name: 'Crimson Power', hex: '#EF4444' },
  { name: 'Royal Purple', hex: '#7C3AED' },
  { name: 'Midnight Slate', hex: '#334155' },
];

export const CreateWebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    activeStore,
    user,
    websiteSubscriptionPlan,
    createSubscribedWebsite,
    checkSubdomainAvailability,
    showToast,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Form State
  const [businessName, setBusinessName] = useState(activeStore?.name || '');
  const [niche, setNiche] = useState<BusinessNiche>('ecommerce');
  const [brandColor, setBrandColor] = useState('#2563EB');
  const [phone, setPhone] = useState(activeStore?.phone || '+880 1711-889900');
  const [email, setEmail] = useState(user?.email || 'contact@mybusiness.com');
  const [address, setAddress] = useState('Dhaka, Bangladesh');
  const [whatsappNumber, setWhatsappNumber] = useState(activeStore?.phone || '+880 1711-889900');
  const [headline, setHeadline] = useState('Quality Products & Exceptional Service');
  const [subheadline, setSubheadline] = useState('Welcome to our official business website. Browse our offerings and chat with us.');
  const [aboutText, setAboutText] = useState('We are a committed local business dedicated to delivering the highest quality products and personalized customer service.');
  const [socialLinks, setSocialLinks] = useState({ facebook: '', instagram: '' });

  // Template State
  const [selectedTemplateId, setSelectedTemplateId] = useState('tpl-modern-business');

  // Products/Services list
  const [items, setItems] = useState<Array<{ id: string; name: string; price: string; description: string }>>([
    { id: '1', name: 'Signature Offering 1', price: '৳1,500', description: 'Our bestselling product crafted with premium quality.' },
    { id: '2', name: 'Signature Offering 2', price: '৳2,800', description: 'Exceptional service delivered with guaranteed satisfaction.' },
  ]);

  // Subdomain
  const [subdomain, setSubdomain] = useState('');
  const [subdomainCheckResult, setSubdomainCheckResult] = useState<{ available: boolean; reason?: string } | null>(null);

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Deployment Simulation
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStage, setDeploymentStage] = useState(0);

  // Payment Demo Method
  const [paymentGateway, setPaymentGateway] = useState<'bKash' | 'Nagad' | 'Card'>('bKash');

  // Auto-generate suggested subdomain when business name changes
  useEffect(() => {
    if (businessName && !subdomain) {
      const suggested = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
      setSubdomain(suggested.slice(0, 20));
    }
  }, [businessName]);

  // Auto-fill template & default offerings when niche changes
  const handleNicheSelect = (selectedNiche: BusinessNiche) => {
    setNiche(selectedNiche);
    const nicheObj = NICHES.find((n) => n.id === selectedNiche);
    if (nicheObj) {
      setItems(
        nicheObj.defaultProducts.map((p, idx) => ({
          id: String(idx + 1),
          ...p,
        }))
      );
      if (selectedNiche === 'cafe' || selectedNiche === 'restaurant') {
        setSelectedTemplateId('tpl-warm-bistro');
        setBrandColor('#D97706');
        setHeadline('Artisan Flavors & Memorable Dining');
      } else if (selectedNiche === 'gym') {
        setSelectedTemplateId('tpl-vibrant-power');
        setBrandColor('#EF4444');
        setHeadline('Transform Your Fitness & Unleash Your Strength');
      } else if (selectedNiche === 'salon') {
        setSelectedTemplateId('tpl-minimal-emerald');
        setBrandColor('#059669');
        setHeadline('Rejuvenate Your Mind, Body & Style');
      } else {
        setSelectedTemplateId('tpl-modern-business');
        setBrandColor('#2563EB');
        setHeadline('Premium Essentials & Reliable Service');
      }
    }
  };

  // Subdomain Validation effect
  useEffect(() => {
    if (subdomain) {
      const result = checkSubdomainAvailability(subdomain);
      setSubdomainCheckResult(result);
    } else {
      setSubdomainCheckResult(null);
    }
  }, [subdomain]);

  // Add Item
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: 'New Offering',
        price: '৳500',
        description: 'Brief description of this offering.',
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: 'name' | 'price' | 'description', value: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  // Deployment action
  const handleDeployAndActivate = () => {
    if (!subdomainCheckResult?.available) {
      showToast('Please specify a valid, available subdomain first.', 'error');
      setStep(4);
      return;
    }

    setIsDeploying(true);
    setDeploymentStage(1);

    setTimeout(() => {
      setDeploymentStage(2);
      setTimeout(() => {
        setDeploymentStage(3);
        setTimeout(() => {
          setDeploymentStage(4);
          setTimeout(() => {
            // Commit to AppContext
            const selectedNicheObj = NICHES.find((n) => n.id === niche);
            const selectedTpl = TEMPLATES.find((t) => t.id === selectedTemplateId);

            createSubscribedWebsite({
              storeId: activeStore?.id || 'store-1',
              businessName,
              ownerName: user?.name || 'Store Owner',
              email,
              phone,
              niche,
              nicheLabel: selectedNicheObj?.label || 'Business',
              templateId: selectedTemplateId,
              templateName: selectedTpl?.name || 'Modern Executive',
              subdomain,
              fullDomainUrl: `${subdomain}.amaas.xyz`,
              brandColor,
              address,
              headline,
              subheadline,
              aboutText,
              servicesOrProducts: items,
              whatsappNumber,
              socialLinks,
              planName: websiteSubscriptionPlan.name,
              monthlyFee: websiteSubscriptionPlan.priceMonthly,
              subscriptionStatus: 'active',
              paymentStatus: 'paid',
              deploymentStatus: 'provisioning',
              sslStatus: 'pending',
              nextBillingDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            });

            setIsDeploying(false);
            navigate('/dashboard/subscribed-website');
          }, 900);
        }, 900);
      }, 900);
    }, 900);
  };

  // Assembled site preview object
  const currentPreviewSite: Partial<SubscribedWebsite> = {
    businessName,
    niche,
    nicheLabel: NICHES.find((n) => n.id === niche)?.label,
    brandColor,
    subdomain: subdomain || 'yourbusiness',
    fullDomainUrl: `${subdomain || 'yourbusiness'}.amaas.xyz`,
    phone,
    email,
    address,
    whatsappNumber,
    headline,
    subheadline,
    aboutText,
    servicesOrProducts: items,
    subscriptionStatus: 'active',
    deploymentStatus: 'provisioning',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>AMAAS Website Lite — ৳600/month Subscription</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Website Builder & Subdomain Provisioning
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Build your customized business website draft, select your <code className="text-blue-600 font-mono">*.amaas.xyz</code> subdomain, and activate with zero upfront development fees.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/pricing')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Back to Pricing
            </button>
          </div>
        </div>

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-5 gap-2 sm:gap-4 text-xs font-medium">
          {[
            { num: 1, label: 'Business Profile' },
            { num: 2, label: 'Design & Colors' },
            { num: 3, label: 'Offerings & Content' },
            { num: 4, label: 'Live Preview & Edit' },
            { num: 5, label: 'Subdomain & Launch' },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num as any)}
              className={`p-3 rounded-xl border text-left transition-all ${
                step === s.num
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-xs'
                  : step > s.num
                  ? 'border-emerald-300 dark:border-emerald-900 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step === s.num
                      ? 'bg-blue-600 text-white'
                      : step > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </span>
                <span className="truncate hidden sm:inline">{s.label}</span>
              </div>
            </button>
          ))}
        </div>

        {/* =========================================================================
            STEP 1: BUSINESS PROFILE & NICHE SELECTION
           ========================================================================= */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 1: Your Business Niche & Core Identity
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                AMAAS Website Lite supports any commercial or creative niche. Select your primary category to customize layout and catalog structure.
              </p>
            </div>

            {/* Niche Selector Grid */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Select Your Business Niche *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {NICHES.map((n) => {
                  const Icon = n.icon;
                  const isSelected = niche === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNicheSelect(n.id)}
                      className={`p-4 rounded-xl border text-left flex flex-col items-start gap-2.5 transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold ring-2 ring-blue-600'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs leading-snug">{n.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Business Contact & Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Business / Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Apex Lifestyle BD"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Contact Number *
                </label>
                <input
                  type="text"
                  required
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+880 1711-..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Support Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@business.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Physical Address / Showroom Location *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Gulshan 1, Dhaka"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (!businessName) {
                    showToast('Please enter your business name', 'warning');
                    return;
                  }
                  setStep(2);
                }}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-xs"
              >
                <span>Continue to Design & Colors</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 2: DESIGN TEMPLATE & BRAND COLORS
           ========================================================================= */}
        {step === 2 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 2: Choose Design Template & Brand Color Palette
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select from our mobile-optimized layouts tailored for responsiveness and conversions.
              </p>
            </div>

            {/* Template Selector */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Design Template
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 ring-2 ring-blue-600'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-3">
                        <div
                          className="h-20 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-inner"
                          style={{ backgroundColor: tpl.previewColor }}
                        >
                          <Layout className="w-6 h-6 opacity-80" />
                        </div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          {tpl.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {tpl.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Brand Color Palette */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Primary Brand Accent Color
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {BRAND_COLORS.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => setBrandColor(col.hex)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      brandColor === col.hex
                        ? 'border-slate-900 dark:border-white ring-2 ring-blue-500 text-slate-900 dark:text-white font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full inline-block border border-black/10"
                      style={{ backgroundColor: col.hex }}
                    />
                    <span>{col.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-xs"
              >
                <span>Continue to Offerings & Content</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 3: OFFERINGS & EDITABLE CONTENT
           ========================================================================= */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 3: Business Copy & Catalog Offerings
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Customize your headline, about story, and featured services or menu items.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hero Headline *
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sub-headline / Supporting Value Proposition *
                </label>
                <input
                  type="text"
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  About Business Description *
                </label>
                <textarea
                  rows={3}
                  value={aboutText}
                  onChange={(e) => setAboutText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Dynamic Items List */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Featured Products or Services ({items.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Customers can browse and click order directly on WhatsApp.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold text-xs flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Item Name</label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Price / Tag</label>
                      <input
                        type="text"
                        value={item.price}
                        onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                        title="Delete item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-xs"
              >
                <span>Continue to Live Preview</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 4: INTERACTIVE LIVE PREVIEW & EDIT
           ========================================================================= */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 4: Interactive Live Website Draft
                </h2>
                <p className="text-xs text-slate-500">
                  Test your mobile and desktop layout. All sections, WhatsApp triggers, and contact forms are fully responsive.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                      previewDevice === 'desktop'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Desktop</span>
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                      previewDevice === 'mobile'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition-colors"
                >
                  <span>Approve & Pick Subdomain</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Interactive Preview */}
            <div className="p-4 sm:p-8 bg-slate-200/60 dark:bg-slate-900/40 rounded-2xl border border-slate-300 dark:border-slate-800 flex justify-center">
              <WebsitePreviewRenderer site={currentPreviewSite} viewMode={previewDevice} />
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Content Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-2 shadow-xs"
              >
                <span>Continue to Subdomain Selection</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 5: SUBDOMAIN CHECK & DEMO ACTIVATION
           ========================================================================= */}
        {step === 5 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 shadow-xs max-w-3xl mx-auto">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Step 5: Choose Subdomain & Activate Subscription
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Your website will be hosted and routed on the AMAAS network under your chosen subdomain.
              </p>
            </div>

            {/* Subdomain Checker Card */}
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
              <label className="block text-xs font-bold text-slate-900 dark:text-white">
                Choose Your Desired Subdomain:
              </label>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().trim())}
                    placeholder="yourbusiness"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono"
                  />
                </div>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm whitespace-nowrap">
                  .amaas.xyz
                </span>
              </div>

              {/* Real-time Status Feedback */}
              {subdomainCheckResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                    subdomainCheckResult.available
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium'
                      : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                  }`}
                >
                  {subdomainCheckResult.available ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Subdomain Available!</strong>{' '}
                        <code className="font-mono text-emerald-700 dark:text-emerald-200 font-bold">
                          https://{subdomain}.amaas.xyz
                        </code>{' '}
                        is ready for assignment under your account.
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Unavailable:</strong> {subdomainCheckResult.reason}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Subdomain Disclosures */}
              <div className="text-[11px] text-slate-500 space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p>
                  • Subdomain format is provided under AMAAS infrastructure (<code className="font-mono">businessname.amaas.xyz</code>). It is not a separately registered top-level domain (.com).
                </p>
                <p>
                  • Custom domain upgrade (e.g. <code className="font-mono">yourbusiness.com</code>) can be connected at any time from your website dashboard.
                </p>
              </div>
            </div>

            {/* Plan & Pricing Summary */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 text-white border border-blue-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-[10px] font-semibold uppercase">
                    Monthly Subscription
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">
                    {websiteSubscriptionPlan.name}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono">
                    ৳{websiteSubscriptionPlan.priceMonthly.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-300"> / month</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-blue-800/80 text-[11px] text-slate-300">
                <div>
                  <span className="text-slate-400 block">Upfront Setup:</span>
                  <strong className="text-white">৳0 (Zero Dev Fee)</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Hosting & SSL:</span>
                  <strong className="text-white">Included</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Monthly Updates:</span>
                  <strong className="text-white">Up to 2 / month</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Grace Period:</span>
                  <strong className="text-white">7 Days (Preserved)</strong>
                </div>
              </div>
            </div>

            {/* Payment Gateway (Demo Flow) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Payment Method
                </label>
                <span className="text-[10px] text-slate-400">Instant Automated Activation</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['bKash', 'Nagad', 'Card'].map((gw) => (
                  <button
                    key={gw}
                    type="button"
                    onClick={() => setPaymentGateway(gw as any)}
                    className={`py-3 px-4 rounded-xl border text-xs font-semibold transition-all ${
                      paymentGateway === gw
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {gw} Instant Checkout
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!subdomainCheckResult?.available}
                onClick={handleDeployAndActivate}
                className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-md"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Confirm & Deploy Website (৳600/mo)</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal: Deployment Progress Simulation */}
        {isDeploying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/30 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/40 animate-pulse">
                <Globe className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold">Deploying Your Business Website</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  https://{subdomain}.amaas.xyz
                </p>
              </div>

              <div className="space-y-3 text-xs text-left bg-slate-950 p-4 rounded-xl border border-slate-850">
                <div className={`flex items-center gap-2 ${deploymentStage >= 1 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
                  <span>{deploymentStage >= 1 ? '✓' : '○'}</span>
                  <span>1. Allocating Subdomain DNS Record</span>
                </div>
                <div className={`flex items-center gap-2 ${deploymentStage >= 2 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
                  <span>{deploymentStage >= 2 ? '✓' : '○'}</span>
                  <span>2. Generating SSL/HTTPS Encryption Handshake</span>
                </div>
                <div className={`flex items-center gap-2 ${deploymentStage >= 3 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
                  <span>{deploymentStage >= 3 ? '✓' : '○'}</span>
                  <span>3. Bundling Catalog & WhatsApp Order Hooks</span>
                </div>
                <div className={`flex items-center gap-2 ${deploymentStage >= 4 ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
                  <span>{deploymentStage >= 4 ? '✓' : '○'}</span>
                  <span>4. Activating ৳600/mo Recurring Subscription</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Connecting to GoAMAAS Hosting Core...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
