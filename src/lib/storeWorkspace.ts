import { Store } from '../types';

export const STORE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StoreWorkspaceStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export interface StoreWorkspaceSnapshot {
  status: StoreWorkspaceStatus;
  isInitializing: boolean;
  error: string | null;
  stores: Store[];
  activeStoreId: string;
}

export interface StoreWorkspaceResolution {
  storeId?: string;
  stores: Store[];
  status: StoreWorkspaceStatus;
  reason: 'resolved' | 'unauthenticated' | 'auth_loading' | 'missing' | 'error' | 'stale';
  error?: string;
}

export interface StoreWorkspaceCoordinatorDeps {
  fetchStores: () => Promise<{ data: Store[] | null; error: Error | null }>;
  createStore: (params: {
    name: string;
    category?: string;
    currency?: string;
    phone?: string;
    address?: string;
  }) => Promise<{ data: Store | null; error: Error | null }>;
  linkUserProfileStore?: (userId: string, storeId: string) => Promise<void>;
  onStateChange?: (snapshot: StoreWorkspaceSnapshot) => void;
}

export interface InitializeStoreWorkspaceOptions {
  userId: string;
  userName?: string;
  preferredName?: string;
  profileStoreId?: string;
  websiteStoreIds?: (string | undefined | null)[];
  userRole?: string;
  isAdminRoute?: boolean;
  allowAutoProvision?: boolean;
  forceRefresh?: boolean;
  defaultCategory?: string;
  defaultCurrency?: string;
  defaultPhone?: string;
  defaultAddress?: string;
}

export function selectPreferredActiveStoreId(params: {
  stores: Store[];
  userSelectedStoreId?: string | null;
  currentActiveStoreId?: string | null;
  profileStoreId?: string | null;
  websiteStoreIds?: (string | undefined | null)[];
}): string {
  const validStores = (params.stores || []).filter((s) => STORE_UUID_REGEX.test(s.id));
  if (validStores.length === 0) return '';

  const storeIdSet = new Set(validStores.map((s) => s.id));

  if (params.userSelectedStoreId && storeIdSet.has(params.userSelectedStoreId)) {
    return params.userSelectedStoreId;
  }
  if (params.currentActiveStoreId && storeIdSet.has(params.currentActiveStoreId)) {
    return params.currentActiveStoreId;
  }
  if (params.profileStoreId && storeIdSet.has(params.profileStoreId)) {
    return params.profileStoreId;
  }
  if (Array.isArray(params.websiteStoreIds)) {
    for (const candidate of params.websiteStoreIds) {
      if (candidate && storeIdSet.has(candidate)) {
        return candidate;
      }
    }
  }
  return validStores[0].id;
}

export function resolveTargetStoreIdForProduct(params: {
  linkedWebsiteStoreId?: string | null;
  availableStores: Store[];
  resolvedStoreId?: string;
}): string | undefined {
  const cleanWebsiteStoreId = (params.linkedWebsiteStoreId || '').trim();
  const validStores = (params.availableStores || []).filter((s) => STORE_UUID_REGEX.test(s.id));

  if (cleanWebsiteStoreId && STORE_UUID_REGEX.test(cleanWebsiteStoreId)) {
    if (validStores.length === 0 || validStores.some((s) => s.id === cleanWebsiteStoreId)) {
      return cleanWebsiteStoreId;
    }
  }

  if (params.resolvedStoreId && STORE_UUID_REGEX.test(params.resolvedStoreId)) {
    return params.resolvedStoreId;
  }

  return validStores[0]?.id;
}

/**
 * Single-flight, epoch-guarded coordinator for merchant store workspace initialization.
 * Prevents concurrent fetch/auto-provision races, stale async overwrites on sign-out or
 * store switching, and ensures loading flags reset in every outcome.
 */
export class StoreWorkspaceCoordinator {
  private deps: StoreWorkspaceCoordinatorDeps;
  private status: StoreWorkspaceStatus = 'idle';
  private isInitializing = false;
  private error: string | null = null;
  private stores: Store[] = [];
  private activeStoreId = '';
  private userSelectedStoreId: string | null = null;
  private currentUserId: string | null = null;
  private epoch = 0;
  private lastErrorWasRls = false;

  private inFlightPromise: Promise<StoreWorkspaceResolution> | null = null;
  private inFlightToken: symbol | null = null;
  private inFlightEpoch = -1;
  private inFlightUserId: string | null = null;
  private inFlightAllowAutoProvision = false;

  constructor(deps: StoreWorkspaceCoordinatorDeps) {
    this.deps = deps;
  }

  getSnapshot(): StoreWorkspaceSnapshot {
    return {
      status: this.status,
      isInitializing: this.isInitializing,
      error: this.error,
      stores: this.stores,
      activeStoreId: this.activeStoreId,
    };
  }

  private emit() {
    this.deps.onStateChange?.(this.getSnapshot());
  }

