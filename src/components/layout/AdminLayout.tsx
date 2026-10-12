import React from 'react';
import { Link, useNavigate, Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  ShieldAlert,
  ArrowLeft,
  Users,
  Store,
  CreditCard,
  Globe2,
  Activity,
  Layers,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { ToastContainer } from '../ui/Toast';

export const AdminLayout: React.FC = () => {
  const { user, role, switchRole, theme, toggleTheme } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      <ToastContainer />

      {/* Admin Top Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            title="Return to Merchant Store Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Merchant App</span>
          </Link>
          <div className="h-5 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-white tracking-tight">GoAMAAS Super Admin</span>
              <span className="hidden sm:inline text-[10px] text-purple-400 ml-2 font-mono">
                [PLATFORM_CONTROL_NODE]
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              navigate('/dashboard');
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            Merchant Workspace →
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-semibold text-xs flex items-center justify-center">
              A
            </div>
            <span className="hidden md:inline text-xs text-slate-300 font-medium">
              {user?.name || 'Administrator'}
            </span>
          </div>
        </div>
      </header>

      {/* Admin Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
