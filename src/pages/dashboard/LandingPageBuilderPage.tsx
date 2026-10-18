import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LandingPage } from '../../types';
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Eye,
  Smartphone,
  Monitor,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Settings,
  Palette,
  Layout,
  Share2,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';
import { TrialGateBanner } from '../../components/ui/TrialGateBanner';

export const LandingPageBuilderPage: React.FC = () => {
  const {
    getServiceAccess,
    landingPages,
    createLandingPage,
    updateLandingPage,
    deleteLandingPage,
    togglePublishLandingPage,
    showToast,
  } = useApp();
  const serviceAccess = getServiceAccess('landing_page_builder', 'Landing Page Visual Builder', 'landing_pages');

  const [activeTab, setActiveTab] = useState<'pages' | 'editor'>('pages');
  const [selectedPage, setSelectedPage] = useState<LandingPage>(landingPages[0]);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Modals
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<LandingPage | null>(null);

  // Template options
  const templates = [
    {
      id: 'fashion-chic' as const,
      name: 'Fashion Lookbook Drop',
      desc: 'Designed for high-impact apparel campaigns with instant size selection and COD form.',
      theme: '#2563EB',
    },
    {
      id: 'tech-launch' as const,
      name: 'Gadget & Tech Launch',
      desc: 'Technical specs tables, comparison grids, and urgency countdown tags.',
      theme: '#0EA5E9',
    },
    {
      id: 'artisan-craft' as const,
      name: 'Artisanal & Organic Pantry',
      desc: 'Warm aesthetic for raw foods, gourmet honeys, and handcrafted lifestyle goods.',
      theme: '#D97706',
    },
    {
      id: 'direct-order' as const,
      name: 'Ultra-Fast 1-Click COD Checkout',
      desc: 'Minimalist funnel designed for maximum conversion from Facebook & TikTok ads.',
      theme: '#10B981',
    },
  ];

  const handleSelectTemplate = (templateId: LandingPage['templateId'], themeColor: string) => {
    const title = `Campaign Drop #${landingPages.length + 1}`;
    const slug = `campaign-${Date.now().toString().slice(-4)}`;

    createLandingPage({
      title,
      slug,
      templateId,
      headline: 'Experience Premium Quality Direct to Your Door',
      subheadline: 'Crafted with premium materials and backed by our 7-day hassle-free exchange guarantee.',
      ctaText: 'Order Now via Cash on Delivery',
      ctaLink: '#checkout',
      themeColor,
      status: 'draft',
      sections: {
        hero: true,
        features: true,
        productHighlight: true,
        pricing: true,
        reviews: true,
        faq: true,
        contact: true,
      },
    });

    setIsTemplateModalOpen(false);
    showToast('New landing page draft initiated! Opening editor...', 'success');
  };

  const handleOpenEditor = (page: LandingPage) => {
    setSelectedPage(page);
    setActiveTab('editor');
  };

  const handleToggleSection = (sectionKey: keyof LandingPage['sections']) => {
    if (!selectedPage) return;
    const updated = {
      ...selectedPage,
      sections: {
        ...selectedPage.sections,
        [sectionKey]: !selectedPage.sections[sectionKey],
      },
    };
    setSelectedPage(updated);
    updateLandingPage(selectedPage.id, updated);
  };

  return (
    <div className="space-y-6">
      {/* Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Landing Page Visual Builder
            </h1>
            <TrialStatusBadge
              serviceId="landing_page_builder"
              serviceName="Landing Page Visual Builder"
              category="landing_pages"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Build, customize, and publish high-converting campaign pages with direct COD checkout.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'editor' && (
            <button
              onClick={() => setActiveTab('pages')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              &larr; Back to Page List
            </button>
          )}

          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Page</span>
          </button>
        </div>
      </div>

      {/* Independent Trial Gate Banner if trial not active or expired */}
      {!serviceAccess.hasAccess ? (
        <TrialGateBanner
          serviceId="landing_page_builder"
          serviceName="Landing Page Visual Builder"
          category="landing_pages"
          serviceDescription="Design and launch fast-loading, mobile-optimized landing pages with built-in Cash on Delivery order forms and conversion tracking with our 7-day free trial."
          features={[
            'Drag-and-Drop Visual Section Controls',
            '1-Click Cash on Delivery Checkout Funnels',
            'Mobile & Desktop Interactive Preview Modes',
            'Ad-Campaign Conversion Tracking & Analytics',
            'Customizable Brand Colors & Typography',
            'Real-Time Visitor & Order Syncing',
          ]}
          subscribePath="/dashboard/billing"
          subscribePriceLabel="Included in Dashboard Pro"
        />
      ) : activeTab === 'pages' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {landingPages.map((lp) => {
              const convRate = lp.visitors > 0 ? ((lp.conversions / lp.visitors) * 100).toFixed(1) : '0.0';

              return (
                <div
                  key={lp.id}
                  className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-blue-500/50 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          lp.status === 'published'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {lp.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Updated: {lp.updatedAt}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-1">
                      {lp.title}
                    </h3>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                      /p/{lp.slug}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      "{lp.headline}"
                    </p>

                    {/* Analytics Pill Bar */}
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-center font-mono text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Visitors</span>
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {lp.visitors.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Orders</span>
                        <strong className="text-blue-600 dark:text-blue-400 tabular-nums">
                          {lp.conversions}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Conv. Rate</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {convRate}%
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => togglePublishLandingPage(lp.id)}
                      className={`text-[11px] font-semibold ${
                        lp.status === 'published' ? 'text-amber-600 hover:underline' : 'text-emerald-600 hover:underline'
                      }`}
                    >
                      {lp.status === 'published' ? 'Unpublish' : 'Publish Page'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditor(lp)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-1 hover:bg-blue-700"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Edit Page</span>
                      </button>
                      <button
                        onClick={() => {
                          setPageToDelete(lp);
                          setIsDeleteDialogOpen(true);
                        }}
                        className="p-1.5 text-rose-500 hover:text-rose-700"
                        title="Delete Landing Page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VIEW 2: Visual Editor & Live Preview Split */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Panel (5 Cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-xs text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                Editor Controls
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePublishLandingPage(selectedPage.id)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase ${
                    selectedPage.status === 'published'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {selectedPage.status} (Demo)
                </button>
              </div>
            </div>

            {/* Page Meta */}
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={selectedPage.title}
                  onChange={(e) => {
                    const updated = { ...selectedPage, title: e.target.value };
                    setSelectedPage(updated);
                    updateLandingPage(selectedPage.id, updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  URL Slug
                </label>
                <div className="flex items-center gap-1 font-mono">
                  <span className="text-slate-400">/p/</span>
                  <input
                    type="text"
                    value={selectedPage.slug}
                    onChange={(e) => {
                      const updated = { ...selectedPage, slug: e.target.value };
                      setSelectedPage(updated);
                      updateLandingPage(selectedPage.id, updated);
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Main Hero Headline
                </label>
                <textarea
                  rows={2}
                  value={selectedPage.headline}
                  onChange={(e) => {
                    const updated = { ...selectedPage, headline: e.target.value };
                    setSelectedPage(updated);
                    updateLandingPage(selectedPage.id, updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sub-Headline / Value Proposition
                </label>
                <textarea
                  rows={3}
                  value={selectedPage.subheadline}
                  onChange={(e) => {
                    const updated = { ...selectedPage, subheadline: e.target.value };
                    setSelectedPage(updated);
                    updateLandingPage(selectedPage.id, updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Primary CTA Button Text
                </label>
                <input
                  type="text"
                  value={selectedPage.ctaText}
                  onChange={(e) => {
                    const updated = { ...selectedPage, ctaText: e.target.value };
                    setSelectedPage(updated);
                    updateLandingPage(selectedPage.id, updated);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Theme Color Picker */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Accent Color Palette
                </label>
                <div className="flex items-center gap-2">
                  {['#2563EB', '#0EA5E9', '#10B981', '#D97706', '#8B5CF6', '#E11D48'].map((col) => (
                    <button
                      key={col}
                      onClick={() => {
                        const updated = { ...selectedPage, themeColor: col };
                        setSelectedPage(updated);
                        updateLandingPage(selectedPage.id, updated);
                      }}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        selectedPage.themeColor === col ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              {/* Section Toggles */}
              <div className="pt-2">
                <span className="block font-bold text-slate-900 dark:text-white mb-2">
                  Section Visibility Controls
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(selectedPage.sections) as Array<keyof LandingPage['sections']>).map((key) => {
                    const isVisible = selectedPage.sections[key];
                    return (
                      <button
                        key={key}
                        onClick={() => handleToggleSection(key)}
                        className={`p-2 rounded-lg border text-left capitalize transition-colors flex items-center justify-between ${
                          isVisible
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-400'
                        }`}
                      >
                        <span>{key}</span>
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${isVisible ? 'text-blue-600 dark:text-blue-400' : 'opacity-0'}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Panel (7 Cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between px-2 text-xs">
              <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Live Responsive Sandbox
              </span>
              <div className="flex items-center p-1 rounded-lg bg-slate-200 dark:bg-slate-800">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-md ${
                    previewDevice === 'desktop' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                  title="Desktop Preview"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-md ${
                    previewDevice === 'mobile' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                  title="Mobile Viewport Preview"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Frame */}
            <div
              className={`mx-auto rounded-2xl border-4 border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-2xl transition-all ${
                previewDevice === 'mobile' ? 'max-w-sm min-h-[580px]' : 'w-full min-h-[580px]'
              }`}
            >
              {/* Fake Browser Top */}
              <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <span className="font-mono text-slate-300">shop.goamaas.com/p/{selectedPage.slug}</span>
                <span className="text-[10px] text-blue-400 font-semibold">PREVIEW</span>
              </div>

              {/* Rendered Landing Page Content */}
              <div className="p-6 space-y-8 text-slate-900 dark:text-slate-100">
                {/* Hero Section */}
                {selectedPage.sections.hero && (
                  <div className="text-center space-y-4 pt-4">
                    <span
                      className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                      style={{ backgroundColor: selectedPage.themeColor }}
                    >
                      Limited Flash Drop
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                      {selectedPage.headline}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                      {selectedPage.subheadline}
                    </p>
                    <div className="pt-2">
                      <button
                        style={{ backgroundColor: selectedPage.themeColor }}
                        className="px-6 py-3 rounded-xl text-white font-bold text-xs shadow-md"
                      >
                        {selectedPage.ctaText}
                      </button>
                    </div>
                  </div>
                )}

                {/* Features Section */}
                {selectedPage.sections.features && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-left">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-xs block">100% Genuine Quality</span>
                      <span className="text-[10px] text-slate-500">Inspected by quality assurance</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-xs block">Cash on Delivery</span>
                      <span className="text-[10px] text-slate-500">Pay after checking parcel</span>
                    </div>
                  </div>
                )}

                {/* Direct Order Form Section */}
                {selectedPage.sections.pricing && (
                  <div className="p-5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-center">
                      Fast Direct Order Form
                    </h4>
                    <div className="space-y-2 text-xs">
                      <input
                        type="text"
                        disabled
                        placeholder="Your Full Name"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-[11px]"
                      />
                      <input
                        type="tel"
                        disabled
                        placeholder="Mobile Number (e.g. 01700-000000)"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-[11px]"
                      />
                      <input
                        type="text"
                        disabled
                        placeholder="Full Delivery Address"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-[11px]"
                      />
                      <button
                        style={{ backgroundColor: selectedPage.themeColor }}
                        className="w-full py-2.5 rounded-lg text-white font-bold text-xs"
                      >
                        Confirm Cash on Delivery Order (৳1,850)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Gallery Selection Modal */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Select Landing Page Template"
        description="Choose a high-converting layout architecture tailored for your product category."
        maxWidth="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => handleSelectTemplate(tpl.id, tpl.theme)}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer transition-all hover:shadow-md space-y-3 bg-white dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: tpl.theme }}
                />
                <span className="text-[10px] font-mono text-slate-400">TEMPLATE</span>
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">{tpl.name}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{tpl.desc}</p>
              <button
                type="button"
                className="w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
              >
                Use Template &rarr;
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (pageToDelete) deleteLandingPage(pageToDelete.id);
        }}
        title="Delete Landing Page?"
        message={`Are you sure you want to delete "${pageToDelete?.title}"? Any active visitors directed to /p/${pageToDelete?.slug} will see a 404.`}
        confirmLabel="Delete Page"
        cancelLabel="Keep Page"
        isDestructive
      />
    </div>
  );
};
