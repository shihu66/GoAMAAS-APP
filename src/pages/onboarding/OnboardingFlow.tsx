import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  Check,
  Building,
  Tag,
  Package,
  Target,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export const OnboardingFlow: React.FC = () => {
  const { onboarding, updateOnboarding, completeOnboarding, activeStore, updateActiveStore } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: onboarding.businessName || activeStore?.name || '',
    businessType: onboarding.businessType || 'Retail & E-Commerce Store',
    category: onboarding.category || 'Fashion & Apparel',
    phone: onboarding.phone || '',
    city: onboarding.city || '',
    productsOffered: onboarding.productsOffered || '',
    primaryGoal: onboarding.primaryGoal || 'Automate courier delivery creation with Steadfast & Pathao',
  });

  const businessTypes = [
    'Retail & E-Commerce Store',
    'Facebook / Instagram Commerce (F-Commerce)',
    'Wholesale B2B & Distribution',
    'Custom Manufacturing & Export',
    'Service & Consulting',
  ];

  const categories = [
    'Fashion & Apparel',
    'Electronics & Gadgets',
    'Beauty & Cosmetics',
    'Organic Foods & Groceries',
    'Home Decor & Furniture',
    'Handicrafts & Artisanal Goods',
  ];

  const goals = [
    'Automate courier delivery creation with Steadfast & Pathao',
    'Deploy 24/7 AI chatbots on WhatsApp & Messenger',
    'Launch high-converting landing pages for flash drops',
    'Prevent stockouts and track real-time inventory',
    'Get a custom modern e-commerce website built by AMAAS',
  ];

  const handleNext = () => {
    updateOnboarding(formData);
    if (step < 5) {
      setStep(step + 1);
    } else {
      updateActiveStore({
        name: formData.businessName,
        category: formData.category,
        phone: formData.phone,
      });
      completeOnboarding();
      navigate('/dashboard');
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="max-w-2xl mx-auto w-full space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Store Onboarding Wizard (Step {step} of 5)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Configure Your GoAMAAS Engine
          </h1>
          <p className="text-xs text-slate-500">
            Tell us about your operations so we can customize your workspace.
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 -z-0" />
          {[1, 2, 3, 4, 5].map((s) => {
            const isCompleted = step > s;
            const isCurrent = step === s;
            return (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : s}
              </div>
            );
          })}
        </div>

        {/* Card Content */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          {/* STEP 1: Business Name & Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 1: Business Name & Model
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  What is the commercial name of your brand?
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Brand / Store Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="e.g. Apex Lifestyle BD"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Business Operating Model *
                </label>
                <div className="space-y-2">
                  {businessTypes.map((type) => (
                    <label
                      key={type}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                        formData.businessType === type
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="businessType"
                        value={type}
                        checked={formData.businessType === type}
                        onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                        className="text-blue-600"
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Category & Contact */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 2: Category & Contact Details
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Helps our automated system select the right units and tax brackets.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Primary Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Official Phone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+880 1711-000000"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Base City / District *
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Dhaka, Chittagong, Sylhet"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Products / Services Offered */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 3: Products & Services
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provide a brief summary of what items you manufacture or sell.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Product Line Overview *
                </label>
                <textarea
                  rows={4}
                  value={formData.productsOffered}
                  onChange={(e) => setFormData({ ...formData, productsOffered: e.target.value })}
                  placeholder="e.g. Premium men casual shirts, formal trousers, genuine leather belts, and watches."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300">
                You can import items in bulk via Excel or add them individually once inside the Products workspace.
              </div>
            </div>
          )}

          {/* STEP 4: Business Goals */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 4: Primary Growth Goal
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select your top priority for the next 90 days.
                </p>
              </div>

              <div className="space-y-2">
                {goals.map((g) => (
                  <label
                    key={g}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                      formData.primaryGoal === g
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="primaryGoal"
                      value={g}
                      checked={formData.primaryGoal === g}
                      onChange={(e) => setFormData({ ...formData, primaryGoal: e.target.value })}
                      className="text-blue-600 mt-0.5"
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: Review & Finish */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Step 5: Review & Launch Workspace
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Please confirm your store details before entering the dashboard.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Business Name:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formData.businessName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Operating Model:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formData.businessType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formData.category}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Contact / City:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formData.phone} ({formData.city})</span>
                </div>
                <div className="py-1">
                  <span className="text-slate-500 block mb-1">Primary Growth Goal:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{formData.primaryGoal}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>7-Day Free Trial Activated · Sample demo catalog and orders are pre-loaded.</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-6 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <span>{step === 5 ? 'Finish & Launch Dashboard' : 'Next Step'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
