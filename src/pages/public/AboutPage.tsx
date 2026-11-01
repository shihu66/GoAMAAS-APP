import React from 'react';
import { Link } from 'react-router-dom';
import { ASSETS } from '../../assets/images';
import { Shield, Zap, Award, ArrowRight, MapPin, ExternalLink } from 'lucide-react';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { Reveal, StaggerGroup, StaggerItem } from '../../components/ui/MotionPrimitives';

const VALUE_ICONS = [Zap, Shield, Award];
const OFFICIAL_MAPS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Fulbarigate,+KUET-9203,+Khulna,+Bangladesh';

export const AboutPage: React.FC = () => {
  const { t } = useLanguage();
  const ap = t.aboutPage;

  usePageSeo({
    title: ap.seoTitle,
    description: ap.seoDescription,
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Editorial Hero */}
      <section className="relative pt-14 pb-16 sm:pt-20 sm:pb-20 border-b border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,#000_50%,transparent_100%)]"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Reveal y={12}>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {ap.eyebrow}
              </p>
            </Reveal>
            <Reveal delay={0.05} y={16}>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.12] text-balance">
                {ap.title}
              </h1>
            </Reveal>
            <Reveal delay={0.1} y={16}>
              <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {ap.subtitle}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Mission & Founder Split */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <Reveal className="lg:col-span-7 flex flex-col justify-center space-y-6" y={16}>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white tracking-tight text-balance">
                {ap.storyTitle}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {ap.storyP1}
              </p>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {ap.storyP2}
              </p>

              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200/80 dark:border-slate-800">
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                    {ap.stat1Val}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {ap.stat1Label}
                  </p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">
                    {ap.stat2Val}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {ap.stat2Label}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal className="lg:col-span-5" delay={0.08} y={18}>
              <div className="h-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-8 sm:p-10 flex flex-col justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                    <img
                      src={ASSETS.avatarFounder}
                      alt="Tanvir Hossain — Founder & Chief Architect at AMAAS Technologies"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-950 dark:text-white truncate">
                      Tanvir Hossain
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {ap.founderRole}
                    </p>
                    <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                      official.amaas.dev@gmail.com
                    </p>
                  </div>
                </div>

                <blockquote className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pt-6 border-t border-slate-200/80 dark:border-slate-800">
                  {ap.founderQuote}
                </blockquote>
              </div>
            </Reveal>
          </div>

          {/* Core Operating Principles */}
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ap.values.map((val, idx) => {
              const Icon = VALUE_ICONS[idx % VALUE_ICONS.length];
              return (
                <StaggerItem key={idx}>
                  <div className="h-full p-7 sm:p-8 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white tracking-tight">
                      {val.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {val.desc}
                    </p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGroup>

          {/* Khulna Headquarters Callout */}
          <Reveal y={16}>
            <div className="p-8 sm:p-10 rounded-2xl bg-slate-950 dark:bg-slate-900 text-white border border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {ap.hqTitle}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    {ap.hqSubtitle}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <a
                  href={OFFICIAL_MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap"
                >
                  <span>{ap.hqDirectionsCta}</span>
                  <ExternalLink className="w-4 h-4 text-blue-400" />
                </a>
                <Link
                  to="/contact"
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap group"
                >
                  <span>{ap.hqCta}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};
