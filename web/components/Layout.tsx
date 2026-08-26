import { ChevronDown, Clock, Send, Star } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../types';

interface LayoutProps {
  user: User;
  scheduledCount?: number;
  sentCount?: number;
  starredCount?: number;
  children: React.ReactNode;
  onLogout: () => Promise<void>;
}

export function Layout({
  user,
  scheduledCount = 0,
  sentCount = 0,
  starredCount = 0,
  children,
  onLogout
}: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeStarred = location.pathname.includes('/starred');
  const activeSent = !activeStarred && location.pathname.includes('/sent');
  const activeScheduled = !activeStarred && !activeSent;

  return (
    <div className="w-screen min-h-screen">
      <div className="w-full min-h-screen bg-white grid grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        {/* Sidebar */}
        <aside className="border-r border-dotted border-gray-200 py-5 px-4 flex flex-col gap-2">
          {/* Logo */}
          <div
            className="text-[32px] leading-none mb-3 text-gray-900 cursor-pointer"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
            onClick={() => navigate('/dashboard')}
          >
            ONB
          </div>

          {/* User Card */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
            <img
              className="w-10 h-10 rounded-full object-cover shrink-0"
              src={user.picture || 'https://i.pravatar.cc/100?img=12'}
              alt={user.displayName}
            />
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium text-gray-800 truncate">{user.displayName}</div>
              <div className="text-sm text-gray-400 truncate">{user.email}</div>
            </div>
            <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
          </div>

          {/* Compose Button */}
          <button
            className="w-full h-12 rounded-full border border-brand-green bg-white text-brand-green text-lg font-semibold cursor-pointer mt-3 hover:bg-emerald-50 transition-colors"
            onClick={() => navigate('/compose')}
          >
            Compose
          </button>

          {/* Menu */}
          <div className="mt-5 text-xs font-semibold text-gray-400 tracking-wider uppercase px-2">
            CORE
          </div>

          {/* Scheduled */}
          <Link
            to="/dashboard"
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-base transition-colors ${
              activeScheduled ? 'bg-emerald-50 font-semibold text-gray-800' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className={`w-5 h-5 ${activeScheduled ? 'text-brand-green' : 'text-gray-400'}`} />
              <span>Scheduled</span>
            </div>
            <span className="text-sm text-gray-400 font-normal">{scheduledCount}</span>
          </Link>

          {/* Sent */}
          <Link
            to="/dashboard/sent"
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-base transition-colors ${
              activeSent ? 'bg-emerald-50 font-semibold text-gray-800' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Send className={`w-5 h-5 ${activeSent ? 'text-brand-green' : 'text-gray-400'}`} />
              <span>Sent</span>
            </div>
            <span className="text-sm text-gray-400 font-normal">{sentCount}</span>
          </Link>

          {/* Starred (Gmail style) */}
          <Link
            to="/dashboard/starred"
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-base transition-colors ${
              activeStarred ? 'bg-emerald-50 font-semibold text-gray-800' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Star
                className={`w-5 h-5 ${
                  activeStarred ? 'text-amber-400 fill-amber-400' : 'text-gray-400 hover:text-amber-400'
                }`}
              />
              <span>Starred</span>
            </div>
            <span className="text-sm text-gray-400 font-normal">{starredCount}</span>
          </Link>

          {/* Spacer + Logout */}
          <div className="flex-1" />
          <button
            className="border-none bg-transparent text-gray-400 text-sm text-left cursor-pointer hover:text-gray-600 transition-colors px-2 pb-2"
            onClick={onLogout}
          >
            Logout
          </button>
        </aside>

        {/* Main Content */}
        <main className="py-4 px-6">{children}</main>
      </div>
    </div>
  );
}
