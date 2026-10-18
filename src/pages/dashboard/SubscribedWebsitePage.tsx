import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SubscribedWebsite } from '../../types';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';
import { TrialGateBanner } from '../../components/ui/TrialGateBanner';
import { ManualPaymentModal } from '../../components/payment/ManualPaymentModal';
import {
  Globe,
  CreditCard,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Edit3,
  RefreshCw,
  Plus,
  Send,
  ShieldCheck,
  Zap,
  Smartphone,
  Monitor,
  HardDrive,
  Activity,
  Layers,
  Phone,
  MessageSquare,
  HelpCircle,
  FileText,
} from 'lucide-react';

export const SubscribedWebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeStore,
    subscribedWebsites,
    websiteSubscriptionPlan,
    updateSubscribedWebsite,
    renewSubscribedWebsite,
    requestWebsiteContentUpdate,
    showToast,
    getServiceAccess,
    publishWebsite,
    unpublishWebsite,
  } = useApp();
  const serviceAccess = getServiceAccess('business_website_lite', 'Business Website Lite', 'website');

  // Find website belonging to current active store or fallback to first website
  const activeWebsite: SubscribedWebsite | undefined =
    subscribedWebsites.find((s) => s.storeId === activeStore?.id) ||
    subscribedWebsites[0];

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Edit Form State
  const [editHeadline, setEditHeadline] = useState(activeWebsite?.headline || '');
  const [editSubheadline, setEditSubheadline] = useState(activeWebsite?.subheadline || '');
  const [editPhone, setEditPhone] = useState(activeWebsite?.phone || '');
  const [editWhatsapp, setEditWhatsapp] = useState(activeWebsite?.whatsappNumber || '');
  const [editAddress, setEditAddress] = useState(activeWebsite?.address || '');
  const [editAbout, setEditAbout] = useState(activeWebsite?.aboutText || '');

  // Content Update Request State
  const [updateRequestText, setUpdateRequestText] = useState('');

  // Payment Method
  const [renewGateway, setRenewGateway] = useState<'bKash' | 'Nagad' | 'Card'>('bKash');

  const handleCopyLink = () => {
    if (!activeWebsite) return;
    navigator.clipboard.writeText(`https://${activeWebsite.fullDomainUrl}`);
    showToast('Website URL copied to clipboard!', 'info');
  };

  const handleSaveEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWebsite) return;

    updateSubscribedWebsite(activeWebsite.id, {
      headline: editHeadline,
      subheadline: editSubheadline,
      phone: editPhone,
      whatsappNumber: editWhatsapp,
      address: editAddress,
      aboutText: editAbout,
    });
    setIsEditModalOpen(false);
  };

  const handleSendUpdateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWebsite || !updateRequestText.trim()) return;

    requestWebsiteContentUpdate(activeWebsite.id, updateRequestText);
    setUpdateRequestText('');
    setIsRequestModalOpen(false);
  };

  const handleConfirmRenewal = () => {
    if (!activeWebsite) return;
    renewSubscribedWebsite(activeWebsite.id);
    setIsRenewModalOpen(false);
  };

  if (!activeWebsite) {
    return (
      <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-6 max-w-2xl mx-auto shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
          <Globe className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold text-xs">
            {websiteSubscriptionPlan.badge}
          </span>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Get Your Business Online for ৳600/month
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Zero upfront development fees. Custom-designed, mobile-responsive business website with hosting and your own <code className="font-mono text-blue-600">yourbusiness.amaas.xyz</code> subdomain.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => navigate('/create-website')}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Start Your Website Now</span>
          </button>
        </div>
      </div>
    );
  }

  const isGracePeriod = activeWebsite.subscriptionStatus === 'grace_period';
  const isSuspended = activeWebsite.subscriptionStatus === 'suspended';

  return (
    <div className="space-y-8">
      {/* Top Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] font-bold">
                {activeWebsite.planName}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  activeWebsite.subscriptionStatus === 'active'
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : isGracePeriod
                    ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse'
                    : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}
              >
                {activeWebsite.subscriptionStatus.replace('_', ' ')}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-mono">
                {activeWebsite.nicheLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeWebsite.businessName} Website Hub
              </h1>
              {activeWebsite.paymentStatus === 'paid' && activeWebsite.deploymentStatus === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Published & Live</span>
                </span>
              ) : activeWebsite.paymentStatus === 'paid' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Approved · Ready to Publish</span>
                </span>
              ) : activeWebsite.paymentStatus === 'pending_review' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Payment Audit Review Required</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Payment Verification Pending</span>
                </span>
              )}
            </div>

            {/* Live Domain Badge & Quick Links */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white font-semibold">
                <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>https://{activeWebsite.fullDomainUrl}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                title="Copy URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <a
                href={`#preview-section`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Jump to Live Preview</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeWebsite.paymentStatus === 'paid' && activeWebsite.deploymentStatus !== 'live' && (
              <button
                onClick={async () => {
                  await publishWebsite(activeWebsite.id);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>1-Click Publish Website</span>
              </button>
            )}
            {activeWebsite.paymentStatus === 'paid' && activeWebsite.deploymentStatus === 'live' && (
              <button
                onClick={async () => {
                  await unpublishWebsite(activeWebsite.id);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                <span>Unpublish Website</span>
              </button>
            )}
            <button
              onClick={() => {
                setEditHeadline(activeWebsite.headline);
                setEditSubheadline(activeWebsite.subheadline);
                setEditPhone(activeWebsite.phone);
                setEditWhatsapp(activeWebsite.whatsappNumber);
                setEditAddress(activeWebsite.address);
                setEditAbout(activeWebsite.aboutText);
                setIsEditModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Quick Edit Content</span>
            </button>

            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              <span>Request Content Update</span>
            </button>

            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Pay / Renew (৳600)</span>
            </button>
          </div>
        </div>

        {/* Grace Period Policy Warning Banner */}
        {isGracePeriod && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Subscription Payment Pending — Active 7-Day Grace Period</strong>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                  Your website remains live at <code className="font-mono">{activeWebsite.fullDomainUrl}</code>. Under GoAMAAS policy, customer websites and catalog data are safely preserved and never deleted immediately. Renew before {activeWebsite.gracePeriodEndsAt || 'the grace deadline'} to ensure uninterrupted uptime.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsRenewModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs shrink-0 hover:bg-amber-500 transition-colors"
            >
              Pay ৳600 Now
            </button>
          </div>
        )}

        {/* 4 Resource Usage Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Pages Included</span>
              <Layers className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-extrabold font-mono text-slate-900 dark:text-white">
              {activeWebsite.resourceUsage.pagesCount} / {activeWebsite.resourceUsage.pagesLimit}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Mobile-responsive</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Media Storage</span>
              <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-extrabold font-mono text-slate-900 dark:text-white">
              {activeWebsite.resourceUsage.storageUsedMb} MB / {activeWebsite.resourceUsage.storageLimitMb} MB
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{
                  width: `${(activeWebsite.resourceUsage.storageUsedMb / activeWebsite.resourceUsage.storageLimitMb) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Monthly Bandwidth</span>
              <Activity className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-extrabold font-mono text-slate-900 dark:text-white">
              {activeWebsite.resourceUsage.bandwidthUsedGb} GB / {activeWebsite.resourceUsage.bandwidthLimitGb} GB
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full"
                style={{
                  width: `${(activeWebsite.resourceUsage.bandwidthUsedGb / activeWebsite.resourceUsage.bandwidthLimitGb) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Updates Used This Month</span>
              <FileText className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-2 text-lg sm:text-xl font-extrabold font-mono text-slate-900 dark:text-white">
              {activeWebsite.resourceUsage.monthlyUpdatesUsed} / {activeWebsite.resourceUsage.monthlyUpdatesLimit}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Refreshes next billing cycle
            </span>
          </div>
        </div>
      </div>

      {/* Subdomain Clarification & Custom Domain Upgrade Callout */}
      <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Subdomain Allocation & Custom Domain Upgrades</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Your website is hosted on the AMAAS network under <code className="font-mono text-blue-600">https://{activeWebsite.fullDomainUrl}</code>. A custom top-level domain (such as <code className="font-mono">yourbusiness.com</code>) is not included in this Lite plan, but can be seamlessly mapped anytime.
          </p>
        </div>

        <button
          onClick={() => navigate('/dashboard/website-requests')}
          className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors whitespace-nowrap"
        >
          Explore Custom .COM Upgrade
        </button>
      </div>

      {/* Custom Domain Request Callout */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="font-bold text-xs text-slate-900 dark:text-white block">
            Want to use your own custom domain? (e.g. www.{activeWebsite.subdomain}.com)
          </span>
          <span className="text-[11px] text-slate-500">
            Contact AMAAS to connect and configure your custom domain with free SSL.
          </span>
        </div>
        <a
          href={`https://wa.me/8801822332020?text=${encodeURIComponent(`Hello AMAAS! I would like to connect a custom domain for my GoAMAAS website "${activeWebsite.businessName}" (${activeWebsite.fullDomainUrl}).`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Contact on WhatsApp</span>
        </a>
      </div>

      {/* Embedded Live Preview Section */}
      <div id="preview-section" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Live Website Preview
            </h2>
            <p className="text-xs text-slate-500">
              Interactive preview rendered directly from your current website configuration.
            </p>
          </div>

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
        </div>

        <div className="p-4 sm:p-8 bg-slate-200/60 dark:bg-slate-950/60 rounded-3xl border border-slate-300 dark:border-slate-800 flex justify-center">
          <WebsitePreviewRenderer site={activeWebsite} viewMode={previewDevice} showGraceBanner={isGracePeriod} />
        </div>
      </div>

      {/* Modal 1: Quick Content Edit */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Quick Edit Website Content"
        description="Update your business contact numbers, hero headline, and about story immediately."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveEdits} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hero Headline
            </label>
            <input
              type="text"
              value={editHeadline}
              onChange={(e) => setEditHeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Subheadline / Slogan
            </label>
            <input
              type="text"
              value={editSubheadline}
              onChange={(e) => setEditSubheadline(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                WhatsApp Number (Orders link here)
              </label>
              <input
                type="text"
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Support Phone
              </label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Physical Location / Map Address
            </label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              About Us Story
            </label>
            <textarea
              rows={3}
              value={editAbout}
              onChange={(e) => setEditAbout(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Request Content Update from AMAAS */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Submit Website Content Update Request"
        description={`Your plan includes up to ${activeWebsite.resourceUsage.monthlyUpdatesLimit} professional update requests per month (${activeWebsite.resourceUsage.monthlyUpdatesUsed} used this cycle).`}
        maxWidth="md"
      >
        <form onSubmit={handleSendUpdateRequest} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Describe the Changes You Need *
            </label>
            <textarea
              required
              rows={5}
              placeholder="e.g. Please update our Friday opening hours to 2:00 PM - 10:00 PM, and change the price of Chef Special Biryani from ৳550 to ৳580."
              value={updateRequestText}
              onChange={(e) => setUpdateRequestText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
            Our web maintenance engineers review and publish permitted content adjustments within 24 business hours.
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsRequestModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Request</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Renew Subscription (৳600/month) */}
      <Modal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        title="Renew Website Subscription"
        description="Extend your website hosting and subdomain routing for another 30 days."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Plan:</span>
              <strong className="text-slate-900 dark:text-white">{activeWebsite.planName}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Subdomain:</span>
              <span className="font-mono text-slate-900 dark:text-white">{activeWebsite.fullDomainUrl}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Amount Due:</span>
              <span className="text-base font-extrabold font-mono text-blue-600">৳600</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Select Demo Payment Method:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['bKash', 'Nagad', 'Card'].map((gw) => (
                <button
                  key={gw}
                  type="button"
                  onClick={() => setRenewGateway(gw as any)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold ${
                    renewGateway === gw
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 ring-2 ring-blue-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {gw}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setIsRenewModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRenewal}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs"
            >
              Confirm Payment (৳600)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
