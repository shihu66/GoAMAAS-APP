import React from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'merchant' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const {
    user,
    isAuthenticated,
    isAuthLoading,
    isCustomerSessionOnly,
    logout,
    transitionCustomerToMerchantOnboarding,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [isTransitioningFromPortal, setIsTransitioningFromPortal] = React.useState(false);

  const isCustomerPortalOnboardingHandoff =
    location.pathname === '/onboarding' &&
    new URLSearchParams(location.search).get('from') === 'customer_portal';

  React.useEffect(() => {
    if (
      !isAuthLoading &&
      isAuthenticated &&
      isCustomerSessionOnly &&
      isCustomerPortalOnboardingHandoff &&
      !isTransitioningFromPortal
    ) {
      setIsTransitioningFromPortal(true);
      void transitionCustomerToMerchantOnboarding().finally(() => {
        setIsTransitioningFromPortal(false);
      });
    }
  }, [
    isAuthLoading,
    isAuthenticated,
    isCustomerSessionOnly,
    isCustomerPortalOnboardingHandoff,
    isTransitioningFromPortal,
    transitionCustomerToMerchantOnboarding,
  ]);

  if (isAuthLoading || isTransitioningFromPortal) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Verifying authorization...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (isCustomerSessionOnly) {
    if (isCustomerPortalOnboardingHandoff) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Preparing merchant onboarding...</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Customer Session Active
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            You are currently signed in as a storefront customer ({user.email}). Merchant dashboard and store administration routes require a merchant account sign-in.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center py-2 px-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
            >
              Return to Home
            </Link>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await logout({ silent: true });
                  navigate('/login', { replace: true });
                })();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Merchant Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (requiredRole && user.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Access Restricted
          </h2>
          <p className="text-xs text-slate-500">
            This administrative area requires elevated platform credentials. Your account ({user.email}) does not have administrative permissions.
          </p>
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
            >
              Return to Store Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
