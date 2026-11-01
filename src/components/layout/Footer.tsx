import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Globe, Shield, Mail, Phone, MapPin, ExternalLink } from 'lucide-react';

const OFFICIAL_MAPS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Fulbarigate,+KUET-9203,+Khulna,+Bangladesh';

export const Footer: React.FC = () => {
  const { t } = useLanguage();
  const f = t.footer;

  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
          {/* Brand & Official Business Column */}
          <div className="lg:col-span-2 space-y-5">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm tracking-wider">
                GA
              </span>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-bold tracking-tight text-white">GoAMAAS</span>
                <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                  {f.businessName}
                </span>
              </div>
            </Link>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm leading-relaxed">
              {f.tagline}
            </p>
            <div className="pt-1 flex flex-col gap-2.5 text-xs text-slate-400">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="block text-slate-300">{f.location}</span>
                  <a
                    href={OFFICIAL_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <span>{f.directionsLabel}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <a
                  href={`tel:${f.mobile}`}
                  className="font-mono hover:text-white transition-colors"
                >
                  {f.hotline}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <a
                  href="mailto:official.amaas.dev@gmail.com"
                  className="font-mono hover:text-white transition-colors"
                >
                  official.amaas.dev@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <a
                  href={f.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:text-white transition-colors"
                >
                  {f.website}
                </a>
              </div>
            </div>
          </div>

          {/* Platform Column */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-white tracking-wider uppercase">
              {f.colPlatform}
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link to="/create-website" className="hover:text-white transition-colors">
                  {f.links.websiteBuilder}
                </Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">
                  {f.links.orders}
                </Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">
                  {f.links.inventory}
                </Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">
                  {f.links.courier}
                </Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">
                  {f.links.automations}
                </Link>
              </li>
            </ul>
          </div>

          {/* Plans & Services Column */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-white tracking-wider uppercase">
              {f.colServices}
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link to="/create-website" className="hover:text-white transition-colors">
                  {f.links.websitePlan}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  {f.links.dashboardPlans}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  {f.links.customWeb}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  {f.links.aiPackages}
                </Link>
              </li>
              <li>
                <Link to="/solutions" className="hover:text-white transition-colors">
                  {f.links.industrySolutions}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-white tracking-wider uppercase">
              {f.colCompany}
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  {f.links.about}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  {f.links.contact}
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  {f.links.merchantLogin}
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">
                  {f.links.freeTrial}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Subdomain & Custom Domain Transparency Strip */}
        <div className="mt-12 pt-6 border-t border-slate-800/80 text-[11px] text-slate-500">
          {f.subdomainNote}
        </div>

        {/* Bottom Copyright & Architecture Strip */}
        <div className="mt-6 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} {f.copyright}
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{f.badgeSecurity}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{f.badgeBangladesh}</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
