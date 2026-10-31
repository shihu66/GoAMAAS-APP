import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, ArrowLeft, Sun, Moon } from 'lucide-react';
import { ToastContainer } from '../ui/Toast';

export const AdminLayout: React.FC = () => {
  const { user, theme, toggleTheme } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      <ToastContainer />

      {/* Compact Mobile-First Sticky Admin Header (<= 56px height) */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sticky top-0 z-40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="min-h-[44px] min-w-[44px] px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors rounded-xl hover:bg-slate-800 shrink-0"
            title="Return to Merchant Dashboard"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Merchant App</span>
          </Link>

          <div className="h-5 w-px bg-slate-800 shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight truncate">
              GoAMAAS Admin
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 font-bold text-xs flex items-center justify-center">
              {(user?.name || 'A').charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:inline text-xs text-slate-300 font-medium max-w-[160px] truncate">
              {user?.name || 'Administrator'}
            </span>
          </div>
        </div>
      </header>

      {/* Admin Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
