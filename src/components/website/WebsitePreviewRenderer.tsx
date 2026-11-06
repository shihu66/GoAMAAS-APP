import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Order,
  SubscribedWebsite,
  WebsiteSectionConfig,
  WebsiteProductItem,
} from '../../types';
import {
  PublicCustomerOrderInput,
  buildGoogleMapsDirectionsUrl,
  validateAndNormalizeGoogleMapsUrl,
  validatePublicCustomerOrderInput,
} from '../../lib/storefrontSync';
import {
  Globe,
  Phone,
  Mail,
  MapPin,
  Navigation,
  MessageSquare,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Shield,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  ExternalLink,
  Quote,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  Package,
  Eye,
} from 'lucide-react';

const PRODUCT_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BD_DISTRICTS = [
  'Dhaka',
  'Chattogram',
  'Gazipur',
  'Narayanganj',
  'Sylhet',
  'Rajshahi',
  'Khulna',
  'Cumilla',
  'Barishal',
  'Rangpur',
  'Mymensingh',
  'Bogura',
];

interface CartLineItem {
  productId: string;
  name: string;
  sku?: string;
  unitPrice: number;
  originalPrice?: number;
  quantity: number;
  maxStock?: number;
  imageUrl?: string;
  category?: string;
}

interface WebsitePreviewRendererProps {
  site: Partial<SubscribedWebsite>;
  viewMode?: 'desktop' | 'mobile';
  showGraceBanner?: boolean;
  isPublicView?: boolean;
  onSubmitOrder?: (
    input: PublicCustomerOrderInput
  ) => Promise<{ success: boolean; message: string; order?: Order; code?: string }>;
  onOrderPlaced?: (order: Order) => void;
}

function createCheckoutAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `chk-${crypto.randomUUID()}`;
  }
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultSections(site: Partial<SubscribedWebsite>): WebsiteSectionConfig[] {
  const sections: WebsiteSectionConfig[] = [
    {
      id: 'sec-hero',
      type: 'hero',
      title: site.headline || 'Quality Products & Attentive Service',
      subtitle:
        site.subheadline ||
        'Explore our featured offerings and place your order directly online.',
      enabled: true,
      order: 0,
    },
  ];

  if ((site.bannerTitle && site.bannerTitle.trim()) || (site.bannerImageUrl && site.bannerImageUrl.trim())) {
    sections.push({
      id: 'sec-banner',
      type: 'banner',
      title: site.bannerTitle || 'Seasonal Showcase',
      subtitle: site.bannerSubtitle || '',
      imageUrl: site.bannerImageUrl,
      ctaText: site.bannerCtaText,
      ctaLink: site.bannerCtaLink,
      enabled: true,
      order: 1,
    });
  }

  if (site.aboutText === undefined || site.aboutText.trim().length > 0) {
    sections.push({
      id: 'sec-about',
      type: 'about',
      title: 'About Our Business',
      content:
        site.aboutText !== undefined
          ? site.aboutText
          : 'We are committed to delivering authentic products and responsive customer service.',
      enabled: true,
      order: 2,
    });
  }

  sections.push({
    id: 'sec-products',
    type: 'products',
    title: 'Featured Products & Offerings',
    subtitle: 'Browse available items below, view specifications, and order directly online.',
    enabled: true,
    order: 3,
  });

  sections.push({
    id: 'sec-contact',
    type: 'contact',
    title: 'Get in Touch',
    subtitle: 'Reach out to our team directly for orders, pricing, or questions.',
    enabled: true,
    order: 4,
  });

  return sections;
}

