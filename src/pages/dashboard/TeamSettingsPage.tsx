import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { TeamMember, Store } from '../../types';
import {
  Settings,
  Users,
  Store as StoreIcon,
  Shield,
  Bell,
  Lock,
  Plus,
  Trash2,
  CheckCircle2,
  Upload,
  Save,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const TeamSettingsPage: React.FC = () => {
  const {
    activeStore,
    updateActiveStore,
    teamMembers,
    addTeamMember,
    removeTeamMember,
    user,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'store' | 'team' | 'security' | 'notifications'>('store');

  // Store form
  const [storeName, setStoreName] = useState(activeStore?.name || '');
  const [storeCategory, setStoreCategory] = useState(activeStore?.category || '');
  const [storePhone, setStorePhone] = useState(activeStore?.phone || '');
  const [storeAddress, setStoreAddress] = useState(activeStore?.address || '');
  const [storeCurrency, setStoreCurrency] = useState(activeStore?.currency || '৳');

  useEffect(() => {
    setStoreName(activeStore?.name || '');
    setStoreCategory(activeStore?.category || '');
    setStorePhone(activeStore?.phone || '');
    setStoreAddress(activeStore?.address || '');
    setStoreCurrency(activeStore?.currency || '৳');
  }, [activeStore?.id, activeStore?.name, activeStore?.category, activeStore?.phone, activeStore?.address, activeStore?.currency]);

  // Invite modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('staff');

  // Delete modal
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  // Security password form
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification toggles
  const [notifyOrderSMS, setNotifyOrderSMS] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyDailySummary, setNotifyDailySummary] = useState(true);
  const [notifyWhatsAppAlerts, setNotifyWhatsAppAlerts] = useState(true);

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    updateActiveStore({
      name: storeName,
      category: storeCategory,
      phone: storePhone,
      address: storeAddress,
      currency: storeCurrency,
    });
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTeamMember({
      name: inviteName,
      email: inviteEmail,
      role: inviteRole,
      status: 'invited',
    });
    setIsInviteModalOpen(false);
    setInviteName('');
    setInviteEmail('');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showToast(error.message, 'error');
        return;
      }
    }
    showToast('Account password updated successfully', 'success');
    setCurrPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Business Profile, Team & Store Settings
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure physical address, staff user roles, and security credentials for {activeStore?.name}.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'store'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <StoreIcon className="w-3.5 h-3.5" />
          <span>Store & Branding</span>
        </button>

        <button
          onClick={() => setActiveTab('team')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'team'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team & Roles ({teamMembers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'security'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Security & Passwords</span>
        </button>
      </div>

      {/* TAB 1: Store & Branding Form */}
      {activeTab === 'store' && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
          <form onSubmit={handleSaveStore} className="space-y-4 text-xs">
            {/* Branding Logo UI */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Store Logo & Avatar
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                  {storeName.slice(0, 2).toUpperCase() || 'GA'}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => showToast('Logo storage bucket is not configured for this workspace yet.', 'info')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload New Logo</span>
                  </button>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Recommended 500x500 PNG with transparent background
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Official Store Name *
                </label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Commercial Category
                </label>
                <input
                  type="text"
                  value={storeCategory}
                  onChange={(e) => setStoreCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Support Hotline / Phone
                </label>
                <input
                  type="text"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Store Currency
                </label>
                <select
                  value={storeCurrency}
                  onChange={(e) => setStoreCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="৳">৳ BDT (Bangladeshi Taka)</option>
                  <option value="$">$ USD (United States Dollar)</option>
                  <option value="€">€ EUR (Euro)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dispatch Warehouse / Physical Address
              </label>
              <textarea
                rows={3}
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Store Profile</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Team Members & Roles */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Workspace Staff & Role Permissions
              </h3>
              <p className="text-xs text-slate-500">
                Manage who has access to inventory adjustments and order invoices.
              </p>
            </div>

            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Invite Staff Member</span>
            </button>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No additional staff members registered. Click &ldquo;Invite Staff Member&rdquo; to grant team access.
                    </td>
                  </tr>
                ) : (
                  teamMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {m.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono">
                        {m.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            m.role === 'owner'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : m.role === 'admin'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {m.joinedAt}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {m.role !== 'owner' ? (
                          <button
                            onClick={() => setMemberToRemove(m)}
                            className="p-1 text-rose-500 hover:text-rose-700"
                            title="Remove Team Member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Primary Owner</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Notifications Toggles */}
      {activeTab === 'notifications' && (
        <div className="max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
            Notification Delivery Channels
          </h3>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <strong className="block font-semibold text-slate-900 dark:text-white">Customer Order Dispatch SMS</strong>
                <span className="text-slate-500 text-[11px]">Send automatic tracking SMS when parcel is marked Shipped</span>
              </div>
              <input
                type="checkbox"
                checked={notifyOrderSMS}
                onChange={() => setNotifyOrderSMS(!notifyOrderSMS)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <strong className="block font-semibold text-slate-900 dark:text-white">Low Stock Warning Push</strong>
                <span className="text-slate-500 text-[11px]">Alert merchant when inventory dips below low-stock threshold</span>
              </div>
              <input
                type="checkbox"
                checked={notifyLowStock}
                onChange={() => setNotifyLowStock(!notifyLowStock)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <strong className="block font-semibold text-slate-900 dark:text-white">Daily Revenue & Order Digest</strong>
                <span className="text-slate-500 text-[11px]">Receive summary email at 9:00 PM with gross sales figures</span>
              </div>
              <input
                type="checkbox"
                checked={notifyDailySummary}
                onChange={() => setNotifyDailySummary(!notifyDailySummary)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <strong className="block font-semibold text-slate-900 dark:text-white">WhatsApp Business Alert Webhooks</strong>
                <span className="text-slate-500 text-[11px]">Send live courier delay messages to customers</span>
              </div>
              <input
                type="checkbox"
                checked={notifyWhatsAppAlerts}
                onChange={() => setNotifyWhatsAppAlerts(!notifyWhatsAppAlerts)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => showToast('Notification preferences saved', 'success')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold"
            >
              Update Notification Rules
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Security & Passwords */}
      {activeTab === 'security' && (
        <div className="max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
          <form onSubmit={handleSavePassword} className="space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Update Security Password
            </h3>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current Password *
              </label>
              <input
                type="password"
                required
                value={currPassword}
                onChange={(e) => setCurrPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Team Member"
        description="Invited colleagues receive access to your GoAMAAS store operations."
        maxWidth="sm"
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Member Name *
            </label>
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Mahfuz Rahman"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Work Email Address *
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. mahfuz@apexstyle.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assigned Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="staff">Staff (Orders & Products only)</option>
              <option value="manager">Manager (Inventory & Reports)</option>
              <option value="admin">Admin (Full Store Access)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Send Invitation
            </button>
          </div>
        </form>
      </Modal>

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={() => {
          if (memberToRemove) removeTeamMember(memberToRemove.id);
        }}
        title="Remove Staff Access?"
        message={`Are you sure you want to revoke access for ${memberToRemove?.name}? They will no longer be able to log in.`}
        confirmLabel="Remove Access"
        cancelLabel="Keep Member"
        isDestructive
      />
    </div>
  );
};
