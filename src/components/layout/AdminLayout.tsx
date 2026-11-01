import React, { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  CreditCard,
  Globe,
  Users,
  Sliders,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAdminSecurity } from '../auth/AdminProtectedRoute';
import {
  AdminPWAInstallButton,
  AdminPWAInstallPrompt,
} from '../admin/AdminPWAInstallBanner';
import { ToastContainer } from '../ui/Toast';

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const { theme, toggleTheme, paymentRequests } = useApp();
  const { verifiedAdmin, isOnline, secureSignOut } = useAdminSecurity();

  const pendingCount = useMemo(
    () => paymentRequests.filter((p) => p.status === 'pending').length,
    [paymentRequests]
  );

  const navItems = [
    {
      label: 'Overview',
      shortLabel: 'Overview',
      path: '/admin',
      exact: true,
      icon: LayoutGrid,
      badge: 0,
    },
    {
      label: 'Payments',
      shortLabel: 'Payments',
      path: '/admin/payments',
      exact: false,
      icon: CreditCard,
      badge: pendingCount,
    },
    {
      label: 'Websites',
      shortLabel: 'Websites',
      path: '/admin/websites',
      exact: false,
      icon: Globe,
      badge: 0,
    },
    {
      label: 'Customers',
      shortLabel: 'Customers',
      path: '/admin/customers',
      exact: false,
      icon: Users,
      badge: 0,
    },
    {
      label: 'Gateways',
      shortLabel: 'Gateways',
      path: '/admin/gateways',
      exact: false,
      icon: Sliders,
      badge: 0,
    },
    {
      label: 'Security & Audit',
      shortLabel: 'Security',
      path: '/admin/audit',
      exact: false,
      icon: ShieldCheck,
      badge: 0,
    },
  ];

  // 5-item ergonomic mobile bottom navigation bar
  const mobileBottomItems = [
    navItems[0], // Overview
    navItems[1], // Payments
    navItems[2], // Websites
    navItems[3], // Customers
    navItems[5], // Security & Audit
  ];

  const isPathActive = (path: string, exact = false): boolean => {
    if (exact) {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const activeNav =
    navItems.find((item) => isPathActive(item.path, item.exact)) || navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex antialiased">
      <ToastContainer />
      <AdminPWAInstallPrompt theme={theme} />

      {/* Desktop Left Sidebar (256px, hidden on mobile/tablet) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
        {/* Single-line Brand Wordmark */}
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5 shrink-0">
          <img
            src="/admin-icon.svg"
            alt="GoAMAAS Admin"
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg shrink-0"
          />
          <Link
            to="/admin"
            className="font-bold text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate"
          >
            GoAMAAS Admin
          </Link>
        </div>

        {/* Primary Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Admin sections">
          {navItems.map((item) => {
            const active = isPathActive(item.path, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge > 0 && (
                  <span
                    className={`font-mono text-[11px] font-bold tabular-nums ${
                      active
                        ? 'text-white'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer: Verified Admin Identity + Sign Out */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {verifiedAdmin.name}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
              {verifiedAdmin.email}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              AMAAS Technologies
            </p>
          </div>

          <button
            type="button"
            onClick={() => void secureSignOut()}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-900 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Compact Sticky Top Bar (52px mobile / 56px desktop — strictly within 15% mobile sticky cap) */}
        <header className="h-[52px] sm:h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-30">
          {/* Zone 1: Mobile wordmark / Desktop contextual breadcrumb */}
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/admin-icon.svg"
              alt="GoAMAAS Admin"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg shrink-0 lg:hidden"
            />
            <div className="flex items-center gap-2 min-w-0 text-xs sm:text-sm">
              <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap lg:text-slate-500 lg:dark:text-slate-400 lg:font-medium">
                GoAMAAS Admin
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeNav.label}
              </span>
            </div>
          </div>

          {/* Zone 2 (Mobile Gateways Shortcut when on mobile) + Zone 3 Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              to="/admin/gateways"
              className={`lg:hidden min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isPathActive('/admin/gateways')
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Payment Gateways"
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline">Gateways</span>
            </Link>

            <AdminPWAInstallButton theme={theme} variant="compact" />

            <button
              type="button"
              onClick={toggleTheme}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => void secureSignOut()}
              className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Sign out of GoAMAAS Admin"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Live Offline Connectivity Notice */}
        {!isOnline && (
          <div
            role="status"
            className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-900 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-center gap-2"
          >
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Offline mode — Live verification, website publishing, and database updates require an active connection.
            </span>
          </div>
        )}

        {/* Main Viewport Content (pb-24 on mobile leaves generous room above 56px bottom tab bar) */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar (56px height, <15% combined mobile sticky cap) */}
      <nav
        aria-label="Mobile admin navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        {mobileBottomItems.map((item) => {
          const active = isPathActive(item.path, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors relative whitespace-nowrap ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-3 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">
                {item.shortLabel}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
