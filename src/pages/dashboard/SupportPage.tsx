import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { extractOrderMetadataFromItems } from '../../lib/storefrontSync';
import { SupportTicket } from '../../types';
import {
  HelpCircle,
  Plus,
  Search,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  BookOpen,
  Bell,
  ChevronDown,
  Inbox,
  Phone,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const SupportPage: React.FC = () => {
  const {
    supportTickets,
    createSupportTicket,
    replySupportTicket,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    orders,
    subscribedWebsites,
    showToast,
  } = useApp();
  const { lang } = useLanguage();

  const [activeTab, setActiveTab] = useState<'inquiries' | 'tickets' | 'faq' | 'notifications'>('tickets');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);

  // New ticket state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('Integration');
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [initialMessage, setInitialMessage] = useState('');

  // Ticket reply state
  const [replyText, setReplyText] = useState('');

  // FAQ search
  const [faqSearch, setFaqSearch] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const customerInquiries = useMemo(() => {
    return orders
      .filter((o) => {
        const meta = extractOrderMetadataFromItems(o.items);
        return (
          Boolean(o.notes?.trim()) ||
          Boolean(o.deliveryInstructions?.trim()) ||
          Boolean(meta.deliveryInstructions?.trim()) ||
          meta.orderSource === 'public_website' ||
          Boolean(o.websiteSubdomain || meta.websiteSubdomain)
        );
      })
      .slice(0, 20)
      .map((o) => {
        const meta = extractOrderMetadataFromItems(o.items);
        return {
          order: o,
          subdomain: o.websiteSubdomain || meta.websiteSubdomain,
          instructions: o.deliveryInstructions || meta.deliveryInstructions || '',
          note: o.notes || '',
        };
      });
  }, [orders]);

  const primaryWebsite = subscribedWebsites[0] || null;
  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const knowledgeBase = [
    {
      q: 'How do I generate an automated Steadfast Courier parcel?',
      a: 'Go to your Orders page, click on the Truck icon next to the order, select Steadfast Courier, and enter or auto-generate the consignment code. The courier webhook will automatically update parcel progress.',
    },
    {
      q: 'Can I connect a custom domain (e.g. shop.mybrand.com) to my landing pages?',
      a: 'Yes. Simply add a CNAME DNS record pointing to "cname.goamaas.com". An SSL certificate is automatically provisioned by our edge network within 5 minutes.',
    },
    {
      q: 'How does the WhatsApp AI Assistant recover abandoned carts?',
      a: 'When an online visitor enters their phone number on your landing page or store checkout but does not finalize the order within 30 minutes, GoAMAAS automatically sends a polite follow-up message with their cart link and free shipping incentive.',
    },
    {
      q: 'Are Merchant Dashboard or custom website development fees recurring?',
      a: 'The core GoAMAAS Merchant Dashboard is 100% free forever (৳0/month). Bespoke website development packages starting at ৳8,000 are one-time engineering fees with cloud deployment setup included; custom domain registration and recurring hosting/third-party costs are billed separately.',
    },
  ];

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    createSupportTicket(subject, category, priority, initialMessage);
    setIsNewTicketModalOpen(false);
    setSubject('');
    setInitialMessage('');
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    replySupportTicket(selectedTicket.id, replyText.trim());
    setReplyText('');
    // Update local state
    const updated = supportTickets.find((t) => t.id === selectedTicket.id);
    if (updated) {
      setSelectedTicket({
        ...updated,
        messages: [
          ...updated.messages,
          {
            id: `msg-${Date.now()}`,
            sender: 'You',
            text: replyText.trim(),
            timestamp: 'Just now',
            isStaff: false,
          },
        ],
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {lang === 'bn' ? 'ইনবক্স ও সাপোর্ট কেন্দ্র' : 'Inbox & Support Center'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'bn'
              ? 'ক্রেতার অর্ডার বার্তা, অ্যালার্ট এবং টেকনিক্যাল সাপোর্ট টিকেট এক জায়গায় দেখুন।'
              : 'Review customer order messages & instructions, live store alerts, and GoAMAAS support tickets.'}
          </p>
        </div>

        <button
          onClick={() => setIsNewTicketModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Open Support Ticket</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('inquiries')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'inquiries'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Customer Messages ({customerInquiries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Support Tickets ({supportTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>
            Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount} new)` : ''}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('faq')}
          className={`px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'faq'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Help Guide</span>
        </button>
      </div>

      {/* TAB 0: Customer Order Messages & Website Inquiries */}
      {activeTab === 'inquiries' && (
        <div className="space-y-4">
          {primaryWebsite && (
            <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Website Direct Inquiries ({primaryWebsite.businessName})
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Website contact &amp; WhatsApp inquiries route to{' '}
                  <strong className="font-mono">
                    {primaryWebsite.whatsappNumber || primaryWebsite.phone || primaryWebsite.email || 'your storefront contact settings'}
                  </strong>
                  . Customer checkout notes appear automatically below.
                </p>
              </div>
              <Link
                to="/dashboard/subscribed-website?tab=settings"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline shrink-0"
              >
                <span>Edit Store Contact</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {customerInquiries.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No customer order messages yet"
              description="When shoppers leave delivery instructions or notes on your website checkout, they will appear right here."
            />
          ) : (
            <div className="space-y-3">
              {customerInquiries.map(({ order, subdomain, instructions, note }) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {order.customerName}
                        </span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">
                          {order.customerPhone}
                        </span>
                        {subdomain && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                            <Globe className="w-3 h-3" />
                            <span>{subdomain}.amaas.xyz</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Order #{order.orderNumber} · ৳{order.total.toLocaleString()} ·{' '}
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        order.status === 'delivered'
                          ? 'delivered'
                          : order.status === 'cancelled'
                          ? 'cancelled'
                          : 'pending'
                      }
                      label={order.status}
                    />
                  </div>

                  {(instructions || note) ? (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1 text-slate-700 dark:text-slate-200">
                      {instructions && (
                        <p>
                          <strong>Delivery instructions:</strong> {instructions}
                        </p>
                      )}
                      {note && (
                        <p>
                          <strong>Customer note:</strong> {note}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      Website order for {order.items.map((it) => `${it.name} × ${it.quantity}`).join(', ')} ({order.city}).
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call Customer</span>
                    </a>
                    <Link
                      to="/dashboard/orders"
                      className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold hover:underline"
                    >
                      <span>Open in Orders</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: Support Tickets */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {supportTickets.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No support tickets yet"
              description="Need help setting up your store, payments, or courier APIs? Open a ticket anytime."
              primaryAction={{
                label: 'Open Support Ticket',
                onClick: () => setIsNewTicketModalOpen(true),
              }}
            />
          ) : (
            <>
              {/* Mobile Ticket Cards */}
              <div className="md:hidden space-y-3">
                {supportTickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-[11px]">
                          {t.ticketNumber}
                        </span>
                        <h3 className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {t.subject}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {t.category} · Priority: {t.priority.toUpperCase()}
                        </p>
                      </div>
                      <StatusBadge
                        tone={t.status === 'resolved' ? 'approved' : t.status === 'in_progress' ? 'info' : 'pending'}
                        label={t.status.replace('_', ' ')}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="font-mono text-[11px] text-slate-400">{t.createdAt}</span>
                      <button
                        onClick={() => setSelectedTicket(t)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                      >
                        View ({t.messages.length})
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Tickets Table */}
              <div className="hidden md:block rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Ticket ID</th>
                        <th className="py-3 px-4">Subject</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Created Date</th>
                        <th className="py-3 px-4 text-right">Conversation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {supportTickets.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {t.ticketNumber}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                            {t.subject}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500">
                            {t.category}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-semibold uppercase text-[10px] ${
                                t.priority === 'high' ? 'text-rose-600' : 'text-slate-500'
                              }`}
                            >
                              {t.priority}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge
                              tone={t.status === 'resolved' ? 'approved' : t.status === 'in_progress' ? 'info' : 'pending'}
                              label={t.status.replace('_', ' ')}
                            />
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                            {t.createdAt}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedTicket(t)}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-semibold cursor-pointer"
                            >
                              View ({t.messages.length})
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Knowledge Base FAQ */}
      {activeTab === 'faq' && (
        <div className="max-w-3xl space-y-4">
          <div className="space-y-3">
            {knowledgeBase.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-4 flex items-center justify-between text-left font-semibold text-xs text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Notifications Feed */}
      {activeTab === 'notifications' && (
        <div className="max-w-2xl bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-bold text-slate-900 dark:text-white">
              System & Operations Feed
            </span>
            {notifications.length > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="All caught up"
              description="Order alerts, low-stock warnings, and payment updates will appear here."
            />
          ) : (
            <div className="space-y-3">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markNotificationRead(notif.id)}
                  className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    !notif.read
                      ? 'border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20'
                      : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-slate-400">{notif.timestamp}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {notif.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ticket Conversation Modal */}
      {selectedTicket && (
        <Modal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          title={`Ticket ${selectedTicket.ticketNumber} — ${selectedTicket.subject}`}
          description={`Category: ${selectedTicket.category} · Priority: ${selectedTicket.priority.toUpperCase()}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Conversation Log */}
            <div className="max-h-72 overflow-y-auto space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              {selectedTicket.messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl ${
                    m.isStaff
                      ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 text-[11px]">
                    <span className="font-bold">{m.sender}</span>
                    <span className="text-slate-400">{m.timestamp}</span>
                  </div>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <form onSubmit={handleSendReply} className="flex gap-2 pt-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your response to the support engineers..."
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Reply</span>
              </button>
            </form>
          </div>
        </Modal>
      )}

      {/* New Support Ticket Modal */}
      <Modal
        isOpen={isNewTicketModalOpen}
        onClose={() => setIsNewTicketModalOpen(false)}
        title="Open Support Ticket"
        description="Our technical team responds within 2 hours during active business shifts."
        maxWidth="md"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ticket Subject *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Courier Steadfast Webhook Error"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Integration">Integration / API</option>
                <option value="Billing">Billing & Subscription</option>
                <option value="Technical">Technical Bug</option>
                <option value="Website Service">Website Service</option>
                <option value="General">General Inquiry</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High (Urgent)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description / Issue Details *
            </label>
            <textarea
              rows={4}
              required
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Describe the issue, paste consignment IDs or error message..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsNewTicketModalOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Submit Ticket
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
