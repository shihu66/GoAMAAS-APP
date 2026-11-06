import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Product } from '../../types';
import {
  computeProductWebsiteSyncState,
  getEffectiveProductUnitPrice,
  ProductWebsiteSyncState,
} from '../../lib/storefrontSync';
import {
  Package,
  Plus,
  Search,
  Grid,
  List,
  Edit,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Upload,
  Globe,
  Loader2,
  X,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Star,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const DEFAULT_CATEGORIES = [
  'Fashion & Apparel',
  'Accessories',
  'Sportswear',
  'Gadgets & Electronics',
  'Organic Foods & Grocery',
  'Beauty & Skincare',
  'Home & Living',
  'Services & Packages',
];

export const ProductsPage: React.FC = () => {
  const {
    products,
    subscribedWebsites,
    activeStore,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStock,
    publishProductToWebsite,
    unpublishProductFromWebsite,
    uploadWebsiteAsset,
    showToast,
  } = useApp();
  const { lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [selectedWebsiteSyncFilter, setSelectedWebsiteSyncFilter] = useState<
    'all' | ProductWebsiteSyncState
  >('all');
  const [sortField, setSortField] = useState<'name' | 'price' | 'stock' | 'salesCount'>('salesCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStockAdjustModalOpen, setIsStockAdjustModalOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [publishingProductId, setPublishingProductId] = useState<string | null>(null);

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const myWebsites = useMemo(() => {
    if (!activeStore) return subscribedWebsites;
    const storeMatched = subscribedWebsites.filter(
      (s) => !s.storeId || s.storeId === activeStore.id
    );
    return storeMatched.length > 0 ? storeMatched : subscribedWebsites;
  }, [subscribedWebsites, activeStore]);

  const primaryWebsite = myWebsites[0] || null;

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Fashion & Apparel',
    price: 1500,
    discountPrice: '' as string | number,
    costPrice: 800,
    stock: 25,
    lowStockThreshold: 10,
    status: 'active' as Product['status'],
    description: '',
    imageUrl: '',
    websiteId: '',
    isVisible: true,
    sortOrder: 0,
    isFeatured: false,
  });

  const [stockAdjustDelta, setStockAdjustDelta] = useState(10);
  const [stockAdjustReason, setStockAdjustReason] = useState('New shipment restock');

  const handleOpenAdd = () => {
    setImageUploadError(null);
    setFormData({
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'Fashion & Apparel',
      price: 1500,
      discountPrice: '',
      costPrice: 800,
      stock: 25,
      lowStockThreshold: 10,
      status: 'active',
      description: '',
      imageUrl: '',
      websiteId: primaryWebsite?.id || '',
      isVisible: Boolean(primaryWebsite),
      sortOrder: products.length,
      isFeatured: false,
    });
    setIsAddModalOpen(true);
  };

  // Support `?action=add` shortcut from Dashboard Overview
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      handleOpenAdd();
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Categories list combining defaults + merchant custom categories
  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const p of products) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return ['all', ...Array.from(set)];
  }, [products]);

  const productSyncMap = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof computeProductWebsiteSyncState>
    >();
    for (const p of products) {
      map.set(p.id, computeProductWebsiteSyncState(p, myWebsites));
    }
    return map;
  }, [products, myWebsites]);

  const syncSummaryCounts = useMemo(() => {
    let published = 0;
    let update_pending = 0;
    let draft = 0;
    let unavailable = 0;
    for (const p of products) {
      const info = productSyncMap.get(p.id);
      if (!info) continue;
      if (info.state === 'published') published += 1;
      else if (info.state === 'update_pending') update_pending += 1;
      else if (info.state === 'unavailable') unavailable += 1;
      else draft += 1;
    }
    return { all: products.length, published, update_pending, draft, unavailable };
  }, [products, productSyncMap]);

  // Filtering & Sorting
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        const matchesCategory =
          selectedCategory === 'all' || p.category === selectedCategory;
        const matchesStock =
          selectedStockStatus === 'all' ||
          (selectedStockStatus === 'low' && p.stock <= p.lowStockThreshold && p.stock > 0) ||
          (selectedStockStatus === 'out' && p.stock === 0) ||
          (selectedStockStatus === 'in' && p.stock > p.lowStockThreshold);
        const syncState = productSyncMap.get(p.id)?.state || 'draft';
        const matchesWebsiteSync =
          selectedWebsiteSyncFilter === 'all' || syncState === selectedWebsiteSyncFilter;
        return matchesSearch && matchesCategory && matchesStock && matchesWebsiteSync;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortOrder === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
  }, [
    products,
    search,
    selectedCategory,
    selectedStockStatus,
    selectedWebsiteSyncFilter,
    sortField,
    sortOrder,
    productSyncMap,
  ]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleOpenEdit = (p: Product) => {
    setActiveProduct(p);
    setImageUploadError(null);
    setFormData({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      discountPrice:
        typeof p.discountPrice === 'number' && p.discountPrice > 0 ? p.discountPrice : '',
      costPrice: p.costPrice,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      status: p.status,
      description: p.description,
      imageUrl: p.image || '',
      websiteId: p.websiteId || primaryWebsite?.id || '',
      isVisible: p.isVisible !== false,
      sortOrder: p.sortOrder ?? 0,
      isFeatured: Boolean(p.isFeatured),
    });
    setIsEditModalOpen(true);
  };

  const handleToggleFeatured = async (p: Product) => {
    const nextFeatured = !p.isFeatured;
    await updateProduct(p.id, { isFeatured: nextFeatured });
    showToast(
      nextFeatured
        ? `"${p.name}" marked as Featured on website.`
        : `"${p.name}" removed from Featured.`,
      'info'
    );
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImageUploadError(null);
    setIsUploadingImage(true);
    try {
      const res = await uploadWebsiteAsset({
        file,
        folder: 'products',
        websiteId: formData.websiteId || primaryWebsite?.id || undefined,
      });
      if (res.publicUrl && !res.error) {
        setFormData((prev) => ({ ...prev, imageUrl: res.publicUrl! }));
        showToast('Product image uploaded.', 'success');
      } else {
        const msg = res.error?.message || 'Image upload failed.';
        setImageUploadError(msg);
        showToast(msg, 'error');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const parseDiscountValue = (raw: string | number, basePrice: number): number | undefined => {
    if (raw === '' || raw === null || raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    if (parsed >= basePrice) return undefined;
    return parsed;
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const basePrice = Math.max(0, Number(formData.price) || 0);
    if (
      formData.discountPrice !== '' &&
      Number(formData.discountPrice) > 0 &&
      Number(formData.discountPrice) >= basePrice
    ) {
      showToast('Discount price must be lower than the regular selling price.', 'warning');
      return;
    }

    setIsSavingProduct(true);
    try {
      const created = await addProduct({
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category.trim() || 'General',
        price: basePrice,
        discountPrice: parseDiscountValue(formData.discountPrice, basePrice),
        costPrice: Math.max(0, Number(formData.costPrice) || 0),
        stock: Math.max(0, Math.trunc(Number(formData.stock) || 0)),
        lowStockThreshold: Math.max(1, Math.trunc(Number(formData.lowStockThreshold) || 5)),
        status: formData.status,
        description: formData.description.trim(),
        image: formData.imageUrl.trim() || undefined,
        websiteId: formData.websiteId || undefined,
        isVisible: Boolean(formData.websiteId) && formData.isVisible,
        sortOrder: Number(formData.sortOrder) || 0,
        isFeatured: Boolean(formData.isFeatured),
      });
      if (created) {
        setIsAddModalOpen(false);
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    const basePrice = Math.max(0, Number(formData.price) || 0);
    if (
      formData.discountPrice !== '' &&
      Number(formData.discountPrice) > 0 &&
      Number(formData.discountPrice) >= basePrice
    ) {
      showToast('Discount price must be lower than the regular selling price.', 'warning');
      return;
    }

    setIsSavingProduct(true);
    try {
      const updated = await updateProduct(activeProduct.id, {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category.trim() || 'General',
        price: basePrice,
        discountPrice: parseDiscountValue(formData.discountPrice, basePrice),
        costPrice: Math.max(0, Number(formData.costPrice) || 0),
        stock: Math.max(0, Math.trunc(Number(formData.stock) || 0)),
        lowStockThreshold: Math.max(1, Math.trunc(Number(formData.lowStockThreshold) || 5)),
        status: formData.status,
        description: formData.description.trim(),
        image: formData.imageUrl.trim(),
        websiteId: formData.websiteId,
        isVisible: Boolean(formData.websiteId) && formData.isVisible,
        sortOrder: Number(formData.sortOrder) || 0,
        isFeatured: Boolean(formData.isFeatured),
      });
      if (updated) {
        setIsEditModalOpen(false);
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handlePublishAction = async (p: Product) => {
    const targetSiteId = p.websiteId || primaryWebsite?.id;
    if (!targetSiteId) {
      showToast('Create your GoAMAAS Website first before publishing products.', 'warning');
      return;
    }
    setPublishingProductId(p.id);
    try {
      await publishProductToWebsite(p.id, targetSiteId);
    } finally {
      setPublishingProductId(null);
    }
  };

  const handleUnpublishAction = async (p: Product) => {
    const syncInfo = productSyncMap.get(p.id);
    const targetSiteId = p.websiteId || syncInfo?.website?.id || primaryWebsite?.id;
    setPublishingProductId(p.id);
    try {
      await unpublishProductFromWebsite(p.id, targetSiteId);
    } finally {
      setPublishingProductId(null);
    }
  };

  const handleSaveStockAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeProduct) {
      adjustProductStock(activeProduct.id, stockAdjustDelta, stockAdjustReason);
    }
    setIsStockAdjustModalOpen(false);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderWebsiteSyncStatus = (state: ProductWebsiteSyncState) => {
    if (state === 'published') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Published</span>
        </span>
      );
    }
    if (state === 'update_pending') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Update Pending</span>
        </span>
      );
    }
    if (state === 'unavailable') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Unavailable / Out of Stock</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <EyeOff className="w-3.5 h-3.5 shrink-0" />
        <span>Draft / Not Published</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {lang === 'bn' ? 'পণ্য ও ওয়েবসাইট ক্যাটালগ' : 'Products & Website Catalog'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'bn'
              ? 'পণ্যের মূল্য, স্টক পরিচালনা করুন এবং সরাসরি আপনার পাবলিক ওয়েবসাইটে প্রকাশ করুন।'
              : 'Manage inventory, pricing, discounts, and publish products directly to your live storefront.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {primaryWebsite && (
            <a
              href={`/s/${primaryWebsite.subdomain}#services`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{lang === 'bn' ? 'ওয়েবসাইট দেখুন' : 'Preview Storefront'}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Card Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'bn' ? 'নতুন পণ্য যোগ করুন' : 'Add Product'}</span>
          </button>
        </div>
      </div>

      {/* Website Publishing State Segmented Filter */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {[
          { key: 'all', label: 'All Products', count: syncSummaryCounts.all },
          { key: 'published', label: 'Published on Website', count: syncSummaryCounts.published },
          { key: 'update_pending', label: 'Update Pending', count: syncSummaryCounts.update_pending },
          { key: 'draft', label: 'Draft / Not Published', count: syncSummaryCounts.draft },
          { key: 'unavailable', label: 'Unavailable / Out of Stock', count: syncSummaryCounts.unavailable },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setSelectedWebsiteSyncFilter(tab.key as any);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer ${
              selectedWebsiteSyncFilter === tab.key
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            <span className="font-mono text-[10px] tabular-nums opacity-80">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by product name, SKU, or category..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Category & Stock Status Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Stock:</span>
            <select
              value={selectedStockStatus}
              onChange={(e) => {
                setSelectedStockStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">All Stock Levels</option>
              <option value="in">In Stock</option>
              <option value="low">Low Stock Alerts</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      {products.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <Package className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Your product catalog is empty
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Add your first product to track inventory, accept customer orders, and publish directly to your GoAMAAS Website.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Product</span>
            </button>
            {!primaryWebsite && (
              <Link
                to="/create-website"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Create Website</span>
              </Link>
            )}
          </div>
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Package className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No products found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query or clearing your active filter tabs.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">
                    <button
                      onClick={() => toggleSort('name')}
                      className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Product</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">SKU · Category</th>
                  <th className="py-3 px-4">Website Publishing</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      onClick={() => toggleSort('price')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Price</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      onClick={() => toggleSort('stock')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Stock</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Website &amp; Catalog Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedProducts.map((p) => {
                  const isLow = p.stock <= p.lowStockThreshold && p.stock > 0;
                  const isOut = p.stock <= 0;
                  const syncInfo =
                    productSyncMap.get(p.id) || computeProductWebsiteSyncState(p, myWebsites);
                  const targetWebsite = syncInfo.website || primaryWebsite;
                  const { unitPrice, hasDiscount, originalPrice } = getEffectiveProductUnitPrice(p);
                  const isBusy = publishingProductId === p.id;
                  const hasPublishedEntry = Boolean(syncInfo.publishedItem);

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white max-w-xs truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">
                              {p.description || 'No description provided'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 block">
                          {p.sku}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.category} · <span className="capitalize">{p.status}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {renderWebsiteSyncStatus(syncInfo.state)}
                          {targetWebsite ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                              <span className="truncate max-w-[150px]">
                                {targetWebsite.fullDomainUrl}
                              </span>
                              <span aria-hidden="true">·</span>
                              <a
                                href={`/s/${targetWebsite.subdomain}#services`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline font-sans whitespace-nowrap"
                              >
                                Preview
                              </a>
                            </div>
                          ) : (
                            <Link
                              to="/create-website"
                              className="block text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Connect a website →
                            </Link>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">
                          ৳{unitPrice.toLocaleString()}
                        </span>
                        {hasDiscount && originalPrice ? (
                          <span className="block text-[10px] text-slate-400 line-through">
                            ৳{originalPrice.toLocaleString()}
                          </span>
                        ) : (
                          <span className="block text-[10px] text-slate-400">
                            Cost ৳{p.costPrice.toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            isOut
                              ? 'text-rose-600 dark:text-rose-400'
                              : isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {p.stock} units
                        </span>
                        {isLow && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans">
                            Low (&le;{p.lowStockThreshold})
                          </span>
                        )}
                        {isOut && (
                          <span className="block text-[10px] text-rose-600 dark:text-rose-400 font-sans">
                            Out of stock
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {targetWebsite && syncInfo.state === 'draft' && p.stock > 0 && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handlePublishAction(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Globe className="w-3 h-3" />
                              )}
                              <span>Publish to Website</span>
                            </button>
                          )}

                          {targetWebsite && syncInfo.state === 'update_pending' && p.stock > 0 && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handlePublishAction(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              <span>Update on Website</span>
                            </button>
                          )}

                          {hasPublishedEntry && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleUnpublishAction(p)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              title="Remove from public website storefront"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                              <span>Unpublish</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleToggleFeatured(p)}
                            className={`p-1.5 cursor-pointer transition-colors ${
                              p.isFeatured
                                ? 'text-amber-500 hover:text-amber-600'
                                : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                            }`}
                            title={
                              p.isFeatured
                                ? 'Featured on storefront (click to remove)'
                                : 'Mark as Featured on storefront'
                            }
                          >
                            <Star className={`w-3.5 h-3.5 ${p.isFeatured ? 'fill-amber-400' : ''}`} />
                          </button>
                          <button
                            onClick={() => {
                              setActiveProduct(p);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="View Product Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setActiveProduct(p);
                              setStockAdjustDelta(10);
                              setIsStockAdjustModalOpen(true);
                            }}
                            className="p-1.5 text-blue-500 hover:text-blue-700 cursor-pointer"
                            title="Adjust Stock"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setActiveProduct(p);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="p-1.5 text-rose-400 hover:text-rose-600 cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedProducts.map((p) => {
            const isLow = p.stock <= p.lowStockThreshold && p.stock > 0;
            const isOut = p.stock <= 0;
            const syncInfo =
              productSyncMap.get(p.id) || computeProductWebsiteSyncState(p, myWebsites);
            const targetWebsite = syncInfo.website || primaryWebsite;
            const { unitPrice, hasDiscount, originalPrice } = getEffectiveProductUnitPrice(p);
            const isBusy = publishingProductId === p.id;
            const hasPublishedEntry = Boolean(syncInfo.publishedItem);

            return (
              <div
                key={p.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between overflow-hidden hover:border-blue-500/50 transition-colors"
              >
                {p.image ? (
                  <div className="aspect-[16/10] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <img
                      src={p.image}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/10] w-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-300 dark:text-slate-600">
                    <Package className="w-8 h-8" />
                  </div>
                )}

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-mono text-blue-600 dark:text-blue-400 truncate">
                        {p.sku} · {p.category}
                      </span>
                      {renderWebsiteSyncStatus(syncInfo.state)}
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {p.description || 'No detailed specifications recorded.'}
                    </p>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
                      <div>
                        <span className="text-slate-400 text-[10px] font-sans block">Price</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          ৳{unitPrice.toLocaleString()}
                        </span>
                        {hasDiscount && originalPrice && (
                          <span className="ml-1.5 text-[10px] text-slate-400 line-through">
                            ৳{originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] font-sans block">Stock</span>
                        <span
                          className={`font-bold ${
                            isOut
                              ? 'text-rose-600 dark:text-rose-400'
                              : isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {p.stock} units
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {targetWebsite && syncInfo.state !== 'published' && p.stock > 0 && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handlePublishAction(p)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap"
                        >
                          {syncInfo.state === 'update_pending' ? 'Update Site' : 'Publish'}
                        </button>
                      )}
                      {hasPublishedEntry && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleUnpublishAction(p)}
                          className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          Unpublish
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleFeatured(p)}
                        className={`p-1 cursor-pointer transition-colors ${
                          p.isFeatured
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                        }`}
                        title={
                          p.isFeatured
                            ? 'Featured on storefront (click to remove)'
                            : 'Mark as Featured on storefront'
                        }
                      >
                        <Star className={`w-3.5 h-3.5 ${p.isFeatured ? 'fill-amber-400' : ''}`} />
                      </button>
                      {targetWebsite && (
                        <a
                          href={`/s/${targetWebsite.subdomain}#services`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-blue-600"
                          title="Preview on Website"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setActiveProduct(p);
                          setIsStockAdjustModalOpen(true);
                        }}
                        className="p-1 text-blue-500 hover:text-blue-700 cursor-pointer"
                        title="Adjust Stock"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="Edit Product"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setActiveProduct(p);
                          setIsDeleteDialogOpen(true);
                        }}
                        className="p-1 text-rose-400 hover:text-rose-600 cursor-pointer"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
          <div className="font-mono tabular-nums">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of{' '}
            {filteredProducts.length} items
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }}
        title={isAddModalOpen ? 'Add New Product' : `Edit Product (${activeProduct?.sku})`}
        maxWidth="lg"
      >
        <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Handwoven Jamdani Saree"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SKU / Product Code *
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Product Image Upload + URL */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Product Image
              </label>
              <div className="flex items-center gap-2">
                {formData.imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, imageUrl: '' }));
                      setImageUploadError(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[11px] font-medium cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer">
                  {isUploadingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{formData.imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={handleImageFileUpload}
                    disabled={isUploadingImage}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {imageUploadError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{imageUploadError}</p>
            )}

            <div className="flex items-center gap-3">
              {formData.imageUrl ? (
                <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <img
                    src={formData.imageUrl}
                    alt="Product preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}

              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="Or paste a public image URL (https://...)"
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Website Assignment, Display Order & Storefront Visibility */}
          {myWebsites.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GoAMAAS Website Storefront
                </label>
                <select
                  value={formData.websiteId}
                  onChange={(e) => setFormData({ ...formData, websiteId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Keep in Dashboard only (Draft)</option>
                  {myWebsites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.businessName} ({site.fullDomainUrl})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Website Display Order
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                  disabled={!formData.websiteId}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono disabled:opacity-50"
                />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isVisible}
                    onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })}
                    disabled={!formData.websiteId}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Publish to Website on Save</span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <input
                type="text"
                list="goamaas-product-categories"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g. Fashion & Apparel"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <datalist id="goamaas-product-categories">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Regular Price (৳) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Discount Price (৳)
              </label>
              <input
                type="number"
                min={0}
                value={formData.discountPrice}
                onChange={(e) => setFormData({ ...formData, discountPrice: e.target.value })}
                placeholder="Optional sale price"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cost Price (৳)
              </label>
              <input
                type="number"
                min={0}
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Available Stock Quantity *
              </label>
              <input
                type="number"
                required
                min={0}
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: Math.max(0, Number(e.target.value)) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min={1}
                value={formData.lowStockThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, lowStockThreshold: Math.max(1, Number(e.target.value)) })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Availability Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as Product['status'] })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="active">Active (Available for Sale)</option>
                <option value="draft">Draft (Internal Only)</option>
                <option value="archived">Archived (Unavailable)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Product Description &amp; Specifications
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe fabric, dimensions, warranty, or package details..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <input
              type="checkbox"
              id="product-is-featured-input"
              checked={formData.isFeatured}
              onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
            />
            <label
              htmlFor="product-is-featured-input"
              className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>Mark as Featured Product (prioritized on public website catalog)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingProduct || isUploadingImage}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer"
            >
              {isSavingProduct
                ? 'Saving to Server...'
                : isAddModalOpen
                ? formData.websiteId && formData.isVisible
                  ? 'Save & Publish to Website'
                  : 'Create Product'
                : 'Save Product Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Stock Adjustment Modal */}
      <Modal
        isOpen={isStockAdjustModalOpen}
        onClose={() => setIsStockAdjustModalOpen(false)}
        title={`Adjust Stock — ${activeProduct?.name}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveStockAdjust} className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
            <span className="text-slate-400 block">Current Stock:</span>
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {activeProduct?.stock} units
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Stock Quantity Delta (+/-)
            </label>
            <input
              type="number"
              required
              value={stockAdjustDelta}
              onChange={(e) => setStockAdjustDelta(Number(e.target.value))}
              placeholder="e.g. +20 to restock, or -5 for damage"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Resulting Stock (never negative):{' '}
              <strong className="font-mono tabular-nums text-blue-600">
                {Math.max(0, (activeProduct?.stock || 0) + stockAdjustDelta)}
              </strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reason / Reference
            </label>
            <input
              type="text"
              required
              value={stockAdjustReason}
              onChange={(e) => setStockAdjustReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsStockAdjustModalOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Details Modal */}
      {activeProduct && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={activeProduct.name}
          description={`SKU: ${activeProduct.sku} · Category: ${activeProduct.category}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            {activeProduct.image && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-56 bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <img
                  src={activeProduct.image}
                  alt={activeProduct.name}
                  referrerPolicy="no-referrer"
                  className="max-h-56 w-auto object-contain"
                />
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Website Publishing Status:</span>
              {renderWebsiteSyncStatus(
                productSyncMap.get(activeProduct.id)?.state ||
                  computeProductWebsiteSyncState(activeProduct, myWebsites).state
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Effective Selling Price:</span>
                <span className="font-bold text-sm font-mono tabular-nums text-slate-900 dark:text-white">
                  ৳{getEffectiveProductUnitPrice(activeProduct).unitPrice.toLocaleString()}
                </span>
                {activeProduct.discountPrice && activeProduct.discountPrice < activeProduct.price && (
                  <span className="ml-1.5 text-[10px] font-mono text-slate-400 line-through">
                    ৳{activeProduct.price.toLocaleString()}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Estimated Unit Margin:</span>
                {(() => {
                  const eff = getEffectiveProductUnitPrice(activeProduct).unitPrice;
                  const margin = eff - activeProduct.costPrice;
                  return (
                    <span className="font-bold text-sm font-mono tabular-nums text-emerald-600">
                      ৳{margin.toLocaleString()} (
                      {eff > 0 ? Math.round((margin / eff) * 100) : 0}%)
                    </span>
                  );
                })()}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Current Stock:</span>
                <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {activeProduct.stock} units
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Total Sold:</span>
                <span className="font-bold font-mono tabular-nums text-blue-600">
                  {activeProduct.salesCount} units
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 block font-semibold mb-1">Description:</span>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeProduct.description || 'No detailed description available.'}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {primaryWebsite && activeProduct.stock > 0 && (
                  <button
                    type="button"
                    disabled={publishingProductId === activeProduct.id}
                    onClick={() => void handlePublishAction(activeProduct)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                  >
                    {productSyncMap.get(activeProduct.id)?.state === 'published'
                      ? 'Sync Again'
                      : 'Publish to Website'}
                  </button>
                )}
                {primaryWebsite && (
                  <a
                    href={`/s/${primaryWebsite.subdomain}#services`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span>Preview on Website</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (activeProduct) {
            void deleteProduct(activeProduct.id);
          }
        }}
        title="Delete Product?"
        message={`Are you sure you want to permanently remove "${activeProduct?.name}" (${activeProduct?.sku})? Existing historical orders will retain their saved product snapshot, while the item will be removed from your active catalog and public website.`}
        confirmLabel="Delete Product"
        cancelLabel="Keep Product"
        isDestructive
      />
    </div>
  );
};
