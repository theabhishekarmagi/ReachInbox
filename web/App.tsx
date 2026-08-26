import {
  AlignLeft,
  Archive,
  ArrowLeft,
  Bold,
  Calendar,
  ChevronDown,
  Clock,
  Code,
  CornerUpLeft,
  CornerUpRight,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Filter,
  Heading,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  MoreVertical,
  Paperclip,
  Printer,
  Quote,
  Redo,
  RefreshCw,
  Search,
  Star,
  Strikethrough,
  Trash2,
  Underline,
  Undo,
  Upload,
  X
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { Layout } from './components/Layout';
import { ListView } from './components/ListView';
import type { EmailAttachment, EmailItem, User } from './types';

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  isImage: boolean;
  previewUrl: string;
  content: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateFull(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
    return <ImageIcon className="w-5 h-5 text-blue-500" />;
  }
  if (['csv', 'xls', 'xlsx'].includes(ext || '')) {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  }
  if (['pdf'].includes(ext || '')) {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  return <File className="w-5 h-5 text-gray-500" />;
}

function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Login</h1>
        <a href="/auth/google" className="google-btn">G&nbsp; Login with Google</a>
        <div className="separator">or sign up through email</div>
        <input className="input" placeholder="Email ID" disabled />
        <input className="input" placeholder="Password" type="password" disabled />
        <button className="login-btn" disabled>Login</button>
      </div>
    </div>
  );
}

