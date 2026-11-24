import { User } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

export type WorkspaceTab = 'home' | 'doubts' | 'zoom' | 'calendar' | 'admin';

interface TopBarProps {
  activeTab: WorkspaceTab;
  isAdmin: boolean;
  user: User | null;
  isSigningIn: boolean;
  openDoubtsCount: number;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function TopBar({
  activeTab,
  isAdmin,
  user,
  isSigningIn,
  openDoubtsCount,
  onSelectTab,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'doubts', label: 'Ask & Doubts' },
    { id: 'zoom', label: 'Zoom Sessions' },
    { id: 'calendar', label: 'Calendar' },
    ...(isAdmin
      ? [
          {
            id: 'admin' as WorkspaceTab,
            label:
              openDoubtsCount > 0
                ? `Tutor Desk (${openDoubtsCount})`
                : 'Tutor Desk',
          },
        ]
      : []),
  ];

  return (
    <header className="pointer-events-auto relative z-30 flex h-16 w-full items-center justify-between gap-8 border-b border-slate-200 bg-white px-5 sm:px-7 text-slate-900">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('home')}
        className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
      >
        OpenMaths OL
      </button>

      {/* Zone 2: Clean single-line navigation links */}
      <nav
        aria-label="Primary sections"
        className="flex h-full items-center gap-4 sm:gap-6 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative flex h-full items-center text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700 ${
                isActive
                  ? 'text-blue-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action / Auth control */}
      <div className="flex items-center gap-3 shrink-0">
        {!user ? (
          <GoogleSignInButton
            onClick={onSignIn}
            disabled={isSigningIn}
            label={isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          />
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-block max-w-[160px] truncate text-xs font-medium text-slate-700">
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
