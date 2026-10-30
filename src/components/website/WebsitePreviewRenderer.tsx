import React, { useState } from 'react';
import {
  SubscribedWebsite,
  WebsiteSectionConfig,
  WebsiteProductItem,
} from '../../types';
import {
  Globe,
  Phone,
  Mail,
  MapPin,
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
} from 'lucide-react';

interface WebsitePreviewRendererProps {
  site: Partial<SubscribedWebsite>;
  viewMode?: 'desktop' | 'mobile';
  showGraceBanner?: boolean;
  isPublicView?: boolean;
}

function buildDefaultSections(site: Partial<SubscribedWebsite>): WebsiteSectionConfig[] {
  const sections: WebsiteSectionConfig[] = [
    {
      id: 'sec-hero',
      type: 'hero',
      title: site.headline || 'Quality Products & Attentive Service',
      subtitle:
        site.subheadline ||
        'Explore our featured offerings and reach out directly to place your order or inquiry.',
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
    subtitle: 'Browse available items below and connect directly to order or inquire.',
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

export const WebsitePreviewRenderer: React.FC<WebsitePreviewRendererProps> = ({
  site,
  viewMode = 'desktop',
  showGraceBanner = false,
  isPublicView = false,
}) => {
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [inquiryNote, setInquiryNote] = useState('');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

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

  const heroLayout = themeSettings.heroLayout || (site.heroImageUrl ? 'split' : 'centered');

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

  const visibleProducts: WebsiteProductItem[] = (site.servicesOrProducts || []).filter(
    (item) => item && item.isVisible !== false && (item.name || '').trim().length > 0
  );

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
    (site.heroCtaText || '').trim() || (hasWhatsapp ? 'Chat on WhatsApp' : 'Explore Offerings');
  const primaryCtaHref = resolveCtaHref(
    site.heroCtaLink,
    hasWhatsapp ? 'whatsapp' : hasProductsSection ? '#services' : '#contact'
  );
  const isPrimaryExternal = primaryCtaHref.startsWith('http');

  const secondaryCtaLabel =
    site.secondaryCtaText !== undefined
      ? site.secondaryCtaText.trim()
      : hasProductsSection && primaryCtaHref !== '#services'
      ? 'View Offerings'
      : '';
  const secondaryCtaHref = resolveCtaHref(site.secondaryCtaLink || '#services', '#services');

  const isSuspended =
    site.subscriptionStatus === 'suspended' || site.deploymentStatus === 'suspended';
  const isGracePeriod = site.subscriptionStatus === 'grace_period' || showGraceBanner;

  const formatProductPrice = (item: WebsiteProductItem): string => {
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
          site.subheadline !== undefined ? site.subheadline.trim() : (section.subtitle || subheadline).trim();
        const heroImg = (site.heroImageUrl || section.imageUrl || '').trim();

        if (heroLayout === 'split' && heroImg) {
          return (
            <section
              key={section.id}
              className="py-12 sm:py-16 px-4 sm:px-8 border-b border-slate-200/70"
              style={{ backgroundColor: surfaceColor }}
            >
              <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                <div className="md:col-span-7 space-y-4 text-left">
                  {site.nicheLabel && (
                    <p className="text-xs font-semibold text-slate-500">{site.nicheLabel}</p>
                  )}
                  <h2
                    className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight text-balance"
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
                      className={`px-5 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-sm hover:opacity-90 transition-opacity inline-flex items-center gap-1.5`}
                      style={{ backgroundColor: brandColor }}
                    >
                      <span>{primaryCtaLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                    {secondaryCtaLabel && (
                      <a
                        href={secondaryCtaHref}
                        className={`px-5 py-2.5 ${buttonRadiusClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 font-semibold text-xs transition-colors`}
                      >
                        {secondaryCtaLabel}
                      </a>
                    )}
                  </div>
                </div>

                <div className="md:col-span-5">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100 aspect-[4/3]">
                    <img
                      src={heroImg}
                      alt={heroHeading}
                      className="w-full h-full object-cover"
                    />
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
              className="relative py-16 sm:py-24 px-4 sm:px-8 text-center text-white overflow-hidden"
            >
              <img
                src={heroImg}
                alt={heroHeading}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-950/65" />
              <div className="max-w-3xl mx-auto space-y-4 relative z-10">
                {site.nicheLabel && (
                  <p className="text-xs font-medium text-slate-200">{site.nicheLabel}</p>
                )}
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight text-balance">
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
                    className={`px-5 py-2.5 ${buttonRadiusClass} text-white font-semibold text-xs shadow-md hover:opacity-90 transition-opacity inline-flex items-center gap-1.5`}
                    style={{ backgroundColor: brandColor }}
                  >
                    <span>{primaryCtaLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                  {secondaryCtaLabel && (
                    <a
                      href={secondaryCtaHref}
                      className={`px-5 py-2.5 ${buttonRadiusClass} bg-white/15 hover:bg-white/25 text-white font-medium text-xs border border-white/25 transition-colors`}
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
            className="py-12 sm:py-16 px-4 sm:px-6 text-center text-white relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${brandColor} 0%, #0F172A 100%)`,
            }}
          >
            <div className="max-w-3xl mx-auto space-y-4 relative z-10">
              {site.nicheLabel && (
                <p className="text-xs font-medium text-white/80">{site.nicheLabel}</p>
              )}
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight text-balance">
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
                  className={`px-5 py-2.5 ${buttonRadiusClass} bg-white text-slate-900 font-bold text-xs shadow-md hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5`}
                >
                  <span>{primaryCtaLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
                {secondaryCtaLabel && (
                  <a
                    href={secondaryCtaHref}
                    className={`px-5 py-2.5 ${buttonRadiusClass} bg-white/15 hover:bg-white/25 text-white font-medium text-xs border border-white/20 transition-colors`}
                  >
                    {secondaryCtaLabel}
                  </a>
                )}
              </div>
              {heroImg && (
                <div className="pt-6 max-w-2xl mx-auto">
                  <div className="rounded-2xl overflow-hidden border border-white/20 shadow-xl aspect-[16/9] bg-slate-900">
                    <img
                      src={heroImg}
                      alt={heroHeading}
                      className="w-full h-full object-cover"
                    />
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

        return (
          <section key={section.id} className="py-8 px-4 sm:px-6 max-w-5xl mx-auto">
            <div
              className="rounded-2xl overflow-hidden border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-12 items-center"
              style={{ backgroundColor: surfaceColor }}
            >
              <div className={`${bImg ? 'md:col-span-7' : 'md:col-span-12'} p-6 sm:p-8 space-y-3`}>
                {bTitle && (
                  <h3 className="text-lg sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
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
                      className={`inline-flex items-center gap-1.5 px-4 py-2 ${buttonRadiusClass} text-white font-semibold text-xs hover:opacity-90 transition-opacity`}
                      style={{ backgroundColor: brandColor }}
                    >
                      <span>{bCtaText}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
              {bImg && (
                <div className="md:col-span-5 h-48 md:h-full min-h-[180px] bg-slate-100">
                  <img src={bImg} alt={bTitle || businessName} className="w-full h-full object-cover" />
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
                    <span>Direct customer communication & verified store profile</span>
                  </div>
                </div>
              </div>

              {sectionImg ? (
                <div className="md:col-span-5">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]">
                    <img
                      src={sectionImg}
                      alt={section.title || businessName}
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
                        <span className="font-semibold text-slate-800 font-mono">{phone}</span>
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
                        <img src={it.imageUrl} alt={it.title} className="w-full h-full object-cover" />
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
          <section
            key={section.id}
            id="services"
            className="py-12 px-4 sm:px-6 border-t border-slate-200/80"
            style={{ backgroundColor: surfaceColor }}
          >
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: textColor }}>
                    {section.title || 'Featured Products & Offerings'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {section.subtitle ||
                      (hasWhatsapp
                        ? 'Select any item below to order or inquire directly via WhatsApp.'
                        : 'Explore our current catalog of products and services.')}
                  </p>
                </div>
                {visibleProducts.length > 0 && (
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {visibleProducts.length} {visibleProducts.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {visibleProducts.length > 0 ? (
                  visibleProducts.map((item, idx) => {
                    const priceText = formatProductPrice(item);
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
                        key={item.id || idx}
                        className="rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-xs overflow-hidden flex flex-col justify-between transition-all"
                      >
                        <div>
                          {item.imageUrl && (
                            <div className="w-full h-44 bg-slate-100 border-b border-slate-100 overflow-hidden">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="p-4 space-y-2">
                            {item.category && (
                              <div className="text-[11px] text-slate-400 font-medium">
                                {item.category}
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-sm text-slate-900 leading-snug">
                                {item.name}
                              </h4>
                              {priceText && (
                                <span
                                  className="font-bold font-mono tabular-nums text-sm shrink-0"
                                  style={{ color: brandColor }}
                                >
                                  {priceText}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">Available</span>
                          <a
                            href={productOrderHref}
                            target={productOrderHref.startsWith('http') ? '_blank' : undefined}
                            rel={productOrderHref.startsWith('http') ? 'noreferrer' : undefined}
                            className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                            style={{ color: brandColor }}
                          >
                            <span>{hasWhatsapp ? 'Order / Inquire' : 'Inquire Now'}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </a>
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
                        <span className="font-mono">{phone}</span>
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
                        Message / Order Note
                      </label>
                      <input
                        type="text"
                        value={inquiryNote}
                        onChange={(e) => setInquiryNote(e.target.value)}
                        placeholder="What would you like to order or ask?"
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

              {address && (
                <div
                  className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-6 text-center space-y-3"
                  style={{ backgroundColor: surfaceColor }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-xs"
                    style={{ backgroundColor: brandColor }}
                  >
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-900">Store / Office Location</h4>
                    <p className="text-xs text-slate-600 max-w-xs leading-relaxed">{address}</p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${businessName} ${address}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    style={{ color: brandColor }}
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
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
      className={`mx-auto text-slate-900 overflow-hidden transition-all duration-300 ${fontClass} ${
        isPublicView
          ? 'w-full min-h-screen rounded-none border-0 shadow-none'
          : viewMode === 'mobile'
          ? 'max-w-sm rounded-[36px] border-8 border-slate-900 shadow-2xl my-4'
          : 'w-full max-w-5xl rounded-2xl border border-slate-300 dark:border-slate-800 shadow-xl my-2'
      }`}
      style={{ backgroundColor }}
    >
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
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
              <a href="#" className="flex items-center gap-2.5 min-w-0">
                {site.logoUrl ? (
                  <img
                    src={site.logoUrl}
                    alt={businessName}
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

              {hasWhatsapp ? (
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
              ) : phone ? (
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
          </header>

          {/* Dynamic Ordered Website Sections */}
          <main>{activeSections.map((sec) => renderSection(sec))}</main>

          {/* Footer — Strictly renders only configured business info, socials, and custom links */}
          <footer className="bg-slate-900 text-slate-400 py-8 px-4 sm:px-6 text-xs border-t border-slate-800">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-2.5">
                    {site.logoUrl && (
                      <img
                        src={site.logoUrl}
                        alt={businessName}
                        className="w-7 h-7 rounded-lg object-contain bg-white p-0.5"
                      />
                    )}
                    <span className="font-bold text-sm text-white">{businessName}</span>
                  </div>
                  {address && <p className="text-[11px] text-slate-400 max-w-sm">{address}</p>}
                  {(phone || email) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      {phone && (
                        <a href={`tel:${phone}`} className="hover:text-white font-mono">
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
              className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-full text-white font-bold text-xs shadow-2xl flex items-center gap-2 hover:scale-105 transition-transform"
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
