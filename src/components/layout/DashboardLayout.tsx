import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
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
  ShieldAlert,
  Sparkles,
  ChevronDown,
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  RotateCcw,
  Check,
  ExternalLink,
  ChevronRight,
  Store as StoreIcon,
} from 'lucide-react';
import { ToastContainer } from '../ui/Toast';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { getDashboardPlanById } from '../../data/pricingConfig';

export const DashboardLayout: React.FC = () => {
  const {
    user,
    role,
    switchRole,
    logout,
    stores,
    activeStore,
    activeStoreId,
    setActiveStoreId,
    theme,
    toggleTheme,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    resetDemoData,
    trialDaysLeft,
    currentPlan,
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const navItems = [
    { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Products', path: '/dashboard/products', icon: Package },
    { label: 'Orders', path: '/dashboard/orders', icon: ShoppingCart },
    { label: 'Customers', path: '/dashboard/customers', icon: Users },
    { label: 'Inventory', path: '/dashboard/inventory', icon: Boxes },
    { label: 'Page Builder', path: '/dashboard/landing-pages', icon: Layers },
    { label: 'AI Automations', path: '/dashboard/automations', icon: Bot },
    { label: 'My Website', path: '/dashboard/subscribed-website', icon: Globe2 },
    { label: 'Create New Website', path: '/create-website', icon: Sparkles },
    { label: 'Bespoke Dev', path: '/dashboard/website-requests', icon: Sparkles },
    { label: 'Billing & Plans', path: '/dashboard/billing', icon: CreditCard },
    { label: 'Team & Settings', path: '/dashboard/settings', icon: Settings },
    { label: 'Support & Help', path: '/dashboard/support', icon: HelpCircle },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  // Generate breadcrumb items
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentNav = navItems.find((n) => isActive(n.path));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      <ToastContainer />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 ${
            sidebarCollapsed ? 'w-16' : 'w-64'
          }`}
        >
          {/* Brand header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
            {!sidebarCollapsed ? (
              <Link to="/dashboard" className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-wider">
                  GA
                </span>
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                    GoAMAAS
                  </span>
                  <span className="text-[10px] text-slate-400">by AMAAS</span>
                </div>
              </Link>
            ) : (
              <span className="w-8 h-8 mx-auto rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                GA
              </span>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Store switcher */}
          {!sidebarCollapsed && (
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 relative">
              <button
                onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 transition-colors text-left"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <StoreIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {activeStore?.name}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {activeStore?.category}
                    </p>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {storeDropdownOpen && (
                <div className="absolute top-16 left-3 right-3 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 text-xs">
                  <div className="px-3 py-1.5 font-semibold text-[10px] text-slate-400 uppercase tracking-wider">
                    Your Stores
                  </div>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveStoreId(s.id);
                        setStoreDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

            {/* Admin Switcher */}
            {role === 'admin' && (
              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/admin"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>Admin Master Panel</span>}
                </Link>
              </div>
            )}
          </nav>

          {/* Public Website Link */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800">
              <Link
                to="/"
                className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span>View Public Site</span>
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
            <div className="relative w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-10">
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    GA
                  </span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">GoAMAAS</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-500 mb-1">Active Store:</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">{activeStore?.name}</div>
              </div>

              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {navItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
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
                {role === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Admin Master Panel</span>
                  </Link>
                )}
              </nav>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  <span>Public Site</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar Header */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
            {/* Left: Mobile hamburger & Breadcrumbs */}
            <div className="flex items-center gap-3 overflow-hidden">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 overflow-hidden">
                <Link to="/dashboard" className="hover:text-slate-900 dark:hover:text-white truncate">
                  Dashboard
                </Link>
                {currentNav && currentNav.path !== '/dashboard' && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {currentNav.label}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Center/Right: Global search bar, notifications, theme, user */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Quick Search Button */}
              <button
                onClick={() => setShowSearchModal(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="truncate">Search products, orders...</span>
                <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono">
                  ⌘K
                </kbd>
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                  aria-label="View notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50 text-xs">
                    <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Notifications ({unreadNotifCount} unread)
                      </span>
                      {unreadNotifCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-slate-400">No notifications</div>
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
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-900 dark:bg-blue-600 text-white font-semibold text-xs flex items-center justify-center">
                    {user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}
                  </div>
                  <span className="hidden lg:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
                    {user?.name || (user?.email ? user.email.split('@')[0] : 'Account')}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {user?.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        Role: {role.toUpperCase()}
                      </span>
                    </div>

                    <Link
                      to="/dashboard/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Store & Account Settings
                    </Link>
                    <Link
                      to="/dashboard/billing"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Subscription ({getDashboardPlanById(currentPlan)?.name || 'Starter'})
                    </Link>

                    {user?.role === 'admin' && (
                      <>
                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                        <Link
                          to="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-4 py-2 text-purple-600 dark:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                        >
                          Super Admin Console →
                        </Link>
                      </>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                        navigate('/login');
                      }}
                      className="w-full text-left px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content Viewport */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Global Quick Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-10">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Jump to products, orders, inventory, customers..."
                className="w-full bg-transparent text-sm focus:outline-hidden text-slate-900 dark:text-white"
                autoFocus
              />
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600 p-1"
              >
                ESC
              </button>
            </div>
            <div className="p-3 max-h-72 overflow-y-auto space-y-1 text-xs">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                Quick Navigation
              </p>
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setShowSearchModal(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <item.icon className="w-4 h-4 text-blue-500" />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Go to page →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
