import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Language, TRANSLATIONS, TranslationDictionary } from '../data/translations';

export const LANGUAGE_STORAGE_KEY = 'goamaas_lang';

interface LanguageContextValue {
  lang: Language;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function resolveInitialLanguage(storedValue?: string | null): Language {
  if (storedValue === 'bn') return 'bn';
  if (storedValue === 'en') return 'en';
  return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    try {
      return resolveInitialLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((next: Language) => {
    const normalized: Language = next === 'bn' ? 'bn' : 'en';
    setLangState(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage quota errors in restricted frames
      }
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'bn' : 'en');
  }, [lang, setLang]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isAdminRoute = path === '/admin' || path.startsWith('/admin/');
    document.documentElement.lang = isAdminRoute ? 'en' : lang;
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang,
      t: TRANSLATIONS[lang],
    }),
    [lang, setLang, toggleLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: 'en',
      setLang: () => {},
      toggleLang: () => {},
      t: TRANSLATIONS.en,
    };
  }
  return ctx;
}

export function usePageSeo(params: { title: string; description?: string }): void {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const p = window.location.pathname;
    if (p === '/admin' || p.startsWith('/admin/')) return;

    const canonicalUrl = `https://amaas.xyz${p === '/' ? '/' : p.replace(/\/+$/, '')}`;
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

    if (params.title) {
      document.title = params.title;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', params.title);
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.setAttribute('content', params.title);
    }

    if (params.description) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', params.description);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', params.description);
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute('content', params.description);
    }
  }, [params.title, params.description]);
}
