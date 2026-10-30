import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
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
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export const ProductsPage: React.FC = () => {
  const {
    products,
    subscribedWebsites,
    activeStore,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStock,
    uploadWebsiteAsset,
    showToast,
  } = useApp();

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'price' | 'stock' | 'salesCount'>('salesCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStockAdjustModalOpen, setIsStockAdjustModalOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const myWebsites = useMemo(() => {
    if (!activeStore) return subscribedWebsites;
    const storeMatched = subscribedWebsites.filter(
      (s) => !s.storeId || s.storeId === activeStore.id
    );
    return storeMatched.length > 0 ? storeMatched : subscribedWebsites;
  }, [subscribedWebsites, activeStore]);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Fashion & Apparel',
    price: 1500,
    costPrice: 800,
    stock: 25,
    lowStockThreshold: 10,
    status: 'active' as Product['status'],
    description: '',
    imageUrl: '',
    websiteId: '',
    isVisible: true,
    sortOrder: 0,
  });

  const [stockAdjustDelta, setStockAdjustDelta] = useState(10);
  const [stockAdjustReason, setStockAdjustReason] = useState('New shipment restock');

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtering & Sorting
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase());
        const matchesCategory =
          selectedCategory === 'all' || p.category === selectedCategory;
        const matchesStock =
          selectedStockStatus === 'all' ||
          (selectedStockStatus === 'low' && p.stock <= p.lowStockThreshold && p.stock > 0) ||
          (selectedStockStatus === 'out' && p.stock === 0) ||
          (selectedStockStatus === 'in' && p.stock > p.lowStockThreshold);
        return matchesSearch && matchesCategory && matchesStock;
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
  }, [products, search, selectedCategory, selectedStockStatus, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      sku: `APX-${Math.floor(100 + Math.random() * 900)}`,
      category: 'Fashion & Apparel',
      price: 1500,
      costPrice: 800,
      stock: 25,
      lowStockThreshold: 10,
      status: 'active',
      description: '',
      imageUrl: '',
      websiteId: myWebsites[0]?.id || '',
      isVisible: true,
      sortOrder: products.length,
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setActiveProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      costPrice: p.costPrice,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      status: p.status,
      description: p.description,
      imageUrl: p.image || '',
      websiteId: p.websiteId || '',
      isVisible: p.isVisible !== false,
      sortOrder: p.sortOrder ?? 0,
    });
    setIsEditModalOpen(true);
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const res = await uploadWebsiteAsset({
        file,
        folder: 'products',
        websiteId: formData.websiteId || undefined,
      });
      if (res.publicUrl && !res.error) {
        setFormData((prev) => ({ ...prev, imageUrl: res.publicUrl! }));
        showToast('Product image uploaded.', 'success');
      } else {
        showToast(res.error?.message || 'Image upload failed.', 'error');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProduct(true);
    try {
      await addProduct({
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category,
        price: Number(formData.price),
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        lowStockThreshold: Number(formData.lowStockThreshold),
        status: formData.status,
        description: formData.description.trim(),
        image: formData.imageUrl.trim() || undefined,
        websiteId: formData.websiteId || undefined,
        isVisible: formData.isVisible,
        sortOrder: formData.sortOrder,
      });
      setIsAddModalOpen(false);
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    setIsSavingProduct(true);
    try {
      await updateProduct(activeProduct.id, {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category,
        price: Number(formData.price),
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        lowStockThreshold: Number(formData.lowStockThreshold),
        status: formData.status,
        description: formData.description.trim(),
        image: formData.imageUrl.trim(),
        websiteId: formData.websiteId,
        isVisible: formData.isVisible,
        sortOrder: Number(formData.sortOrder) || 0,
      });
      setIsEditModalOpen(false);
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleToggleWebsiteVisibility = async (p: Product) => {
    const nextVisible = p.isVisible === false;
    await updateProduct(p.id, { isVisible: nextVisible });
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

  const getWebsiteDomainLabel = (websiteId?: string) => {
    if (!websiteId) return null;
    const found = subscribedWebsites.find((w) => w.id === websiteId);
    return found ? found.fullDomainUrl : null;
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Products & Inventory Catalog
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage product pricing, images, website storefront visibility, and stock thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
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
            placeholder="Search by product name or SKU..."
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
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Your product catalog is empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Add your first item to start tracking inventory, receiving orders, and showcasing items on your GoAMAAS Website.
          </p>
          <div className="pt-2">
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Product</span>
            </button>
          </div>
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Package className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No products found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query or filters.
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
                  <th className="py-3 px-4">SKU / Category</th>
                  <th className="py-3 px-4">Website Display</th>
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
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedProducts.map((p) => {
                  const isLow = p.stock <= p.lowStockThreshold && p.stock > 0;
                  const isOut = p.stock === 0;
                  const siteDomain = getWebsiteDomainLabel(p.websiteId);
                  const isShownOnWebsite = Boolean(p.websiteId) && p.isVisible !== false && p.status === 'active';

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
                            <div className="text-[10px] text-slate-400 line-clamp-1">
                              {p.description || 'No description provided.'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-blue-600 dark:text-blue-400 block">{p.sku}</span>
                        <span className="text-slate-400 text-[10px]">{p.category}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {p.websiteId ? (
                          <div className="space-y-0.5">
                            <button
                              type="button"
                              onClick={() => void handleToggleWebsiteVisibility(p)}
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
                                isShownOnWebsite
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="Toggle visibility on published website"
                            >
                              {p.isVisible === false ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Globe className="w-3.5 h-3.5" />
                              )}
                              <span>{p.isVisible === false ? 'Hidden on Site' : 'Visible on Site'}</span>
                            </button>
                            {siteDomain && (
                              <span className="block font-mono text-[10px] text-slate-400 truncate max-w-[160px]">
                                {siteDomain}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Inventory only</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        ৳{p.price.toLocaleString()}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          Cost: ৳{p.costPrice.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            isOut
                              ? 'text-rose-600'
                              : isLow
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {p.stock} units
                        </span>
                        {isLow && (
                          <span className="block text-[10px] text-amber-500 font-semibold">
                            Low Stock (&lt;{p.lowStockThreshold})
                          </span>
                        )}
                        {isOut && (
                          <span className="block text-[10px] text-rose-500 font-semibold">
                            Out of Stock
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            p.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : p.status === 'draft'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setActiveProduct(p);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setActiveProduct(p);
                              setStockAdjustDelta(10);
                              setIsStockAdjustModalOpen(true);
                            }}
                            className="p-1 text-blue-500 hover:text-blue-700 cursor-pointer"
                            title="Adjust Stock"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
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
            const isOut = p.stock === 0;
            const siteDomain = getWebsiteDomainLabel(p.websiteId);

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
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : null}

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                        {p.sku}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          p.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {p.description || 'No detailed specifications recorded.'}
                    </p>

                    {siteDomain && (
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {p.isVisible === false ? 'Hidden on ' : 'Shown on '}
                        {siteDomain}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800 font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Price</span>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                          ৳{p.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">In Stock</span>
                        <span
                          className={`font-bold tabular-nums ${
                            isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {p.stock} units
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400">{p.salesCount} sold</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveProduct(p);
                          setIsStockAdjustModalOpen(true);
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 cursor-pointer"
                      >
                        Adjust Stock
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
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
          <div>
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
            <span className="px-2 font-semibold text-slate-900 dark:text-white font-mono">
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
                Product Title *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SKU Barcode *
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

            <div className="flex items-center gap-3">
              {formData.imageUrl ? (
                <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <img
                    src={formData.imageUrl}
                    alt="Product preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-900/80 text-white hover:bg-rose-600 cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : null}

              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="Or paste an image URL (https://...)"
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
                  <option value="">Do not link to website</option>
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
                  <span>Show on Published Website</span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Fashion & Apparel">Fashion & Apparel</option>
                <option value="Accessories">Accessories</option>
                <option value="Sportswear">Sportswear</option>
                <option value="Gadgets">Gadgets</option>
                <option value="Organic Foods">Organic Foods</option>
                <option value="Home & Living">Home & Living</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Selling Price (৳) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
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
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Initial Stock Count
              </label>
              <input
                type="number"
                min={0}
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Low Stock Threshold
              </label>
              <input
                type="number"
                min={1}
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Product['status'] })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description & Specifications
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
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
                ? 'Saving...'
                : isAddModalOpen
                ? 'Create Product'
                : 'Save Changes'}
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
            <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
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
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Resulting Stock:{' '}
              <strong className="font-mono text-blue-600">
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

      {/* Product Details Drawer/Modal */}
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
                  className="max-h-56 w-auto object-contain"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Selling Price:</span>
                <span className="font-bold text-sm font-mono text-slate-900 dark:text-white">
                  ৳{activeProduct.price.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Estimated Margin:</span>
                <span className="font-bold text-sm font-mono text-emerald-600">
                  ৳{(activeProduct.price - activeProduct.costPrice).toLocaleString()} (
                  {activeProduct.price > 0
                    ? Math.round(((activeProduct.price - activeProduct.costPrice) / activeProduct.price) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Current Stock:</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">
                  {activeProduct.stock} units
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Total Sold:</span>
                <span className="font-bold font-mono text-blue-600">
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

            <div className="pt-2 flex justify-end">
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
        message={`Are you sure you want to permanently remove "${activeProduct?.name}" (${activeProduct?.sku})? This will remove it from your catalog and published website.`}
        confirmLabel="Delete Product"
        cancelLabel="Keep Product"
        isDestructive
      />
    </div>
  );
};