function parseItemNumericPrice(item: WebsiteProductItem): number {
  if (typeof item.discountPrice === 'number' && Number.isFinite(item.discountPrice) && item.discountPrice >= 0) {
    return item.discountPrice;
  }
  if (typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) && item.priceNumeric >= 0) {
    return item.priceNumeric;
  }
  const cleaned = Number(String(item.price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(cleaned) && cleaned >= 0 ? cleaned : 0;
}

function parseItemOriginalPrice(item: WebsiteProductItem, effectiveUnitPrice: number): number | undefined {
  if (
    typeof item.originalPrice === 'number' &&
    Number.isFinite(item.originalPrice) &&
    item.originalPrice > effectiveUnitPrice
  ) {
    return item.originalPrice;
  }
  if (
    typeof item.discountPrice === 'number' &&
    typeof item.priceNumeric === 'number' &&
    item.priceNumeric > item.discountPrice
  ) {
    return item.priceNumeric;
  }
  return undefined;
}

export const WebsitePreviewRenderer: React.FC<WebsitePreviewRendererProps> = ({
  site,
  viewMode = 'desktop',
  showGraceBanner = false,
  isPublicView = false,
  onSubmitOrder,
  onOrderPlaced,
}) => {
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [inquiryNote, setInquiryNote] = useState('');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  // Resilient image error states (reset whenever URL changes)
  const [brokenHeroImg, setBrokenHeroImg] = useState(false);
  const [brokenLogoImg, setBrokenLogoImg] = useState(false);
  const [brokenProductImages, setBrokenProductImages] = useState<Record<string, boolean>>({});

  // Product detail modal & per-card quantity selectors
  const [detailProduct, setDetailProduct] = useState<WebsiteProductItem | null>(null);
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});

  // Order Bag & Customer Checkout State
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [city, setCity] = useState('Dhaka');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryMethod, setDeliveryMethod] =
    useState<PublicCustomerOrderInput['deliveryMethod']>('Inside Dhaka');
  const [paymentMethod, setPaymentMethod] =
    useState<PublicCustomerOrderInput['paymentMethod']>('Cash on Delivery (COD)');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [checkoutAttemptId, setCheckoutAttemptId] = useState<string>(() => createCheckoutAttemptId());
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderFormError, setOrderFormError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const submittingLockRef = useRef(false);
  const checkoutSectionRef = useRef<HTMLElement | null>(null);

  const heroCandidateUrl = useMemo(() => {
    const secHero = (site.sections || []).find((s) => s.type === 'hero');
    return ((site.heroImageUrl ?? secHero?.imageUrl) || '').trim();
  }, [site.heroImageUrl, site.sections]);

  useEffect(() => {
    setBrokenHeroImg(false);
  }, [heroCandidateUrl]);

  useEffect(() => {
    setBrokenLogoImg(false);
  }, [site.logoUrl]);

  const themeSettings = site.themeSettings || {};
  const brandColor = themeSettings.primaryColor || site.brandColor || '#2563EB';
  const backgroundColor = themeSettings.backgroundColor || '#FFFFFF';
  const surfaceColor = themeSettings.surfaceColor || '#F8FAFC';
  const textColor = themeSettings.textColor || '#0F172A';

  const fontClass =
    themeSettings.fontStyle === 'editorial'
      ? 'font-serif'
      : themeSettings.fontStyle === 'bold'
      ? 'font-sans tracking-tight'
      : themeSettings.fontStyle === 'minimal'
      ? 'font-sans'
      : 'font-sans';

  const buttonRadiusClass =
    themeSettings.buttonStyle === 'pill'
      ? 'rounded-full'
      : themeSettings.buttonStyle === 'sharp'
      ? 'rounded-none'
      : 'rounded-lg';

  const heroLayout = themeSettings.heroLayout || (heroCandidateUrl ? 'split' : 'centered');

  const businessName = (site.businessName || '').trim() || 'Business Storefront';
  const headline = (site.headline || '').trim() || `Welcome to ${businessName}`;
  const subheadline = (site.subheadline || '').trim();
  const aboutText = (site.aboutText || '').trim();

  // Strictly use real configured contact values — never invent fake phone/email/address
  const phone = (site.phone || '').trim();
  const email = (site.email || '').trim();
  const address = (site.address || '').trim();
  const whatsappRaw = (site.whatsappNumber || phone || '').trim();
  const whatsappDigits = whatsappRaw.replace(/[^0-9]/g, '');
  const hasWhatsapp = whatsappDigits.length >= 8;

  const subdomain = (site.subdomain || 'yourbusiness').trim().toLowerCase();
  const fullDomainUrl = `${subdomain}.amaas.xyz`;
  const customDomain = (site.customDomain || '').trim().toLowerCase();
  const displayDomain = customDomain || fullDomainUrl;

  const visibleProducts: WebsiteProductItem[] = useMemo(
    () =>
      (site.servicesOrProducts || []).filter(
        (item) => item && item.isVisible !== false && (item.name || '').trim().length > 0
      ),
    [site.servicesOrProducts]
  );

  const [storefrontSort, setStorefrontSort] = useState<
    'custom' | 'featured' | 'price-low' | 'price-high' | 'name' | 'newest'
  >('custom');

  const sortedProducts: WebsiteProductItem[] = useMemo(() => {
    const list = [...visibleProducts];
    if (storefrontSort === 'featured') {
      return list.sort((a, b) => {
        const aFeat = a.isFeatured ? 1 : 0;
        const bFeat = b.isFeatured ? 1 : 0;
        return bFeat - aFeat;
      });
    }
    if (storefrontSort === 'price-low') {
      return list.sort((a, b) => parseItemNumericPrice(a) - parseItemNumericPrice(b));
    }
    if (storefrontSort === 'price-high') {
      return list.sort((a, b) => parseItemNumericPrice(b) - parseItemNumericPrice(a));
    }
    if (storefrontSort === 'name') {
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    if (storefrontSort === 'newest') {
      return list.reverse();
    }
    return list;
  }, [visibleProducts, storefrontSort]);

  // Animation & Effect Styling
  const anims = themeSettings.animations;
  const animationsEnabled = anims ? anims.enabled !== false : true;
  const animReducedMotion = anims?.reducedMotion === true;
  const animSpeed = anims?.transitionSpeed || 'normal';
  const animReveal =
    animationsEnabled && !animReducedMotion ? anims?.sectionReveal || 'fade-up' : 'none';
  const hoverEffect =
    animationsEnabled && !animReducedMotion ? anims?.hoverEffect || 'lift' : 'none';
  const smoothScroll = anims ? anims.smoothScroll !== false : true;

  const animRevealClass =
    animReveal === 'fade-up'
      ? 'ams-anim-fade-up'
      : animReveal === 'fade-in'
      ? 'ams-anim-fade-in'
      : animReveal === 'zoom-in'
      ? 'ams-anim-zoom-in'
      : '';

  const cardHoverClass =
    hoverEffect === 'lift'
      ? 'transition-all duration-200 hover:-translate-y-1 hover:shadow-lg'
      : hoverEffect === 'scale'
      ? 'transition-all duration-200 hover:scale-[1.02] hover:shadow-lg'
      : hoverEffect === 'glow'
      ? 'transition-all duration-200 hover:ring-2 hover:ring-blue-400 hover:shadow-md'
      : '';
  const animHoverClass = cardHoverClass;

  // Keep cart synced if product stock or prices update after refresh
  useEffect(() => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      const next: CartLineItem[] = [];
      for (const line of prev) {
        const match = visibleProducts.find(
          (vp) => (vp.productId || vp.id) === line.productId
        );
        if (!match) continue;
        const avail =
          typeof match.stock === 'number' && Number.isFinite(match.stock)
            ? Math.max(0, Math.trunc(match.stock))
            : undefined;
        if (match.inStock === false || (avail !== undefined && avail <= 0)) continue;
        const unitPrice = parseItemNumericPrice(match);
        next.push({
          ...line,
          name: match.name,
          unitPrice,
          originalPrice: parseItemOriginalPrice(match, unitPrice),
          maxStock: avail,
          quantity: avail !== undefined ? Math.min(line.quantity, avail) : line.quantity,
        });
      }
      return next;
    });
  }, [visibleProducts]);

  const orderableCatalogItems = useMemo(
    () =>
      visibleProducts.filter((item) => {
        const pid = (item.productId || item.id || '').trim();
        const price = parseItemNumericPrice(item);
        if (isPublicView) {
          return PRODUCT_UUID_REGEX.test(pid) && price >= 0;
        }
        return Boolean(pid) && price >= 0;
      }),
    [visibleProducts, isPublicView]
  );

  const hasOrderableStorefront = orderableCatalogItems.length > 0;

  const totalCartItems = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart]
  );
  const deliveryCharge = useMemo(() => {
    if (deliveryMethod === 'Store Pickup') return 0;
    if (deliveryMethod === 'Outside Dhaka') return 120;
    return 60;
  }, [deliveryMethod]);
  const cartGrandTotal = cart.length > 0 ? cartSubtotal + deliveryCharge : 0;

  const scrollToCheckout = () => {
    if (checkoutSectionRef.current) {
      checkoutSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getCardQuantity = (itemKey: string): number => {
    const val = cardQuantities[itemKey];
    return typeof val === 'number' && val >= 1 ? val : 1;
  };

  const setCardQuantity = (itemKey: string, nextQty: number, maxStock?: number) => {
    const bounded = maxStock !== undefined ? Math.min(Math.max(1, nextQty), Math.max(1, maxStock)) : Math.max(1, nextQty);
    setCardQuantities((prev) => ({ ...prev, [itemKey]: bounded }));
  };

  const handleAddItemToOrder = (item: WebsiteProductItem, qtyToAdd: number, jumpToCheckout = false) => {
    const pid = (item.productId || item.id || '').trim();
    if (!pid) return;

    const maxStock =
      typeof item.stock === 'number' && Number.isFinite(item.stock)
        ? Math.max(0, Math.trunc(item.stock))
        : undefined;
    if (item.inStock === false || (maxStock !== undefined && maxStock <= 0)) {
      return;
    }

    const unitPrice = parseItemNumericPrice(item);
    const originalPrice = parseItemOriginalPrice(item, unitPrice);

    setConfirmedOrder(null);
    setOrderFormError(null);
    setCheckoutAttemptId(createCheckoutAttemptId());

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.productId === pid);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const combined = existing.quantity + Math.max(1, qtyToAdd);
        const capped = maxStock !== undefined ? Math.min(combined, maxStock) : combined;
        const copy = [...prev];
        copy[existingIdx] = {
          ...existing,
          unitPrice,
          originalPrice,
          maxStock,
          quantity: capped,
        };
        return copy;
      }
      const initialQty = maxStock !== undefined ? Math.min(Math.max(1, qtyToAdd), maxStock) : Math.max(1, qtyToAdd);
      return [
        ...prev,
        {
          productId: pid,
          name: item.name,
          sku: item.sku,
          unitPrice,
          originalPrice,
          quantity: initialQty,
          maxStock,
          imageUrl: item.imageUrl,
          category: item.category,
        },
      ];
    });

    if (jumpToCheckout) {
      setTimeout(() => scrollToCheckout(), 60);
    }
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setOrderFormError(null);
    setCheckoutAttemptId(createCheckoutAttemptId());
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          const rawNext = line.quantity + delta;
          if (rawNext <= 0) return null;
          const capped =
            line.maxStock !== undefined ? Math.min(rawNext, line.maxStock) : rawNext;
          return { ...line, quantity: capped };
        })
        .filter((x): x is CartLineItem => Boolean(x))
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setOrderFormError(null);
    setCheckoutAttemptId(createCheckoutAttemptId());
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  };

  const handleCityChange = (nextCity: string) => {
    setCity(nextCity);
    if (deliveryMethod !== 'Store Pickup') {
      if (nextCity.trim().toLowerCase() === 'dhaka') {
        setDeliveryMethod('Inside Dhaka');
      } else if (nextCity.trim().length >= 2) {
        setDeliveryMethod('Outside Dhaka');
      }
    }
  };

  const handleSubmitCustomerOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingLockRef.current || isSubmittingOrder) return;

    setOrderFormError(null);

    if (!isPublicView || !onSubmitOrder) {
      setOrderFormError(
        'Preview Mode: Customer orders are saved directly to your Merchant Orders Dashboard once your website is published live.'
      );
      return;
    }

    if (cart.length === 0) {
      setOrderFormError('Please add at least one product from the catalog above before placing an order.');
      return;
    }

    const orderPayload: PublicCustomerOrderInput = {
      subdomain,
      websiteId: site.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim() || undefined,
      shippingAddress: shippingAddress.trim(),
      city: city.trim(),
      deliveryArea: deliveryArea.trim() || undefined,
      deliveryInstructions: deliveryInstructions.trim() || undefined,
      orderNotes: orderNotes.trim() || undefined,
      deliveryMethod,
      paymentMethod,
      items: cart.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
      })),
      checkoutAttemptId,
    };

    const clientValidation = validatePublicCustomerOrderInput(orderPayload);
    if (!clientValidation.valid) {
      setOrderFormError(clientValidation.error || 'Please check all required fields and try again.');
      return;
    }

    submittingLockRef.current = true;
    setIsSubmittingOrder(true);
    try {
      const result = await onSubmitOrder(orderPayload);
      if (!result.success || !result.order) {
        setOrderFormError(
          result.message || 'Unable to confirm your order right now. Please try again.'
        );
        return;
      }

      setConfirmedOrder(result.order);
      setCart([]);
      setOrderNotes('');
      setDeliveryInstructions('');
      setCheckoutAttemptId(createCheckoutAttemptId());
      onOrderPlaced?.(result.order);
      scrollToCheckout();
    } catch (err: unknown) {
      setOrderFormError(
        err instanceof Error
          ? err.message
          : 'Network error while submitting your order. Please check your connection and try again.'
      );
    } finally {
      setIsSubmittingOrder(false);
      submittingLockRef.current = false;
    }
  };

  const customLinks = (site.customLinks || []).filter(
    (link) => (link.label || '').trim().length > 0 && (link.url || '').trim().length > 0
  );

  const socialLinks = site.socialLinks || {};
  const hasAnySocial = Boolean(
    socialLinks.facebook?.trim() ||
      socialLinks.instagram?.trim() ||
      socialLinks.twitter?.trim() ||
      socialLinks.linkedin?.trim() ||
      socialLinks.youtube?.trim()
  );

  const hasAnyDirectContact = Boolean(phone || email || address || hasWhatsapp);

  const activeSections: WebsiteSectionConfig[] = (
    site.sections && site.sections.length > 0 ? site.sections : buildDefaultSections(site)
  )
    .filter((s) => s.enabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);

  const hasAboutSection = activeSections.some((s) => s.type === 'about');
  const hasProductsSection = activeSections.some((s) => s.type === 'products');
  const hasContactSection = activeSections.some((s) => s.type === 'contact');

  const resolveCtaHref = (rawLink?: string, fallbackAnchor = '#services') => {
    const trimmed = (rawLink || '').trim();
    if (!trimmed || trimmed === 'whatsapp') {
      if (hasOrderableStorefront && !trimmed) {
        return '#services';
      }
      if (hasWhatsapp) {
        return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
          `Hello ${businessName}, I am visiting your website (${displayDomain}) and would like to inquire.`
        )}`;
      }
      if (phone) return `tel:${phone}`;
      if (email) return `mailto:${email}`;
      return fallbackAnchor;
    }
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('tel:') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('/')
    ) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const primaryCtaLabel =
    (site.heroCtaText || '').trim() ||
    (hasOrderableStorefront ? 'Shop Catalog' : hasWhatsapp ? 'Chat on WhatsApp' : 'Explore Offerings');
  const primaryCtaHref = resolveCtaHref(
    site.heroCtaLink,
    hasProductsSection ? '#services' : hasWhatsapp ? 'whatsapp' : '#contact'
  );
  const isPrimaryExternal = primaryCtaHref.startsWith('http');

  const secondaryCtaLabel =
    site.secondaryCtaText !== undefined
      ? site.secondaryCtaText.trim()
      : hasOrderableStorefront && primaryCtaHref !== '#checkout'
      ? 'Order Online'
      : hasProductsSection && primaryCtaHref !== '#services'
      ? 'View Offerings'
      : '';
  const secondaryCtaHref = resolveCtaHref(
    site.secondaryCtaLink || (hasOrderableStorefront ? '#checkout' : '#services'),
    '#services'
  );

  const isSuspended =
    site.subscriptionStatus === 'suspended' || site.deploymentStatus === 'suspended';
  const isGracePeriod = site.subscriptionStatus === 'grace_period' || showGraceBanner;

  const formatProductPrice = (item: WebsiteProductItem): string => {
    const unit = parseItemNumericPrice(item);
    if (unit > 0) {
      return `৳${unit.toLocaleString()}`;
    }
    if (item.price && item.price.trim()) return item.price.trim();
    if (typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric)) {
      return `৳${item.priceNumeric.toLocaleString()}`;
    }
    return '';
  };

  const renderSection = (section: WebsiteSectionConfig) => {
    switch (section.type) {
      case 'hero': {
        const heroHeading = (site.headline || section.title || headline).trim();
        const heroDesc =
          site.subheadline !== undefined
            ? site.subheadline.trim()
            : (section.subtitle || subheadline).trim();
        const rawHeroImg = ((site.heroImageUrl ?? section.imageUrl) || '').trim();
        const heroImg = !brokenHeroImg ? rawHeroImg : '';

        // Hero Cover Image Styling Controls
        const heroPos = themeSettings.heroImagePosition || 'center';
        const heroPosClass =
          heroPos === 'top'
            ? 'object-top'
            : heroPos === 'bottom'
            ? 'object-bottom'
            : heroPos === 'left'
            ? 'object-left'
            : heroPos === 'right'
            ? 'object-right'
            : 'object-center';

        const overlayOpacityPct =
          typeof themeSettings.heroOverlayOpacity === 'number'
            ? Math.max(0, Math.min(100, themeSettings.heroOverlayOpacity))
            : 65;
        const brightnessPct =
          typeof themeSettings.heroBrightness === 'number'
            ? Math.max(50, Math.min(150, themeSettings.heroBrightness))
            : 100;

        const heroHeightChoice = themeSettings.heroHeight || 'medium';
        const heroHeightClass =
          heroHeightChoice === 'compact'
            ? 'py-10 sm:py-14'
            : heroHeightChoice === 'tall'
            ? 'py-20 sm:py-32'
            : heroHeightChoice === 'full'
            ? 'min-h-[75vh] py-16 flex flex-col justify-center'
            : 'py-14 sm:py-20';

        if (heroLayout === 'split' && heroImg) {
          return (
            <section
              key={section.id}
              className={`px-4 sm:px-8 border-b border-slate-200/70 ${heroHeightClass} ${animRevealClass}`}
              style={{ backgroundColor: surfaceColor }}
            >
              <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                <div className="md:col-span-7 space-y-4 text-left">
                  {site.nicheLabel && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {site.nicheLabel}
                    </p>
                  )}
                  <h2
                    className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-balance"
                    style={{ color: textColor }}
                  >
                    {heroHeading}
                  </h2>
                  {heroDesc && (
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xl">
                      {heroDesc}
                    </p>
                  )}
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={primaryCtaHref}
                      target={isPrimaryExternal ? '_blank' : undefined}
                      rel={isPrimaryExternal ? 'noreferrer' : undefined}
                      className={`min-h-[44px] px-5 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-sm hover:opacity-90 ${animHoverClass} transition-all inline-flex items-center gap-1.5`}
                      style={{ backgroundColor: brandColor }}
                    >
                      <span>{primaryCtaLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                    {secondaryCtaLabel && (
                      <a
                        href={secondaryCtaHref}
                        className={`min-h-[44px] px-5 py-2.5 ${buttonRadiusClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 ${animHoverClass} font-semibold text-xs transition-colors inline-flex items-center`}
                      >
                        {secondaryCtaLabel}
                      </a>
                    )}
                  </div>
                </div>

                <div className="md:col-span-5">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100 aspect-[4/3] relative">
                    <img
                      src={heroImg}
                      alt={heroHeading}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenHeroImg(true)}
                      className={`w-full h-full object-cover ${heroPosClass}`}
                      style={{
                        filter: brightnessPct !== 100 ? `brightness(${brightnessPct}%)` : undefined,
                      }}
                    />
                    {overlayOpacityPct > 0 && (
                      <div
                        className="absolute inset-0 bg-slate-950 pointer-events-none"
                        style={{ opacity: overlayOpacityPct / 300 }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (heroLayout === 'cover' && heroImg) {
          return (
            <section
              key={section.id}
              className={`relative px-4 sm:px-8 text-center text-white overflow-hidden ${heroHeightClass} ${animRevealClass}`}
            >
              <img
                src={heroImg}
                alt={heroHeading}
                referrerPolicy="no-referrer"
                onError={() => setBrokenHeroImg(true)}
                className={`absolute inset-0 w-full h-full object-cover ${heroPosClass}`}
                style={{
                  filter: brightnessPct !== 100 ? `brightness(${brightnessPct}%)` : undefined,
                }}
              />
              <div
                className="absolute inset-0 bg-slate-950 transition-opacity"
                style={{ opacity: overlayOpacityPct / 100 }}
              />
              <div className="max-w-3xl mx-auto space-y-4 relative z-10">
                {site.nicheLabel && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/90">
                    {site.nicheLabel}
                  </p>
                )}
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-balance text-white drop-shadow-sm">
                  {heroHeading}
                </h2>
                {heroDesc && (
                  <p className="text-xs sm:text-sm text-slate-100 max-w-xl mx-auto leading-relaxed drop-shadow-xs">
                    {heroDesc}
                  </p>
                )}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={primaryCtaHref}
                    target={isPrimaryExternal ? '_blank' : undefined}
                    rel={isPrimaryExternal ? 'noreferrer' : undefined}
                    className={`min-h-[44px] px-6 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-md hover:opacity-95 ${animHoverClass} transition-all inline-flex items-center gap-1.5`}
                    style={{ backgroundColor: brandColor }}
                  >
                    <span>{primaryCtaLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                  {secondaryCtaLabel && (
                    <a
                      href={secondaryCtaHref}
                      className={`min-h-[44px] px-5 py-2.5 ${buttonRadiusClass} bg-white/20 hover:bg-white/30 text-white font-medium text-xs border border-white/30 backdrop-blur-xs ${animHoverClass} transition-colors inline-flex items-center`}
                    >
                      {secondaryCtaLabel}
                    </a>
                  )}
                </div>
              </div>
            </section>
          );
        }

        return (
          <section
            key={section.id}
            className={`px-4 sm:px-6 text-center text-white relative overflow-hidden ${heroHeightClass} ${animRevealClass}`}
            style={{
              background: `linear-gradient(135deg, ${brandColor} 0%, #0F172A 100%)`,
            }}
          >
            <div className="max-w-3xl mx-auto space-y-4 relative z-10">
              {site.nicheLabel && (
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  {site.nicheLabel}
                </p>
              )}
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-balance text-white">
                {heroHeading}
              </h2>
              {heroDesc && (
                <p className="text-xs sm:text-sm text-slate-200 max-w-xl mx-auto leading-relaxed">
                  {heroDesc}
                </p>
              )}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={primaryCtaHref}
                  target={isPrimaryExternal ? '_blank' : undefined}
                  rel={isPrimaryExternal ? 'noreferrer' : undefined}
                  className={`min-h-[44px] px-6 py-2.5 ${buttonRadiusClass} bg-white text-slate-900 font-bold text-xs shadow-md hover:bg-slate-100 ${animHoverClass} transition-all inline-flex items-center gap-1.5`}
                >
                  <span>{primaryCtaLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
                {secondaryCtaLabel && (
                  <a
                    href={secondaryCtaHref}
                    className={`min-h-[44px] px-5 py-2.5 ${buttonRadiusClass} bg-white/15 hover:bg-white/25 text-white font-medium text-xs border border-white/20 ${animHoverClass} transition-colors inline-flex items-center`}
                  >
                    {secondaryCtaLabel}
                  </a>
                )}
              </div>
              {heroImg && (
                <div className="pt-6 max-w-2xl mx-auto">
                  <div className="rounded-2xl overflow-hidden border border-white/20 shadow-xl aspect-[16/9] bg-slate-900 relative">
                    <img
                      src={heroImg}
                      alt={heroHeading}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenHeroImg(true)}
                      className={`w-full h-full object-cover ${heroPosClass}`}
                      style={{
                        filter: brightnessPct !== 100 ? `brightness(${brightnessPct}%)` : undefined,
                      }}
                    />
                    {overlayOpacityPct > 0 && (
                      <div
                        className="absolute inset-0 bg-slate-950 pointer-events-none"
                        style={{ opacity: overlayOpacityPct / 250 }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      }

      case 'banner': {
        const bTitle = (site.bannerTitle || section.title || '').trim();
        const bSub = (site.bannerSubtitle || section.subtitle || section.content || '').trim();
        const bImg = (site.bannerImageUrl || section.imageUrl || '').trim();
        const bCtaText = (site.bannerCtaText || section.ctaText || '').trim();
        const bCtaHref = resolveCtaHref(site.bannerCtaLink || section.ctaLink, '#services');

        if (!bTitle && !bImg && !bSub) return null;

        const bannerLayout = themeSettings.bannerLayout || 'split';
        const bannerBg = themeSettings.bannerBgColor || surfaceColor;
        const bannerTxt = themeSettings.bannerTextColor || textColor;
        const bannerAlign = themeSettings.bannerAlignment || 'left';
        const bannerImgPos = themeSettings.bannerImagePosition || 'right';
        const bannerCtaStyle = themeSettings.bannerCtaStyle || 'solid';

        const ctaBtnClass =
          bannerCtaStyle === 'outline'
            ? `border border-current bg-transparent hover:bg-black/5 dark:hover:bg-white/10`
            : bannerCtaStyle === 'ghost'
            ? `bg-transparent hover:underline px-0`
            : `text-white shadow-xs hover:opacity-90`;

        const ctaBtnStyle =
          bannerCtaStyle === 'solid' ? { backgroundColor: brandColor } : undefined;

        // Option 1: Compact Promotional Strip (e.g. Free shipping alert)
        if (bannerLayout === 'strip') {
          return (
            <section
              key={section.id}
              className={`py-3 px-4 sm:px-6 border-y border-slate-200/80 ${animRevealClass}`}
              style={{ backgroundColor: bannerBg, color: bannerTxt }}
            >
              <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brandColor }} />
                  <span className="font-bold truncate">{bTitle || 'Special Promotion'}</span>
                  {bSub && <span className="text-slate-500 hidden sm:inline">· {bSub}</span>}
                </div>
                {bCtaText && (
                  <a
                    href={bCtaHref}
                    target={bCtaHref.startsWith('http') ? '_blank' : undefined}
                    rel={bCtaHref.startsWith('http') ? 'noreferrer' : undefined}
                    className={`font-semibold inline-flex items-center gap-1 hover:underline text-xs`}
                    style={{ color: brandColor }}
                  >
                    <span>{bCtaText}</span>
                    <ChevronRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            </section>
          );
        }

        // Option 2: Minimal Text-Only Announcement
        if (bannerLayout === 'minimal' || (!bImg && bannerLayout !== 'full')) {
          return (
            <section
              key={section.id}
              className={`py-8 px-4 sm:px-6 max-w-4xl mx-auto ${animRevealClass}`}
            >
              <div
                className={`p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs text-${bannerAlign}`}
                style={{ backgroundColor: bannerBg, color: bannerTxt }}
              >
                {bTitle && (
                  <h3 className="text-lg sm:text-2xl font-extrabold tracking-tight">
                    {bTitle}
                  </h3>
                )}
                {bSub && <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">{bSub}</p>}
                {bCtaText && (
                  <div className="pt-4">
                    <a
                      href={bCtaHref}
                      target={bCtaHref.startsWith('http') ? '_blank' : undefined}
                      rel={bCtaHref.startsWith('http') ? 'noreferrer' : undefined}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 ${buttonRadiusClass} font-semibold text-xs ${ctaBtnClass}`}
                      style={ctaBtnStyle}
                    >
                      <span>{bCtaText}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </section>
          );
        }

        // Option 3: Full-Width Image Banner with overlay
        if (bannerLayout === 'full' && bImg) {
          return (
            <section
              key={section.id}
              className={`py-6 px-4 sm:px-6 max-w-5xl mx-auto ${animRevealClass}`}
            >
              <div className="relative rounded-2xl overflow-hidden min-h-[220px] sm:min-h-[280px] flex items-center p-6 sm:p-10 text-white shadow-md">
                <img
                  src={bImg}
                  alt={bTitle || businessName}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/60" />
                <div className="relative z-10 max-w-xl space-y-3">
                  {bTitle && (
                    <h3 className="text-xl sm:text-3xl font-extrabold tracking-tight drop-shadow-sm">
                      {bTitle}
                    </h3>
                  )}
                  {bSub && (
                    <p className="text-xs sm:text-sm text-slate-100 leading-relaxed drop-shadow-xs">
                      {bSub}
                    </p>
                  )}
                  {bCtaText && (
                    <div className="pt-2">
                      <a
                        href={bCtaHref}
                        target={bCtaHref.startsWith('http') ? '_blank' : undefined}
                        rel={bCtaHref.startsWith('http') ? 'noreferrer' : undefined}
                        className={`inline-flex items-center gap-1.5 px-5 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-md hover:opacity-90 transition-opacity`}
                        style={{ backgroundColor: brandColor }}
                      >
                        <span>{bCtaText}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        // Option 4 (Default): Split Image + Text Banner
        return (
          <section key={section.id} className={`py-8 px-4 sm:px-6 max-w-5xl mx-auto ${animRevealClass}`}>
            <div
              className="rounded-2xl overflow-hidden border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-12 items-center"
              style={{ backgroundColor: bannerBg, color: bannerTxt }}
            >
              {bImg && bannerImgPos === 'left' && (
                <div className="md:col-span-5 h-48 md:h-full min-h-[200px] bg-slate-100 order-last md:order-first">
                  <img
                    src={bImg}
                    alt={bTitle || businessName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div
                className={`${bImg ? 'md:col-span-7' : 'md:col-span-12'} p-6 sm:p-8 space-y-3 text-${bannerAlign}`}
              >
                {bTitle && (
                  <h3 className="text-lg sm:text-2xl font-extrabold tracking-tight">
                    {bTitle}
                  </h3>
                )}
                {bSub && <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{bSub}</p>}
                {bCtaText && (
                  <div className="pt-1">
                    <a
                      href={bCtaHref}
                      target={bCtaHref.startsWith('http') ? '_blank' : undefined}
                      rel={bCtaHref.startsWith('http') ? 'noreferrer' : undefined}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 ${buttonRadiusClass} font-semibold text-xs transition-opacity ${ctaBtnClass}`}
                      style={ctaBtnStyle}
                    >
                      <span>{bCtaText}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
              {bImg && bannerImgPos !== 'left' && (
                <div className="md:col-span-5 h-48 md:h-full min-h-[200px] bg-slate-100">
                  <img
                    src={bImg}
                    alt={bTitle || businessName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </section>
        );
      }

      case 'about': {
        const body = (section.content !== undefined ? section.content : aboutText).trim();
        const sectionImg = (section.imageUrl || '').trim();
        if (!body && !sectionImg) return null;

        return (
          <section key={section.id} id="about" className="py-12 px-4 sm:px-6 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className={`${sectionImg || address ? 'md:col-span-7' : 'md:col-span-12 max-w-3xl'} space-y-3`}>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                  {section.title || 'About Our Business'}
                </h3>
                {section.subtitle && (
                  <p className="text-xs font-medium text-slate-500">{section.subtitle}</p>
                )}
                {body && (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {body}
                  </p>
                )}
                <div className="pt-2 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Direct customer ordering & verified store profile</span>
                  </div>
                </div>
              </div>

              {sectionImg ? (
                <div className="md:col-span-5">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]">
                    <img
                      src={sectionImg}
                      alt={section.title || businessName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : address || site.nicheLabel || phone ? (
                <div
                  className="md:col-span-5 p-6 rounded-2xl border border-slate-200 space-y-3"
                  style={{ backgroundColor: surfaceColor }}
                >
                  <h4 className="text-xs font-bold text-slate-900">Business Details</h4>
                  <div className="space-y-2 text-xs text-slate-600">
                    {(site.nicheLabel || site.niche) && (
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                        <span className="text-slate-400">Category</span>
                        <span className="font-semibold text-slate-800 capitalize">
                          {site.nicheLabel || site.niche}
                        </span>
                      </div>
                    )}
                    {address && (
                      <div className="flex items-start justify-between gap-4 pb-1.5 border-b border-slate-200/80">
                        <span className="text-slate-400 shrink-0">Location</span>
                        <span className="font-semibold text-slate-800 text-right">{address}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                        <span className="text-slate-400">Phone</span>
                        <span className="font-semibold text-slate-800 font-mono tabular-nums">{phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Storefront</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" /> Official Site
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      }

      case 'highlights': {
        const highlightItems = (section.items || []).filter((it) => (it.title || '').trim().length > 0);
        if (highlightItems.length === 0) return null;

        return (
          <section
            key={section.id}
            className="py-12 px-4 sm:px-6 border-t border-slate-200/70"
            style={{ backgroundColor: surfaceColor }}
          >
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                  {section.title || 'Why Customers Choose Us'}
                </h3>
                {section.subtitle && <p className="text-xs text-slate-500">{section.subtitle}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {highlightItems.map((it) => (
                  <div
                    key={it.id}
                    className="p-5 rounded-xl bg-white border border-slate-200 space-y-2"
                  >
                    {it.imageUrl && (
                      <div className="w-full h-32 rounded-lg overflow-hidden bg-slate-100 mb-2">
                        <img
                          src={it.imageUrl}
                          alt={it.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <h4 className="text-sm font-bold text-slate-900">{it.title}</h4>
                    {it.description && (
                      <p className="text-xs text-slate-600 leading-relaxed">{it.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }

      case 'products': {
        return (
          <React.Fragment key={section.id}>
            <section
              id="services"
              className={`py-12 px-4 sm:px-6 border-t border-slate-200/80 ${animRevealClass}`}
              style={{ backgroundColor: surfaceColor }}
            >
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200/60">
                  <div className="space-y-1">
                    <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                      {section.title || 'Featured Products & Offerings'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {section.subtitle ||
                        (hasOrderableStorefront
                          ? 'Select quantities below to add items to your order bag or place an instant order.'
                          : 'Explore our current catalog of products and services.')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {visibleProducts.length > 0 && (
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {visibleProducts.length} {visibleProducts.length === 1 ? 'item' : 'items'}
                      </span>
                    )}
                    {visibleProducts.length > 1 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500 font-medium">Sort:</span>
                        <select
                          value={storefrontSort}
                          onChange={(e) => setStorefrontSort(e.target.value as any)}
                          aria-label="Sort products"
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                        >
                          <option value="custom">Default Order</option>
                          <option value="featured">Featured First</option>
                          <option value="price-low">Price: Low to High</option>
                          <option value="price-high">Price: High to Low</option>
                          <option value="name">Name: A to Z</option>
                          <option value="newest">Newest First</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {sortedProducts.length > 0 ? (
                    sortedProducts.map((item, idx) => {
                      const itemKey = (item.productId || item.id || `idx-${idx}`).trim();
                      const priceText = formatProductPrice(item);
                      const unitNumeric = parseItemNumericPrice(item);
                      const originalPrice = parseItemOriginalPrice(item, unitNumeric);
                      const availableStock =
                        typeof item.stock === 'number' && Number.isFinite(item.stock)
                          ? Math.max(0, Math.trunc(item.stock))
                          : undefined;
                      const isOutOfStock =
                        item.inStock === false || (availableStock !== undefined && availableStock <= 0);
                      const isLowStock =
                        !isOutOfStock && availableStock !== undefined && availableStock <= 5;
                      const canOrderOnline = isPublicView
                        ? PRODUCT_UUID_REGEX.test(itemKey) && unitNumeric >= 0
                        : Boolean(itemKey) && unitNumeric >= 0;
                      const selectedQty = getCardQuantity(itemKey);
                      const inBagLine = cart.find((c) => c.productId === itemKey);
                      const imgBroken = Boolean(brokenProductImages[itemKey]);

                      const productOrderHref = hasWhatsapp
                        ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
                            `Hello ${businessName}, I am interested in "${item.name}"${
                              priceText ? ` (${priceText})` : ''
                            }.`
                          )}`
                        : phone
                        ? `tel:${phone}`
                        : email
                        ? `mailto:${email}?subject=${encodeURIComponent(`Inquiry: ${item.name}`)}`
                        : '#contact';

                      return (
                        <div
                          key={itemKey}
                          className={`rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-xs overflow-hidden flex flex-col justify-between transition-all ${cardHoverClass}`}
                        >
                          <div>
                            <button
                              type="button"
                              onClick={() => setDetailProduct(item)}
                              className="w-full aspect-[4/3] bg-slate-100 border-b border-slate-100 overflow-hidden block relative text-left cursor-pointer group"
                            >
                              {item.imageUrl && !imgBroken ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setBrokenProductImages((prev) => ({ ...prev, [itemKey]: true }))
                                  }
                                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 bg-slate-50">
                                  <Package className="w-7 h-7 stroke-[1.5]" />
                                  <span className="text-[11px] font-medium text-slate-400">
                                    {item.category || businessName}
                                  </span>
                                </div>
                              )}
                            </button>

                            <div className="p-4 space-y-2">
                              {(item.category || item.sku) && (
                                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 truncate">
                                  {item.category && <span>{item.category}</span>}
                                  {item.category && item.sku && <span aria-hidden="true">·</span>}
                                  {item.sku && (
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {item.sku}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDetailProduct(item)}
                                  className="font-bold text-sm text-slate-900 leading-snug text-left hover:underline cursor-pointer"
                                >
                                  {item.name}
                                </button>
                                {priceText && (
                                  <div className="text-right shrink-0">
                                    <span
                                      className="font-bold font-mono tabular-nums text-sm block"
                                      style={{ color: brandColor }}
                                    >
                                      {priceText}
                                    </span>
                                    {originalPrice !== undefined && (
                                      <span className="text-[11px] font-mono tabular-nums text-slate-400 line-through block">
                                        ৳{originalPrice.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {item.description && (
                                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                                  {item.description}
                                </p>
                              )}

                              <div className="pt-1 flex items-center justify-between text-[11px]">
                                <span
                                  className={`font-medium ${
                                    isOutOfStock
                                      ? 'text-rose-600'
                                      : isLowStock
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {isOutOfStock
                                    ? 'Out of Stock'
                                    : isLowStock
                                    ? `Low Stock · ${availableStock} left`
                                    : availableStock !== undefined
                                    ? `In Stock · ${availableStock} available`
                                    : 'Available'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDetailProduct(item)}
                                  className="text-slate-500 hover:text-slate-900 font-medium inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Details</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
                            {canOrderOnline ? (
                              isOutOfStock ? (
                                <button
                                  type="button"
                                  disabled
                                  className={`w-full min-h-[40px] px-3 py-2 ${buttonRadiusClass} bg-slate-200 text-slate-500 text-xs font-semibold cursor-not-allowed`}
                                >
                                  Currently Unavailable
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white">
                                      <button
                                        type="button"
                                        aria-label="Decrease quantity"
                                        onClick={() =>
                                          setCardQuantity(itemKey, selectedQty - 1, availableStock)
                                        }
                                        className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <span className="w-8 text-center text-xs font-mono font-bold tabular-nums text-slate-900">
                                        {selectedQty}
                                      </span>
                                      <button
                                        type="button"
                                        aria-label="Increase quantity"
                                        onClick={() =>
                                          setCardQuantity(itemKey, selectedQty + 1, availableStock)
                                        }
                                        className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleAddItemToOrder(item, selectedQty, false)}
                                      className={`flex-1 min-h-[36px] px-3 py-1.5 ${buttonRadiusClass} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer transition-colors`}
                                    >
                                      {inBagLine
                                        ? `In Bag (${inBagLine.quantity}) · +Add`
                                        : 'Add to Bag'}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleAddItemToOrder(item, selectedQty, true)}
                                    className={`w-full min-h-[40px] px-3.5 py-2 ${buttonRadiusClass} text-white text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer`}
                                    style={{ backgroundColor: brandColor }}
                                  >
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                    <span>Order Now</span>
                                  </button>
                                </div>
                              )
                            ) : (
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-slate-500">Direct Inquiry</span>
                                <a
                                  href={productOrderHref}
                                  target={productOrderHref.startsWith('http') ? '_blank' : undefined}
                                  rel={productOrderHref.startsWith('http') ? 'noreferrer' : undefined}
                                  className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                                  style={{ color: brandColor }}
                                >
                                  <span>{hasWhatsapp ? 'Inquire on WhatsApp' : 'Contact Us'}</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center py-8 text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                      Catalog items will appear here once published.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* PUBLIC CUSTOMER ORDER FORM SECTION (#checkout) */}
            {hasOrderableStorefront && (
              <section
                ref={checkoutSectionRef}
                id="checkout"
                className="py-12 px-4 sm:px-6 border-t border-slate-200/80 bg-white"
              >
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="space-y-1">
                    <h3
                      className="text-xl sm:text-2xl font-extrabold tracking-tight"
                      style={{ color: textColor }}
                    >
                      Place Your Order Online
                    </h3>
                    <p className="text-xs text-slate-500">
                      Complete your delivery details below. Product prices and stock availability are verified directly with {businessName}.
                    </p>
                  </div>

                  {confirmedOrder ? (
                    <div className="p-6 sm:p-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-emerald-200/80">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-base sm:text-lg font-extrabold text-slate-900">
                              Order Confirmed
                            </h4>
                            <p className="text-xs text-slate-600">
                              Thank you, <strong>{confirmedOrder.customerName}</strong>. Your order has been recorded with {businessName}.
                            </p>
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[11px] text-slate-500 block">Order Reference</span>
                          <span className="text-sm font-mono font-extrabold tabular-nums text-slate-900">
                            #{confirmedOrder.orderNumber}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                          <div className="font-bold text-slate-900 mb-1">Delivery Details</div>
                          <p className="text-slate-700 font-medium">{confirmedOrder.customerName}</p>
                          <p className="text-slate-600 font-mono tabular-nums">{confirmedOrder.customerPhone}</p>
                          {confirmedOrder.customerEmail && (
                            <p className="text-slate-600">{confirmedOrder.customerEmail}</p>
                          )}
                          <p className="text-slate-600">
                            {confirmedOrder.shippingAddress}, {confirmedOrder.city}
                          </p>
                          {confirmedOrder.deliveryMethod && (
                            <p className="text-slate-500">
                              Delivery: <strong className="text-slate-800">{confirmedOrder.deliveryMethod}</strong>
                            </p>
                          )}
                          <p className="text-slate-500">
                            Payment: <strong className="text-slate-800">{confirmedOrder.paymentMethod}</strong>
                          </p>
                        </div>

                        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                          <div className="font-bold text-slate-900">Ordered Items</div>
                          <div className="divide-y divide-slate-100">
                            {confirmedOrder.items.map((it, i) => (
                              <div
                                key={`${it.productId}-${i}`}
                                className="py-1.5 flex items-center justify-between gap-2"
                              >
                                <span className="text-slate-700 truncate">
                                  {it.name}{' '}
                                  <span className="font-mono text-slate-500">× {it.quantity}</span>
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 shrink-0">
                                  ৳{(it.price * it.quantity).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2 border-t border-slate-200 space-y-1">
                            <div className="flex justify-between text-slate-500">
                              <span>Delivery Charge</span>
                              <span className="font-mono tabular-nums">
                                ৳{(confirmedOrder.deliveryFee || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between font-bold text-sm text-slate-900">
                              <span>Total Payable</span>
                              <span className="font-mono tabular-nums" style={{ color: brandColor }}>
                                ৳{confirmedOrder.total.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-slate-600">
                          Save your reference number (<strong className="font-mono">#{confirmedOrder.orderNumber}</strong>) for delivery updates.
                        </p>
                        <button
                          type="button"
                          onClick={() => setConfirmedOrder(null)}
                          className={`px-4 py-2 ${buttonRadiusClass} border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer`}
                        >
                          Place Another Order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => void handleSubmitCustomerOrder(e)}
                      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                      {/* Order Bag Summary Column */}
                      <div
                        className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 space-y-4"
                        style={{ backgroundColor: surfaceColor }}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <ShoppingBag className="w-4 h-4" style={{ color: brandColor }} />
                            <span>Your Order Bag</span>
                          </h4>
                          <span className="text-xs font-mono tabular-nums text-slate-500">
                            {totalCartItems} {totalCartItems === 1 ? 'unit' : 'units'}
                          </span>
                        </div>

                        {cart.length === 0 ? (
                          <div className="p-5 rounded-xl bg-white border border-dashed border-slate-200 text-center space-y-3">
                            <p className="text-xs text-slate-500">
                              Your order bag is empty. Select a product from the catalog above or quick-add below:
                            </p>
                            <div className="flex flex-wrap justify-center gap-1.5">
                              {orderableCatalogItems
                                .filter(
                                  (it) =>
                                    it.inStock !== false &&
                                    (typeof it.stock !== 'number' || it.stock > 0)
                                )
                                .slice(0, 4)
                                .map((it) => (
                                  <button
                                    key={it.productId || it.id}
                                    type="button"
                                    onClick={() => handleAddItemToOrder(it, 1, false)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span className="truncate max-w-[140px]">{it.name}</span>
                                  </button>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {cart.map((line) => (
                              <div
                                key={line.productId}
                                className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-900 truncate">
                                    {line.name}
                                  </p>
                                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                    ৳{line.unitPrice.toLocaleString()} × {line.quantity} ={' '}
                                    <strong className="text-slate-800">
                                      ৳{(line.unitPrice * line.quantity).toLocaleString()}
                                    </strong>
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateCartQuantity(line.productId, -1)}
                                      className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer"
                                      aria-label="Decrease item quantity"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="w-6 text-center text-xs font-mono font-bold tabular-nums text-slate-900">
                                      {line.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateCartQuantity(line.productId, 1)}
                                      disabled={
                                        line.maxStock !== undefined && line.quantity >= line.maxStock
                                      }
                                      className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                      aria-label="Increase item quantity"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromCart(line.productId)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal</span>
                            <span className="font-mono tabular-nums font-semibold">
                              ৳{cartSubtotal.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Delivery ({deliveryMethod})</span>
                            <span className="font-mono tabular-nums font-semibold">
                              {cart.length > 0
                                ? deliveryCharge === 0
                                  ? 'Free'
                                  : `৳${deliveryCharge.toLocaleString()}`
                                : '৳0'}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-extrabold text-slate-900">
                            <span>Total Payable</span>
                            <span className="font-mono tabular-nums" style={{ color: brandColor }}>
                              ৳{cartGrandTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Customer Details & Delivery Form Column */}
                      <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white space-y-4 text-xs">
                        <h4 className="text-sm font-bold text-slate-900">
                          Customer &amp; Delivery Information
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Full Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              placeholder="e.g. Tanvir Ahmed"
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Mobile Number <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              value={customerPhone}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              placeholder="017XXXXXXXX"
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-mono focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              District / City <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              list="bd-districts-list"
                              value={city}
                              onChange={(e) => handleCityChange(e.target.value)}
                              placeholder="Dhaka"
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                            <datalist id="bd-districts-list">
                              {BD_DISTRICTS.map((d) => (
                                <option key={d} value={d} />
                              ))}
                            </datalist>
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Area / Thana
                            </label>
                            <input
                              type="text"
                              value={deliveryArea}
                              onChange={(e) => setDeliveryArea(e.target.value)}
                              placeholder="e.g. Dhanmondi, Uttara"
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Email (Optional)
                            </label>
                            <input
                              type="email"
                              value={customerEmail}
                              onChange={(e) => setCustomerEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Full Delivery Address <span className="text-rose-500">*</span>
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={shippingAddress}
                            onChange={(e) => setShippingAddress(e.target.value)}
                            placeholder="House / Flat, Road, Block, Landmark"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Delivery Option
                            </label>
                            <select
                              value={deliveryMethod}
                              onChange={(e) =>
                                setDeliveryMethod(
                                  e.target.value as PublicCustomerOrderInput['deliveryMethod']
                                )
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium focus:bg-white focus:border-blue-500 outline-none"
                            >
                              <option value="Inside Dhaka">Inside Dhaka (৳60)</option>
                              <option value="Outside Dhaka">Outside Dhaka (৳120)</option>
                              <option value="Store Pickup">Store Pickup (Free)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Payment Method
                            </label>
                            <select
                              value={paymentMethod}
                              onChange={(e) =>
                                setPaymentMethod(
                                  e.target.value as PublicCustomerOrderInput['paymentMethod']
                                )
                              }
                              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium focus:bg-white focus:border-blue-500 outline-none"
                            >
                              <option value="Cash on Delivery (COD)">Cash on Delivery (COD)</option>
                              <option value="bKash">bKash (Pay on Confirmation)</option>
                              <option value="Nagad">Nagad (Pay on Confirmation)</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Delivery Instructions (Optional)
                            </label>
                            <input
                              type="text"
                              value={deliveryInstructions}
                              onChange={(e) => setDeliveryInstructions(e.target.value)}
                              placeholder="e.g. Call before arrival"
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Order Notes (Optional)
                            </label>
                            <input
                              type="text"
                              value={orderNotes}
                              onChange={(e) => setOrderNotes(e.target.value)}
                              placeholder="Size, color, or gift note"
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        {orderFormError && (
                          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                            <span className="leading-relaxed">{orderFormError}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmittingOrder || cart.length === 0}
                          className={`w-full min-h-[46px] px-5 py-3 ${buttonRadiusClass} text-white font-bold text-xs sm:text-sm shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer`}
                          style={{ backgroundColor: brandColor }}
                        >
                          {isSubmittingOrder ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Verifying Stock &amp; Saving Order...</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              <span>
                                {cart.length > 0
                                  ? `Confirm Order · ৳${cartGrandTotal.toLocaleString()}`
                                  : 'Select Products Above to Order'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
            )}
          </React.Fragment>
        );
      }

      case 'testimonials': {
        const reviews = (section.items || []).filter(
          (it) => (it.description || it.title || '').trim().length > 0
        );
        if (reviews.length === 0) return null;

        return (
          <section key={section.id} className="py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-6">
            <div className="space-y-1">
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                {section.title || 'Customer Feedback'}
              </h3>
              {section.subtitle && <p className="text-xs text-slate-500">{section.subtitle}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-5 rounded-xl border border-slate-200 space-y-3"
                  style={{ backgroundColor: surfaceColor }}
                >
                  <Quote className="w-4 h-4 text-slate-400" />
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                    {rev.description || rev.title}
                  </p>
                  {(rev.author || rev.role) && (
                    <div className="text-xs text-slate-500 pt-1">
                      {rev.author && <strong className="text-slate-900">{rev.author}</strong>}
                      {rev.author && rev.role && <span className="mx-1.5">·</span>}
                      {rev.role && <span>{rev.role}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      }

      case 'faq': {
        const faqs = (section.items || []).filter((it) => (it.title || '').trim().length > 0);
        if (faqs.length === 0) return null;

        return (
          <section
            key={section.id}
            className="py-12 px-4 sm:px-6 border-t border-slate-200/70"
            style={{ backgroundColor: surfaceColor }}
          >
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="space-y-1 text-center">
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                  {section.title || 'Frequently Asked Questions'}
                </h3>
                {section.subtitle && <p className="text-xs text-slate-500">{section.subtitle}</p>}
              </div>

              <div className="space-y-2.5">
                {faqs.map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className="rounded-xl bg-white border border-slate-200 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span>{faq.title}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && faq.description && (
                        <div className="px-4 pb-4 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                          {faq.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      }

      case 'contact': {
        if (!hasAnyDirectContact && isPublicView) {
          return null;
        }
        const locConfig = themeSettings.location;
        const effectiveAddr = (locConfig?.address || address || '').trim();
        const locShareUrl = (locConfig?.mapsShareUrl || '').trim();
        const dirUrl = buildGoogleMapsDirectionsUrl({
          businessName,
          address: effectiveAddr,
          mapsShareUrl: locShareUrl,
          latitude: locConfig?.latitude,
          longitude: locConfig?.longitude,
        });
        const showMapCard = Boolean(dirUrl || effectiveAddr || locShareUrl);

        return (
          <section key={section.id} id="contact" className="py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                {section.title || 'Get in Touch'}
              </h3>
              {section.subtitle && <p className="text-xs text-slate-500">{section.subtitle}</p>}
            </div>

            <div className={`grid grid-cols-1 ${address ? 'md:grid-cols-2' : 'max-w-xl mx-auto'} gap-6`}>
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-900">Direct Contact</h4>

                {hasAnyDirectContact ? (
                  <div className="space-y-2.5 text-xs text-slate-600">
                    {phone && (
                      <a href={`tel:${phone}`} className="flex items-center gap-2.5 hover:text-slate-900">
                        <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: brandColor }} />
                        <span className="font-mono tabular-nums">{phone}</span>
                      </a>
                    )}
                    {email && (
                      <a href={`mailto:${email}`} className="flex items-center gap-2.5 hover:text-slate-900">
                        <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: brandColor }} />
                        <span>{email}</span>
                      </a>
                    )}
                    {address && (
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: brandColor }} />
                        <span>{address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Add your phone number, WhatsApp, email, or store address in Business Info to display direct contact options here.
                  </p>
                )}

                {hasWhatsapp && (
                  <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                          Your Name
                        </label>
                        <input
                          type="text"
                          value={inquiryName}
                          onChange={(e) => setInquiryName(e.target.value)}
                          placeholder="Your name"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                          Phone / WhatsApp
                        </label>
                        <input
                          type="text"
                          value={inquiryContact}
                          onChange={(e) => setInquiryContact(e.target.value)}
                          placeholder="+880 1..."
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                        Message / Inquiry
                      </label>
                      <input
                        type="text"
                        value={inquiryNote}
                        onChange={(e) => setInquiryNote(e.target.value)}
                        placeholder="Have a question for our team?"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <a
                      href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
                        `Hello ${businessName}, I am contacting you from ${displayDomain}.\nName: ${
                          inquiryName || 'Visitor'
                        }\nPhone: ${inquiryContact || 'Not specified'}\nMessage: ${
                          inquiryNote || 'I would like to inquire about your offerings.'
                        }`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`w-full py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-xs transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5`}
                      style={{ backgroundColor: brandColor }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send Message on WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>

              {showMapCard && (
                <div
                  className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col items-center justify-between p-6 text-center space-y-4 shadow-xs"
                  style={{ backgroundColor: surfaceColor }}
                >
                  <div className="flex flex-col items-center space-y-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm"
                      style={{ backgroundColor: brandColor }}
                    >
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">
                        {locConfig?.placeName || 'Store / Office Location'}
                      </h4>
                      <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                        {effectiveAddr || 'Open Google Maps below for our verified location and direct driving route.'}
                      </p>
                      {locConfig?.latitude && locConfig?.longitude && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Verified Pin ({locConfig.latitude.toFixed(4)}, {locConfig.longitude.toFixed(4)})</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                    <a
                      href={dirUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-sm hover:opacity-90 transition-opacity`}
                      style={{ backgroundColor: brandColor }}
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Get Directions</span>
                    </a>
                    {locShareUrl && (
                      <a
                        href={locShareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                      >
                        <span>View Map</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      }

      case 'location': {
        const locConfig = themeSettings.location;
        const effectiveAddr = (locConfig?.address || address || '').trim();
        const locShareUrl = (locConfig?.mapsShareUrl || '').trim();
        const hasLocationData = Boolean(effectiveAddr || locShareUrl);
        if (!hasLocationData && isPublicView) return null;

        const dirUrl = buildGoogleMapsDirectionsUrl({
          address: effectiveAddr,
          mapsShareUrl: locShareUrl,
          businessName: locConfig?.placeName || businessName,
          latitude: locConfig?.latitude,
          longitude: locConfig?.longitude,
        });

        return (
          <section key={section.id} id="location" className={`py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-6 ${animRevealClass}`}>
            <div className="text-center space-y-1">
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                {section.title || 'Store & Office Location'}
              </h3>
              {section.subtitle && <p className="text-xs text-slate-500">{section.subtitle}</p>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: brandColor }}
                >
                  <MapPin className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900">
                    {locConfig?.placeName || businessName}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md">
                    {effectiveAddr || 'Visit us during our regular business hours.'}
                  </p>
                  {phone && (
                    <p className="text-xs text-slate-500 font-mono">
                      Contact: {phone}
                    </p>
                  )}
                  {locConfig?.latitude && locConfig?.longitude && (
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Verified Location ({locConfig.latitude.toFixed(4)}, {locConfig.longitude.toFixed(4)})</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
                <a
                  href={dirUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 ${buttonRadiusClass} text-white font-semibold text-xs shadow-sm hover:opacity-90 transition-opacity`}
                  style={{ backgroundColor: brandColor }}
                >
                  <Navigation className="w-4 h-4" />
                  <span>Get Directions</span>
                </a>
                {locShareUrl && (
                  <a
                    href={locShareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </section>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className={`mx-auto text-slate-900 overflow-hidden transition-all duration-300 relative ${fontClass} ${
        isPublicView
          ? 'w-full min-h-screen rounded-none border-0 shadow-none'
          : viewMode === 'mobile'
          ? 'max-w-sm rounded-[36px] border-8 border-slate-900 shadow-2xl my-4'
          : 'w-full max-w-5xl rounded-2xl border border-slate-300 dark:border-slate-800 shadow-xl my-2'
      }`}
      style={{ backgroundColor }}
    >
      {animationsEnabled && (
        <style>{`
          ${smoothScroll ? 'html { scroll-behavior: smooth; }' : ''}
          @keyframes amsFadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes amsFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes amsZoomIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
          .ams-anim-fade-up {
            animation: amsFadeUp ${
              animSpeed === 'fast' ? '0.3s' : animSpeed === 'relaxed' ? '0.75s' : '0.45s'
            } cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .ams-anim-fade-in {
            animation: amsFadeIn ${
              animSpeed === 'fast' ? '0.25s' : animSpeed === 'relaxed' ? '0.65s' : '0.4s'
            } ease-out forwards;
          }
          .ams-anim-zoom-in {
            animation: amsZoomIn ${
              animSpeed === 'fast' ? '0.3s' : animSpeed === 'relaxed' ? '0.7s' : '0.45s'
            } cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          @media (prefers-reduced-motion: reduce) {
            .ams-anim-fade-up, .ams-anim-fade-in, .ams-anim-zoom-in {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
            }
          }
        `}</style>
      )}
      {/* Browser Chrome Simulation Header */}
      {!isPublicView && (
        <div className="bg-slate-900 text-slate-300 px-4 py-2.5 flex items-center justify-between border-b border-slate-800 text-xs select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800/80 text-[11px] font-mono text-slate-300 max-w-xs sm:max-w-md truncate">
            <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-emerald-400">https://</span>
            <span className="font-semibold text-white truncate">{displayDomain}</span>
          </div>

          <div className="text-[10px] text-slate-400 font-medium">
            {viewMode === 'mobile' ? 'Mobile' : 'Desktop'}
          </div>
        </div>
      )}

      {/* Grace Period Notification Banner */}
      {isGracePeriod && !isSuspended && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2">
          <span>Subscription renewal is pending. Website remains live during the 7-day grace window.</span>
        </div>
      )}

      {/* Suspended Notice */}
      {isSuspended ? (
        <div className="p-12 text-center space-y-4 bg-slate-50 min-h-[400px] flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Website Temporarily Paused</h2>
          <p className="text-xs text-slate-600 max-w-md">
            This business website ({displayDomain}) is currently inactive pending subscription renewal. Customer data and settings are safely preserved.
          </p>
          <div className="text-[11px] text-slate-400 font-mono">Hosted on GoAMAAS</div>
        </div>
      ) : (
        <div className="antialiased" style={{ color: textColor }}>
          {/* Top Navigation Bar */}
          <header className="border-b border-slate-100 bg-white/95 backdrop-blur-xs sticky top-0 z-20">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <a href="#" className="flex items-center gap-2.5 min-w-0">
                {site.logoUrl && !brokenLogoImg ? (
                  <img
                    src={site.logoUrl}
                    alt={businessName}
                    referrerPolicy="no-referrer"
                    onError={() => setBrokenLogoImg(true)}
                    className="w-9 h-9 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                    style={{ backgroundColor: brandColor }}
                  >
                    {businessName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="truncate">
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight truncate">
                    {businessName}
                  </h1>
                  {(site.nicheLabel || site.niche) && (
                    <span className="text-[10px] text-slate-400 font-medium capitalize block truncate">
                      {site.nicheLabel || site.niche}
                    </span>
                  )}
                </div>
              </a>

              <nav className="hidden sm:flex items-center gap-5 text-xs font-medium text-slate-600">
                {hasAboutSection && (
                  <a href="#about" className="hover:text-slate-900 hover:underline underline-offset-4">
                    About
                  </a>
                )}
                {hasProductsSection && (
                  <a href="#services" className="hover:text-slate-900 hover:underline underline-offset-4">
                    Catalog
                  </a>
                )}
                {hasOrderableStorefront && (
                  <a href="#checkout" className="hover:text-slate-900 hover:underline underline-offset-4">
                    Order Online
                  </a>
                )}
                {hasContactSection && hasAnyDirectContact && (
                  <a href="#contact" className="hover:text-slate-900 hover:underline underline-offset-4">
                    Contact
                  </a>
                )}
                {customLinks.slice(0, 2).map((link) => (
                  <a
                    key={link.id}
                    href={resolveCtaHref(link.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-slate-900 hover:underline underline-offset-4"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              <div className="flex items-center gap-2 shrink-0">
                {hasOrderableStorefront && (
                  <button
                    type="button"
                    onClick={scrollToCheckout}
                    className={`min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 ${buttonRadiusClass} text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 cursor-pointer`}
                    style={{ backgroundColor: brandColor }}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Bag</span>
                    <span className="font-mono tabular-nums font-bold">
                      ({totalCartItems})
                    </span>
                  </button>
                )}

                {!hasOrderableStorefront && hasWhatsapp ? (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 ${buttonRadiusClass} text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 shrink-0`}
                    style={{ backgroundColor: brandColor }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                ) : !hasOrderableStorefront && phone ? (
                  <a
                    href={`tel:${phone}`}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 ${buttonRadiusClass} text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 shrink-0`}
                    style={{ backgroundColor: brandColor }}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                ) : null}
              </div>
            </div>
          </header>

          {/* Dynamic Ordered Website Sections */}
          <main>{activeSections.map((sec) => renderSection(sec))}</main>

          {/* Product Details Modal */}
          {detailProduct && (
            <div
              className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setDetailProduct(null)}
            >
              <div
                className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                  <div className="text-xs text-slate-500 font-medium truncate">
                    {detailProduct.category || businessName}
                    {detailProduct.sku ? ` · ${detailProduct.sku}` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailProduct(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {detailProduct.imageUrl && (
                  <div className="w-full aspect-[16/10] bg-slate-100 border-b border-slate-100 overflow-hidden">
                    <img
                      src={detailProduct.imageUrl}
                      alt={detailProduct.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                      {detailProduct.name}
                    </h3>
                    <div className="text-right shrink-0">
                      <span
                        className="text-base font-extrabold font-mono tabular-nums block"
                        style={{ color: brandColor }}
                      >
                        {formatProductPrice(detailProduct)}
                      </span>
                      {parseItemOriginalPrice(
                        detailProduct,
                        parseItemNumericPrice(detailProduct)
                      ) !== undefined && (
                        <span className="text-xs font-mono tabular-nums text-slate-400 line-through">
                          ৳
                          {parseItemOriginalPrice(
                            detailProduct,
                            parseItemNumericPrice(detailProduct)
                          )?.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {detailProduct.description && (
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                      {detailProduct.description}
                    </p>
                  )}

                  {(() => {
                    const pid = (detailProduct.productId || detailProduct.id || '').trim();
                    const avail =
                      typeof detailProduct.stock === 'number'
                        ? Math.max(0, Math.trunc(detailProduct.stock))
                        : undefined;
                    const out =
                      detailProduct.inStock === false || (avail !== undefined && avail <= 0);
                    const canOrder = isPublicView ? PRODUCT_UUID_REGEX.test(pid) : Boolean(pid);
                    if (!canOrder) return null;

                    return (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <span
                          className={`text-xs font-semibold ${
                            out ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {out
                            ? 'Out of Stock'
                            : avail !== undefined
                            ? `In Stock (${avail} available)`
                            : 'Available'}
                        </span>
                        <button
                          type="button"
                          disabled={out}
                          onClick={() => {
                            handleAddItemToOrder(detailProduct, 1, true);
                            setDetailProduct(null);
                          }}
                          className={`min-h-[40px] px-5 py-2 ${buttonRadiusClass} text-white text-xs font-semibold shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5`}
                          style={{ backgroundColor: brandColor }}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{out ? 'Unavailable' : 'Add & Proceed to Order'}</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Footer — Strictly renders only configured business info, socials, and custom links */}
          <footer className="bg-slate-900 text-slate-400 py-8 px-4 sm:px-6 text-xs border-t border-slate-800">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-2.5">
                    {site.logoUrl && !brokenLogoImg && (
                      <img
                        src={site.logoUrl}
                        alt={businessName}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-lg object-contain bg-white p-0.5"
                      />
                    )}
                    <span className="font-bold text-sm text-white">{businessName}</span>
                  </div>
                  {address && <p className="text-[11px] text-slate-400 max-w-sm">{address}</p>}
                  {(phone || email) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      {phone && (
                        <a href={`tel:${phone}`} className="hover:text-white font-mono tabular-nums">
                          {phone}
                        </a>
                      )}
                      {phone && email && <span aria-hidden="true">·</span>}
                      {email && (
                        <a href={`mailto:${email}`} className="hover:text-white">
                          {email}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start md:items-end gap-3">
                  {customLinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 text-[11px]">
                      {customLinks.map((link) => (
                        <a
                          key={link.id}
                          href={resolveCtaHref(link.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-300 hover:text-white hover:underline underline-offset-4"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {hasAnySocial && (
                    <div className="flex items-center gap-3.5">
                      {socialLinks.facebook?.trim() && (
                        <a
                          href={resolveCtaHref(socialLinks.facebook)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Facebook"
                        >
                          <Facebook className="w-4 h-4" />
                        </a>
                      )}
                      {socialLinks.instagram?.trim() && (
                        <a
                          href={resolveCtaHref(socialLinks.instagram)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Instagram"
                        >
                          <Instagram className="w-4 h-4" />
                        </a>
                      )}
                      {socialLinks.twitter?.trim() && (
                        <a
                          href={resolveCtaHref(socialLinks.twitter)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Twitter / X"
                        >
                          <Twitter className="w-4 h-4" />
                        </a>
                      )}
                      {socialLinks.linkedin?.trim() && (
                        <a
                          href={resolveCtaHref(socialLinks.linkedin)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white transition-colors"
                          title="LinkedIn"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {socialLinks.youtube?.trim() && (
                        <a
                          href={resolveCtaHref(socialLinks.youtube)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white transition-colors"
                          title="YouTube"
                        >
                          <Youtube className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  © {new Date().getFullYear()} {businessName}. All rights reserved.
                </span>
                <span className="font-mono text-[10px]">
                  Hosted on GoAMAAS · {fullDomainUrl}
                </span>
              </div>
            </div>
          </footer>

          {/* Floating WhatsApp Button on Public View ONLY when WhatsApp/Phone is configured */}
          {isPublicView && hasWhatsapp && (
            <a
              href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
                `Hello ${businessName}, I am browsing your online store at ${displayDomain}!`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full text-white font-bold text-xs shadow-2xl flex items-center gap-2 hover:scale-105 transition-transform"
              style={{ backgroundColor: '#25D366' }}
            >
              <MessageSquare className="w-4 h-4 fill-white" />
              <span>Chat with Us</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
};
