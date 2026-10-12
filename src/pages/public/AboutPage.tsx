import React from 'react';
import { Link } from 'react-router-dom';
import { ASSETS } from '../../assets/images';
import {
  Shield,
  Zap,
  Globe2,
  Users,
  Target,
  Sparkles,
  ArrowRight,
  MapPin,
  Mail,
  Award,
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
            About AMAAS
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Engineering the Infrastructure for Emerging Commerce
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            AMAAS was founded with a singular conviction: merchant growth should not be constrained by broken tools, high delivery failure rates, or complicated software.
          </p>
        </div>

        {/* Mission & Story Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              From Local Retail Struggles to Unified Software
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              In 2024, our founders observed retail entrepreneurs in Bangladesh losing hours manually re-typing customer delivery addresses from Facebook chat into courier portals, calculating stock on physical notepads, and failing to recover shoppers who abandoned carts.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              We built <strong>GoAMAAS</strong> as a modern, high-speed unified SaaS platform designed specifically for local and regional commerce dynamics: Cash on Delivery (COD), bKash/Nagad mobile wallets, courier APIs (Steadfast, Pathao), and conversational social shopping.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-2xl font-black text-blue-600 font-mono tabular-nums">100%</p>
                <p className="text-xs text-slate-500 mt-1">Bootstrapped & Product-Driven</p>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">24 / 7</p>
                <p className="text-xs text-slate-500 mt-1">Dedicated Technical Support</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-900 p-8 space-y-6">
            <div className="flex items-center gap-4">
              <img
                src={ASSETS.avatarFounder}
                alt="AMAAS Technology Lead"
                className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500"
                referrerPolicy="no-referrer"
              />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Tanvir Hossain</h3>
                <p className="text-xs text-slate-500">Founder & Chief Architect, AMAAS</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">official.amaas.dev@gmail.com</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed">
              "We believe great software should not require a computer science degree to operate. Our goal with GoAMAAS is to give every merchant the operational superpowers previously reserved for multi-million dollar corporations."
            </p>
          </div>
        </div>

        {/* Core Values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Zero Clutter, Maximum Speed</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              We eliminate unnecessary clicks and complex nested forms. Your team can process 100 orders in under 3 minutes.
            </p>
          </div>

          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Data Privacy & Sovereignty</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your customer lists, transaction values, and product margins belong exclusively to you. We never resell merchant intelligence.
            </p>
          </div>

          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Continuous Innovation</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Weekly updates incorporating newest courier protocols, AI language models, and landing page conversion trends.
            </p>
          </div>
        </div>

        {/* Office & Contact */}
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Headquartered in Dhaka, Bangladesh</h3>
            <p className="text-xs text-slate-500">
              Gulshan Commercial Area, Dhaka 1212 · Serving merchants worldwide
            </p>
          </div>
          <Link
            to="/contact"
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0"
          >
            Get in Touch With Us
          </Link>
        </div>
      </div>
    </div>
  );
};
