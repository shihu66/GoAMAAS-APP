import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { Sun, Moon, Menu, X, ArrowRight, LayoutDashboard } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { theme, toggleTheme, isAuthenticated, user } = useApp();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const navLinks = [
    { label: t.nav.features, path: '/features' },
    { label: t.nav.solutions, path: '/solutions' },
    { label: t.nav.websiteBuilder, path: '/create-website' },
    { label: t.nav.pricing, path: '/pricing' },
    { label: t.nav.about, path: '/about' },
    { label: t.nav.contact, path: '/contact' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
        {/* Brand Identity (Exact AMAAS / GoAMAAS mark preserved) */}
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 group"
        >
          <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm tracking-wider shadow-xs group-hover:bg-blue-500 transition-colors">
            GA
          </span>
          <span>GoAMAAS</span>
        </Link>

        {/* Primary Desktop Navigation */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6 text-[13px] font-medium text-slate-600 dark:text-slate-300"
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                isActive(link.path)
                  ? 'text-slate-950 dark:text-white font-semibold'
                  : 'hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Controls: Language Switcher + Theme Toggle + Divider + Primary CTA */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div className="sm:hidden">
            <LanguageSwitcher size="xs" compactLabels />
          </div>
          <div className="hidden sm:block">
            <LanguageSwitcher size="sm" />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
            title={t.nav.toggleTheme}
            aria-label={t.nav.toggleTheme}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <span
            aria-hidden="true"
            className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5"
          />

          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>{t.nav.goToDashboard}</span>
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                to="/login"
                className="min-h-[38px] inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                {t.nav.login}
              </Link>
              <Link
                to="/create-website"
                className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <span>{t.nav.createWebsite}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden min-h-[42px] min-w-[42px] inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-expanded={mobileMenuOpen}
            aria-label={t.nav.toggleMenu}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl px-4 pt-3 pb-6 space-y-4"
          >
            <div className="sm:hidden">
              <LanguageSwitcher size="md" fullWidth />
            </div>

            <nav aria-label="Mobile Navigation" className="flex flex-col space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`min-h-[44px] flex items-center px-3.5 py-2.5 text-sm rounded-xl transition-colors ${
                  isActive('/')
                    ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-950 dark:text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                {t.nav.home}
              </Link>
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] flex items-center px-3.5 py-2.5 text-sm rounded-xl transition-colors ${
                    isActive(link.path)
                      ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-950 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-2.5">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/dashboard');
                  }}
                  className="w-full min-h-[44px] px-4 py-2.5 text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl cursor-pointer"
                >
                  {t.nav.openDashboard} {user?.name ? `(${user.name})` : ''}
                </button>
              ) : (
                <>
                  <Link
                    to="/create-website"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl"
                  >
                    <span>{t.nav.createWebsite}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="min-h-[44px] inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
                    >
                      {t.nav.login}
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="min-h-[44px] inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
                    >
                      {t.nav.startFreeTrial}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