  resetForUnauthenticated(): void {
    this.epoch += 1;
    this.currentUserId = null;
    this.stores = [];
    this.activeStoreId = '';
    this.userSelectedStoreId = null;
    this.status = 'idle';
    this.isInitializing = false;
    this.error = null;
    this.lastErrorWasRls = false;
    this.inFlightPromise = null;
    this.inFlightToken = null;
    this.inFlightEpoch = -1;
    this.inFlightUserId = null;
    this.inFlightAllowAutoProvision = false;
    this.emit();
  }

  syncUserSession(userId: string | null): void {
    const cleanId = (userId || '').trim() || null;
    if (!cleanId) {
      if (this.currentUserId !== null || this.stores.length > 0 || this.status !== 'idle') {
        this.resetForUnauthenticated();
      }
      return;
    }
    if (this.currentUserId !== cleanId) {
      this.epoch += 1;
      this.currentUserId = cleanId;
      this.stores = [];
      this.activeStoreId = '';
      this.userSelectedStoreId = null;
      this.status = 'idle';
      this.isInitializing = false;
      this.error = null;
      this.lastErrorWasRls = false;
      this.inFlightPromise = null;
      this.inFlightToken = null;
      this.inFlightEpoch = -1;
      this.inFlightUserId = null;
      this.inFlightAllowAutoProvision = false;
      this.emit();
    }
  }

  selectActiveStore(storeId: string): void {
    const cleanId = (storeId || '').trim();
    if (!cleanId) return;
    this.userSelectedStoreId = cleanId;
    this.activeStoreId = cleanId;
    this.emit();
  }

  seedCreatedStore(store: Store): void {
    if (!store || !STORE_UUID_REGEX.test(store.id)) return;
    this.stores = [store, ...this.stores.filter((s) => s.id !== store.id)];
    if (!this.userSelectedStoreId) {
      this.activeStoreId = store.id;
    }
    this.status = 'ready';
    this.error = null;
    this.isInitializing = false;
    this.emit();
  }

  applyStoresFromExternalUpdate(nextStores: Store[], preferredStoreId?: string): void {
    this.stores = nextStores;
    this.activeStoreId = selectPreferredActiveStoreId({
      stores: nextStores,
      userSelectedStoreId: this.userSelectedStoreId,
      currentActiveStoreId: preferredStoreId || this.activeStoreId,
    });
    if (nextStores.length > 0) {
      this.status = 'ready';
      this.error = null;
    }
    this.emit();
  }

