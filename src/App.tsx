import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { validateSubdomainFormat } from './lib/supabase';

// Layouts
import { PublicLayout } from './components/layout/PublicLayout';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { AdminLayout } from './components/layout/AdminLayout';

// Auth Protection & Callback
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage';

// Public Pages
import { HomePage } from './pages/public/HomePage';
import { FeaturesPage } from './pages/public/FeaturesPage';
import { SolutionsPage } from './pages/public/SolutionsPage';
import { PricingPage } from './pages/public/PricingPage';
import { AboutPage } from './pages/public/AboutPage';
import { ContactPage } from './pages/public/ContactPage';
import { CreateWebsitePage } from './pages/public/CreateWebsitePage';
import { PublicTenantWebsitePage } from './pages/public/PublicTenantWebsitePage';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Onboarding
import { OnboardingFlow } from './pages/onboarding/OnboardingFlow';

// Dashboard Pages
import { DashboardOverviewPage } from './pages/dashboard/DashboardOverviewPage';
import { ProductsPage } from './pages/dashboard/ProductsPage';
import { OrdersPage } from './pages/dashboard/OrdersPage';
import { CustomersPage } from './pages/dashboard/CustomersPage';
import { InventoryPage } from './pages/dashboard/InventoryPage';
import { LandingPageBuilderPage } from './pages/dashboard/LandingPageBuilderPage';
import { AutomationsPage } from './pages/dashboard/AutomationsPage';
import { AnalyticsPage } from './pages/dashboard/AnalyticsPage';
import { BillingPage } from './pages/dashboard/BillingPage';
import { WebsiteRequestPage } from './pages/dashboard/WebsiteRequestPage';
import { SubscribedWebsitePage } from './pages/dashboard/SubscribedWebsitePage';
import { TeamSettingsPage } from './pages/dashboard/TeamSettingsPage';
import { SupportPage } from './pages/dashboard/SupportPage';

// Admin Page
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';

export default function App() {
  // Check if current request is dispatched to a tenant subdomain (e.g. urbanfashion.amaas.xyz or urbanfashion.localhost)
  const isTenantSubdomain = (() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    let candidate = '';
    if (host.endsWith('.amaas.xyz') && host !== 'amaas.xyz') {
      candidate = host.slice(0, -'.amaas.xyz'.length);
    } else if (host.endsWith('.localhost') && host !== 'localhost') {
      candidate = host.slice(0, -'.localhost'.length);
    }
    if (!candidate || candidate.includes('.')) return false;
    return validateSubdomainFormat(candidate).valid;
  })();

  return (
    <AppProvider>
      <BrowserRouter>
        {isTenantSubdomain && (
          <Routes>
            <Route path="*" element={<PublicTenantWebsitePage />} />
          </Routes>
        )}
        {!isTenantSubdomain && (
        <Routes>
          {/* Public Website Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/solutions" element={<SolutionsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/create-website" element={<CreateWebsitePage />} />
          </Route>

          {/* Multi-Tenant Public Website Routes */}
          <Route path="/sites/:subdomain" element={<PublicTenantWebsitePage />} />
          <Route path="/site/:subdomain" element={<PublicTenantWebsitePage />} />

          {/* Authentication & OAuth Callback Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Multi-step Onboarding Wizard (Authenticated) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingFlow />
              </ProtectedRoute>
            }
          />

          {/* SaaS Merchant Dashboard Routes (Authenticated Protected) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardOverviewPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="landing-pages" element={<LandingPageBuilderPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="subscribed-website" element={<SubscribedWebsitePage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="website-requests" element={<WebsiteRequestPage />} />
            <Route path="settings" element={<TeamSettingsPage />} />
            <Route path="support" element={<SupportPage />} />
          </Route>

          {/* Platform Super Admin Console (Admin Role Protected) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        )}
      </BrowserRouter>
    </AppProvider>
  );
}
