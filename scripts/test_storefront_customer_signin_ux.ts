import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebsitePreviewRenderer } from '../src/components/website/WebsitePreviewRenderer';
import { CustomerPortalModal } from '../src/components/website/CustomerPortalModal';
import type { SubscribedWebsite, User } from '../src/types';

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

const sampleSiteWithProducts: Partial<SubscribedWebsite> = {
  id: 'site-1',
  storeId: 'store-1',
  subdomain: 'dhakakicks',
  businessName: 'Dhaka Kicks Studio Very Long Name For Narrow Viewport Truncation Test',
  niche: 'fashion',
  nicheLabel: 'Footwear & Lifestyle',
  brandColor: '#0F766E',
  phone: '01711223344',
  whatsappNumber: '8801711223344',
  email: 'hello@dhakakicks.com',
  address: 'House 12, Banani, Dhaka',
  subscriptionStatus: 'active',
  servicesOrProducts: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      productId: '11111111-1111-4111-8111-111111111111',
      name: 'Canvas Sneaker',
      description: 'Daily comfort sneaker',
      price: '৳1,850',
      priceNumeric: 1850,
      stock: 10,
      inStock: true,
      isVisible: true,
    },
  ],
};

const sampleSiteInquiryOnly: Partial<SubscribedWebsite> = {
  ...sampleSiteWithProducts,
  id: 'site-2',
  subdomain: 'banani-studio',
  businessName: 'Banani Design Studio',
  servicesOrProducts: [],
};

const sampleCustomer: User = {
  id: 'cust-123',
  name: 'Tasnim Jahan',
  email: 'tasnim@example.com',
  avatar: 'https://cdn.example.com/avatar.png',
  role: 'merchant',
  storeId: '',
};

