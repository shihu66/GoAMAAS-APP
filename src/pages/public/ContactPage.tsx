import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { Reveal } from '../../components/ui/MotionPrimitives';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, Globe, ExternalLink } from 'lucide-react';

const OFFICIAL_MAPS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Fulbarigate,+KUET-9203,+Khulna,+Bangladesh';

export const ContactPage: React.FC = () => {
  const { showToast } = useApp();
  const { t } = useLanguage();
  const cp = t.contactPage;

  usePageSeo({
    title: cp.seoTitle,
    description: cp.seoDescription,
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      showToast(cp.toastRequired, 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      showToast(cp.toastDelivered, 'success');
    }, 500);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <section className="relative pt-14 pb-16 sm:pt-20 sm:pb-20 border-b border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,#000_50%,transparent_100%)]"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Reveal y={12}>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {cp.eyebrow}
              </p>
            </Reveal>
            <Reveal delay={0.05} y={16}>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.12] text-balance">
                {cp.title}
              </h1>
            </Reveal>
            <Reveal delay={0.1} y={16}>
              <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {cp.subtitle}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Contact Workspace Split */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* Direct Contact Channels */}
            <Reveal className="lg:col-span-5" y={16}>
              <div className="p-7 sm:p-9 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-6">
                <h2 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white">
                  {cp.directChannels}
                </h2>

                <div className="space-y-5 text-xs sm:text-sm">
                  <div className="flex items-start gap-3.5">
                    <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                    <div className="space-y-1">
                      <strong className="text-slate-950 dark:text-white block font-semibold">
                        {cp.headOffice}
                      </strong>
                      <span className="text-slate-600 dark:text-slate-400 leading-relaxed block">
                        {cp.headOfficeVal}
                      </span>
                      <a
                        href={OFFICIAL_MAPS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>{cp.directionsLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                    <div>
                      <strong className="text-slate-950 dark:text-white block font-semibold">
                        {cp.hotlineLabel}
                      </strong>
                      <a
                        href="tel:+8801605012812"
                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-mono transition-colors"
                      >
                        {cp.hotlineVal}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                    <div>
                      <strong className="text-slate-950 dark:text-white block font-semibold">
                        {cp.engSales}
                      </strong>
                      <a
                        href="mailto:official.amaas.dev@gmail.com"
                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-mono transition-colors"
                      >
                        official.amaas.dev@gmail.com
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                    <div>
                      <strong className="text-slate-950 dark:text-white block font-semibold">
                        {cp.officialWebsiteLabel}
                      </strong>
                      <a
                        href="https://amaas.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-mono transition-colors"
                      >
                        https://amaas.xyz
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
                    <div>
                      <strong className="text-slate-950 dark:text-white block font-semibold">
                        {cp.techSupport}
                      </strong>
                      <span className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {cp.techSupportVal}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {cp.customWebPromptPrefix}
                    <Link
                      to="/dashboard/website-requests"
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      {cp.customWebPromptLink}
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Validated Inquiry Form */}
            <Reveal className="lg:col-span-7" delay={0.08} y={18}>
              <div className="p-7 sm:p-9 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800">
                {submitted ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                      {cp.receivedTitle}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                      {cp.receivedBody(formData.name, formData.email)}
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSubmitted(false);
                          setFormData({
                            name: '',
                            email: '',
                            phone: '',
                            subject: 'General Inquiry',
                            message: '',
                          });
                        }}
                        className="min-h-[44px] px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors cursor-pointer"
                      >
                        {cp.sendAnother}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <h2 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white">
                      {cp.formTitle}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {cp.fullName}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={cp.fullNamePlaceholder}
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {cp.businessEmail}
                        </label>
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="merchant@yourbrand.com"
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {cp.phoneWhatsapp}
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+880 1700-000000"
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {cp.topic}
                        </label>
                        <select
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        >
                          {cp.topics.map((tp) => (
                            <option key={tp.value} value={tp.value}>
                              {tp.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        {cp.message}
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        placeholder={cp.messagePlaceholder}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 leading-relaxed"
                      />
                    </div>

                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={loading}
                        className="min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      >
                        <Send className="w-4 h-4" />
                        <span>{loading ? cp.sending : cp.sendMessage}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
};
