import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AIAutomation } from '../../types';
import {
  Bot,
  MessageSquare,
  Zap,
  Play,
  Pause,
  Settings,
  Sparkles,
  Send,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Smartphone,
  Mail,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

export const AutomationsPage: React.FC = () => {
  const { automations, toggleAutomation, updateAutomation, testRunAutomation, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'workflows' | 'chatSimulator'>('workflows');
  const [selectedAuto, setSelectedAuto] = useState<AIAutomation | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Workflow builder edit state
  const [editTrigger, setEditTrigger] = useState('');
  const [editAction, setEditAction] = useState('');
  const [editWelcome, setEditWelcome] = useState('');
  const [editDelay, setEditDelay] = useState(2);

  // Live Chat Simulator State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: 'Assalamu Alaikum! Welcome to Apex Lifestyle. I am your GoAMAAS AI Assistant. How can I help you today? (Ask about: Oxford shirts, delivery fee, order status, or returns!)',
      time: '12:00 PM',
    },
  ]);
  const [userInput, setUserInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);

  const handleOpenConfig = (auto: AIAutomation) => {
    setSelectedAuto(auto);
    setEditTrigger(auto.trigger);
    setEditAction(auto.action);
    setEditWelcome(auto.config.welcomeMessage || '');
    setEditDelay(auto.config.autoReplyDelaySec || 2);
    setIsConfigModalOpen(true);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAuto) {
      updateAutomation(selectedAuto.id, {
        trigger: editTrigger,
        action: editAction,
        config: {
          ...selectedAuto.config,
          welcomeMessage: editWelcome,
          autoReplyDelaySec: editDelay,
        },
      });
    }
    setIsConfigModalOpen(false);
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userText = userInput.trim();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setChatMessages((prev) => [...prev, { sender: 'user', text: userText, time: now }]);
    setUserInput('');
    setIsBotTyping(true);

    // Realistic Demo Response Generation
    setTimeout(() => {
      setIsBotTyping(false);
      let reply = 'Thank you for your message! Our representative will be glad to assist you. Could you share your phone number for priority callback?';
      const lower = userText.toLowerCase();

      if (lower.includes('shirt') || lower.includes('oxford') || lower.includes('dam') || lower.includes('price')) {
        reply = 'Our Monochrome Premium Oxford Shirt is priced at ৳1,850 (combed Egyptian cotton, sizes M, L, XL, XXL). Would you like me to reserve a size for Cash on Delivery?';
      } else if (lower.includes('delivery') || lower.includes('charge') || lower.includes('fee')) {
        reply = 'Delivery charge is ৳80 inside Dhaka (24-48 hours via Steadfast) and ৳130 anywhere outside Dhaka (2-3 business days). Cash on delivery is fully supported!';
      } else if (lower.includes('order') || lower.includes('tracking') || lower.includes('status')) {
        reply = 'To verify your order tracking, please provide your 4-digit order number (e.g. ORD-8491) or your 11-digit mobile number registered during checkout.';
      } else if (lower.includes('return') || lower.includes('exchange') || lower.includes('size')) {
        reply = 'We offer an easy 7-day size exchange guarantee! Simply keep the item with its original tags and hand it to the courier upon delivery of your replacement.';
      } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('salam')) {
        reply = 'Assalamu Alaikum! How can I help you today? You can check prices, browse trending items, or track an existing order.';
      }

      setChatMessages((prev) => [...prev, { sender: 'bot', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    }, 700);
  };

  return (
    <div className="space-y-6">
      {/* Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            AI Automation Center & Messaging Hub
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Deploy 24/7 conversational bots on WhatsApp & Messenger, recover abandoned carts, and send dispatch SMS.
          </p>
        </div>

        {/* View Switch */}
        <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'workflows'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Active Automations ({automations.filter((a) => a.status === 'active').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('chatSimulator')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'chatSimulator'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-white shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Interactive Chatbot Simulator</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Automation Workflows */}
      {activeTab === 'workflows' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {automations.map((auto) => {
              const isActive = auto.status === 'active';

              return (
                <div
                  key={auto.id}
                  className={`p-6 rounded-2xl border transition-all flex flex-col justify-between space-y-4 shadow-xs ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      : 'bg-slate-50 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          auto.channel === 'WhatsApp'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : auto.channel === 'Messenger'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        }`}
                      >
                        {auto.channel}
                      </span>

                      {/* Enable/Disable Toggle */}
                      <button
                        onClick={() => toggleAutomation(auto.id)}
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${
                          isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={isActive ? 'Click to pause' : 'Click to activate'}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {auto.name}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {auto.description}
                    </p>

                    {/* Trigger -> Action pill */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5">
                      <div>
                        <span className="text-slate-400 font-semibold block uppercase text-[9px]">
                          Trigger
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {auto.trigger}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-slate-400 font-semibold block uppercase text-[9px]">
                          Action Output
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {auto.action}
                        </span>
                      </div>
                    </div>

                    {/* Execution Stats */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 font-mono">
                      <div>
                        <span>Executions:</span>{' '}
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {auto.executionCount}
                        </strong>
                      </div>
                      <div className="text-right">
                        <span>Success:</span>{' '}
                        <strong className="text-emerald-600 tabular-nums">{auto.successRate}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => testRunAutomation(auto.id)}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Play className="w-3 h-3" />
                      <span>Test Run</span>
                    </button>
                    <button
                      onClick={() => handleOpenConfig(auto)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Configure</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VIEW 2: Interactive Chatbot Simulator */
        <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl">
          {/* Chat Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm">GoAMAAS Conversational AI</h3>
                <span className="text-[10px] text-emerald-400 font-mono">
                  Online · Demo Sandbox Simulation
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setChatMessages([
                  {
                    sender: 'bot',
                    text: 'Assalamu Alaikum! Conversation reset. How can I assist you with products, pricing, or orders?',
                    time: 'Just now',
                  },
                ]);
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Reset Chat
            </button>
          </div>

          {/* Chat Messages Log */}
          <div className="h-96 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950/60">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-xs sm:max-w-sm rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[9px] text-slate-400 mt-0.5 px-1 font-mono">
                  {msg.time}
                </span>
              </div>
            ))}
            {isBotTyping && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 italic">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>AI Bot is typing smart response...</span>
              </div>
            )}
          </div>

          {/* Quick Question Prompts */}
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <button
              onClick={() => setUserInput('How much for the Oxford shirt?')}
              className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap"
            >
              "How much for the shirt?"
            </button>
            <button
              onClick={() => setUserInput('What is your delivery fee in Dhaka?')}
              className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap"
            >
              "Delivery charge in Dhaka?"
            </button>
            <button
              onClick={() => setUserInput('Can I return if the size does not fit?')}
              className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap"
            >
              "Return policy?"
            </button>
          </div>

          {/* Input Box */}
          <form
            onSubmit={handleSendChatMessage}
            className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
          >
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type customer question to test bot answers..."
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Workflow Builder Configuration Modal */}
      {selectedAuto && (
        <Modal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          title={`Workflow Editor — ${selectedAuto.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300">
              Channel: <strong>{selectedAuto.channel}</strong> · Executed {selectedAuto.executionCount} times
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trigger Event
              </label>
              <input
                type="text"
                required
                value={editTrigger}
                onChange={(e) => setEditTrigger(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Automated Action Flow
              </label>
              <textarea
                rows={2}
                required
                value={editAction}
                onChange={(e) => setEditAction(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom Welcome Message (Optional)
              </label>
              <textarea
                rows={3}
                value={editWelcome}
                onChange={(e) => setEditWelcome(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Auto-Reply Delay (Seconds)
              </label>
              <input
                type="number"
                min={0}
                max={3600}
                value={editDelay}
                onChange={(e) => setEditDelay(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Save Automation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