function runTests(): void {
  // 1. Unauthenticated visitor renders visible Sign In button on orderable storefront (desktop + mobile)
  const unauthHtml = renderToStaticMarkup(
    React.createElement(WebsitePreviewRenderer, {
      site: sampleSiteWithProducts,
      viewMode: 'desktop',
      isPublicView: true,
      customerUser: null,
      customerAccessToken: null,
      onCustomerGoogleSignIn: async () => {},
      onCustomerSignOut: async () => {},
      onStartCustomerBusiness: async () => {},
    })
  );

  assert.ok(
    unauthHtml.includes('data-testid="storefront-signin-button"'),
    'Unauthenticated public storefront must render visible header Sign In button'
  );
  assert.ok(
    unauthHtml.includes('>Sign In</span>'),
    'Sign In button label must render visibly'
  );
  assert.ok(
    !unauthHtml.includes('data-testid="storefront-account-menu-button"'),
    'Unauthenticated visitor must not see authenticated account menu button'
  );

  // Verify Sign In label is NOT hidden on mobile (<640px) viewports
  const signInBtnSliceStart = unauthHtml.indexOf('data-testid="storefront-signin-button"');
  const signInBtnSlice = unauthHtml.slice(signInBtnSliceStart, signInBtnSliceStart + 500);
  assert.ok(
    !signInBtnSlice.includes('hidden sm:inline'),
    'Sign In label must NOT use hidden sm:inline so it stays visible on 320px-430px mobile screens'
  );
  assert.ok(
    signInBtnSlice.includes('<svg'),
    'Sign In button must include user/account icon'
  );

  // 2. Non-orderable (WhatsApp/Call only) storefront also renders visible Sign In button without wrapping/crowding
  const inquiryOnlyHtml = renderToStaticMarkup(
    React.createElement(WebsitePreviewRenderer, {
      site: sampleSiteInquiryOnly,
      viewMode: 'desktop',
      isPublicView: true,
      customerUser: null,
      customerAccessToken: null,
      onCustomerGoogleSignIn: async () => {},
      onCustomerSignOut: async () => {},
    })
  );
  assert.ok(
    inquiryOnlyHtml.includes('data-testid="storefront-signin-button"'),
    'Non-orderable public storefront must also render visible header Sign In button'
  );

  // 3. Stale/partial customerUser without accessToken still shows Sign In rather than false logged-in UI
  const partialAuthHtml = renderToStaticMarkup(
    React.createElement(WebsitePreviewRenderer, {
      site: sampleSiteWithProducts,
      viewMode: 'desktop',
      isPublicView: true,
      customerUser: sampleCustomer,
      customerAccessToken: null,
      onCustomerGoogleSignIn: async () => {},
      onCustomerSignOut: async () => {},
    })
  );
  assert.ok(
    partialAuthHtml.includes('data-testid="storefront-signin-button"'),
    'Visitor missing JWT accessToken must still see Sign In button'
  );

  // 4. Authenticated customer sees account/avatar trigger replacing Sign In
  const authHtml = renderToStaticMarkup(
    React.createElement(WebsitePreviewRenderer, {
      site: sampleSiteWithProducts,
      viewMode: 'desktop',
      isPublicView: true,
      customerUser: sampleCustomer,
      customerAccessToken: 'jwt-valid-token',
      onCustomerGoogleSignIn: async () => {},
      onCustomerSignOut: async () => {},
      onStartCustomerBusiness: async () => {},
    })
  );
  assert.ok(
    authHtml.includes('data-testid="storefront-account-menu-button"'),
    'Authenticated customer must see account/avatar menu trigger button'
  );
  assert.ok(
    authHtml.includes('Tasnim'),
    'Authenticated customer button must show customer name'
  );
  assert.ok(
    !authHtml.includes('data-testid="storefront-signin-button"'),
    'Authenticated customer must not see guest Sign In trigger button in header'
  );

  // 5. Clicking Sign In opens CustomerPortalModal on account tab -> renders Continue with Google button
  const portalUnauthHtml = renderToStaticMarkup(
    React.createElement(CustomerPortalModal, {
      isOpen: true,
      initialTab: 'account',
      site: sampleSiteWithProducts,
      subdomain: 'dhakakicks',
      user: null,
      accessToken: null,
      lang: 'en',
      onClose: () => {},
      onGoogleSignIn: async () => {},
      onSignOut: async () => {},
      onOpenInvoice: () => {},
      onStartBusiness: async () => {},
    })
  );
  assert.ok(
    portalUnauthHtml.includes('Continue with Google'),
    'Customer Portal sign-in view must display Continue with Google CTA'
  );
  assert.ok(
    portalUnauthHtml.includes('Ready to Start Your Own Business?'),
    'Customer Portal must preserve Start Your Business conversion card'
  );

  // 6. Authenticated CustomerPortalModal preserves My Orders, My Account, Sign Out, Start Your Business
  const portalAuthHtml = renderToStaticMarkup(
    React.createElement(CustomerPortalModal, {
      isOpen: true,
      initialTab: 'account',
      site: sampleSiteWithProducts,
      subdomain: 'dhakakicks',
      user: sampleCustomer,
      accessToken: 'jwt-valid-token',
      lang: 'en',
      onClose: () => {},
      onGoogleSignIn: async () => {},
      onSignOut: async () => {},
      onOpenInvoice: () => {},
      onStartBusiness: async () => {},
    })
  );
  assert.ok(portalAuthHtml.includes('My Orders'));
  assert.ok(portalAuthHtml.includes('My Account'));
  assert.ok(portalAuthHtml.includes('Sign Out'));
  assert.ok(portalAuthHtml.includes('Start Your Business'));

  // 7. Source-level checks for dropdown menu items, mobile drawer Sign In, and PublicTenantWebsitePage cleanup
  const rendererSrc = readText('src/components/website/WebsitePreviewRenderer.tsx');
  assert.ok(
    rendererSrc.includes('data-testid="storefront-account-menu"') &&
      rendererSrc.includes("setPortalTab('orders')") &&
      rendererSrc.includes("setPortalTab('account')") &&
      rendererSrc.includes('onCustomerSignOut?.()'),
    'Authenticated account menu dropdown must expose My Orders, My Account, and Sign Out'
  );
  assert.ok(
    rendererSrc.includes('data-testid="storefront-mobile-menu"') &&
      rendererSrc.includes('data-testid="storefront-mobile-menu-signin"'),
    'Mobile hamburger drawer must expose Sign In button for unauthenticated visitors'
  );
  assert.ok(
    rendererSrc.includes('flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1'),
    'Storefront brand container must flex-1 & truncate cleanly at 320px without squeezing right controls'
  );

  const publicPageSrc = readText('src/pages/public/PublicTenantWebsitePage.tsx');
  assert.ok(
    publicPageSrc.includes("nextParams.delete('portal')") &&
      publicPageSrc.includes('loginAsCustomerWithGoogle'),
    'PublicTenantWebsitePage must preserve Google OAuth return and clean portal query params on sign out'
  );

  console.log('ALL STOREFRONT CUSTOMER SIGN-IN UX TESTS PASSED (7/7)');
}

runTests();
