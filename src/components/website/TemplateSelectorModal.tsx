import React, { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import {
  CURATED_WEBSITE_TEMPLATES,
  CuratedWebsiteTemplate,
} from '../../data/websiteTemplates';
import { useLanguage } from '../../context/LanguageContext';
import { CheckCircle2, Palette, Sparkles } from 'lucide-react';

interface TemplateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTemplateId?: string;
  businessName?: string;
  onSelectTemplate: (template: CuratedWebsiteTemplate) => void;
}

export const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  isOpen,
  onClose,
  activeTemplateId,
  businessName,
  onSelectTemplate,
}) => {
  const { lang } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(CURATED_WEBSITE_TEMPLATES.map((tpl) => tpl.categoryTag))
    );
    return ['All', ...unique];
  }, []);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'All') return CURATED_WEBSITE_TEMPLATES;
    return CURATED_WEBSITE_TEMPLATES.filter((t) => t.categoryTag === selectedCategory);
  }, [selectedCategory]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lang === 'bn' ? 'একটি ওয়েবসাইট ডিজাইন বেছে নিন' : 'Choose a Website Design'}
      description={
        lang === 'bn'
          ? 'যে কোনো ডিজাইনে ক্লিক করলে রঙ, ফন্ট এবং লেআউট সাথে সাথে আপডেট হবে। আপনার প্রোডাক্ট ও লেখা অক্ষত থাকবে।'
          : 'Pick a curated look for your storefront. Your logo, text, and products remain intact.'
      }
      maxWidth="4xl"
    >
      <div className="space-y-5">
        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat === 'All' && lang === 'bn' ? 'সবগুলো' : cat}
              </button>
            );
          })}
        </div>

        {/* Curated Visual Template Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => {
            const isCurrent = activeTemplateId === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between gap-3.5 transition-all ${
                  isCurrent
                    ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Live Mini Layout Preview */}
                  <div
                    className="h-28 rounded-xl border border-black/5 p-3 flex flex-col justify-between overflow-hidden"
                    style={{ backgroundColor: tpl.bgColor }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-md shrink-0"
                          style={{ backgroundColor: tpl.brandColor }}
                        />
                        <span
                          className="text-[11px] font-bold truncate"
                          style={{ color: tpl.textColor }}
                        >
                          {businessName?.trim() || 'Your Store'}
                        </span>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-white shrink-0"
                        style={{ backgroundColor: tpl.brandColor }}
                      >
                        {tpl.themeSettings.heroLayout || 'split'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-2">
                      {[1, 2, 3].map((slot) => (
                        <div
                          key={slot}
                          className="h-10 rounded-lg border border-black/5 bg-white/80 p-1.5 flex flex-col justify-end"
                        >
                          <span
                            className="block h-1.5 w-8 rounded-full opacity-80"
                            style={{ backgroundColor: tpl.brandColor }}
                          />
                          <span className="block h-1 w-5 rounded-full bg-slate-300 mt-1" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? tpl.nameBn : tpl.name}
                      </h4>
                      {isCurrent && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                      {lang === 'bn' ? tpl.categoryTagBn : tpl.categoryTag}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      {lang === 'bn' ? tpl.descriptionBn : tpl.description}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: tpl.brandColor }}
                      title="Primary color"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: tpl.bgColor }}
                      title="Background color"
                    />
                    <span className="text-[10px] font-mono text-slate-400 capitalize ml-1">
                      {tpl.themeSettings.fontStyle}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectTemplate(tpl);
                      onClose();
                    }}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-900 dark:bg-slate-800 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isCurrent
                        ? lang === 'bn'
                          ? 'পুনরায় প্রয়োগ করুন'
                          : 'Re-apply Design'
                        : lang === 'bn'
                        ? 'এই ডিজাইন ব্যবহার করুন'
                        : 'Use This Design'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-blue-600" />
            <span>
              {lang === 'bn'
                ? 'ডিজাইন সিলেক্ট করার পর আপনি যেকোনো রঙ বা লেখা বদলাতে পারবেন।'
                : 'You can still fine-tune colors, fonts, and sections after applying.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
          >
            {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
