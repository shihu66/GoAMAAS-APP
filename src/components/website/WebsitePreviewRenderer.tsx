import React from 'react';
import { SubscribedWebsite } from '../../types';
import {
  Globe,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  Clock,
  ExternalLink,
  CheckCircle2,
  ChevronRight,
  Shield,
  Sparkles,
} from 'lucide-react';

interface WebsitePreviewRendererProps {
  site: Partial<SubscribedWebsite>;
  viewMode?: 'desktop' | 'mobile';
  showGraceBanner?: boolean;
  isPublicView?: boolean;
}

export const WebsitePreviewRenderer: React.FC<WebsitePreviewRendererProps> = ({
  site,
  viewMode = 'desktop',
  showGraceBanner = false,
  isPublicView = false,
}) => {
  const [inquiryName, setInquiryName] = React.useState('');
  const [inquiryContact, setInquiryContact] = React.useState('');
  const [inquiryNote, setInquiryNote] = React.useState('');
  const brandColor = site.brandColor || '#2563EB';
  const businessName = site.businessName || 'Your Business Name';
  const headline = site.headline || 'Exceptional Products & Services Tailored for You';
  const subheadline =
    site.subheadline ||
    'Welcome to our official digital storefront. Explore our catalog and reach out on WhatsApp.';
  const aboutText =
    site.aboutText ||
    'We are a dedicated local business committed to delivering the highest quality products and personalized customer service.';
  const servicesOrProducts = site.servicesOrProducts || [];
  const phone = site.phone || '+880 1711-000000';
  const email = site.email || 'contact@yourbusiness.com';
  const address = site.address || 'Dhaka, Bangladesh';
  const whatsappNumber = site.whatsappNumber || phone;
  const subdomain = site.subdomain || 'yourbusiness';
  const fullDomainUrl = `${subdomain}.amaas.xyz`;

  const isSuspended = site.subscriptionStatus === 'suspended' || site.deploymentStatus === 'suspended';
  const isGracePeriod = site.subscriptionStatus === 'grace_period' || showGraceBanner;

  return (
    <div
      className={`mx-auto bg-white text-slate-900 overflow-hidden transition-all duration-300 ${
        isPublicView
          ? 'w-full min-h-screen rounded-none border-0 shadow-none'
          : viewMode === 'mobile'
          ? 'max-w-sm rounded-[36px] border-8 border-slate-900 shadow-2xl my-6'
          : 'w-full max-w-5xl rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl my-4'
      }`}
    >
      {/* Browser Chrome Simulation Header */}
      {!isPublicView && (
      <div className="bg-slate-900 text-slate-300 px-4 py-2.5 flex items-center justify-between border-b border-slate-800 text-xs select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800/80 text-[11px] font-mono text-slate-300 max-w-xs truncate">
          <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-emerald-400">https://</span>
          <span className="font-semibold text-white">{fullDomainUrl}</span>
          <span className="text-[10px] px-1 rounded bg-blue-900/60 text-blue-300 ml-1">SSL</span>
        </div>

        <div className="text-[10px] text-slate-400 font-medium">
          {viewMode === 'mobile' ? 'Mobile View' : 'Desktop 1080p'}
        </div>
      </div>
      )}

      {/* Grace Period Notification Banner */}
      {isGracePeriod && !isSuspended && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2">
          <span>⚠️ Notice: Subscription renewal is pending. Website remains live under grace period policy.</span>
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
            This business website ({fullDomainUrl}) is currently inactive pending subscription renewal. Customer data and settings are safely preserved.
          </p>
          <div className="text-[11px] text-slate-400 font-mono">
            Powered by GoAMAAS Managed Hosting
          </div>
        </div>
      ) : (
        /* Actual Rendered Website Body */
        <div className="font-sans antialiased text-slate-800">
          {/* Top Bar */}
          <header className="border-b border-slate-100 bg-white sticky top-0 z-10 shadow-xs">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-xs"
                  style={{ backgroundColor: brandColor }}
                >
                  {businessName.charAt(0)}
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-none">
                    {businessName}
                  </h1>
                  <span className="text-[10px] text-slate-400 font-medium capitalize">
                    {site.nicheLabel || site.niche || 'Business'}
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-5 text-xs font-medium text-slate-600">
                <a href="#about" className="hover:text-slate-900">About</a>
                <a href="#services" className="hover:text-slate-900">Catalog / Services</a>
                <a href="#contact" className="hover:text-slate-900">Contact</a>
              </div>

              <a
                href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
                style={{ backgroundColor: brandColor }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </header>

          {/* Hero Section */}
          <section
            className="py-12 sm:py-16 px-4 sm:px-6 text-center text-white relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${brandColor} 0%, #0F172A 100%)`,
            }}
          >
            <div className="max-w-3xl mx-auto space-y-4 relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-white text-[11px] font-semibold border border-white/20">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Official Business Storefront</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                {headline}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 max-w-xl mx-auto leading-relaxed">
                {subheadline}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 rounded-lg bg-white text-slate-900 font-bold text-xs shadow-md hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Chat on WhatsApp</span>
                </a>
                <a
                  href="#services"
                  className="px-5 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium text-xs border border-white/20 transition-colors"
                >
                  View Offerings
                </a>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section id="about" className="py-10 px-4 sm:px-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  About Our Company
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Passionate About Quality, Built for Our Community
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {aboutText}
                </p>
                <div className="pt-2 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Verified local business identity & fast customer response</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Custom orders and bulk inquiry consultations available</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Quick Business Overview
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                    <span className="text-slate-400">Business Category</span>
                    <span className="font-semibold text-slate-800 capitalize">{site.nicheLabel || site.niche || 'Commercial'}</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                    <span className="text-slate-400">Location</span>
                    <span className="font-semibold text-slate-800">{address}</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                    <span className="text-slate-400">Support Hours</span>
                    <span className="font-semibold text-slate-800">10:00 AM – 9:00 PM (Daily)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Online Verification</span>
                    <span className="font-semibold text-emerald-600 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" /> Active Verified
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Offerings / Catalog Section */}
          <section id="services" className="py-10 px-4 sm:px-6 bg-slate-50/70 border-t border-slate-200">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="text-center space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Catalog & Services
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Featured Products & Services
                </h3>
                <p className="text-xs text-slate-500">
                  Click any item to inquire or reserve immediately via WhatsApp.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {servicesOrProducts.length > 0 ? (
                  servicesOrProducts.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-xs flex flex-col justify-between transition-all hover:-translate-y-0.5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-slate-900 leading-snug">
                            {item.name}
                          </h4>
                          {item.price && (
                            <span
                              className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono text-white shrink-0"
                              style={{ backgroundColor: brandColor }}
                            >
                              {item.price}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-600 font-semibold">Available</span>
                        <a
                          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(businessName)},%20I%20am%20interested%20in%20"${encodeURIComponent(item.name)}"`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold flex items-center gap-1 hover:underline"
                          style={{ color: brandColor }}
                        >
                          <span>Order / Inquire</span>
                          <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-6 text-xs text-slate-400">
                    No products or services listed yet.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Contact & Map Section */}
          <section id="contact" className="py-10 px-4 sm:px-6 max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Get in Touch
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Visit Us or Reach Out
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information & Inquiry Form */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-900">Direct Inquiries</h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{address}</span>
                  </div>
                </div>

                {/* Interactive / Simulated Inquiry Form */}
                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Your Name</label>
                    <input
                      type="text"
                      disabled={!isPublicView}
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Phone or WhatsApp</label>
                    <input
                      type="text"
                      disabled={!isPublicView}
                      value={inquiryContact}
                      onChange={(e) => setInquiryContact(e.target.value)}
                      placeholder="+880 17..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  {isPublicView ? (
                    <a
                      href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hello ${businessName}, I am contacting you from your website (${fullDomainUrl}).\nName: ${inquiryName || 'Visitor'}\nContact: ${inquiryContact || 'Not specified'}\nI would like to inquire about your products.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 rounded-lg text-white font-semibold text-xs shadow-xs transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: brandColor }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send Message on WhatsApp</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full py-2 rounded-lg text-white font-semibold text-xs shadow-xs opacity-90 cursor-not-allowed"
                      style={{ backgroundColor: brandColor }}
                    >
                      Submit Inquiry (Live on {fullDomainUrl})
                    </button>
                  )}
                </div>
              </div>

              {/* Simulated Google Maps Card */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Google Maps Location</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    {address}
                  </p>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Coordinates verified via GoAMAAS Map Sync
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="bg-slate-900 text-slate-400 py-6 px-4 text-center text-[11px] border-t border-slate-800 space-y-2">
            <div>
              © {new Date().getFullYear()} {businessName}. All rights reserved.
            </div>
            <div className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
              <span>Hosted under AMAAS Network at</span>
              <span className="text-blue-400 font-mono">{fullDomainUrl}</span>
            </div>
          </footer>
          {/* Floating WhatsApp Action Button for Public Visitors */}
          {isPublicView && (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `Hello ${businessName}, I am browsing your online store at ${fullDomainUrl}!`
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
