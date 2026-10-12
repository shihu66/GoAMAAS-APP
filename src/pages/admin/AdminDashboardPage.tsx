import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WebsiteRequest, SubscribedWebsite } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import {
  ShieldAlert,
  Users,
  Store,
  CreditCard,
  Globe2,
  Globe,
  Activity,
  CheckCircle2,
  Clock,
  Search,
  SlidersHorizontal,
  Bot,
  ExternalLink,
  ChevronDown,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Eye,
  Settings,
  Sparkles,
  AlertTriangle,
  Layers,
  Smartphone,
  Monitor,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const {
    stores,
    websiteRequests,
    updateWebsiteRequestStatus,
    subscribedWebsites,
    websiteSubscriptionPlan,
    updateWebsiteSubscriptionPlanConfig,
    suspendSubscribedWebsite,
    reactivateSubscribedWebsite,
    renewSubscribedWebsite,
    automations,
    invoices,
    showToast,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<'requests' | 'tenants' | 'transactions' | 'websiteSubscriptions'>('websiteSubscriptions');
  const [requestSearch, setRequestSearch] = useState('');
  const [websiteSearch, setWebsiteSearch] = useState('');

  // Website Preview State in Admin
  const [previewingWebsite, setPreviewingWebsite] = useState<SubscribedWebsite | null>(null);
  const [adminPreviewDevice, setAdminPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Plan Settings Form State
  const [isPlanSettingsModalOpen, setIsPlanSettingsModalOpen] = useState(false);
  const [planPrice, setPlanPrice] = useState(websiteSubscriptionPlan.priceMonthly);
  const [planGraceDays, setPlanGraceDays] = useState(websiteSubscriptionPlan.limits.gracePeriodDays);
  const [planMaxPages, setPlanMaxPages] = useState(websiteSubscriptionPlan.limits.maxPages);
  const [planMaxStorage, setPlanMaxStorage] = useState(websiteSubscriptionPlan.limits.maxStorageMb);
  const [planMaxBandwidth, setPlanMaxBandwidth] = useState(websiteSubscriptionPlan.limits.maxBandwidthGb);
  const [planMaxUpdates, setPlanMaxUpdates] = useState(websiteSubscriptionPlan.limits.monthlyUpdateRequests);
  const [planIsVisible, setPlanIsVisible] = useState(websiteSubscriptionPlan.isVisible);

  // Real platform aggregates
  const platformStats = {
    totalTenants: stores.length,
    activeSubscribers: subscribedWebsites.filter((s) => s.subscriptionStatus === 'active').length,
    monthlyRecurringRevenue: subscribedWebsites.reduce(
      (sum, s) => sum + (s.subscriptionStatus === 'active' ? s.monthlyFee : 0),
      0
    ),
    activeAutomations: automations.filter((a) => a.status === 'active').length,
  };

  const filteredRequests = websiteRequests.filter(
    (r) =>
      r.businessName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.contactName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.budgetTier.toLowerCase().includes(requestSearch.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Platform Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700 text-purple-300 text-[10px] font-mono uppercase font-bold">
              SUPER_ADMIN_MODE
            </span>
            <span className="text-xs text-slate-400">GoAMAAS Multitenant Operations Core</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            Platform Master Console
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Platform Health:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Systems Optimal</span>
          </span>
        </div>
      </div>

      {/* 4 Platform Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Active Business Tenants</span>
          <p className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {platformStats.totalTenants}
          </p>
          <span className="text-[11px] text-emerald-400 mt-1 block">+12 this month</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Paying Subscriptions</span>
          <p className="mt-2 text-2xl font-bold text-blue-400 font-mono tabular-nums">
            {platformStats.activeSubscribers}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">83% conversion from trial</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Platform MRR (SaaS Only)</span>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            ৳{platformStats.monthlyRecurringRevenue.toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Excluding website project fees</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Active AI Bots Dispatched</span>
          <p className="mt-2 text-2xl font-bold text-purple-400 font-mono tabular-nums">
            {platformStats.activeAutomations}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Messenger & WhatsApp cloud lines</span>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveAdminTab('websiteSubscriptions')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeAdminTab === 'websiteSubscriptions'
              ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Website Subscriptions (৳600/mo) ({subscribedWebsites.length}) ★</span>
        </button>

        <button
          onClick={() => setActiveAdminTab('requests')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeAdminTab === 'requests'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5" />
          <span>One-Time Requests Pipeline ({websiteRequests.length})</span>
        </button>

        <button
          onClick={() => setActiveAdminTab('tenants')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeAdminTab === 'tenants'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Tenant Stores & Subscriptions</span>
        </button>

        <button
          onClick={() => setActiveAdminTab('transactions')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeAdminTab === 'transactions'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Payment Ledger Audit</span>
        </button>
      </div>

      {/* TAB 0: Website Subscriptions Management (Lite ৳600/month Plan) */}
      {activeAdminTab === 'websiteSubscriptions' && (
        <div className="space-y-6">
          {/* Top Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-72 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={websiteSearch}
                  onChange={(e) => setWebsiteSearch(e.target.value)}
                  placeholder="Filter by business, owner, subdomain..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-hidden text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPlanPrice(websiteSubscriptionPlan.priceMonthly);
                  setPlanGraceDays(websiteSubscriptionPlan.limits.gracePeriodDays);
                  setPlanMaxPages(websiteSubscriptionPlan.limits.maxPages);
                  setPlanMaxStorage(websiteSubscriptionPlan.limits.maxStorageMb);
                  setPlanMaxBandwidth(websiteSubscriptionPlan.limits.maxBandwidthGb);
                  setPlanMaxUpdates(websiteSubscriptionPlan.limits.monthlyUpdateRequests);
                  setPlanIsVisible(websiteSubscriptionPlan.isVisible);
                  setIsPlanSettingsModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Plan Settings & Rules (No Code)</span>
              </button>
            </div>
          </div>

          {/* 4 Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Subscribed Websites</span>
              <p className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
                {subscribedWebsites.length}
              </p>
              <span className="text-[11px] text-blue-400 mt-0.5 block">{websiteSubscriptionPlan.name}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Active & Live</span>
              <p className="mt-1 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {subscribedWebsites.filter((s) => s.subscriptionStatus === 'active').length}
              </p>
              <span className="text-[11px] text-emerald-400 mt-0.5 block">100% DNS routed</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">In Grace Period</span>
              <p className="mt-1 text-2xl font-bold text-amber-400 font-mono tabular-nums">
                {subscribedWebsites.filter((s) => s.subscriptionStatus === 'grace_period').length}
              </p>
              <span className="text-[11px] text-amber-400 mt-0.5 block">Data preserved safely</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Subscription MRR</span>
              <p className="mt-1 text-2xl font-bold text-blue-400 font-mono tabular-nums">
                ৳{(subscribedWebsites.length * websiteSubscriptionPlan.priceMonthly).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block">৳{websiteSubscriptionPlan.priceMonthly}/mo per site</span>
            </div>
          </div>

          {/* Subscribed Websites Management Table */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Business & Owner</th>
                  <th className="py-3 px-4">Assigned Subdomain</th>
                  <th className="py-3 px-4">Niche & Template</th>
                  <th className="py-3 px-4">Subscription</th>
                  <th className="py-3 px-4">Hosting Status</th>
                  <th className="py-3 px-4">Resource Limits</th>
                  <th className="py-3 px-4">Next Billing</th>
                  <th className="py-3 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {subscribedWebsites
                  .filter(
                    (s) =>
                      s.businessName.toLowerCase().includes(websiteSearch.toLowerCase()) ||
                      s.ownerName.toLowerCase().includes(websiteSearch.toLowerCase()) ||
                      s.subdomain.toLowerCase().includes(websiteSearch.toLowerCase())
                  )
                  .map((site) => {
                    const isGrace = site.subscriptionStatus === 'grace_period';
                    const isSuspended = site.subscriptionStatus === 'suspended';

                    return (
                      <tr key={site.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-white block">{site.businessName}</span>
                          <span className="text-[11px] text-slate-400">
                            {site.ownerName} • {site.phone}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400 font-bold">{site.fullDomainUrl}</span>
                            <button
                              onClick={() => setPreviewingWebsite(site)}
                              className="text-slate-400 hover:text-white"
                              title="Preview website"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          <span className="font-medium block capitalize">{site.nicheLabel}</span>
                          <span className="text-[11px] text-slate-400">{site.templateName}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              site.subscriptionStatus === 'active'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : isGrace
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {site.subscriptionStatus.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              site.deploymentStatus === 'live'
                                ? 'bg-blue-950 text-blue-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {site.deploymentStatus.toUpperCase()}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          <div>Pages: {site.resourceUsage.pagesCount}/{site.resourceUsage.pagesLimit}</div>
                          <div className="text-slate-400">
                            Storage: {site.resourceUsage.storageUsedMb}MB / {site.resourceUsage.storageLimitMb}MB
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          <div>{site.nextBillingDate}</div>
                          {site.gracePeriodEndsAt && (
                            <span className="text-amber-400 text-[10px] block">
                              Grace ends: {site.gracePeriodEndsAt}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewingWebsite(site)}
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title="Live website preview"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </button>

                            {isSuspended ? (
                              <button
                                onClick={() => reactivateSubscribedWebsite(site.id)}
                                className="px-2.5 py-1 rounded-md bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Reactivate website"
                              >
                                <PlayCircle className="w-3 h-3" />
                                <span>Activate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => suspendSubscribedWebsite(site.id, 'Administrative suspension')}
                                className="px-2.5 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800 text-amber-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Suspend website"
                              >
                                <PauseCircle className="w-3 h-3" />
                                <span>Suspend</span>
                              </button>
                            )}

                            <button
                              onClick={() => renewSubscribedWebsite(site.id)}
                              className="px-2.5 py-1 rounded-md bg-blue-900/60 hover:bg-blue-800 text-blue-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
                              title="Extend subscription 30 days"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Renew</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 1: Website Requests Triage Pipeline */}
      {activeAdminTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-72 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                placeholder="Search requests by business or tier..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-hidden text-xs"
              />
            </div>
            <span className="text-xs text-slate-400">
              Change status dropdown directly to advance project pipeline.
            </span>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Business & Client</th>
                  <th className="py-3 px-4">Type / Scope</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4">Admin Status Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white block">{req.businessName}</span>
                      <span className="text-[11px] text-slate-400">
                        {req.contactName} ({req.phone})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="font-medium block">{req.desiredType}</span>
                      <span className="text-[10px] text-slate-500 line-clamp-1">{req.description}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {req.budgetTier}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {req.createdAt}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={req.status}
                        onChange={(e) => updateWebsiteRequestStatus(req.id, e.target.value as any)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border bg-slate-950 focus:outline-hidden ${
                          req.status === 'Completed'
                            ? 'border-emerald-600 text-emerald-400'
                            : req.status === 'In Progress'
                            ? 'border-blue-600 text-blue-400'
                            : req.status === 'Reviewing'
                            ? 'border-amber-600 text-amber-400'
                            : 'border-slate-700 text-slate-300'
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Reviewing">Reviewing</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Tenants Table */}
      {activeAdminTab === 'tenants' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
              <tr>
                <th className="py-3 px-4">Store Brand</th>
                <th className="py-3 px-4">Contact Phone</th>
                <th className="py-3 px-4">Store Category</th>
                <th className="py-3 px-4 text-right">Currency</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No registered merchant tenant stores found.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {s.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {s.phone || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {s.category}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums">
                      {s.currency}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Active
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-[11px] font-mono">
                      {s.createdAt}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Transactions */}
      {activeAdminTab === 'transactions' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Subscription Description</th>
                <th className="py-3 px-4 text-right">Amount (৳)</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No billing transactions recorded yet.
                  </td>
                </tr>
              ) : (
                invoices.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-blue-400 font-bold">{tx.invoiceNumber}</td>
                    <td className="py-3.5 px-4 font-sans text-white font-medium">{tx.planName}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-white tabular-nums">৳{tx.amount.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-slate-300 font-sans">Automated Billing</td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">{tx.date}</td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: Admin Plan Settings & Limits Editor (No-Code Config) */}
      <Modal
        isOpen={isPlanSettingsModalOpen}
        onClose={() => setIsPlanSettingsModalOpen(false)}
        title="Website Subscription Plan Configuration"
        description="Configure pricing, resource limits, renewal grace periods, and visibility without writing code."
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateWebsiteSubscriptionPlanConfig({
              priceMonthly: Number(planPrice),
              isVisible: planIsVisible,
              limits: {
                maxPages: Number(planMaxPages),
                maxStorageMb: Number(planMaxStorage),
                maxBandwidthGb: Number(planMaxBandwidth),
                monthlyUpdateRequests: Number(planMaxUpdates),
                gracePeriodDays: Number(planGraceDays),
              },
            });
            setIsPlanSettingsModalOpen(false);
          }}
          className="space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Monthly Subscription Fee (BDT ৳) *
              </label>
              <input
                type="number"
                min={100}
                required
                value={planPrice}
                onChange={(e) => setPlanPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Standard default: ৳600 / month
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Grace Period Policy (Days) *
              </label>
              <input
                type="number"
                min={1}
                max={30}
                required
                value={planGraceDays}
                onChange={(e) => setPlanGraceDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Site stays live and data preserved during grace window.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Max Pages Limit
              </label>
              <input
                type="number"
                min={1}
                value={planMaxPages}
                onChange={(e) => setPlanMaxPages(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Storage Limit (MB)
              </label>
              <input
                type="number"
                min={100}
                value={planMaxStorage}
                onChange={(e) => setPlanMaxStorage(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bandwidth (GB)
              </label>
              <input
                type="number"
                min={5}
                value={planMaxBandwidth}
                onChange={(e) => setPlanMaxBandwidth(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Monthly Updates
              </label>
              <input
                type="number"
                min={0}
                value={planMaxUpdates}
                onChange={(e) => setPlanMaxUpdates(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planIsVisible}
                onChange={(e) => setPlanIsVisible(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Plan Visible in Public Pricing Page & Store Dashboard
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsPlanSettingsModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Admin Website Live Preview */}
      {previewingWebsite && (
        <Modal
          isOpen={!!previewingWebsite}
          onClose={() => setPreviewingWebsite(null)}
          title={`Website Preview: ${previewingWebsite.businessName}`}
          description={`Assigned Subdomain: ${previewingWebsite.fullDomainUrl} • Status: ${previewingWebsite.subscriptionStatus.toUpperCase()}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">
                https://{previewingWebsite.fullDomainUrl}
              </span>
              <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  onClick={() => setAdminPreviewDevice('desktop')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                    adminPreviewDevice === 'desktop'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => setAdminPreviewDevice('mobile')}
                  className={`px-3 py-1 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                    adminPreviewDevice === 'mobile'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-200/50 dark:bg-slate-950/50 rounded-2xl border border-slate-300 dark:border-slate-800 flex justify-center max-h-[600px] overflow-y-auto">
              <WebsitePreviewRenderer site={previewingWebsite} viewMode={adminPreviewDevice} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewingWebsite(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
