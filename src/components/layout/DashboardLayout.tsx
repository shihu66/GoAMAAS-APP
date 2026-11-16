import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { isWebsiteTrulyLive } from '../../lib/paymentWorkflow';
import { ThemeSelector } from '../ui/ThemeSelector';
import { StatusBadge } from '../ui/StatusBadge';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Boxes,
  Layers,
  Bot,
  BarChart3,
  Globe2,
  CreditCard,
  Settings,
  HelpCircle,
  Sparkles,
  ChevronDown,
  Menu,
  X,
  Search,
  Bell,
  LogOut,
  Check,
  ExternalLink,
  ChevronRight,
  Store as StoreIcon,
  MoreHorizontal,
  ArrowUpRight,
} from 'lucide-react';
import { ToastContainer } from '../ui/Toast';

export const DashboardLayout: React.FC = () => {
  const {
    user,
    logout,
    stores,
    activeStore,
    activeStoreId,
    setActiveStoreId,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    products,
    orders,
    customers,
    subscribedWebsites,
  } = useApp();
  const { lang, toggleLang, t } = useLanguage();
  const navText = t.workspace.nav;

  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowSearchModal(false);
        setStoreDropdownOpen(false);
        setUserMenuOpen(false);
        setNotifDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const pendingOrderCount = useMemo(
    () => orders.filter((o) => o.status === 'pending').length,
    [orders]
  );

  const connectedWebsite = useMemo(() => {
    if (!subscribedWebsites || subscribedWebsites.length === 0) return null;
    if (activeStore) {
      const match = subscribedWebsites.find((w) => w.storeId === activeStore.id);
      if (match) return match;
    }
    return subscribedWebsites[0];
  }, [subscribedWebsites, activeStore]);

  const websiteIsLive = connectedWebsite ? isWebsiteTrulyLive(connectedWebsite) : false;

  const primaryNavItems = useMemo(
    () => [
      { label: navText.overview, path: '/dashboard', icon: LayoutDashboard },
      { label: navText.myWebsite, path: '/dashboard/subscribed-website', icon: Globe2 },
      { label: navText.products, path: '/dashboard/products', icon: Package },
      {
        label: navText.orders,
        path: '/dashboard/orders',
        icon: ShoppingCart,
        count: pendingOrderCount > 0 ? pendingOrderCount : undefined,
      },
      { label: navText.inventory, path: '/dashboard/inventory', icon: Boxes },
      { label: navText.customers, path: '/dashboard/customers', icon: Users },
      { label: navText.analytics, path: '/dashboard/analytics', icon: BarChart3 },
    ],
    [navText, pendingOrderCount]
  );

  const accountNavItems = useMemo(
    () => [
      { label: navText.settings, path: '/dashboard/settings', icon: Settings },
      { label: navText.billing, path: '/dashboard/billing', icon: CreditCard },
      { label: navText.support, path: '/dashboard/support', icon: HelpCircle },
    ],
    [navText]
  );

  const extraToolItems = useMemo(
    () => [
      { label: navText.landingPages, path: '/dashboard/landing-pages', icon: Layers },
      { label: navText.automations, path: '/dashboard/automations', icon: Bot },
      { label: navText.webRequests, path: '/dashboard/website-requests', icon: Sparkles },
      { label: navText.buildWebsiteCta, path: '/create-website', icon: Globe2 },
    ],
    [navText]
  );

  const allNavItems = useMemo(
    () => [...primaryNavItems, ...accountNavItems, ...extraToolItems],
    [primaryNavItems, accountNavItems, extraToolItems]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchedNavItems = useMemo(() => {
    if (!normalizedQuery) return allNavItems;
    return allNavItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  }, [allNavItems, normalizedQuery]);

  const matchedProducts = useMemo(() => {
    if (!normalizedQuery) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(normalizedQuery) ||
          p.sku.toLowerCase().includes(normalizedQuery) ||
          p.category.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 4);
  }, [products, normalizedQuery]);

  const matchedOrders = useMemo(() => {
    if (!normalizedQuery) return [];
    return orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(normalizedQuery) ||
          o.customerName.toLowerCase().includes(normalizedQuery) ||
          o.customerPhone.includes(normalizedQuery)
      )
      .slice(0, 4);
  }, [orders, normalizedQuery]);

  const matchedCustomers = useMemo(() => {
    if (!normalizedQuery) return [];
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(normalizedQuery) ||
          c.phone.includes(normalizedQuery) ||
          c.email.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 4);
  }, [customers, normalizedQuery]);

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const currentNav = allNavItems.find((n) => isActive(n.path));
  const isExtraRouteActive = extraToolItems.some((item) => isActive(item.path));

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      <ToastContainer />

      <div className="flex flex-1 min-h-0 relative">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] transition-all duration-200 ${
            sidebarCollapsed ? 'w-[72px]' : 'w-64'
          }`}
        >
          {/* Brand header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800/80">
            {!sidebarCollapsed ? (
              <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs shrink-0">
                  GA
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                    GoAMAAS
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {navText.freeForeverLabel}
                  </span>
                </div>
              </Link>
            ) : (
              <Link
                to="/dashboard"
                className="w-8 h-8 mx-auto rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm"
                title="GoAMAAS"
              >
                GA
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Store switcher & Quick Website Status Card */}
          {!sidebarCollapsed && (
            <div className="p-3 space-y-2.5 border-b border-slate-100 dark:border-slate-800/80 relative">
              {activeStore && (
                <button
                  type="button"
                  onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                  className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <StoreIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {activeStore.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {activeStore.category || 'Merchant Store'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}

              {storeDropdownOpen && (
                <div className="absolute top-16 left-3 right-3 z-30 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 text-xs">
                  <div className="px-3 py-1 font-medium text-[11px] text-slate-400">
                    Your Stores
                  </div>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveStoreId(s.id);
                        setStoreDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {s.name}
                      </span>
                      {s.id === activeStoreId && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                    <Link
                      to="/dashboard/settings"
                      onClick={() => setStoreDropdownOpen(false)}
                      className="block px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium"
                    >
                      + Manage / Add Store
                    </Link>
                  </div>
                </div>
              )}

              {/* Quick Website Status Pill-Free Card */}
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2.5">
                {connectedWebsite ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge
                        tone={websiteIsLive ? 'live' : 'draft'}
                        label={websiteIsLive ? navText.websiteStatusLive : navText.websiteStatusDraft}
                      />
                      <a
                        href={`/s/${connectedWebsite.subdomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 shrink-0"
                      >
                        <span>{navText.openSite}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                      {connectedWebsite.subdomain}.amaas.xyz
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {navText.websiteStatusNone}
                    </span>
                    <Link
                      to="/create-website"
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      {navText.buildWebsiteCta}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-5">
            <div>
              {!sidebarCollapsed && (
                <p className="px-3 mb-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {navText.mainGroup}
                </p>
              )}
              <div className="space-y-0.5">
                {primaryNavItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </span>
                      {!sidebarCollapsed && item.count !== undefined && (
                        <span
                          className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              {!sidebarCollapsed && (
                <p className="px-3 mb-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {navText.workspaceGroup}
                </p>
              )}
              <div className="space-y-0.5">
                {accountNavItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}

                {!sidebarCollapsed && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setMoreToolsOpen((prev) => !prev)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <MoreHorizontal className="w-4 h-4 shrink-0" />
                        <span>{navText.more}</span>
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          moreToolsOpen || isExtraRouteActive ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {(moreToolsOpen || isExtraRouteActive) && (
                      <div className="mt-1 pl-3 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-5">
                        {extraToolItems.map((item) => {
                          const active = isActive(item.path);
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                                active
                                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Bottom Home link */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800/80">
              <Link
                to="/"
                className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span>{lang === 'bn' ? 'প্ল্যাটফর্ম হোম' : 'GoAMAAS Home'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-80 max-w-[85vw] bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-10">
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    GA
                  </span>
                  <div className="leading-tight">
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">GoAMAAS</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activeStore?.name || navText.freeForeverLabel}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3 space-y-4">
                <div className="space-y-1">
                  {primaryNavItems.map((item) => {
                    const active = isActive(item.path);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </span>
                        {item.count !== undefined && (
                          <span className="font-mono text-xs tabular-nums">{item.count}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  {[...accountNavItems, ...extraToolItems].map((item) => {
                    const active = isActive(item.path);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t.workspace.theme.label}
                    </span>
                    <ThemeSelector />
                  </div>
                </div>
              </nav>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl"
                >
                  <span>Home</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="min-h-[44px] flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-xl"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{navText.signOut}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar Header */}
          <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5 text-sm overflow-hidden">
                <Link
                  to="/dashboard"
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white truncate font-medium"
                >
                  {navText.overview}
                </Link>
                {currentNav && currentNav.path !== '/dashboard' && (
                  <>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {currentNav.label}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                className="sm:hidden min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Open quick search"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                className="hidden sm:flex items-center gap-2 min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="truncate max-w-[160px]">{navText.quickSearchHint}</span>
                <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={toggleLang}
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                title="Switch Language (English / বাংলা)"
              >
                {lang === 'en' ? 'বাংলা' : 'EN'}
              </button>

              <div className="hidden lg:block">
                <ThemeSelector compact />
              </div>

              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifDropdownOpen(!notifDropdownOpen);
                    setUserMenuOpen(false);
                  }}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                  aria-label="View notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-[#111827]" />
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-xs">
                    <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Notifications ({unreadNotifCount})
                      </span>
                      {unreadNotifCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-slate-400">No notifications yet</div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => {
                              markNotificationRead(notif.id);
                              if (notif.link) {
                                navigate(notif.link);
                                setNotifDropdownOpen(false);
                              }
                            }}
                            className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                              !notif.read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {notif.title}
                              </span>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                {notif.timestamp}
                              </span>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                              {notif.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setNotifDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                    {user?.name
                      ? user.name.charAt(0).toUpperCase()
                      : user?.email
                      ? user.email.charAt(0).toUpperCase()
                      : 'U'}
                  </div>
                  <span className="hidden lg:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
                    {user?.name || (user?.email ? user.email.split('@')[0] : 'Account')}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-xs">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {user?.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                    </div>

                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        {t.workspace.theme.label}
                      </span>
                      <ThemeSelector compact />
                    </div>

                    <Link
                      to="/dashboard/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                    >
                      {navText.settings}
                    </Link>
                    <Link
                      to="/dashboard/billing"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                    >
                      {navText.billing}
                    </Link>

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                        navigate('/login');
                      }}
                      className="w-full text-left px-4 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{navText.signOut}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content Viewport */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Ergonomic Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile quick navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 px-1"
      >
        {[
          { label: navText.overview, path: '/dashboard', icon: LayoutDashboard },
          { label: navText.myWebsite, path: '/dashboard/subscribed-website', icon: Globe2 },
          { label: navText.products, path: '/dashboard/products', icon: Package },
          {
            label: navText.orders,
            path: '/dashboard/orders',
            icon: ShoppingCart,
            count: pendingOrderCount > 0 ? pendingOrderCount : undefined,
          },
        ].map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[11px] font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[64px]">{item.label}</span>
              {item.count !== undefined && (
                <span className="absolute top-1.5 right-3 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>{navText.more}</span>
        </button>
      </nav>

      {/* Global Quick Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-4">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="relative w-full max-w-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10">
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={navText.quickSearchPlaceholder}
                className="w-full bg-transparent text-sm focus:outline-hidden text-slate-900 dark:text-white"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-400 hover:text-slate-600 p-1"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSearchModal(false)}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                ESC
              </button>
            </div>
            <div className="p-3 max-h-80 overflow-y-auto scrollbar-thin space-y-3 text-xs">
              {matchedProducts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 px-2 py-0.5">
                    {navText.products} ({matchedProducts.length})
                  </p>
                  {matchedProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        navigate('/dashboard/products');
                        setShowSearchModal(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {p.name}
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0 tabular-nums">
                        ৳{p.price.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedOrders.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 px-2 py-0.5">
                    {navText.orders} ({matchedOrders.length})
                  </p>
                  {matchedOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        navigate('/dashboard/orders');
                        setShowSearchModal(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShoppingCart className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {o.orderNumber}
                        </span>
                        <span className="text-slate-500 truncate">{o.customerName}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0 tabular-nums">
                        ৳{o.total.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedCustomers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 px-2 py-0.5">
                    {navText.customers} ({matchedCustomers.length})
                  </p>
                  {matchedCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        navigate('/dashboard/customers');
                        setShowSearchModal(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {c.name}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {c.phone}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedNavItems.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 px-2 py-0.5">
                    {navText.quickSearchHint}
                  </p>
                  {matchedNavItems.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        navigate(item.path);
                        setShowSearchModal(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                        <item.icon className="w-4 h-4 text-blue-500" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {normalizedQuery &&
                matchedProducts.length === 0 &&
                matchedOrders.length === 0 &&
                matchedCustomers.length === 0 &&
                matchedNavItems.length === 0 && (
                  <div className="py-6 text-center text-slate-400">
                    No matching results for &ldquo;{searchQuery}&rdquo;.
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
