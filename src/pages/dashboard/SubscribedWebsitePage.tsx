import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  SubscribedWebsite,
  BusinessNiche,
  Product,
  WebsiteSectionConfig,
  WebsiteSectionType,
  WebsiteSectionItem,
  WebsiteThemeSettings,
  WebsiteCustomLink,
  WebsiteProductItem,
} from '../../types';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ManualPaymentModal } from '../../components/payment/ManualPaymentModal';
import { CATEGORY_SPECS, THEME_PALETTES } from '../../data/websiteBuilderConfig';
import {
  Globe,
  CreditCard,
  ExternalLink,
  Copy,
  AlertTriangle,
  Clock,
  Sparkles,
  Plus,
  Send,
  ShieldCheck,
  Smartphone,
  Monitor,
  HardDrive,
  Activity,
  Layers,
  MessageSquare,
  FileText,
  Loader2,
  Palette,
  ShoppingBag,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Ban,
  Building,
  Eye,
  EyeOff,
  Save,
  Upload,
  Edit3,
  ChevronDown,
  ChevronUp,
  Link2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { isWebsiteTrulyLive } from '../../lib/paymentWorkflow';

function createInitialSections(site: SubscribedWebsite, draft?: SubscribedWebsite['draftConfig']): WebsiteSectionConfig[] {
  const sourceSections = draft?.sections ?? site.sections;
  if (Array.isArray(sourceSections) && sourceSections.length > 0) {
    return sourceSections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => ({
        ...s,
        order: idx,
        items: s.items ? s.items.map((it) => ({ ...it })) : undefined,
      }));
  }

  const headline = draft?.headline ?? site.headline ?? 'Quality Products & Attentive Service';
  const subheadline =
    draft?.subheadline ??
    site.subheadline ??
    'Explore our featured offerings and reach out directly to place your order.';
  const aboutText = draft?.aboutText ?? site.aboutText ?? '';
  const bannerTitle = draft?.bannerTitle ?? site.bannerTitle ?? '';
  const bannerImageUrl = draft?.bannerImageUrl ?? site.bannerImageUrl ?? '';

  return [
    {
      id: 'sec-hero',
      type: 'hero',
      title: headline,
      subtitle: subheadline,
      enabled: true,
      order: 0,
    },
    {
      id: 'sec-banner',
      type: 'banner',
      title: bannerTitle || 'Special Announcement',
      subtitle: draft?.bannerSubtitle ?? site.bannerSubtitle ?? '',
      imageUrl: bannerImageUrl || undefined,
      ctaText: draft?.bannerCtaText ?? site.bannerCtaText ?? 'Learn More',
      ctaLink: draft?.bannerCtaLink ?? site.bannerCtaLink ?? '#services',
      enabled: Boolean(bannerTitle || bannerImageUrl),
      order: 1,
    },
    {
      id: 'sec-about',
      type: 'about',
      title: 'About Our Business',
      content: aboutText,
      enabled: Boolean(aboutText.trim()),
      order: 2,
    },
    {
      id: 'sec-products',
      type: 'products',
      title: 'Featured Products & Offerings',
      subtitle: 'Select any item below to inquire or order directly.',
      enabled: true,
      order: 3,
    },
    {
      id: 'sec-contact',
      type: 'contact',
      title: 'Get in Touch',
      subtitle: 'Reach out directly for pricing, availability, or support.',
      enabled: true,
      order: 4,
    },
  ];
}

const SECTION_TYPE_LABELS: Record<WebsiteSectionType, string> = {
  hero: 'Hero Header',
  banner: 'Promotional Banner',
  about: 'About Story',
  highlights: 'Key Highlights',
  products: 'Products Catalog',
  testimonials: 'Customer Testimonials',
  faq: 'FAQ Accordion',
  contact: 'Contact & Location',
};

