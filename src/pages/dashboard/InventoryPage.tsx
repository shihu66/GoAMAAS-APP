import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import {
  Boxes,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Plus,
  SlidersHorizontal,
  History,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { TrialStatusBadge } from '../../components/ui/TrialStatusBadge';
import { TrialGateBanner } from '../../components/ui/TrialGateBanner';

export const InventoryPage: React.FC = () => {
  const { products, inventoryLogs, adjustProductStock, getServiceAccess } = useApp();
  const serviceAccess = getServiceAccess('dashboard_business', 'Dashboard Business Tier', 'dashboard');

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState(10);
  const [adjustReason, setAdjustReason] = useState('Supplier restock consignment');

  // Computed metrics
  const totalUnits = products.reduce((acc, p) => acc + p.stock, 0);
  const lowStockItems = products.filter((p) => p.stock <= p.lowStockThreshold && p.stock > 0);
  const outOfStockItems = products.filter((p) => p.stock === 0);
  const totalStockAssetValue = products.reduce((acc, p) => acc + p.stock * p.costPrice, 0);

  // Search filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      return (
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [products, search]);

  // Search filtered logs
  const filteredLogs = useMemo(() => {
    return inventoryLogs.filter((log) => {
      return (
        log.productName.toLowerCase().includes(search.toLowerCase()) ||
        log.sku.toLowerCase().includes(search.toLowerCase()) ||
        log.reason.toLowerCase().includes(search.toLowerCase()) ||
        log.operator.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [inventoryLogs, search]);

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProduct) {
      adjustProductStock(selectedProduct.id, adjustDelta, adjustReason);
    }
    setIsAdjustModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Inventory & Warehouse Stock Ledger
            </h1>
            <TrialStatusBadge
              serviceId="dashboard_business"
              serviceName="Dashboard Business Tier"
              category="dashboard"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time stock tracking, automatic reorder alerts, and movement audit logs.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'inventory'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Current Stock</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Movement Audit Log</span>
          </button>
        </div>
      </div>

      {!serviceAccess.hasAccess ? (
        <TrialGateBanner
          serviceId="dashboard_business"
          serviceName="Dashboard Business Tier"
          category="dashboard"
          serviceDescription="Prevent overselling with real-time SKU stock balances, low-stock reorder alerts, wholesale asset valuation, and timestamped movement audit logs using a 7-day free Dashboard trial."
          features={[
            'Real-Time Warehouse SKU Stock Balances',
            'Configurable Low-Stock & Out-of-Stock Warnings',
            'Wholesale Inventory Asset Cost Valuation',
            'Instant Consignment Restock & Deduction Controls',
            'Timestamped Stock Movement Audit History',
            'Automatic Deduction on Validated Orders',
          ]}
          subscribePath="/dashboard/billing"
          subscribePriceLabel="From ৳299/mo"
        />
      ) : (
        <>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Units in Stock</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalUnits} units
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Across {products.length} distinct SKUs
          </span>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Low Stock Warnings</span>
          <p className="mt-2 text-2xl font-bold text-amber-600 font-mono tabular-nums">
            {lowStockItems.length} SKUs
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Requires factory or supplier reorder
          </span>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Out of Stock</span>
          <p className="mt-2 text-2xl font-bold text-rose-600 font-mono tabular-nums">
            {outOfStockItems.length} SKUs
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Hidden from active landing pages
          </span>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Asset Cost Value</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            ৳{totalStockAssetValue.toLocaleString()}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 block">
            Wholesale acquisition baseline
          </span>
        </div>
      </div>

      {/* Low-stock action banner if any */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Immediate Restock Alert:</strong> {lowStockItems.map((i) => i.name).join(', ')} are below safety reserve thresholds.
            </span>
          </div>
          <button
            onClick={() => {
              setSelectedProduct(lowStockItems[0]);
              setAdjustDelta(25);
              setIsAdjustModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 transition-colors"
          >
            Restock First Item
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative w-full max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'inventory' ? 'Filter by product name or SKU...' : 'Filter audit log by operator or reason...'}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* View 1: Current Stock Table */}
      {activeTab === 'inventory' ? (
        products.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <Boxes className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No inventory items yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add products to your catalog to monitor stock reserves, set low-stock warnings, and record restocks.
            </p>
            <div className="pt-2">
              <Link
                to="/dashboard/products"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Go to Products Catalog</span>
              </Link>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <Search className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No matching products found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No products match your search query "{search}". Try clearing your search filter.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Product Name & Description</th>
                    <th className="py-3 px-4">SKU / Category</th>
                    <th className="py-3 px-4 text-right">Cost (৳)</th>
                    <th className="py-3 px-4 text-right">Retail (৳)</th>
                    <th className="py-3 px-4 text-right">Stock Level</th>
                    <th className="py-3 px-4">Health Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.map((p) => {
                    const isLow = p.stock <= p.lowStockThreshold && p.stock > 0;
                    const isOut = p.stock === 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900 dark:text-white block">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-400 line-clamp-1">{p.description}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-blue-600 dark:text-blue-400 block">{p.sku}</span>
                          <span className="text-slate-400 text-[10px]">{p.category}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          ৳{p.costPrice.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          ৳{p.price.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                          <span className={isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}>
                            {p.stock} units
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                              <span className="w-2 h-2 rounded-full bg-rose-600" />
                              <span>Out of Stock</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>Low Stock (&lt;{p.lowStockThreshold})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>Nominal Reserve</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedProduct(p);
                              setAdjustDelta(10);
                              setIsAdjustModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          >
                            Adjust Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* View 2: Movement Audit Log */
        inventoryLogs.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <History className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No stock movements logged yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Every restock, sale decrement, or damaged goods write-off will be recorded here with an immutable operator audit trail.
            </p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <Search className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No matching audit logs</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No inventory movements match your filter query "{search}".
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Product & SKU</th>
                    <th className="py-3 px-4">Change Type</th>
                    <th className="py-3 px-4 text-right">Delta</th>
                    <th className="py-3 px-4 text-right">Previous -&gt; New</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {log.date}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          {log.productName}
                        </span>
                        <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                          {log.sku}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            log.type === 'restock'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : log.type === 'sale'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}
                        >
                          {log.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                        <span className={log.quantityDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {log.quantityDelta >= 0 ? `+${log.quantityDelta}` : log.quantityDelta}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                        {log.previousStock} &rarr; <strong className="text-slate-900 dark:text-white">{log.newStock}</strong>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {log.reason}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {log.operator}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
        </>
      )}

      {/* Stock Adjustment Modal */}
      {selectedProduct && (
        <Modal
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          title={`Adjust Inventory — ${selectedProduct.name}`}
          maxWidth="sm"
        >
          <form onSubmit={handleApplyAdjustment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
              <div>
                <span className="text-slate-400 block text-[10px]">Current Stock:</span>
                <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">
                  {selectedProduct.stock} units
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">SKU:</span>
                <span className="font-mono text-blue-600">{selectedProduct.sku}</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantity Delta (Positive for restock, negative for deduction) *
              </label>
              <input
                type="number"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                New Stock Balance:{' '}
                <strong className="font-mono text-blue-600">
                  {Math.max(0, selectedProduct.stock + adjustDelta)} units
                </strong>
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason / Consignment Reference *
              </label>
              <input
                type="text"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Factory delivery consignment #8410"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Record Movement
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