  async initialize(options: InitializeStoreWorkspaceOptions): Promise<StoreWorkspaceResolution> {
    const cleanUserId = (options.userId || '').trim();
    if (!cleanUserId) {
      return {
        stores: [],
        status: 'idle',
        reason: 'unauthenticated',
        error: 'Please sign in to access your store workspace.',
      };
    }

    this.syncUserSession(cleanUserId);

    const allowProvision = options.allowAutoProvision !== false;

    // Fast path: valid store already resolved and not forcing a DB refresh
    if (
      !options.forceRefresh &&
      this.status === 'ready' &&
      this.stores.length > 0
    ) {
      const resolvedId = selectPreferredActiveStoreId({
        stores: this.stores,
        userSelectedStoreId: this.userSelectedStoreId,
        currentActiveStoreId: this.activeStoreId,
        profileStoreId: options.profileStoreId,
        websiteStoreIds: options.websiteStoreIds,
      });
      if (resolvedId && resolvedId !== this.activeStoreId) {
        this.activeStoreId = resolvedId;
        this.emit();
      }
      if (resolvedId) {
        return {
          storeId: resolvedId,
          stores: this.stores,
          status: 'ready',
          reason: 'resolved',
        };
      }
    }

    // Never repeatedly retry INSERT automatically after a database RLS violation unless user explicitly forces refresh
    if (!options.forceRefresh && this.status === 'error' && this.lastErrorWasRls && this.error) {
      return {
        stores: this.stores,
        status: 'error',
        reason: 'error',
        error: this.error,
      };
    }

    // Join in-flight initialization for this exact user & session epoch
    if (
      this.inFlightPromise &&
      this.inFlightEpoch === this.epoch &&
      this.inFlightUserId === cleanUserId
    ) {
      const sharedResult = await this.inFlightPromise;
      // If the earlier caller didn't allow provisioning (e.g. admin route check) and we now need it:
      if (
        sharedResult.reason === 'missing' &&
        allowProvision &&
        !this.inFlightAllowAutoProvision &&
        this.currentUserId === cleanUserId
      ) {
        return this.initialize({ ...options, forceRefresh: true, allowAutoProvision: true });
      }
      return sharedResult;
    }

    const startEpoch = this.epoch;
    const runToken = Symbol('store-init');
    this.inFlightToken = runToken;
    this.inFlightEpoch = startEpoch;
    this.inFlightUserId = cleanUserId;
    this.inFlightAllowAutoProvision = allowProvision;

    this.isInitializing = true;
    this.status = 'loading';
    this.error = null;
    this.lastErrorWasRls = false;
    this.emit();

    const run = (async (): Promise<StoreWorkspaceResolution> => {
      try {
        const { data: dbStores, error: fetchError } = await this.deps.fetchStores();

        if (this.epoch !== startEpoch || this.currentUserId !== cleanUserId) {
          return { stores: [], status: 'idle', reason: 'stale' };
        }

        if (fetchError) {
          const msg =
            fetchError.message ||
            'Unable to load your store workspace from database. Please retry.';
          this.status = 'error';
          this.error = msg;
          this.isInitializing = false;
          this.emit();
          return {
            stores: this.stores,
            status: 'error',
            reason: 'error',
            error: msg,
          };
        }

        const existingStores = (dbStores || []).filter((s) => STORE_UUID_REGEX.test(s.id));
        if (existingStores.length > 0) {
          const nextActiveId = selectPreferredActiveStoreId({
            stores: existingStores,
            userSelectedStoreId: this.userSelectedStoreId,
            currentActiveStoreId: this.activeStoreId,
            profileStoreId: options.profileStoreId,
            websiteStoreIds: options.websiteStoreIds,
          });
          this.stores = existingStores;
          this.activeStoreId = nextActiveId;
          this.status = 'ready';
          this.error = null;
          this.isInitializing = false;
          this.emit();
          return {
            storeId: nextActiveId,
            stores: existingStores,
            status: 'ready',
            reason: 'resolved',
          };
        }

        // Confirmed 0 stores exist in DB for this user
        if (!allowProvision || options.userRole === 'admin' || options.isAdminRoute) {
          const missingMsg =
            options.userRole === 'admin'
              ? 'No personal store workspace is attached to this administrator session.'
              : 'No store workspace found for your account yet. Click Retry Workspace Setup to create one.';
          this.stores = [];
          this.activeStoreId = '';
          this.status = 'missing';
          this.error = missingMsg;
          this.isInitializing = false;
          this.emit();
          return {
            stores: [],
            status: 'missing',
            reason: 'missing',
            error: missingMsg,
          };
        }

        const defaultName =
          (options.preferredName || '').trim() ||
          (options.userName ? `${options.userName}'s Store` : 'My Store');

        const { data: created, error: createError } = await this.deps.createStore({
          name: defaultName,
          category: options.defaultCategory || 'General E-Commerce',
          currency: options.defaultCurrency || '৳',
          phone: options.defaultPhone || '',
          address: options.defaultAddress || '',
        });

        if (this.epoch !== startEpoch || this.currentUserId !== cleanUserId) {
          return { stores: [], status: 'idle', reason: 'stale' };
        }

        if (createError || !created || !STORE_UUID_REGEX.test(created.id)) {
          const errMsg =
            createError?.message ||
            'Could not initialize a store workspace for your account. Please retry.';
          this.lastErrorWasRls = /42501|row-level security/i.test(errMsg);
          this.status = 'error';
          this.error = errMsg;
          this.isInitializing = false;
          this.emit();
          return {
            stores: this.stores,
            status: 'error',
            reason: 'error',
            error: errMsg,
          };
        }

        const nextStores = [created];
        const nextActiveId = selectPreferredActiveStoreId({
          stores: nextStores,
          userSelectedStoreId: this.userSelectedStoreId,
          currentActiveStoreId: created.id,
        });
        this.stores = nextStores;
        this.activeStoreId = nextActiveId;
        this.status = 'ready';
        this.error = null;
        this.isInitializing = false;
        this.emit();

        if (this.deps.linkUserProfileStore) {
          void this.deps.linkUserProfileStore(cleanUserId, created.id).catch(() => {});
        }

        return {
          storeId: nextActiveId,
          stores: nextStores,
          status: 'ready',
          reason: 'resolved',
        };
      } catch (err: unknown) {
        if (this.epoch !== startEpoch || this.currentUserId !== cleanUserId) {
          return { stores: [], status: 'idle', reason: 'stale' };
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'Unexpected error while initializing store workspace.';
        this.status = 'error';
        this.error = msg;
        this.isInitializing = false;
        this.emit();
        return {
          stores: this.stores,
          status: 'error',
          reason: 'error',
          error: msg,
        };
      } finally {
        if (this.inFlightToken === runToken) {
          this.inFlightPromise = null;
          this.inFlightToken = null;
          this.inFlightEpoch = -1;
          this.inFlightUserId = null;
          this.inFlightAllowAutoProvision = false;
        }
        if (this.epoch === startEpoch && this.isInitializing) {
          this.isInitializing = false;
          this.emit();
        }
      }
    })();

    this.inFlightPromise = run;
    return run;
  }
}