function DashboardPage({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const location = useLocation();
  const isStarredTab = location.pathname.includes('/starred');
  const isSentTab = !isStarredTab && location.pathname.includes('/sent');
  const currentKind: 'scheduled' | 'sent' | 'starred' = isStarredTab ? 'starred' : isSentTab ? 'sent' : 'scheduled';

  const [scheduled, setScheduled] = useState<EmailItem[]>([]);
  const [sent, setSent] = useState<EmailItem[]>([]);
  const [starred, setStarred] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hasAttachmentsOnly, setHasAttachmentsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'subject_asc' | 'subject_desc'>('newest');

  async function load(showSpinner = false) {
    try {
      if (showSpinner) setIsRefreshing(true);
      const [scheduledData, sentData, starredData] = await Promise.all([
        api.scheduled(),
        api.sent(),
        api.starred()
      ]);
      setScheduled(scheduledData);
      setSent(sentData);
      setStarred(starredData);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
      if (showSpinner) {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(() => load(false), 10000);
    return () => clearInterval(id);
  }, []);

  async function handleToggleStar(id: string, newStarred: boolean) {
    // Optimistic UI updates across all lists
    setScheduled((prev) => prev.map((e) => (e.id === id ? { ...e, is_starred: newStarred } : e)));
    setSent((prev) => prev.map((e) => (e.id === id ? { ...e, is_starred: newStarred } : e)));
    setStarred((prev) => {
      if (newStarred) {
        const found = rawItems.find((e) => e.id === id);
        return found ? [...prev.filter((e) => e.id !== id), { ...found, is_starred: true }] : prev;
      }
      return prev.filter((e) => e.id !== id);
    });

    try {
      await api.toggleStar(id, newStarred);
    } catch (err) {
      console.error('Failed to toggle star:', err);
      load(false);
    }
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (hasAttachmentsOnly) count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [dateFilter, statusFilter, hasAttachmentsOnly, sortBy]);

  function clearAllFilters() {
    setSearchQuery('');
    setDateFilter('all');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setHasAttachmentsOnly(false);
    setSortBy('newest');
  }

  const rawItems = isStarredTab ? starred : isSentTab ? sent : scheduled;

  const filteredItems = useMemo(() => {
    let list = [...rawItems];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const subjectMatch = item.subject?.toLowerCase().includes(q);
        const emailMatch = item.email?.toLowerCase().includes(q);
        const senderMatch = item.sender_email?.toLowerCase().includes(q);
        const bodyMatch = item.body?.toLowerCase().includes(q);
        const statusMatch = item.status?.toLowerCase().includes(q);
        return subjectMatch || emailMatch || senderMatch || bodyMatch || statusMatch;
      });
    }

    // 2. Status Filter
    if (statusFilter !== 'all') {
      list = list.filter((item) => item.status === statusFilter);
    }

    // 3. Attachments Filter
    if (hasAttachmentsOnly) {
      list = list.filter((item) => item.attachments && item.attachments.length > 0);
    }

    // 4. Date Range Filter
    if (dateFilter === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      list = list.filter((item) => {
        const d = new Date(item.sent_at || item.scheduled_at || item.created_at || Date.now());
        return d >= todayStart;
      });
    } else if (dateFilter === 'week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      list = list.filter((item) => {
        const d = new Date(item.sent_at || item.scheduled_at || item.created_at || Date.now());
        return d >= weekStart;
      });
    } else if (dateFilter === 'custom') {
      if (startDate) {
        const start = new Date(startDate);
        list = list.filter((item) => {
          const d = new Date(item.sent_at || item.scheduled_at || item.created_at || Date.now());
          return d >= start;
        });
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        list = list.filter((item) => {
          const d = new Date(item.sent_at || item.scheduled_at || item.created_at || Date.now());
          return d <= end;
        });
      }
    }

    // 5. Sorting
    list.sort((a, b) => {
      const timeA = new Date(a.sent_at || a.scheduled_at || a.created_at || 0).getTime();
      const timeB = new Date(b.sent_at || b.scheduled_at || b.created_at || 0).getTime();

      if (sortBy === 'newest') return timeB - timeA;
      if (sortBy === 'oldest') return timeA - timeB;
      if (sortBy === 'subject_asc') return (a.subject || '').localeCompare(b.subject || '');
      if (sortBy === 'subject_desc') return (b.subject || '').localeCompare(a.subject || '');
      return 0;
    });

    return list;
  }, [rawItems, searchQuery, statusFilter, hasAttachmentsOnly, dateFilter, startDate, endDate, sortBy]);

  const hasAnyActiveFilters = searchQuery.trim().length > 0 || activeFilterCount > 0;

  return (
    <Layout
      user={user}
      onLogout={onLogout}
      scheduledCount={scheduled.length}
      sentCount={sent.length}
      starredCount={starred.length}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 relative">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full h-9 rounded-full border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-700 outline-none focus:border-gray-300 focus:bg-white transition-colors font-sans"
            placeholder="Search by subject, email, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 border-none bg-transparent cursor-pointer p-0"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Trigger Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilterPopover((prev) => !prev)}
            className={`relative w-9 h-9 flex items-center justify-center rounded-lg border-none cursor-pointer transition-colors ${
              showFilterPopover || activeFilterCount > 0
                ? 'bg-emerald-50 text-brand-green'
                : 'bg-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Filter emails"
            aria-label="filter"
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-green" />
            )}
          </button>

          {/* Filter Popover Modal */}
          {showFilterPopover && (
            <div className="absolute top-11 right-0 w-80 bg-white border border-gray-100 rounded-2xl shadow-2xl p-4 z-50 text-left animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Filter & Sort</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs text-brand-green font-medium border-none bg-transparent cursor-pointer hover:underline p-0"
                  >
                    Reset all
                  </button>
                )}
              </div>

              {/* Date Filter Section */}
              <div className="mb-3.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setDateFilter('all')}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-colors cursor-pointer ${
                      dateFilter === 'all'
                        ? 'border-brand-green bg-emerald-50 text-emerald-800 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    All Dates
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilter('today')}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-colors cursor-pointer ${
                      dateFilter === 'today'
                        ? 'border-brand-green bg-emerald-50 text-emerald-800 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilter('week')}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-colors cursor-pointer ${
                      dateFilter === 'week'
                        ? 'border-brand-green bg-emerald-50 text-emerald-800 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Past 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilter('custom')}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-colors cursor-pointer ${
                      dateFilter === 'custom'
                        ? 'border-brand-green bg-emerald-50 text-emerald-800 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>

                {dateFilter === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div>
                      <span className="text-[11px] text-gray-400 block mb-0.5">From</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-md p-1 outline-none text-gray-700"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-400 block mb-0.5">To</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-md p-1 outline-none text-gray-700"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filter Section */}
              <div className="mb-3.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Status
                </label>
                <div className="flex flex-wrap gap-1">
                  {['all', 'scheduled', 'deferred', 'sent', 'failed'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`text-xs capitalize py-1 px-2.5 rounded-full border transition-colors cursor-pointer ${
                        statusFilter === st
                          ? 'border-brand-green bg-emerald-50 text-emerald-800 font-semibold'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attachments Toggle */}
              <div className="mb-3.5 flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-xs text-gray-700 font-medium">Has Attachments Only</span>
                <input
                  type="checkbox"
                  checked={hasAttachmentsOnly}
                  onChange={(e) => setHasAttachmentsOnly(e.target.checked)}
                  className="accent-brand-green cursor-pointer w-4 h-4"
                />
              </div>

              {/* Sort By Section */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full text-xs border border-gray-200 rounded-lg p-2 outline-none text-gray-700 bg-white"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="subject_asc">Subject (A to Z)</option>
                  <option value="subject_desc">Subject (Z to A)</option>
                </select>
              </div>

              {/* Popover Action */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowFilterPopover(false)}
                  className="px-4 py-1.5 rounded-full bg-brand-green text-white text-xs font-semibold hover:bg-emerald-600 cursor-pointer border-none transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={() => load(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border-none bg-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="refresh"
          title="Refresh email list"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-green' : ''}`} />
        </button>
      </div>

      <ListView
        items={filteredItems}
        kind={currentKind}
        loading={loading}
        onClearFilters={clearAllFilters}
        hasFilters={hasAnyActiveFilters}
        onToggleStar={handleToggleStar}
      />
    </Layout>
  );
}

function parseEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

function ComposePage({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as { replyTo?: string; subject?: string; body?: string };

  const [subject, setSubject] = useState(navState.subject || '');
  const [body, setBody] = useState(navState.body || '');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>(navState.replyTo ? [navState.replyTo] : []);
  const [delay, setDelay] = useState('2000');
  const [hourlyLimit, setHourlyLimit] = useState('200');
  const [startTime, setStartTime] = useState(new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16));
  const [showScheduler, setShowScheduler] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [inlineImages, setInlineImages] = useState<Array<{ id: string; name: string; previewUrl: string; size?: string }>>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const presets = useMemo(() => {
    const getTomorrow = (hour: number, minute: number = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(hour, minute, 0, 0);
      return d.toISOString().slice(0, 16);
    };

    return [
      { label: 'Tomorrow', time: getTomorrow(9, 0) },
      { label: 'Tomorrow, 10:00 AM', time: getTomorrow(10, 0) },
      { label: 'Tomorrow, 11:00 AM', time: getTomorrow(11, 0) },
      { label: 'Tomorrow, 3:00 PM', time: getTomorrow(15, 0) }
    ];
  }, []);

  const shownRecipients = useMemo(() => recipients.slice(0, 3), [recipients]);

  function addRecipientFromInput() {
    const values = parseEmails(recipientInput);
    if (!values.length) return;
    setRecipients((prev) => Array.from(new Set([...prev, ...values])));
    setRecipientInput('');
  }

  function handleUploadList(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const emails = parseEmails(text);
      if (emails.length > 0) {
        setRecipients((prev) => Array.from(new Set([...prev, ...emails])));
      } else {
        setError(`No valid email addresses found in "${file.name}".`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleAttachmentUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = () => {
        const base64Content = String(reader.result || '');
        const newAttachment: UploadedFile = {
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          size: formatFileSize(file.size),
          type: file.type || 'application/octet-stream',
          isImage,
          previewUrl: isImage ? base64Content : '',
          content: base64Content
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  }

  function removeInlineImage(id: string) {
    setInlineImages((prev) => prev.filter((img) => img.id !== id));
  }

  function handleCanvasPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = String(reader.result || '');
            setInlineImages((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                name: file.name || `Pasted Image ${prev.length + 1}.png`,
                previewUrl: base64,
                size: formatFileSize(file.size)
              }
            ]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = () => {
          const base64 = String(reader.result || '');
          setInlineImages((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              name: file.name || `Dropped Image ${prev.length + 1}.png`,
              previewUrl: base64,
              size: formatFileSize(file.size)
            }
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        // Non-image files dropped on canvas go to attachments
        reader.onload = () => {
          const base64 = String(reader.result || '');
          setAttachments((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              size: formatFileSize(file.size),
              type: file.type || 'application/octet-stream',
              isImage: false,
              previewUrl: '',
              content: base64
            }
          ]);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!subject || (!body.trim() && inlineImages.length === 0) || recipients.length === 0) {
      setError('Please fill subject, message content, and at least one recipient.');
      return;
    }

    try {
      setSaving(true);
      const inlineHtml = inlineImages
        .map(
          (img) =>
            `<div style="margin: 16px 0;"><img src="${img.previewUrl}" alt="${img.name}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" /></div>`
        )
        .join('');
      const combinedBody = body ? (inlineHtml ? `${body}\n\n${inlineHtml}` : body) : inlineHtml;

      await api.scheduleEmail({
        senderEmail: user.email,
        subject,
        body: combinedBody,
        recipients,
        startTime: new Date(startTime).toISOString(),
        delayMs: Number(delay),
        hourlyLimit: Number(hourlyLimit),
        attachments: attachments.map((att) => ({
          filename: att.name,
          contentType: att.type,
          content: att.content,
          size: att.size,
          previewUrl: att.previewUrl
        }))
      });
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule email');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <form className="compose" onSubmit={onSubmit}>
        <div className="compose-head">
          <button
            type="button"
            className="border-none bg-transparent text-gray-600 cursor-pointer mr-2 hover:text-gray-800 transition-colors"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="compose-head-actions relative">
            {/* Hidden file input for attachments */}
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              onChange={handleAttachmentUpload}
              hidden
            />
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              className="flex items-center gap-1 border-none bg-transparent cursor-pointer p-1.5 rounded-full hover:bg-emerald-50 transition-colors text-gray-500 hover:text-brand-green"
              title="Attach document or image as attachment"
            >
              <Paperclip className="w-5 h-5" />
              {attachments.length > 0 && (
                <span className="text-xs font-bold text-brand-green leading-none">
                  {attachments.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowScheduler((prev) => !prev)}
              className={`p-1.5 rounded-full border-none bg-transparent cursor-pointer transition-colors ${
                showScheduler ? 'text-brand-green bg-emerald-50' : 'text-gray-500 hover:text-brand-green hover:bg-emerald-50'
              }`}
              title="Send Later / Schedule"
            >
              <Clock className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-full border border-brand-green bg-white text-brand-green text-sm font-semibold hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              {saving ? 'Sending...' : 'Send'}
            </button>

            {/* Send Later Popover matching screenshot */}
            {showScheduler && (
              <div className="absolute top-12 right-0 w-[320px] bg-white border border-gray-100 rounded-2xl shadow-2xl p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                <h3 className="text-base font-semibold text-gray-900 m-0 mb-4">
                  Send Later
                </h3>

                {/* Date & Time Picker */}
                <div className="relative flex items-center border-b border-gray-200 pb-2 mb-3">
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setSelectedPreset(null);
                    }}
                    className="w-full text-sm text-gray-700 bg-transparent outline-none font-sans"
                  />
                  <Calendar className="w-4 h-4 text-gray-400 pointer-events-none absolute right-0" />
                </div>

                {/* Preset List */}
                <div className="flex flex-col gap-1 my-2">
                  {presets.map((preset) => {
                    const isSelected = selectedPreset === preset.label || startTime === preset.time;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setStartTime(preset.time);
                          setSelectedPreset(preset.label);
                        }}
                        className={`text-left text-sm py-2 px-3 rounded-lg border-none cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-800 font-semibold'
                            : 'bg-transparent text-gray-700 hover:bg-gray-50 font-normal'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Popover Actions */}
                <div className="flex items-center justify-end gap-3 mt-5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowScheduler(false)}
                    className="border-none bg-transparent text-sm font-medium text-gray-800 hover:text-gray-900 cursor-pointer px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScheduler(false)}
                    className="border border-brand-green text-brand-green rounded-full px-5 py-1.5 text-sm font-medium hover:bg-emerald-50 bg-white cursor-pointer transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* From Row */}
        <div className="field-row" style={{ gridTemplateColumns: '100px 1fr auto' }}>
          <label>From</label>
          <div className="flex items-center">
            <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200/80 rounded-xl px-3 py-1.5 text-sm text-gray-700 font-normal">
              <span>{user.email}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>

        {/* To Row */}
        <div className="field-row" style={{ gridTemplateColumns: '100px 1fr auto' }}>
          <label>To</label>
          <div className="flex items-center gap-2 flex-wrap min-w-0 py-1">
            {shownRecipients.map((recipient) => (
              <span key={recipient} className="chip">{recipient}</span>
            ))}
            {recipients.length > 3 && <span className="chip">+{recipients.length - 3}</span>}
            <input
              className="flex-1 min-w-[150px] border-none outline-none text-sm text-gray-800 bg-transparent"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onBlur={addRecipientFromInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addRecipientFromInput();
                }
              }}
              placeholder={recipients.length ? '' : 'recipient@example.com'}
            />
          </div>
          <label className="upload-link flex items-center gap-1.5 font-medium hover:opacity-80">
            <Upload className="w-4 h-4" />
            <span>Upload List</span>
            <input type="file" onChange={handleUploadList} hidden />
          </label>
        </div>

        {/* Subject Row */}
        <div className="field-row">
          <label>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>

        {/* Delays & Limits Row */}
        <div className="inline-fields">
          <div className="field-row small">
            <label>Delay between 2 emails</label>
            <input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="00" />
          </div>
          <div className="field-row small">
            <label>Hourly Limit</label>
            <input value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)} placeholder="00" />
          </div>
        </div>

        {/* Rich Text Editor Card (Canvas) */}
        <div
          className={`mt-2 border rounded-2xl bg-gray-50/50 p-3 relative transition-colors ${
            isDraggingOver ? 'border-brand-green bg-emerald-50/40 ring-2 ring-brand-green/20' : 'border-gray-100'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleCanvasDrop}
        >
          {/* Drag Overlay Prompt */}
          {isDraggingOver && (
            <div className="absolute inset-0 bg-emerald-50/90 border-2 border-dashed border-brand-green rounded-2xl flex flex-col items-center justify-center text-brand-green font-medium text-sm z-30 pointer-events-none">
              <ImageIcon className="w-8 h-8 mb-2 animate-bounce" />
              <span>Drop image here to insert directly into canvas</span>
            </div>
          )}

          {/* Formatting Toolbar */}
          <div className="flex items-center gap-1 bg-white border border-gray-200/80 rounded-xl px-3 py-1.5 mb-2 shadow-xs flex-wrap">
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Redo className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
            <button type="button" className="flex items-center gap-0.5 p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer text-xs font-medium">
              <Heading className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Underline className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <List className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <IndentDecrease className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <IndentIncrease className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Code className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 border-none bg-transparent cursor-pointer">
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text Area Canvas */}
          <textarea
            className="w-full min-h-[220px] border-none outline-none bg-transparent p-2 text-sm text-gray-700 resize-y font-sans leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handleCanvasPaste}
            placeholder="Type Your Reply (or paste/drop images directly here)..."
          />

          {/* Inline Images Rendered Directly Inside Canvas (Gmail style) */}
          {inlineImages.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                <ImageIcon className="w-3.5 h-3.5 text-brand-green" />
                <span>Inline Canvas Images ({inlineImages.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {inlineImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs hover:shadow-md transition-all"
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="w-full h-32 object-cover"
                    />
                    <div className="p-2 flex items-center justify-between text-xs text-gray-700 bg-white border-t border-gray-100">
                      <span className="truncate flex-1 font-medium">{img.name}</span>
                      {img.size && <span className="text-[10px] text-gray-400 ml-1 shrink-0">{img.size}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInlineImage(img.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors border-none cursor-pointer shadow-xs"
                      title="Remove image from canvas"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Uploaded Documents / Attachments Tray (Below Textbox) */}
        {attachments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Attached Documents & Files ({attachments.length})
            </div>
            <div className="flex flex-wrap gap-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs hover:shadow-md transition-all flex items-center"
                >
                  {att.isImage ? (
                    <div className="relative w-44 h-28 bg-gray-100 overflow-hidden">
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 text-white">
                        <span className="text-xs truncate font-medium">{att.name}</span>
                        <span className="text-[10px] text-gray-200">{att.size}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 w-56">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-brand-green flex items-center justify-center shrink-0">
                        {getFileIcon(att.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate m-0">{att.name}</p>
                        <p className="text-[11px] text-gray-400 m-0">{att.size}</p>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gray-900/80 hover:bg-red-600 text-white flex items-center justify-center text-xs opacity-90 hover:opacity-100 transition-all border-none cursor-pointer"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error ? <p className="error">{error}</p> : null}
      </form>
    </Layout>
  );
}

function MailDetailPage({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  const stateEmail = location.state as EmailItem | undefined;
  const [email, setEmail] = useState<EmailItem | null>(stateEmail || null);
  const [loading, setLoading] = useState(!stateEmail);
  const [showDetails, setShowDetails] = useState(false);
  const [isStarred, setIsStarred] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    api
      .getEmail(id)
      .then((data) => {
        if (mounted) {
          setEmail(data);
          setIsStarred(Boolean(data.is_starred));
        }
      })
      .catch((err) => {
        console.error('Failed to load email details:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading && !email) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="p-8 text-gray-400 text-sm">Loading message...</div>
      </Layout>
    );
  }

  if (!email) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="p-8 text-gray-500">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-gray-600 mb-4 border-none bg-transparent cursor-pointer hover:text-gray-900"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <p>Email not found.</p>
        </div>
      </Layout>
    );
  }

  const senderEmail = email.sender_email || user.email;
  const senderName = senderEmail === user.email ? user.displayName : senderEmail.split('@')[0];
  const recipientEmail = email.email;
  const timestamp = email.sent_at || email.scheduled_at || email.created_at;
  const attachments: EmailAttachment[] = email.attachments || [];

  async function handleToggleStarDetail() {
    const next = !isStarred;
    setIsStarred(next);
    if (email?.id) {
      try {
        await api.toggleStar(email.id, next);
      } catch (err) {
        console.error('Failed to update star state:', err);
      }
    }
  }

  async function handleDelete() {
    if (!email?.id) return;
    if (!window.confirm('Are you sure you want to delete this email?')) return;
    try {
      await api.deleteEmail(email.id);
      navigate(email.status === 'sent' || email.status === 'failed' ? '/dashboard/sent' : '/dashboard');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete email');
    }
  }

  function handleReply() {
    navigate('/compose', {
      state: {
        replyTo: email?.sender_email || email?.email,
        subject: email?.subject.startsWith('Re:') ? email?.subject : `Re: ${email?.subject || ''}`
      }
    });
  }

  function handleForward() {
    navigate('/compose', {
      state: {
        subject: email?.subject.startsWith('Fwd:') ? email?.subject : `Fwd: ${email?.subject || ''}`,
        body: `\n\n---------- Forwarded message ---------\nFrom: ${senderName} <${senderEmail}>\nSubject: ${email?.subject}\nTo: ${recipientEmail}\n\n${email?.body || ''}`
      }
    });
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="max-w-5xl mx-auto py-2">
        {/* Gmail Top Action Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4 text-gray-600">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-900 border-none bg-transparent cursor-pointer transition-colors"
              onClick={() => navigate(-1)}
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
            <button
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-900 border-none bg-transparent cursor-pointer transition-colors"
              onClick={() => navigate(email.status === 'sent' || email.status === 'failed' ? '/dashboard/sent' : '/dashboard')}
              title="Inbox / Back to list"
            >
              <Archive className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-red-600 border-none bg-transparent cursor-pointer transition-colors"
              onClick={handleDelete}
              title="Delete email"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 text-gray-500">
            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-900 border-none bg-transparent cursor-pointer transition-colors"
              title="Print email"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-900 border-none bg-transparent cursor-pointer transition-colors"
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Email Subject & Tags */}
        <div className="flex items-center justify-between gap-4 mb-5 pl-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-medium text-gray-900 tracking-tight m-0">
              {email.subject}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                email.status === 'sent'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : email.status === 'failed'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-orange-50 text-orange-700 border border-orange-200'
              }`}
            >
              {email.status}
            </span>
          </div>
        </div>

        {/* Sender & Recipient Info (Gmail standard layout) */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-semibold flex items-center justify-center text-sm shrink-0 uppercase shadow-xs">
              {senderName.charAt(0)}
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{senderName}</span>
                <span className="text-xs text-gray-500">&lt;{senderEmail}&gt;</span>
              </div>

              {/* "to me" / details button */}
              <div className="relative mt-0.5">
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border-none bg-transparent cursor-pointer p-0"
                >
                  <span>to {recipientEmail}</span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>

                {/* Collapsible Details Card */}
                {showDetails && (
                  <div className="absolute top-6 left-0 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-600 grid grid-cols-[60px_1fr] gap-y-1.5">
                    <span className="text-gray-400 font-medium">from:</span>
                    <span className="text-gray-800 font-medium truncate">{senderEmail}</span>

                    <span className="text-gray-400 font-medium">to:</span>
                    <span className="text-gray-800 truncate">{recipientEmail}</span>

                    <span className="text-gray-400 font-medium">date:</span>
                    <span className="text-gray-800">{formatDateFull(timestamp)}</span>

                    <span className="text-gray-400 font-medium">subject:</span>
                    <span className="text-gray-800 truncate">{email.subject}</span>

                    <span className="text-gray-400 font-medium">security:</span>
                    <span className="text-emerald-600 font-medium">Standard encryption (TLS)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Header Actions & Timestamp */}
          <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span title={formatDateFull(timestamp)}>
              {formatDateFull(timestamp)} ({formatRelativeTime(timestamp)})
            </span>
            <button
              type="button"
              onClick={handleToggleStarDetail}
              className="p-1 rounded hover:bg-gray-100 border-none bg-transparent cursor-pointer text-gray-400 hover:text-amber-400 transition-colors"
              title={isStarred ? 'Starred' : 'Not starred'}
            >
              <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleReply}
              className="p-1 rounded hover:bg-gray-100 border-none bg-transparent cursor-pointer text-gray-500 hover:text-gray-800 transition-colors"
              title="Reply"
            >
              <CornerUpLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Email Body Content (supports plain text and inline HTML images) */}
        <div className="pl-13 pr-4 py-2 min-h-[140px] text-sm text-gray-800 leading-relaxed font-sans">
          {email.body && (email.body.includes('<img') || email.body.includes('<div') || email.body.includes('<p') || email.body.includes('<br')) ? (
            <div
              className="prose max-w-none text-sm text-gray-800 leading-relaxed [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-3 [&_img]:shadow-xs"
              dangerouslySetInnerHTML={{ __html: email.body }}
            />
          ) : (
            <div className="whitespace-pre-wrap">{email.body || '(No message content)'}</div>
          )}
        </div>

        {/* Error message if failed */}
        {email.error_message && (
          <div className="ml-13 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <strong>Send Error:</strong> {email.error_message}
          </div>
        )}

        {/* Attached Documents & Files (Gmail attachment cards) */}
        {attachments.length > 0 && (
          <div className="ml-13 mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-700">
              <Paperclip className="w-3.5 h-3.5 text-gray-500" />
              <span>
                {attachments.length} Attachment{attachments.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {attachments.map((att, idx) => {
                const isImage = att.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename);
                const fileUrl = att.content || att.previewUrl || '';

                return (
                  <div
                    key={idx}
                    className="group relative w-48 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs hover:shadow-md transition-all flex flex-col"
                  >
                    {isImage && fileUrl ? (
                      <div className="relative h-28 bg-gray-100 overflow-hidden flex items-center justify-center">
                        <img
                          src={fileUrl}
                          alt={att.filename}
                          className="w-full h-full object-cover"
                        />
                        <a
                          href={fileUrl}
                          download={att.filename}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white no-underline"
                          title="Download"
                        >
                          <Download className="w-6 h-6" />
                        </a>
                      </div>
                    ) : (
                      <div className="h-28 bg-gray-50 flex flex-col items-center justify-center p-3 text-gray-400 group-hover:bg-gray-100 transition-colors">
                        <div className="p-2 rounded-lg bg-white shadow-xs mb-1">
                          {getFileIcon(att.filename)}
                        </div>
                        <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">
                          {att.filename.split('.').pop() || 'FILE'}
                        </span>
                      </div>
                    )}

                    {/* Attachment Info Bar */}
                    <div className="p-2.5 bg-white flex items-center justify-between border-t border-gray-100">
                      <div className="min-w-0 flex-1 pr-1">
                        <p className="text-xs font-medium text-gray-800 truncate m-0" title={att.filename}>
                          {att.filename}
                        </p>
                        {att.size && <p className="text-[11px] text-gray-400 m-0">{att.size}</p>}
                      </div>
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          download={att.filename}
                          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gmail Bottom Quick Actions */}
        <div className="ml-13 mt-10 pt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleReply}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 bg-white cursor-pointer transition-colors shadow-xs"
          >
            <CornerUpLeft className="w-4 h-4 text-gray-500" />
            <span>Reply</span>
          </button>
          <button
            type="button"
            onClick={handleForward}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 bg-white cursor-pointer transition-colors shadow-xs"
          >
            <CornerUpRight className="w-4 h-4 text-gray-500" />
            <span>Forward</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}

function AppInner() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .me()
      .then((result) => {
        if (mounted) setUser(result.user);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setCheckingAuth(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate('/login');
  }

  if (checkingAuth) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route
        path="/dashboard"
        element={user ? <DashboardPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard/sent"
        element={user ? <DashboardPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard/starred"
        element={user ? <DashboardPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/compose"
        element={user ? <ComposePage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/mail/:id"
        element={user ? <MailDetailPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
