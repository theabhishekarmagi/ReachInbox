import { Paperclip, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { EmailItem } from '../types';

interface ListViewProps {
  items: EmailItem[];
  kind: 'scheduled' | 'sent' | 'starred';
  loading: boolean;
  onClearFilters?: () => void;
  hasFilters?: boolean;
  onToggleStar?: (id: string, is_starred: boolean) => void;
}

function formatBadge(item: EmailItem, kind: 'scheduled' | 'sent' | 'starred'): { label: string; style: string } {
  if (kind === 'sent' || (kind === 'starred' && (item.status === 'sent' || item.status === 'failed'))) {
    const isFailed = item.status === 'failed';
    return {
      label: isFailed ? 'Failed' : 'Sent',
      style: isFailed
        ? 'text-red-600 bg-red-50 border-red-200'
        : 'text-gray-500 bg-gray-50 border-gray-200',
    };
  }

  const date = item.scheduled_at ? new Date(item.scheduled_at) : new Date();
  const weekday = date.toLocaleDateString([], { weekday: 'short' });
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return {
    label: `${weekday} ${time}`,
    style: 'text-orange-600 bg-orange-50 border-orange-200',
  };
}

function extractName(email: string): string {
  const local = email.split('@')[0];
  return local
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ListView({
  items,
  kind,
  loading,
  onClearFilters,
  hasFilters,
  onToggleStar
}: ListViewProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-9 text-gray-400 text-sm text-center">
        Loading emails...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-9 text-gray-400 text-sm text-center">
        {hasFilters ? (
          <div>
            <p className="m-0 mb-2 text-gray-500">No emails matched your search or filters.</p>
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs font-semibold text-brand-green bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              >
                Clear Search & Filters
              </button>
            )}
          </div>
        ) : (
          `No ${kind} emails found.`
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100">
      {items.map((item) => {
        const badge = formatBadge(item, kind);
        const preview = item.body
          ? item.body.replace(/\s+/g, ' ').slice(0, 100)
          : (item.status === 'sent' ? 'Delivered successfully' : 'Scheduled message');
        const hasAttachments = item.attachments && item.attachments.length > 0;

        return (
          <div
            key={item.id}
            className="w-full border-b border-gray-100 flex items-center gap-3 py-3.5 px-3 hover:bg-gray-50 transition-colors group cursor-pointer"
            onClick={() => navigate(`/mail/${item.id}`, { state: item })}
          >
            {/* Interactive Star Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar?.(item.id, !item.is_starred);
              }}
              className="p-1 border-none bg-transparent cursor-pointer rounded hover:bg-gray-100 transition-colors shrink-0"
              title={item.is_starred ? 'Starred' : 'Not starred'}
            >
              <Star
                className={`w-4 h-4 transition-colors ${
                  item.is_starred
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300 hover:text-amber-400'
                }`}
              />
            </button>

            {/* Recipient */}
            <span className="w-[180px] shrink-0 text-sm text-gray-700 truncate">
              To: {extractName(item.email)}
            </span>

            {/* Date/Status Badge */}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${badge.style}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {badge.label}
            </span>

            {/* Subject */}
            <span className="text-sm text-gray-800 font-medium whitespace-nowrap">
              {item.subject}
            </span>

            {/* Preview Snippet */}
            <span className="text-sm text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis flex-1">
              · {preview}
            </span>

            {/* Attachment indicator if any */}
            {hasAttachments && (
              <span title={`${item.attachments?.length} attachment(s)`} className="text-gray-400">
                <Paperclip className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
