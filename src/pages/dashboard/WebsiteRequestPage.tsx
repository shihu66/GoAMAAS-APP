import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WebsiteRequest } from '../../types';
import {
  Globe2,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  Eye,
  FileText,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

export const WebsiteRequestPage: React.FC = () => {
  const { websiteRequests, addWebsiteRequest, user, activeStore } = useApp();

  const [activeTab, setActiveTab] = useState<'requestForm' | 'myRequests'>('requestForm');
  const [selectedRequest, setSelectedRequest] = useState<WebsiteRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Form State
  const [businessName, setBusinessName] = useState(activeStore?.name || '');
  const [businessCategory, setBusinessCategory] = useState(activeStore?.category || 'Fashion & Apparel');
  const [desiredType, setDesiredType] = useState<WebsiteRequest['desiredType']>('E-Commerce Store');
  const [budgetTier, setBudgetTier] = useState<WebsiteRequest['budgetTier']>('Starter Website (৳8,000)');
  const [contactName, setContactName] = useState(user?.name || '');
  const [phone, setPhone] = useState(activeStore?.phone || '+880 17');
  const [email, setEmail] = useState(user?.email || '');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState<string[]>([
    'bKash / Nagad Instant Checkout',
    'Steadfast / Pathao Courier API',
    'WhatsApp Chat Floating Button',
  ]);

  const availableFeatures = [
    'bKash / Nagad Instant Checkout',
    'Steadfast / Pathao Courier API',
    'WhatsApp Chat Floating Button',
    'Customer Review & Rating System',
    'Multi-Variant Sizing Selector',
    'Facebook Pixel & Catalog Sync',
    'Customer Login & Order History',
    'Automated PDF Invoice Generation',
  ];

  const handleToggleFeature = (feat: string) => {
    if (features.includes(feat)) {
      setFeatures(features.filter((f) => f !== feat));
    } else {
      setFeatures([...features, feat]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addWebsiteRequest({
      businessName,
      businessCategory,
      desiredType,
      requiredFeatures: features,
      budgetTier,
      contactName,
      phone,
      email,
      description,
      domainIncluded: true,
    });
    setActiveTab('myRequests');
  };

  return (
    <div className="space-y-6">
      {/* Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Custom Website Engineering Requests
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Let the AMAAS development studio engineer your bespoke online store. Free domain and hosting included.
          </p>
        </div>

        <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('requestForm')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'requestForm'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Request</span>
          </button>
          <button
            onClick={() => setActiveTab('myRequests')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'myRequests'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>My Requests ({websiteRequests.length})</span>
          </button>
        </div>
      </div>

      {/* Free Domain & Hosting Guarantee Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 text-white border border-blue-800 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">1st Year Domain & High-Speed Hosting Free</h3>
            <p className="text-xs text-slate-300">
              All AMAAS web development packages (starting at ৳8,000) include top-level domain registration (.com) and dedicated cloud SSD hosting at zero extra charge.
            </p>
          </div>
        </div>
      </div>

      {/* VIEW 1: Requirements Submission Form */}
      {activeTab === 'requestForm' ? (
        <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-6 text-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Website Project Specifications
              </h2>
              <p className="text-slate-500">
                Provide your requirements so our engineering leads can assemble your project timeline and quotation.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Brand / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Industry / Category *
                </label>
                <input
                  type="text"
                  required
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  placeholder="e.g. Leather Crafts, Fashion, Electronics"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Desired Website Architecture *
                </label>
                <select
                  value={desiredType}
                  onChange={(e) => setDesiredType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="E-Commerce Store">E-Commerce Store (Cart + Checkout)</option>
                  <option value="Corporate Showcase">Corporate Showcase & Portfolio</option>
                  <option value="Wholesale B2B">Wholesale B2B with Bulk Pricing</option>
                  <option value="Custom Web App">Custom Tailored Web Application</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Budget Package Tier *
                </label>
                <select
                  value={budgetTier}
                  onChange={(e) => setBudgetTier(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Starter Website (৳8,000)">Starter Website (৳8,000) — Domain + Hosting Free</option>
                  <option value="Business Website (৳15,000)">Business Website (৳15,000) — Domain + Hosting Free (Most Popular)</option>
                  <option value="Advanced Website (৳25,000)">Advanced Website (৳25,000) — Domain + Hosting Free</option>
                </select>
              </div>
            </div>

            {/* Checkbox Feature Selector */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Required Core Integrations & Features:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableFeatures.map((feat) => {
                  const isChecked = features.includes(feat);
                  return (
                    <label
                      key={feat}
                      onClick={() => handleToggleFeature(feat)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="text-blue-600 rounded"
                      />
                      <span>{feat}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Person *
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact Phone / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Scope, Requirements & Reference Websites *
              </label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share any design inspiration, specific product categories, or deadline requirements..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-400">
                AMAAS development studio will review and respond within 24 hours.
              </span>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Website Request</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* VIEW 2: My Submitted Requests */
        <div className="space-y-4">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tracked Website Projects
              </h3>
              <p className="text-xs text-slate-500">Live progress tracking from AMAAS engineering team</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Business / Category</th>
                    <th className="py-3 px-4">Architecture</th>
                    <th className="py-3 px-4">Package</th>
                    <th className="py-3 px-4">Submitted</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">View Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {websiteRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          {req.businessName}
                        </span>
                        <span className="text-[10px] text-slate-400">{req.businessCategory}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {req.desiredType}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        {req.budgetTier}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {req.createdAt}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            req.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : req.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : req.status === 'Reviewing'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Project Brief — ${selectedRequest.businessName}`}
          description={`Status: ${selectedRequest.status} · Submitted on ${selectedRequest.createdAt}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Website Architecture:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedRequest.desiredType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Budget Tier:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedRequest.budgetTier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Domain & Cloud Hosting:</span>
                <span className="font-semibold text-emerald-600">1st Year Included Free</span>
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-1">
                Requested Integrations:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedRequest.requiredFeatures.map((f, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-1">
                Project Scope Notes:
              </span>
              <p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 leading-relaxed">
                {selectedRequest.description}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
