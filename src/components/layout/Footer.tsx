import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Shield, Sparkles, Mail, Phone, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Column 1: Brand & Identity */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-wider">
                GA
              </span>
              <span className="text-xl font-bold tracking-tight text-white">GoAMAAS</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm leading-relaxed">
              The all-in-one business growth and retail operations platform engineered by AMAAS. Streamlining orders, inventory, landing pages, and AI automations for forward-thinking merchants.
            </p>
            <div className="pt-2 flex flex-col gap-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Gulshan Commercial Area, Dhaka 1212, Bangladesh</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>official.amaas.dev@gmail.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>+880 1711-000000 / Hotline</span>
              </div>
            </div>
          </div>

          {/* Column 2: Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">Platform</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/features" className="hover:text-white transition-colors">Multi-Channel Orders</Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">Smart Inventory</Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">Landing Page Builder</Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">AI Automation Center</Link>
              </li>
              <li>
                <Link to="/features" className="hover:text-white transition-colors">Courier API Integrations</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Solutions & Services */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">Services & Plans</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">Dashboard Plans (from ৳299)</Link>
              </li>
              <li>
                <Link to="/solutions" className="hover:text-white transition-colors">Website Services (from ৳8,000)</Link>
              </li>
              <li>
                <Link to="/solutions" className="hover:text-white transition-colors">1st Year Free Domain & Hosting</Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">Omnichannel AI Bots</Link>
              </li>
              <li>
                <Link to="/solutions" className="hover:text-white transition-colors">Enterprise B2B Wholesale</Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Company & Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">Company</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/about" className="hover:text-white transition-colors">About AMAAS</Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">Contact Engineers</Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">Merchant Portal</Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">7-Day Free Trial</Link>
              </li>
              <li>
                <span className="text-slate-500 text-[11px] block pt-1">
                  Demo Experience · No live database required
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} AMAAS Technologies Ltd. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Enterprise Grade Security</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Bangladesh & Global SME Ready</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
