import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shirt,
  Smartphone,
  Apple,
  TrendingUp,
  Building2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { ASSETS } from '../../assets/images';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { Reveal, StaggerGroup, StaggerItem } from '../../components/ui/MotionPrimitives';

const INDUSTRY_ICONS = [Shirt, Smartphone, Apple, TrendingUp, Building2];

export const SolutionsPage: React.FC = () => {
  const { t } = useLanguage();
  const sp = t.solutionsPage;

  usePageSeo({
    title: sp.seoTitle,
    description: sp.seoDescription,
  });

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
                {sp.eyebrow}
              </p>
            </Reveal>
            <Reveal delay={0.05} y={16}>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.12] text-balance">
                {sp.title}
              </h1>
            </Reveal>
            <Reveal delay={0.1} y={16}>
              <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {sp.subtitle}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Industry Verticals Bento */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
            {sp.industries.map((ind, idx) => {
              const Icon = INDUSTRY_ICONS[idx % INDUSTRY_ICONS.length];
              const colSpan = idx < 2 ? 'lg:col-span-6' : 'lg:col-span-4';
              const numLabel = String(idx + 1).padStart(2, '0');

              return (
                <StaggerItem key={idx} className={colSpan}>
                  <article className="h-full p-7 sm:p-8 rounded-2xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between gap-6 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                          {numLabel}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h2 className="text-lg sm:text-xl font-bold text-slate-950 dark:text-white tracking-tight text-balance">
                          {ind.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ind.tagline}
                        </p>
                      </div>
                    </div>

                    <ul className="pt-5 border-t border-slate-200/70 dark:border-slate-800/80 space-y-2.5">
                      {ind.points.map((pt, pIdx) => (
                        <li
                          key={pIdx}
                          className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 leading-snug"
                        >
                          <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </StaggerItem>
              );
            })}
          </StaggerGroup>

          {/* Bespoke Engineering Studio Split */}
          <Reveal y={18}>
            <div className="rounded-2xl bg-slate-950 dark:bg-slate-900 text-white border border-slate-800 overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center space-y-5">
                <p className="text-xs font-semibold text-blue-400">
                  {sp.bannerBadge}
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
                  {sp.bannerTitle}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                  {sp.bannerDesc}
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <Link
                    to="/dashboard/website-requests"
                    className="min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap group"
                  >
                    <span>{sp.bannerPrimaryCta}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link
                    to="/pricing"
                    className="min-h-[46px] inline-flex items-center justify-center px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 transition-colors whitespace-nowrap"
                  >
                    {sp.bannerSecondaryCta}
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5 relative min-h-[260px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800">
                <img
                  src={ASSETS.storePreview}
                  alt="GoAMAAS custom website engineering showcase"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
};