export const SubscribedWebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeStore,
    subscribedWebsites,
    isWebsitesLoading,
    websiteSubscriptionPlan,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    updateSubscribedWebsite,
    saveWebsiteDraft,
    publishWebsiteUpdates,
    uploadWebsiteAsset,
    requestWebsiteContentUpdate,
    showToast,
    publishWebsite,
    unpublishWebsite,
    cancelWebsiteSubscription,
    paymentGatewayConfigs,
    paymentRequests,
    isPaymentsLoading,
    refreshPaymentRequests,
    refreshSubscribedWebsites,
  } = useApp();

  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>('');

  const activeWebsite: SubscribedWebsite | undefined =
    subscribedWebsites.find((s) => s.id === selectedWebsiteId) ||
    subscribedWebsites.find((s) => s.storeId === activeStore?.id) ||
    subscribedWebsites[0];

  // Visual Editor Tab State
  const [editorTab, setEditorTab] = useState<'hero' | 'sections' | 'products' | 'theme' | 'business'>('hero');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);

  // Saving / Uploading / Action States
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Dialogs & Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isUnpublishDialogOpen, setIsUnpublishDialogOpen] = useState(false);
  const [isCancelSubDialogOpen, setIsCancelSubDialogOpen] = useState(false);

  // Product Add/Edit & Delete Confirmation State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductTarget, setEditingProductTarget] = useState<{
    mode: 'add' | 'edit';
    dbProduct?: Product;
    legacyIndex?: number;
  } | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState<number>(1200);
  const [prodCategory, setProdCategory] = useState('General');
  const [prodDescription, setProdDescription] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodVisible, setProdVisible] = useState(true);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{
    dbProduct?: Product;
    legacyIndex?: number;
    name: string;
  } | null>(null);

  // Editable Website State (Hydrated from activeWebsite + draftConfig)
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editHeroImageUrl, setEditHeroImageUrl] = useState('');
  const [editHeadline, setEditHeadline] = useState('');
  const [editSubheadline, setEditSubheadline] = useState('');
  const [editHeroCtaText, setEditHeroCtaText] = useState('');
  const [editHeroCtaLink, setEditHeroCtaLink] = useState('');
  const [editSecondaryCtaText, setEditSecondaryCtaText] = useState('');
  const [editSecondaryCtaLink, setEditSecondaryCtaLink] = useState('');

  const [editBannerImageUrl, setEditBannerImageUrl] = useState('');
  const [editBannerTitle, setEditBannerTitle] = useState('');
  const [editBannerSubtitle, setEditBannerSubtitle] = useState('');
  const [editBannerCtaText, setEditBannerCtaText] = useState('');
  const [editBannerCtaLink, setEditBannerCtaLink] = useState('');

  const [editAbout, setEditAbout] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCustomDomain, setEditCustomDomain] = useState('');

  const [editSocialFacebook, setEditSocialFacebook] = useState('');
  const [editSocialInstagram, setEditSocialInstagram] = useState('');
  const [editSocialTwitter, setEditSocialTwitter] = useState('');
  const [editSocialLinkedin, setEditSocialLinkedin] = useState('');
  const [editSocialYoutube, setEditSocialYoutube] = useState('');
  const [editCustomLinks, setEditCustomLinks] = useState<WebsiteCustomLink[]>([]);

  const [editNiche, setEditNiche] = useState<BusinessNiche>('ecommerce');
  const [editBrandColor, setEditBrandColor] = useState('#2563EB');
  const [editThemeSettings, setEditThemeSettings] = useState<WebsiteThemeSettings>({
    primaryColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    surfaceColor: '#F8FAFC',
    textColor: '#0F172A',
    fontStyle: 'modern',
    buttonStyle: 'rounded',
    heroLayout: 'split',
  });

  const [editSections, setEditSections] = useState<WebsiteSectionConfig[]>([]);
  const [editLegacyItems, setEditLegacyItems] = useState<WebsiteProductItem[]>([]);
  const [updateRequestText, setUpdateRequestText] = useState('');

  // Hydrate editor from activeWebsite (preferring staged draftConfig when hasUnpublishedDraft is true)
  const hydrateEditorFromWebsite = (site: SubscribedWebsite, useDraft = true) => {
    const draft = useDraft && site.hasUnpublishedDraft ? site.draftConfig : undefined;

    setEditBusinessName(draft?.businessName ?? site.businessName ?? '');
    setEditLogoUrl(draft?.logoUrl ?? site.logoUrl ?? '');
    setEditHeroImageUrl(draft?.heroImageUrl ?? site.heroImageUrl ?? '');
    setEditHeadline(draft?.headline ?? site.headline ?? '');
    setEditSubheadline(draft?.subheadline ?? site.subheadline ?? '');
    setEditHeroCtaText(draft?.heroCtaText ?? site.heroCtaText ?? '');
    setEditHeroCtaLink(draft?.heroCtaLink ?? site.heroCtaLink ?? '');
    setEditSecondaryCtaText(draft?.secondaryCtaText ?? site.secondaryCtaText ?? '');
    setEditSecondaryCtaLink(draft?.secondaryCtaLink ?? site.secondaryCtaLink ?? '');

    setEditBannerImageUrl(draft?.bannerImageUrl ?? site.bannerImageUrl ?? '');
    setEditBannerTitle(draft?.bannerTitle ?? site.bannerTitle ?? '');
    setEditBannerSubtitle(draft?.bannerSubtitle ?? site.bannerSubtitle ?? '');
    setEditBannerCtaText(draft?.bannerCtaText ?? site.bannerCtaText ?? '');
    setEditBannerCtaLink(draft?.bannerCtaLink ?? site.bannerCtaLink ?? '');

    setEditAbout(draft?.aboutText ?? site.aboutText ?? '');
    setEditPhone(draft?.phone ?? site.phone ?? '');
    setEditEmail(draft?.email ?? site.email ?? '');
    setEditWhatsapp(draft?.whatsappNumber ?? site.whatsappNumber ?? '');
    setEditAddress(draft?.address ?? site.address ?? '');
    setEditCustomDomain(draft?.customDomain ?? site.customDomain ?? '');

    const socials = draft?.socialLinks ?? site.socialLinks ?? {};
    setEditSocialFacebook(socials.facebook || '');
    setEditSocialInstagram(socials.instagram || '');
    setEditSocialTwitter(socials.twitter || '');
    setEditSocialLinkedin(socials.linkedin || '');
    setEditSocialYoutube(socials.youtube || '');

    setEditCustomLinks(
      (draft?.customLinks ?? site.customLinks ?? []).map((l) => ({ ...l }))
    );

    setEditNiche(site.niche || 'ecommerce');
    const primary =
      draft?.themeSettings?.primaryColor ??
      draft?.brandColor ??
      site.themeSettings?.primaryColor ??
      site.brandColor ??
      '#2563EB';
    setEditBrandColor(primary);

    const srcTheme = draft?.themeSettings ?? site.themeSettings ?? {};
    setEditThemeSettings({
      primaryColor: primary,
      backgroundColor: srcTheme.backgroundColor || '#FFFFFF',
      surfaceColor: srcTheme.surfaceColor || '#F8FAFC',
      textColor: srcTheme.textColor || '#0F172A',
      fontStyle: srcTheme.fontStyle || 'modern',
      buttonStyle: srcTheme.buttonStyle || 'rounded',
      heroLayout: srcTheme.heroLayout || (site.heroImageUrl ? 'split' : 'centered'),
    });

    setEditSections(createInitialSections(site, draft));
    setEditLegacyItems(
      (draft?.servicesOrProducts ?? site.servicesOrProducts ?? []).map((item) => ({ ...item }))
    );
    setIsDirty(false);
  };

  useEffect(() => {
    if (activeWebsite) {
      hydrateEditorFromWebsite(activeWebsite, true);
    }
  }, [activeWebsite?.id]);

  useEffect(() => {
    if (activeWebsite && !isDirty) {
      hydrateEditorFromWebsite(activeWebsite, true);
    }
  }, [
    activeWebsite?.lastUpdatedAt,
    activeWebsite?.hasUnpublishedDraft,
    activeWebsite?.deploymentStatus,
  ]);

  // Database products linked to this website
  const websiteDbProducts = useMemo(() => {
    if (!activeWebsite) return [];
    return products
      .filter((p) => p.websiteId === activeWebsite.id && p.status !== 'archived')
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [products, activeWebsite?.id]);

  // Unified product items for preview and syncing
  const unifiedWebsiteProducts = useMemo<WebsiteProductItem[]>(() => {
    const dbMapped: WebsiteProductItem[] = websiteDbProducts.map((p) => ({
      id: p.id,
      productId: p.id,
      name: p.name,
      price: `৳${p.price.toLocaleString()}`,
      priceNumeric: p.price,
      description: p.description,
      imageUrl: p.image,
      category: p.category,
      isVisible: p.isVisible !== false && p.status === 'active',
    }));

    const dbIds = new Set(websiteDbProducts.map((p) => p.id));
    const dbNames = new Set(websiteDbProducts.map((p) => p.name.trim().toLowerCase()));

    const remainingLegacy = editLegacyItems.filter(
      (item) =>
        (!item.productId || !dbIds.has(item.productId)) &&
        !dbIds.has(item.id) &&
        !dbNames.has((item.name || '').trim().toLowerCase())
    );

    return [...dbMapped, ...remainingLegacy];
  }, [websiteDbProducts, editLegacyItems]);

  const markDirty = () => setIsDirty(true);

  const handleUploadImage = async (
    file: File | undefined,
    folder: 'logos' | 'heroes' | 'banners' | 'products' | 'sections',
    key: string,
    onDone: (publicUrl: string) => void
  ) => {
    if (!file || !activeWebsite) return;
    setUploadingKey(key);
    try {
      const { publicUrl, error } = await uploadWebsiteAsset({
        file,
        folder,
        websiteId: activeWebsite.id,
      });
      if (error || !publicUrl) {
        showToast(error?.message || 'Image upload failed.', 'error');
        return;
      }
      onDone(publicUrl);
      markDirty();
      showToast('Image uploaded to cloud storage.', 'success');
    } finally {
      setUploadingKey(null);
    }
  };

  const buildEditablePayload = (): Partial<SubscribedWebsite> => {
    const cleanSocials: SubscribedWebsite['socialLinks'] = {};
    if (editSocialFacebook.trim()) cleanSocials.facebook = editSocialFacebook.trim();
    if (editSocialInstagram.trim()) cleanSocials.instagram = editSocialInstagram.trim();
    if (editSocialTwitter.trim()) cleanSocials.twitter = editSocialTwitter.trim();
    if (editSocialLinkedin.trim()) cleanSocials.linkedin = editSocialLinkedin.trim();
    if (editSocialYoutube.trim()) cleanSocials.youtube = editSocialYoutube.trim();

    const normalizedSections = editSections.map((sec, index) => {
      const updated: WebsiteSectionConfig = {
        ...sec,
        order: index,
      };
      if (sec.type === 'hero') {
        updated.title = editHeadline.trim() || sec.title;
        updated.subtitle = editSubheadline.trim();
      } else if (sec.type === 'about') {
        updated.content = editAbout.trim();
      } else if (sec.type === 'banner') {
        updated.title = editBannerTitle.trim() || sec.title;
        updated.subtitle = editBannerSubtitle.trim();
        updated.imageUrl = editBannerImageUrl.trim() || sec.imageUrl;
        updated.ctaText = editBannerCtaText.trim() || sec.ctaText;
        updated.ctaLink = editBannerCtaLink.trim() || sec.ctaLink;
      }
      return updated;
    });

    const foundCat = CATEGORY_SPECS.find((c) => c.id === editNiche);
    const normalizedCustomDomain = editCustomDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    return {
      businessName: editBusinessName.trim(),
      niche: editNiche,
      nicheLabel: foundCat?.label || activeWebsite?.nicheLabel || editNiche,
      brandColor: editBrandColor,
      logoUrl: editLogoUrl.trim() || '',
      heroImageUrl: editHeroImageUrl.trim() || '',
      headline: editHeadline.trim(),
      subheadline: editSubheadline.trim(),
      heroCtaText: editHeroCtaText.trim(),
      heroCtaLink: editHeroCtaLink.trim(),
      secondaryCtaText: editSecondaryCtaText.trim(),
      secondaryCtaLink: editSecondaryCtaLink.trim(),
      bannerImageUrl: editBannerImageUrl.trim() || '',
      bannerTitle: editBannerTitle.trim(),
      bannerSubtitle: editBannerSubtitle.trim(),
      bannerCtaText: editBannerCtaText.trim(),
      bannerCtaLink: editBannerCtaLink.trim(),
      aboutText: editAbout.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      whatsappNumber: editWhatsapp.trim(),
      address: editAddress.trim(),
      customDomain: normalizedCustomDomain,
      socialLinks: cleanSocials,
      customLinks: editCustomLinks.filter((l) => l.label.trim() && l.url.trim()),
      sections: normalizedSections,
      themeSettings: {
        ...editThemeSettings,
        primaryColor: editBrandColor,
      },
      servicesOrProducts: unifiedWebsiteProducts,
    };
  };

  // Live Real-Time Preview Object
  const livePreviewSite = useMemo<Partial<SubscribedWebsite>>(() => {
    if (!activeWebsite) return {};
    return {
      ...activeWebsite,
      ...buildEditablePayload(),
    };
  }, [
    activeWebsite,
    editBusinessName,
    editNiche,
    editBrandColor,
    editLogoUrl,
    editHeroImageUrl,
    editHeadline,
    editSubheadline,
    editHeroCtaText,
    editHeroCtaLink,
    editSecondaryCtaText,
    editSecondaryCtaLink,
    editBannerImageUrl,
    editBannerTitle,
    editBannerSubtitle,
    editBannerCtaText,
    editBannerCtaLink,
    editAbout,
    editPhone,
    editEmail,
    editWhatsapp,
    editAddress,
    editCustomDomain,
    editSocialFacebook,
    editSocialInstagram,
    editSocialTwitter,
    editSocialLinkedin,
    editSocialYoutube,
    editCustomLinks,
    editSections,
    editThemeSettings,
    unifiedWebsiteProducts,
  ]);

  const handleSaveDraftClick = async () => {
    if (!activeWebsite) return;
    if (!editBusinessName.trim()) {
      showToast('Business name cannot be empty.', 'error');
      setEditorTab('business');
      return;
    }

    setIsSavingDraft(true);
    try {
      const res = await saveWebsiteDraft(activeWebsite.id, buildEditablePayload());
      if (res.success) {
        setIsDirty(false);
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublishUpdatesClick = async () => {
    if (!activeWebsite) return;
    if (!editBusinessName.trim()) {
      showToast('Business name cannot be empty.', 'error');
      setEditorTab('business');
      return;
    }

    const isPaid = activeWebsite.paymentStatus === 'paid';
    const isSubValid =
      activeWebsite.subscriptionStatus === 'active' ||
      activeWebsite.subscriptionStatus === 'grace_period';

    if (!isPaid || !isSubValid) {
      setIsSavingDraft(true);
      await saveWebsiteDraft(activeWebsite.id, buildEditablePayload());
      setIsSavingDraft(false);
      setIsDirty(false);
      showToast(
        'Draft saved! Complete your ৳600 subscription payment below — your website publishes automatically once verified.',
        'info'
      );
      setIsPaymentModalOpen(true);
      return;
    }

    setIsPublishing(true);
    try {
      const res = await publishWebsiteUpdates(activeWebsite.id, buildEditablePayload());
      if (res.success) {
        setIsDirty(false);
      } else {
        showToast(res.message || 'Could not publish updates.', 'error');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!activeWebsite) return;
    hydrateEditorFromWebsite(activeWebsite, false);
    if (activeWebsite.hasUnpublishedDraft) {
      await updateSubscribedWebsite(
        activeWebsite.id,
        {
          businessName: activeWebsite.businessName,
          headline: activeWebsite.headline,
          subheadline: activeWebsite.subheadline,
        },
        { silentToast: true }
      );
    }
    showToast('Reverted editor to current published configuration.', 'info');
  };

  // Section Management Handlers
  const handleToggleSection = (id: string) => {
    setEditSections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextEnabled = !s.enabled;
        if (s.type === 'banner' && nextEnabled && !editBannerTitle.trim()) {
          setEditBannerTitle('Limited-Time Featured Offer');
        }
        if (s.type === 'about' && nextEnabled && !editAbout.trim()) {
          setEditAbout('We are committed to high-quality products and responsive customer support.');
        }
        return { ...s, enabled: nextEnabled };
      })
    );
    markDirty();
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    setEditSections((prev) => {
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next.map((s, idx) => ({ ...s, order: idx }));
    });
    markDirty();
  };

  const handleAddSection = (type: WebsiteSectionType) => {
    const newId = `sec-${type}-${Date.now()}`;
    let defaultItems: WebsiteSectionItem[] | undefined;
    let defaultTitle = SECTION_TYPE_LABELS[type];
    let defaultSub = '';

    if (type === 'highlights') {
      defaultTitle = 'Why Choose Us';
      defaultSub = 'What sets our business apart for every customer.';
      defaultItems = [
        {
          id: `item-${Date.now()}-1`,
          title: 'Authentic Quality',
          description: 'Every item is inspected carefully before dispatch.',
        },
        {
          id: `item-${Date.now()}-2`,
          title: 'Fast Local Delivery',
          description: 'Prompt doorstep delivery across Dhaka and nationwide.',
        },
        {
          id: `item-${Date.now()}-3`,
          title: 'Direct Support',
          description: 'Reach our team directly on WhatsApp or phone.',
        },
      ];
    } else if (type === 'testimonials') {
      defaultTitle = 'What Customers Say';
      defaultItems = [
        {
          id: `rev-${Date.now()}-1`,
          title: 'Customer Review',
          description: 'Fast response and genuinely reliable product quality.',
          author: 'Verified Customer',
          role: 'Dhaka',
        },
      ];
    } else if (type === 'faq') {
      defaultTitle = 'Frequently Asked Questions';
      defaultItems = [
        {
          id: `faq-${Date.now()}-1`,
          title: 'How do I place an order?',
          description: 'Select any item in our catalog to send your order inquiry directly on WhatsApp or call us.',
        },
      ];
    } else if (type === 'banner') {
      defaultTitle = editBannerTitle || 'Seasonal Promotion';
      defaultSub = editBannerSubtitle || 'Explore our newest arrivals and featured bundles.';
      if (!editBannerTitle) setEditBannerTitle(defaultTitle);
      if (!editBannerSubtitle) setEditBannerSubtitle(defaultSub);
    }

    setEditSections((prev) => [
      ...prev,
      {
        id: newId,
        type,
        title: defaultTitle,
        subtitle: defaultSub,
        enabled: true,
        order: prev.length,
        items: defaultItems,
      },
    ]);
    setExpandedSectionId(newId);
    markDirty();
  };

  const handleRemoveSection = (id: string) => {
    setEditSections((prev) =>
      prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, order: idx }))
    );
    if (expandedSectionId === id) setExpandedSectionId(null);
    markDirty();
  };

  const handleUpdateSectionField = (
    id: string,
    field: keyof WebsiteSectionConfig,
    value: any
  ) => {
    setEditSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
    markDirty();
  };

  const handleAddSectionItem = (sectionId: string) => {
    setEditSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const nextItems = [
          ...(s.items || []),
          {
            id: `si-${Date.now()}`,
            title: s.type === 'faq' ? 'New Question' : 'Highlight Title',
            description: 'Details...',
            author: s.type === 'testimonials' ? 'Customer Name' : undefined,
          },
        ];
        return { ...s, items: nextItems };
      })
    );
    markDirty();
  };

  const handleUpdateSectionItem = (
    sectionId: string,
    itemId: string,
    field: keyof WebsiteSectionItem,
    value: string
  ) => {
    setEditSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: (s.items || []).map((it) =>
            it.id === itemId ? { ...it, [field]: value } : it
          ),
        };
      })
    );
    markDirty();
  };

  const handleRemoveSectionItem = (sectionId: string, itemId: string) => {
    setEditSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: (s.items || []).filter((it) => it.id !== itemId),
        };
      })
    );
    markDirty();
  };

  // Product Management Handlers (Persisted in Supabase public.products + Storage)
  const openAddProductModal = () => {
    setEditingProductTarget({ mode: 'add' });
    setProdName('');
    setProdPrice(1200);
    setProdCategory(activeWebsite?.nicheLabel || 'General');
    setProdDescription('');
    setProdImageUrl('');
    setProdVisible(true);
    setIsProductModalOpen(true);
  };

  const openEditDbProductModal = (p: Product) => {
    setEditingProductTarget({ mode: 'edit', dbProduct: p });
    setProdName(p.name);
    setProdPrice(p.price);
    setProdCategory(p.category || 'General');
    setProdDescription(p.description || '');
    setProdImageUrl(p.image || '');
    setProdVisible(p.isVisible !== false && p.status === 'active');
    setIsProductModalOpen(true);
  };

  const openEditLegacyProductModal = (item: WebsiteProductItem, legacyIndex: number) => {
    const parsedPrice =
      typeof item.priceNumeric === 'number'
        ? item.priceNumeric
        : Number(String(item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    setEditingProductTarget({ mode: 'edit', legacyIndex });
    setProdName(item.name);
    setProdPrice(parsedPrice);
    setProdCategory(item.category || activeWebsite?.nicheLabel || 'General');
    setProdDescription(item.description || '');
    setProdImageUrl(item.imageUrl || '');
    setProdVisible(item.isVisible !== false);
    setIsProductModalOpen(true);
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWebsite || !editingProductTarget) return;
    if (!prodName.trim()) {
      showToast('Please enter a product name.', 'warning');
      return;
    }

    setIsSavingProduct(true);
    try {
      if (editingProductTarget.mode === 'add') {
        const created = await addProduct({
          name: prodName.trim(),
          sku: `WEB-${Date.now().toString().slice(-6)}`,
          category: prodCategory.trim() || 'General',
          price: Math.max(0, Number(prodPrice) || 0),
          costPrice: 0,
          stock: 100,
          lowStockThreshold: 5,
          status: prodVisible ? 'active' : 'draft',
          description: prodDescription.trim(),
          image: prodImageUrl.trim() || undefined,
          websiteId: activeWebsite.id,
          isVisible: prodVisible,
          sortOrder: websiteDbProducts.length,
        });
        if (created) {
          setIsProductModalOpen(false);
        }
      } else if (editingProductTarget.dbProduct) {
        const updated = await updateProduct(editingProductTarget.dbProduct.id, {
          name: prodName.trim(),
          category: prodCategory.trim() || 'General',
          price: Math.max(0, Number(prodPrice) || 0),
          status: prodVisible ? 'active' : 'draft',
          description: prodDescription.trim(),
          image: prodImageUrl.trim(),
          websiteId: activeWebsite.id,
          isVisible: prodVisible,
        });
        if (updated) {
          setIsProductModalOpen(false);
        }
      } else if (typeof editingProductTarget.legacyIndex === 'number') {
        // Promote legacy item into Supabase public.products AND update local list
        const idx = editingProductTarget.legacyIndex;
        const created = await addProduct({
          name: prodName.trim(),
          sku: `WEB-${Date.now().toString().slice(-6)}`,
          category: prodCategory.trim() || 'General',
          price: Math.max(0, Number(prodPrice) || 0),
          costPrice: 0,
          stock: 100,
          lowStockThreshold: 5,
          status: prodVisible ? 'active' : 'draft',
          description: prodDescription.trim(),
          image: prodImageUrl.trim() || undefined,
          websiteId: activeWebsite.id,
          isVisible: prodVisible,
          sortOrder: websiteDbProducts.length,
        });
        if (created) {
          setEditLegacyItems((prev) => prev.filter((_, i) => i !== idx));
          markDirty();
          setIsProductModalOpen(false);
        }
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleToggleDbProductVisibility = async (p: Product) => {
    const nextVisible = !(p.isVisible !== false && p.status === 'active');
    await updateProduct(p.id, {
      isVisible: nextVisible,
      status: nextVisible ? 'active' : 'draft',
    });
  };

  const handleMoveDbProduct = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= websiteDbProducts.length) return;

    const reordered = websiteDbProducts.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    await Promise.all(
      reordered.map((prod, idx) =>
        prod.sortOrder === idx ? Promise.resolve(prod) : updateProduct(prod.id, { sortOrder: idx })
      )
    );
  };

  const handleToggleLegacyProductVisibility = (legacyIndex: number) => {
    setEditLegacyItems((prev) =>
      prev.map((it, idx) =>
        idx === legacyIndex ? { ...it, isVisible: it.isVisible === false } : it
      )
    );
    markDirty();
  };

  const handleMoveLegacyProduct = (legacyIndex: number, direction: 'up' | 'down') => {
    setEditLegacyItems((prev) => {
      const targetIndex = direction === 'up' ? legacyIndex - 1 : legacyIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(legacyIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    markDirty();
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    if (productToDelete.dbProduct) {
      await deleteProduct(productToDelete.dbProduct.id);
    } else if (typeof productToDelete.legacyIndex === 'number') {
      const targetIdx = productToDelete.legacyIndex;
      setEditLegacyItems((prev) => prev.filter((_, i) => i !== targetIdx));
      markDirty();
    }
    setProductToDelete(null);
  };

  const handleCopyLink = () => {
    if (!activeWebsite) return;
    navigator.clipboard.writeText(`https://${activeWebsite.fullDomainUrl}`);
    showToast('Website URL copied to clipboard!', 'info');
  };

  const handleConfirmUnpublish = async () => {
    if (!activeWebsite) return;
    setIsActionLoading(true);
    try {
      const res = await unpublishWebsite(activeWebsite.id);
      if (res.success) {
        showToast('Website unpublished. Public visitors can no longer access it.', 'info');
      } else {
        showToast(res.message || 'Failed to unpublish website.', 'error');
      }
    } finally {
      setIsActionLoading(false);
      setIsUnpublishDialogOpen(false);
    }
  };

  const handleConfirmCancelSubscription = async () => {
    if (!activeWebsite) return;
    setIsActionLoading(true);
    try {
      const res = await cancelWebsiteSubscription(activeWebsite.id);
      if (res.success) {
        showToast('Website subscription cancelled.', 'info');
      } else {
        showToast(res.message || 'Failed to cancel subscription.', 'error');
      }
    } finally {
      setIsActionLoading(false);
      setIsCancelSubDialogOpen(false);
    }
  };

  const handleSendUpdateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWebsite || !updateRequestText.trim()) return;
    requestWebsiteContentUpdate(activeWebsite.id, updateRequestText);
    setUpdateRequestText('');
    setIsRequestModalOpen(false);
  };

  if (isWebsitesLoading && subscribedWebsites.length === 0) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading your website workspace...</p>
      </div>
    );
  }

  if (!activeWebsite) {
    return (
      <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-6 max-w-2xl mx-auto shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
          <Globe className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            GoAMAAS Website · ৳{websiteSubscriptionPlan.priceMonthly}/month · 30-day cycle
          </span>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Build &amp; Host Your Business Website for ৳{websiteSubscriptionPlan.priceMonthly}/month
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            One simple plan with free GoAMAAS hosting, your own{' '}
            <code className="font-mono text-blue-600">businessname.amaas.xyz</code> subdomain, optional custom domain support, and a full self-service Visual Website Editor.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => navigate('/create-website')}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Create Your Website Now</span>
          </button>
        </div>
      </div>
    );
  }

  const isGracePeriod = activeWebsite.subscriptionStatus === 'grace_period';
  const isSuspended = activeWebsite.subscriptionStatus === 'suspended';
  const isCancelled = activeWebsite.subscriptionStatus === 'cancelled';
  const isPaid = activeWebsite.paymentStatus === 'paid';
  const isPublishEligible =
    isPaid && (activeWebsite.subscriptionStatus === 'active' || isGracePeriod);
  const isLive = isWebsiteTrulyLive(activeWebsite);

  const websitePaymentRequests = paymentRequests
    .filter(
      (r) =>
        (r.serviceType === 'website_subscription' || r.serviceType === 'website_package') &&
        r.serviceId.trim().toLowerCase() === activeWebsite.id.trim().toLowerCase()
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestWebsitePayment = websitePaymentRequests[0];
  const hasPendingWebsitePayment = websitePaymentRequests.some((r) => r.status === 'pending');

  // Legacy items not yet migrated to DB products
  const dbIdsSet = new Set(websiteDbProducts.map((p) => p.id));
  const dbNamesSet = new Set(websiteDbProducts.map((p) => p.name.trim().toLowerCase()));
  const unmigratedLegacyItems = editLegacyItems
    .map((item, idx) => ({ item, idx }))
    .filter(
      ({ item }) =>
        (!item.productId || !dbIdsSet.has(item.productId)) &&
        !dbIdsSet.has(item.id) &&
        !dbNamesSet.has((item.name || '').trim().toLowerCase())
    );

  return (
    <div className="space-y-6">
      {/* Multi-Website Switcher & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <Globe className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-bold text-slate-900 dark:text-white">
            Website Workspace:
          </span>
          {subscribedWebsites.length > 1 ? (
            <select
              value={activeWebsite.id}
              onChange={(e) => setSelectedWebsiteId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs"
            >
              {subscribedWebsites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.businessName} — {site.fullDomainUrl} ({site.deploymentStatus})
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {activeWebsite.businessName} ({activeWebsite.fullDomainUrl})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/create-website')}
          className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5 text-blue-600" />
          <span>Create Another Website</span>
        </button>
      </div>

      {/* Top Subscription & Domain Header Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            {/* Clean Metadata Status Line */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white font-semibold">
                GoAMAAS Website (৳{activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly}/mo)
              </strong>
              <span aria-hidden="true">·</span>
              <span
                className={
                  isLive
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-amber-600 dark:text-amber-400 font-semibold'
                }
              >
                {isLive
                  ? 'Live & Public'
                  : activeWebsite.paymentStatus === 'pending_review'
                  ? 'Payment Under Admin Verification'
                  : isPaid
                  ? 'Paid · Unpublished Draft'
                  : 'Draft · Awaiting ৳600 Payment'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Subscription: <strong className="capitalize">{activeWebsite.subscriptionStatus.replace('_', ' ')}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                Renews: {activeWebsite.nextBillingDate}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeWebsite.businessName}
            </h1>

            {/* Domain & Public Storefront Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white font-semibold">
                <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>https://{activeWebsite.fullDomainUrl}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                title="Copy Subdomain URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {activeWebsite.customDomain && (
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400 px-2">
                  Custom Domain: {activeWebsite.customDomain}
                </span>
              )}

              {isLive ? (
                <a
                  href={`/sites/${activeWebsite.subdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Live Website</span>
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                  <Ban className="w-3 h-3" />
                  <span>Offline until published</span>
                </span>
              )}
            </div>
          </div>

          {/* Billing & Lifecycle Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isLive && (
              <button
                type="button"
                onClick={() => setIsUnpublishDialogOpen(true)}
                disabled={isActionLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Unpublish
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsRequestModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Request Team Edit</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>
                {isPaid
                  ? `Renew +30 Days (৳${activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly})`
                  : `Activate Website (৳${activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly})`}
              </span>
            </button>
          </div>
        </div>

        {/* Grace Period orSuspended Banner */}
        {isGracePeriod && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Subscription Renewal Due — 7-Day Grace Window Active</strong>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                  Your website remains live at <code className="font-mono">{activeWebsite.fullDomainUrl}</code>. Renew for ৳{activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly} to add 30 days to your billing period.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs shrink-0 hover:bg-amber-500 cursor-pointer"
            >
              Renew Now
            </button>
          </div>
        )}

        {isSuspended && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Website Suspended</strong>
                <p className="text-[11px] mt-0.5">
                  Public access to <code className="font-mono">{activeWebsite.fullDomainUrl}</code> is paused. Submit your 30-day renewal payment to automatically restore live publishing once verified.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs shrink-0 hover:bg-rose-500 cursor-pointer"
            >
              Submit Renewal Payment
            </button>
          </div>
        )}

        {/* Payment Verification & Instant Publishing Status Banner */}
        {latestWebsitePayment && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-2.5 ${
              latestWebsitePayment.status === 'pending'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                : latestWebsitePayment.status === 'rejected'
                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                : isLive
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
                : 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-100'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {latestWebsitePayment.status === 'pending' ? (
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : latestWebsitePayment.status === 'rejected' ? (
                  <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">
                      Payment Status:{' '}
                      {latestWebsitePayment.status === 'pending'
                        ? 'Pending Verification'
                        : latestWebsitePayment.status === 'approved'
                        ? 'Approved'
                        : 'Rejected'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 font-mono text-[11px] font-semibold tabular-nums">
                      {latestWebsitePayment.paymentMethod} · ৳{latestWebsitePayment.amount.toLocaleString()}
                    </span>
                    {(latestWebsitePayment.transactionId || latestWebsitePayment.bankReference) && (
                      <span className="font-mono text-[11px] opacity-90">
                        TrxID: {latestWebsitePayment.transactionId || latestWebsitePayment.bankReference}
                      </span>
                    )}
                  </div>

                  {latestWebsitePayment.status === 'pending' && (
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      Submitted on{' '}
                      <span className="font-mono tabular-nums">
                        {new Date(latestWebsitePayment.createdAt).toLocaleString()}
                      </span>
                      {latestWebsitePayment.senderNumber
                        ? ` from ${latestWebsitePayment.senderNumber}`
                        : ''}
                      . Your website will become <strong>Active</strong> and <strong>Live</strong> automatically as soon as an administrator verifies this transfer.
                    </p>
                  )}

                  {latestWebsitePayment.status === 'rejected' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                        Rejection Reason:{' '}
                        <span className="font-normal">
                          {latestWebsitePayment.adminNotes ||
                            'Transaction ID or transfer details could not be verified.'}
                        </span>
                      </p>
                      <p className="text-[11px] opacity-85">
                        Please verify your Transaction ID and sender number, then submit a corrected payment request.
                      </p>
                    </div>
                  )}

                  {latestWebsitePayment.status === 'approved' && (
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      {isLive ? (
                        <>
                          Verified and published live at{' '}
                          <code className="font-mono font-semibold">
                            https://{activeWebsite.fullDomainUrl}
                          </code>
                          .
                        </>
                      ) : isPublishEligible ? (
                        <>
                          Your payment is verified and subscription is active, but the website is currently unpublished. Click <strong>Publish Website Now</strong> to make it live.
                        </>
                      ) : (
                        <>Payment record verified.</>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {latestWebsitePayment.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isPaymentsLoading || isWebsitesLoading}
                    onClick={() => {
                      void refreshPaymentRequests();
                      void refreshSubscribedWebsites();
                      showToast('Synced latest payment & website status.', 'info');
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isPaymentsLoading || isWebsitesLoading ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Refresh Status</span>
                  </button>
                )}

                {latestWebsitePayment.status === 'rejected' && !hasPendingWebsitePayment && (
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Resubmit Payment</span>
                  </button>
                )}

                {latestWebsitePayment.status === 'approved' && isPublishEligible && !isLive && (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={async () => {
                      setIsActionLoading(true);
                      try {
                        const res = await publishWebsite(activeWebsite.id);
                        if (!res.success) {
                          showToast(res.message || 'Could not publish website.', 'error');
                        }
                      } finally {
                        setIsActionLoading(false);
                      }
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span>Publish Website Now</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* INTEGRATED VISUAL WEBSITE BUILDER & REAL-TIME PREVIEW WORKSPACE           */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Builder Top Toolbar: Tabs + Save Draft + Publish Updates */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-900">
          {/* 5 Structured Builder Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800 overflow-x-auto text-xs">
            {[
              { id: 'hero', label: 'Hero & Banner', icon: Sparkles },
              { id: 'sections', label: `Sections (${editSections.filter((s) => s.enabled).length})`, icon: Layers },
              { id: 'products', label: `Products (${unifiedWebsiteProducts.length})`, icon: ShoppingBag },
              { id: 'theme', label: 'Theme & Logo', icon: Palette },
              { id: 'business', label: 'Business, Footer & Domain', icon: Building },
            ].map((t) => {
              const Icon = t.icon;
              const active = editorTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditorTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Save Draft & Publish Controls */}
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2.5 text-xs">
            <span className="text-[11px] text-slate-500">
              {isDirty
                ? 'Unsaved edits in preview'
                : activeWebsite.hasUnpublishedDraft
                ? 'Staged draft saved (not yet published)'
                : isLive
                ? 'All changes live'
                : 'Draft saved'}
            </span>

            {(isDirty || activeWebsite.hasUnpublishedDraft) && (
              <button
                type="button"
                onClick={() => void handleDiscardDraft()}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                title="Revert unpublished draft edits"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Draft</span>
              </button>
            )}

            <button
              type="button"
              disabled={isSavingDraft || isPublishing}
              onClick={() => void handleSaveDraftClick()}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-900 dark:text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSavingDraft ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              disabled={isPublishing || isSavingDraft}
              onClick={() => void handlePublishUpdatesClick()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>
                {isLive
                  ? 'Publish Updates'
                  : isPublishEligible
                  ? 'Publish Website Live'
                  : 'Save & Activate to Publish'}
              </span>
            </button>
          </div>
        </div>

        {/* Split Editor & Live Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* LEFT PANE: VISUAL EDITOR CONTROLS (5 Cols) */}
          <div className="lg:col-span-5 p-5 space-y-5 max-h-[820px] overflow-y-auto text-xs">
            {/* TAB 1: HERO & PROMOTIONAL BANNER */}
            {editorTab === 'hero' && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Hero Section &amp; Call-to-Action
                  </h3>

                  {/* Hero Image Upload */}
                  <div className="space-y-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300">
                      Hero Image (Supabase Cloud Storage)
                    </label>
                    {editHeroImageUrl ? (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                        <img
                          src={editHeroImageUrl}
                          alt="Hero banner"
                          className="w-full h-36 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <div className="flex items-center justify-between">
                          <label className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1">
                            {uploadingKey === 'hero' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>Replace Hero Image</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                void handleUploadImage(
                                  e.target.files?.[0],
                                  'heroes',
                                  'hero',
                                  setEditHeroImageUrl
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setEditHeroImageUrl('');
                              markDirty();
                            }}
                            className="text-rose-600 font-semibold hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                        {uploadingKey === 'hero' ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-blue-600" />
                        )}
                        <span>
                          {uploadingKey === 'hero'
                            ? 'Uploading to Storage...'
                            : 'Upload Hero Image (PNG/JPG/WEBP)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            void handleUploadImage(
                              e.target.files?.[0],
                              'heroes',
                              'hero',
                              setEditHeroImageUrl
                            )
                          }
                        />
                      </label>
                    )}
                  </div>

                  {/* Hero Layout Selector */}
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Layout Style
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['split', 'centered', 'cover'] as const).map((layout) => (
                        <button
                          key={layout}
                          type="button"
                          onClick={() => {
                            setEditThemeSettings((prev) => ({ ...prev, heroLayout: layout }));
                            markDirty();
                          }}
                          className={`py-2 px-3 rounded-lg border font-semibold capitalize cursor-pointer ${
                            editThemeSettings.heroLayout === layout
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {layout}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Heading
                    </label>
                    <input
                      type="text"
                      value={editHeadline}
                      onChange={(e) => {
                        setEditHeadline(e.target.value);
                        markDirty();
                      }}
                      placeholder="e.g. Curated Modern Apparel for Everyday Wear"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Description
                    </label>
                    <textarea
                      rows={2}
                      value={editSubheadline}
                      onChange={(e) => {
                        setEditSubheadline(e.target.value);
                        markDirty();
                      }}
                      placeholder="Welcome visitors and highlight what you offer..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Primary CTA Text
                      </label>
                      <input
                        type="text"
                        value={editHeroCtaText}
                        onChange={(e) => {
                          setEditHeroCtaText(e.target.value);
                          markDirty();
                        }}
                        placeholder="Order on WhatsApp"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        CTA Destination (#anchor, whatsapp, or URL)
                      </label>
                      <input
                        type="text"
                        list="cta-destinations"
                        value={editHeroCtaLink}
                        onChange={(e) => {
                          setEditHeroCtaLink(e.target.value);
                          markDirty();
                        }}
                        placeholder="whatsapp or #services"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                      <datalist id="cta-destinations">
                        <option value="whatsapp">Direct WhatsApp Inquiry</option>
                        <option value="#services">Products / Catalog Section</option>
                        <option value="#contact">Contact Section</option>
                        <option value="#about">About Section</option>
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Secondary CTA Text (Optional)
                      </label>
                      <input
                        type="text"
                        value={editSecondaryCtaText}
                        onChange={(e) => {
                          setEditSecondaryCtaText(e.target.value);
                          markDirty();
                        }}
                        placeholder="View Offerings"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Secondary CTA Destination
                      </label>
                      <input
                        type="text"
                        value={editSecondaryCtaLink}
                        onChange={(e) => {
                          setEditSecondaryCtaLink(e.target.value);
                          markDirty();
                        }}
                        placeholder="#services"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Promotional Banner Configuration */}
                <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Promotional Banner
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        const existingBanner = editSections.find((s) => s.type === 'banner');
                        if (existingBanner) {
                          handleToggleSection(existingBanner.id);
                        } else {
                          handleAddSection('banner');
                        }
                      }}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      {editSections.some((s) => s.type === 'banner' && s.enabled)
                        ? 'Hide Banner'
                        : 'Show Banner on Site'}
                    </button>
                  </div>

                  {editBannerImageUrl ? (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                      <img
                        src={editBannerImageUrl}
                        alt="Promotional banner"
                        className="w-full h-28 rounded-lg object-cover"
                      />
                      <div className="flex items-center justify-between">
                        <label className="text-blue-600 font-semibold hover:underline cursor-pointer">
                          <span>Replace Banner Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              void handleUploadImage(
                                e.target.files?.[0],
                                'banners',
                                'banner',
                                (url) => {
                                  setEditBannerImageUrl(url);
                                  setEditSections((prev) =>
                                    prev.map((s) =>
                                      s.type === 'banner' ? { ...s, enabled: true, imageUrl: url } : s
                                    )
                                  );
                                }
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setEditBannerImageUrl('');
                            markDirty();
                          }}
                          className="text-rose-600 font-semibold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                      {uploadingKey === 'banner' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="w-4 h-4 text-blue-600" />
                      )}
                      <span>Upload Promotional Banner Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadImage(
                            e.target.files?.[0],
                            'banners',
                            'banner',
                            (url) => {
                              setEditBannerImageUrl(url);
                              setEditSections((prev) =>
                                prev.map((s) =>
                                  s.type === 'banner' ? { ...s, enabled: true, imageUrl: url } : s
                                )
                              );
                            }
                          )
                        }
                      />
                    </label>
                  )}

                  <input
                    type="text"
                    value={editBannerTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditBannerTitle(val);
                      if (val.trim()) {
                        setEditSections((prev) =>
                          prev.map((s) => (s.type === 'banner' ? { ...s, enabled: true } : s))
                        );
                      }
                      markDirty();
                    }}
                    placeholder="Banner Heading (e.g. Eid Collection — Free Delivery Inside Dhaka)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />

                  <input
                    type="text"
                    value={editBannerSubtitle}
                    onChange={(e) => {
                      setEditBannerSubtitle(e.target.value);
                      markDirty();
                    }}
                    placeholder="Banner Subtitle / Details"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editBannerCtaText}
                      onChange={(e) => {
                        setEditBannerCtaText(e.target.value);
                        markDirty();
                      }}
                      placeholder="Banner Button Text"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={editBannerCtaLink}
                      onChange={(e) => {
                        setEditBannerCtaLink(e.target.value);
                        markDirty();
                      }}
                      placeholder="#services or whatsapp"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WEBSITE SECTIONS (ADD, REMOVE, REORDER, CUSTOMIZE) */}
            {editorTab === 'sections' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Page Sections &amp; Layout Order
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Reorder sections up or down, toggle visibility, or add Highlights, Testimonials, and FAQs.
                  </p>
                </div>

                {/* Add Section Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {(['highlights', 'testimonials', 'faq', 'banner', 'about'] as WebsiteSectionType[]).map(
                    (type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAddSection(type)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-blue-600" />
                        <span>{SECTION_TYPE_LABELS[type]}</span>
                      </button>
                    )
                  )}
                </div>

                {/* Ordered Section List */}
                <div className="space-y-2.5">
                  {editSections.map((sec, idx) => {
                    const isExpanded = expandedSectionId === sec.id;
                    const canDelete = sec.type !== 'hero' && sec.type !== 'products';

                    return (
                      <div
                        key={sec.id}
                        className={`rounded-xl border transition-colors ${
                          sec.enabled
                            ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                            : 'border-slate-200/60 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 opacity-65'
                        }`}
                      >
                        <div className="p-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedSectionId(isExpanded ? null : sec.id)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                          >
                            <span className="text-[11px] font-mono text-slate-400">
                              0{idx + 1}.
                            </span>
                            <div className="truncate">
                              <span className="font-bold text-slate-900 dark:text-white block truncate">
                                {sec.title || SECTION_TYPE_LABELS[sec.type]}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {SECTION_TYPE_LABELS[sec.type]}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveSection(idx, 'up')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Move section up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === editSections.length - 1}
                              onClick={() => handleMoveSection(idx, 'down')}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Move section down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSection(sec.id)}
                              className={`p-1 rounded cursor-pointer ${
                                sec.enabled ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                              title={sec.enabled ? 'Visible on website' : 'Hidden'}
                            >
                              {sec.enabled ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSection(sec.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Delete section"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedSectionId(isExpanded ? null : sec.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                Section Heading
                              </label>
                              <input
                                type="text"
                                value={sec.type === 'hero' ? editHeadline : sec.title}
                                onChange={(e) => {
                                  if (sec.type === 'hero') {
                                    setEditHeadline(e.target.value);
                                    markDirty();
                                  } else {
                                    handleUpdateSectionField(sec.id, 'title', e.target.value);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                              />
                            </div>

                            {sec.type !== 'about' && (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                  Subtitle
                                </label>
                                <input
                                  type="text"
                                  value={sec.type === 'hero' ? editSubheadline : sec.subtitle || ''}
                                  onChange={(e) => {
                                    if (sec.type === 'hero') {
                                      setEditSubheadline(e.target.value);
                                      markDirty();
                                    } else {
                                      handleUpdateSectionField(sec.id, 'subtitle', e.target.value);
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                />
                              </div>
                            )}

                            {sec.type === 'about' && (
                              <div className="space-y-2.5">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                    About Story Copy
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editAbout}
                                    onChange={(e) => {
                                      setEditAbout(e.target.value);
                                      handleUpdateSectionField(sec.id, 'content', e.target.value);
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                  />
                                </div>

                                {/* Optional About Section Image */}
                                <div className="flex items-center justify-between gap-2">
                                  {sec.imageUrl ? (
                                    <div className="flex items-center gap-2">
                                      <img
                                        src={sec.imageUrl}
                                        alt="Section"
                                        className="w-12 h-10 rounded object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateSectionField(sec.id, 'imageUrl', undefined)
                                        }
                                        className="text-rose-600 font-semibold text-[11px] cursor-pointer"
                                      >
                                        Remove Image
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-[11px] cursor-pointer">
                                      <Upload className="w-3 h-3 text-blue-600" />
                                      <span>Upload About Image</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) =>
                                          void handleUploadImage(
                                            e.target.files?.[0],
                                            'sections',
                                            `sec-${sec.id}`,
                                            (url) =>
                                              handleUpdateSectionField(sec.id, 'imageUrl', url)
                                          )
                                        }
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Section Items Editor (Highlights / Testimonials / FAQ) */}
                            {(sec.type === 'highlights' ||
                              sec.type === 'testimonials' ||
                              sec.type === 'faq') && (
                              <div className="space-y-2.5 pt-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-[11px] text-slate-600 dark:text-slate-300">
                                    Entries ({(sec.items || []).length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSectionItem(sec.id)}
                                    className="text-blue-600 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Entry</span>
                                  </button>
                                </div>

                                {(sec.items || []).map((it) => (
                                  <div
                                    key={it.id}
                                    className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <input
                                        type="text"
                                        value={it.title}
                                        onChange={(e) =>
                                          handleUpdateSectionItem(
                                            sec.id,
                                            it.id,
                                            'title',
                                            e.target.value
                                          )
                                        }
                                        placeholder={
                                          sec.type === 'faq' ? 'Question' : 'Title'
                                        }
                                        className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSectionItem(sec.id, it.id)}
                                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <textarea
                                      rows={2}
                                      value={it.description || ''}
                                      onChange={(e) =>
                                        handleUpdateSectionItem(
                                          sec.id,
                                          it.id,
                                          'description',
                                          e.target.value
                                        )
                                      }
                                      placeholder={
                                        sec.type === 'faq'
                                          ? 'Answer...'
                                          : sec.type === 'testimonials'
                                          ? 'Customer quote...'
                                          : 'Highlight description...'
                                      }
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                    />
                                    {sec.type === 'testimonials' && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <input
                                          type="text"
                                          value={it.author || ''}
                                          onChange={(e) =>
                                            handleUpdateSectionItem(
                                              sec.id,
                                              it.id,
                                              'author',
                                              e.target.value
                                            )
                                          }
                                          placeholder="Customer Name"
                                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                        />
                                        <input
                                          type="text"
                                          value={it.role || ''}
                                          onChange={(e) =>
                                            handleUpdateSectionItem(
                                              sec.id,
                                              it.id,
                                              'role',
                                              e.target.value
                                            )
                                          }
                                          placeholder="City / Role"
                                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: PRODUCT CATALOG MANAGEMENT (SUPABASE PRODUCTS + STORAGE) */}
            {editorTab === 'products' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Website Products &amp; Offerings
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Add products, upload photos, toggle visibility, or remove items. Stored in Supabase.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddProductModal}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                </div>

                {websiteDbProducts.length === 0 && unmigratedLegacyItems.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                    <ShoppingBag className="w-7 h-7 text-slate-400 mx-auto" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      No products added to this website yet
                    </p>
                    <button
                      type="button"
                      onClick={openAddProductModal}
                      className="text-blue-600 font-semibold hover:underline cursor-pointer"
                    >
                      + Add your first product
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {websiteDbProducts.map((p, dbIdx) => {
                      const visible = p.isVisible !== false && p.status === 'active';
                      return (
                        <div
                          key={p.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                            visible
                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                              : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800 opacity-65'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {p.image ? (
                              <img
                                src={p.image}
                                alt={p.name}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {p.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                                  ৳{p.price.toLocaleString()}
                                </span>
                                <span>·</span>
                                <span>{visible ? 'Visible on site' : 'Hidden'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={dbIdx === 0}
                              onClick={() => void handleMoveDbProduct(dbIdx, 'up')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Move up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={dbIdx === websiteDbProducts.length - 1}
                              onClick={() => void handleMoveDbProduct(dbIdx, 'down')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Move down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleDbProductVisibility(p)}
                              className={`p-1.5 rounded-lg cursor-pointer ${
                                visible
                                  ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              title={visible ? 'Hide from website' : 'Show on website'}
                            >
                              {visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditDbProductModal(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Edit product"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setProductToDelete({ dbProduct: p, name: p.name })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Delete product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {unmigratedLegacyItems.map(({ item, idx }, listIdx) => {
                      const visible = item.isVisible !== false;
                      return (
                        <div
                          key={item.id || idx}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                            visible
                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                              : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800 opacity-65'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {item.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                {item.price && (
                                  <span className="font-mono font-semibold text-blue-600">
                                    {item.price}
                                  </span>
                                )}
                                <span>·</span>
                                <span>{visible ? 'Visible on site' : 'Hidden'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={listIdx === 0}
                              onClick={() => handleMoveLegacyProduct(idx, 'up')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Move up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={listIdx === unmigratedLegacyItems.length - 1}
                              onClick={() => handleMoveLegacyProduct(idx, 'down')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Move down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleLegacyProductVisibility(idx)}
                              className={`p-1.5 rounded-lg cursor-pointer ${
                                visible ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                              title={visible ? 'Hide from website' : 'Show on website'}
                            >
                              {visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditLegacyProductModal(item, idx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 cursor-pointer"
                              title="Edit product"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setProductToDelete({ legacyIndex: idx, name: item.name })
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Delete product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Full inventory &amp; SKU management:</span>
                  <Link
                    to="/dashboard/products"
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    Open Products &amp; Inventory →
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 4: THEME, COLORS, FONTS & LOGO */}
            {editorTab === 'theme' && (
              <div className="space-y-5">
                {/* Business Logo Upload */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-900 dark:text-white text-sm">
                    Business Logo
                  </label>
                  {editLogoUrl ? (
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <img
                        src={editLogoUrl}
                        alt="Business logo"
                        className="w-14 h-14 rounded-xl object-contain bg-white p-1 border border-slate-200"
                      />
                      <div className="space-y-1.5">
                        <label className="text-blue-600 font-semibold hover:underline cursor-pointer block">
                          <span>
                            {uploadingKey === 'logo' ? 'Uploading...' : 'Replace Logo'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              void handleUploadImage(
                                e.target.files?.[0],
                                'logos',
                                'logo',
                                setEditLogoUrl
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setEditLogoUrl('');
                            markDirty();
                          }}
                          className="text-rose-600 font-semibold hover:underline cursor-pointer block"
                        >
                          Remove Logo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                      {uploadingKey === 'logo' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="w-4 h-4 text-blue-600" />
                      )}
                      <span>Upload Business Logo (PNG/JPG/SVG)</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadImage(
                            e.target.files?.[0],
                            'logos',
                            'logo',
                            setEditLogoUrl
                          )
                        }
                      />
                    </label>
                  )}
                </div>

                {/* Palette Presets */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-900 dark:text-white text-sm">
                    Theme Color Palette
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {THEME_PALETTES.map((pal) => (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => {
                          setEditBrandColor(pal.brandColor);
                          setEditThemeSettings((prev) => ({
                            ...prev,
                            primaryColor: pal.brandColor,
                            backgroundColor: pal.bgColor,
                            textColor: pal.textColor,
                          }));
                          markDirty();
                        }}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${
                          editBrandColor.toLowerCase() === pal.brandColor.toLowerCase()
                            ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full shrink-0"
                          style={{ backgroundColor: pal.brandColor }}
                        />
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {pal.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Color Pickers */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Primary Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editBrandColor}
                        onChange={(e) => {
                          setEditBrandColor(e.target.value);
                          setEditThemeSettings((prev) => ({
                            ...prev,
                            primaryColor: e.target.value,
                          }));
                          markDirty();
                        }}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={editBrandColor}
                        onChange={(e) => {
                          setEditBrandColor(e.target.value);
                          markDirty();
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Page Background
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editThemeSettings.backgroundColor || '#FFFFFF'}
                        onChange={(e) => {
                          setEditThemeSettings((prev) => ({
                            ...prev,
                            backgroundColor: e.target.value,
                          }));
                          markDirty();
                        }}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={editThemeSettings.backgroundColor || '#FFFFFF'}
                        onChange={(e) => {
                          setEditThemeSettings((prev) => ({
                            ...prev,
                            backgroundColor: e.target.value,
                          }));
                          markDirty();
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Font Style & Button Radius */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Typography Style
                    </label>
                    <select
                      value={editThemeSettings.fontStyle || 'modern'}
                      onChange={(e) => {
                        setEditThemeSettings((prev) => ({
                          ...prev,
                          fontStyle: e.target.value as any,
                        }));
                        markDirty();
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="modern">Modern Sans</option>
                      <option value="editorial">Editorial Serif</option>
                      <option value="bold">Bold Geometric</option>
                      <option value="minimal">Clean Minimal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Button Shape
                    </label>
                    <select
                      value={editThemeSettings.buttonStyle || 'rounded'}
                      onChange={(e) => {
                        setEditThemeSettings((prev) => ({
                          ...prev,
                          buttonStyle: e.target.value as any,
                        }));
                        markDirty();
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="rounded">Rounded</option>
                      <option value="pill">Pill Capsule</option>
                      <option value="sharp">Sharp Square</option>
                    </select>
                  </div>
                </div>

                {/* Business Category */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Business Industry Category
                  </label>
                  <select
                    value={editNiche}
                    onChange={(e) => {
                      setEditNiche(e.target.value as BusinessNiche);
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {CATEGORY_SPECS.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* TAB 5: BUSINESS INFO, FOOTER LINKS & CUSTOM DOMAIN */}
            {editorTab === 'business' && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Business Contact &amp; Footer Details
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Optional fields left blank are automatically hidden from your website and footer.
                  </p>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Business Name *
                    </label>
                    <input
                      type="text"
                      value={editBusinessName}
                      onChange={(e) => {
                        setEditBusinessName(e.target.value);
                        markDirty();
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => {
                          setEditPhone(e.target.value);
                          markDirty();
                        }}
                        placeholder="+880 1..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        WhatsApp Number
                      </label>
                      <input
                        type="text"
                        value={editWhatsapp}
                        onChange={(e) => {
                          setEditWhatsapp(e.target.value);
                          markDirty();
                        }}
                        placeholder="+880 1..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Business Email
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => {
                        setEditEmail(e.target.value);
                        markDirty();
                      }}
                      placeholder="contact@yourbusiness.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Physical Address / Location
                    </label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => {
                        setEditAddress(e.target.value);
                        markDirty();
                      }}
                      placeholder="e.g. House 14, Road 7, Dhanmondi, Dhaka"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                {/* Social Media Links */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Social Media Profiles
                  </h4>
                  <input
                    type="url"
                    value={editSocialFacebook}
                    onChange={(e) => {
                      setEditSocialFacebook(e.target.value);
                      markDirty();
                    }}
                    placeholder="Facebook URL (https://facebook.com/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <input
                    type="url"
                    value={editSocialInstagram}
                    onChange={(e) => {
                      setEditSocialInstagram(e.target.value);
                      markDirty();
                    }}
                    placeholder="Instagram URL (https://instagram.com/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <input
                    type="url"
                    value={editSocialTwitter}
                    onChange={(e) => {
                      setEditSocialTwitter(e.target.value);
                      markDirty();
                    }}
                    placeholder="Twitter / X URL (https://x.com/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <input
                    type="url"
                    value={editSocialLinkedin}
                    onChange={(e) => {
                      setEditSocialLinkedin(e.target.value);
                      markDirty();
                    }}
                    placeholder="LinkedIn URL (https://linkedin.com/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <input
                    type="url"
                    value={editSocialYoutube}
                    onChange={(e) => {
                      setEditSocialYoutube(e.target.value);
                      markDirty();
                    }}
                    placeholder="YouTube URL (https://youtube.com/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                {/* Custom Footer/Header Business Links */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Custom Business Links</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setEditCustomLinks((prev) => [
                          ...prev,
                          { id: `cl-${Date.now()}`, label: '', url: '' },
                        ]);
                        markDirty();
                      }}
                      className="text-blue-600 font-semibold hover:underline cursor-pointer"
                    >
                      + Add Link
                    </button>
                  </div>

                  {editCustomLinks.map((link, idx) => (
                    <div key={link.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={link.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditCustomLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, label: val } : l))
                          );
                          markDirty();
                        }}
                        placeholder="Label (e.g. Return Policy)"
                        className="w-2/5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditCustomLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, url: val } : l))
                          );
                          markDirty();
                        }}
                        placeholder="https://..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditCustomLinks((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Custom Domain Configuration */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Optional Custom Domain
                  </h4>
                  <input
                    type="text"
                    value={editCustomDomain}
                    onChange={(e) => {
                      setEditCustomDomain(e.target.value);
                      markDirty();
                    }}
                    placeholder="e.g. www.yourbusiness.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                    <p>
                      <strong>Included Free:</strong>{' '}
                      <code className="font-mono text-blue-600">{activeWebsite.fullDomainUrl}</code> + GoAMAAS Hosting.
                    </p>
                    <p>
                      <strong>Custom Domain DNS:</strong> Point a <code className="font-mono">CNAME</code> record for <code className="font-mono">www</code> to <code className="font-mono">cname.amaas.xyz</code>. Domain registration is paid separately to your domain registrar.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANE: LIVE REAL-TIME DESKTOP & MOBILE PREVIEW (7 Cols) */}
          <div className="lg:col-span-7 p-4 sm:p-6 bg-slate-100/80 dark:bg-slate-950/60 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white">
                  Real-Time Storefront Preview
                </span>
                <span className="text-slate-400 mx-2">·</span>
                <span className="text-slate-500">Updates immediately as you edit</span>
              </div>

              <div className="inline-flex p-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="max-h-[750px] overflow-y-auto flex justify-center">
              <WebsitePreviewRenderer
                site={livePreviewSite}
                viewMode={previewDevice}
                showGraceBanner={isGracePeriod}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resource Usage & Subscription Controls Footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Sections</span>
            <Layers className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {editSections.filter((s) => s.enabled).length}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Catalog Products</span>
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {unifiedWebsiteProducts.filter((p) => p.isVisible !== false).length} visible
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Media Storage</span>
            <HardDrive className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {activeWebsite.resourceUsage.storageLimitMb} MB included
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Bandwidth</span>
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {activeWebsite.resourceUsage.bandwidthLimitGb} GB / mo
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Subscription Lifecycle Controls</span>
          </div>
          <p className="text-xs text-slate-500 max-w-xl">
            GoAMAAS Website is billed at ৳{activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly} per 30-day cycle with free hosting and subdomain included. You can unpublish or cancel your subscription anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCancelled && (
            <button
              type="button"
              onClick={() => setIsCancelSubDialogOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-700 dark:text-rose-400 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel Subscription
            </button>
          )}

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
                    `Hello GoAMAAS! I need assistance with my website "${activeWebsite.businessName}" (${activeWebsite.fullDomainUrl}).`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>GoAMAAS Support</span>
                </a>
              );
            }
            return (
              <Link
                to="/dashboard/support"
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>GoAMAAS Support</span>
              </Link>
            );
          })()}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Modal: Add / Edit Website Product                                         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProductTarget?.mode === 'add' ? 'Add Website Product' : 'Edit Website Product'}
        description="Saved directly to your Supabase products table and cloud asset storage."
        maxWidth="md"
      >
        <form onSubmit={handleSaveProductModal} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Product / Service Name *
            </label>
            <input
              type="text"
              required
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="e.g. Handwoven Jamdani Saree"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Price (BDT ৳) *
              </label>
              <input
                type="number"
                min={0}
                required
                value={prodPrice}
                onChange={(e) => setProdPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <input
                type="text"
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
                placeholder="e.g. Apparel"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={prodDescription}
              onChange={(e) => setProdDescription(e.target.value)}
              placeholder="Key materials, sizing, or specifications..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Product Image Upload */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300">
              Product Image
            </label>
            {prodImageUrl ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <img
                  src={prodImageUrl}
                  alt={prodName}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                />
                <div className="space-y-1">
                  <label className="text-blue-600 font-semibold hover:underline cursor-pointer block">
                    <span>{uploadingKey === 'modal-prod' ? 'Uploading...' : 'Replace Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        void handleUploadImage(
                          e.target.files?.[0],
                          'products',
                          'modal-prod',
                          setProdImageUrl
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setProdImageUrl('')}
                    className="text-rose-600 font-semibold hover:underline cursor-pointer block"
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold">
                {uploadingKey === 'modal-prod' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <Upload className="w-4 h-4 text-blue-600" />
                )}
                <span>Upload Product Photo (PNG/JPG/WEBP)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    void handleUploadImage(
                      e.target.files?.[0],
                      'products',
                      'modal-prod',
                      setProdImageUrl
                    )
                  }
                />
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={prodVisible}
              onChange={(e) => setProdVisible(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Show this product on published website
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsProductModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingProduct || uploadingKey === 'modal-prod'}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isSavingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingProductTarget?.mode === 'add' ? 'Add Product' : 'Save Product'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Concierge Update Request */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Request Concierge Website Update"
        description={`Includes up to ${activeWebsite.resourceUsage.monthlyUpdatesLimit} assisted update requests per billing cycle.`}
        maxWidth="md"
      >
        <form onSubmit={handleSendUpdateRequest} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Describe Requested Changes *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Describe any layout or content assistance you would like from our team..."
              value={updateRequestText}
              onChange={(e) => setUpdateRequestText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsRequestModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Request</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Manual Payment Submission Modal */}
      <ManualPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        serviceType="website_subscription"
        serviceId={activeWebsite.id}
        serviceName={`GoAMAAS Website (${activeWebsite.fullDomainUrl})`}
        planTier="GoAMAAS Website"
        amount={activeWebsite.monthlyFee || websiteSubscriptionPlan.priceMonthly}
        onSuccess={() => {
          showToast(
            'Payment submitted! Your website will automatically publish live for 30 days once verified.',
            'success'
          );
        }}
      />

      {/* Delete Product Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={() => void handleConfirmDeleteProduct()}
        title="Delete Product"
        message={`Are you sure you want to permanently delete "${productToDelete?.name}" from your catalog and website?`}
        confirmLabel="Delete Product"
        cancelLabel="Keep Product"
        isDestructive={true}
      />

      {/* Unpublish Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isUnpublishDialogOpen}
        onClose={() => setIsUnpublishDialogOpen(false)}
        onConfirm={() => void handleConfirmUnpublish()}
        title="Take Website Offline"
        message={`Are you sure you want to unpublish "${activeWebsite.businessName}"? Visitors to https://${activeWebsite.fullDomainUrl} will see that the site is offline. Your content and products remain safely saved.`}
        confirmLabel="Unpublish Website"
        cancelLabel="Stay Live"
        isDestructive={true}
      />

      {/* Cancel Subscription Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isCancelSubDialogOpen}
        onClose={() => setIsCancelSubDialogOpen(false)}
        onConfirm={() => void handleConfirmCancelSubscription()}
        title="Cancel Website Subscription"
        message={`Are you sure you want to cancel the GoAMAAS Website subscription for "${activeWebsite.businessName}"? Your website will be taken offline immediately.`}
        confirmLabel="Yes, Cancel Subscription"
        cancelLabel="Keep Subscription"
        isDestructive={true}
      />
    </div>
  );
};
