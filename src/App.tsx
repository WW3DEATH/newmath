import { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ConfirmationModal,
  ConfirmDialogState,
} from './components/ConfirmationModal';
import { DoubtPortalDrawer } from './components/DoubtPortalDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './components/HomePage';
import { TopBar, WorkspaceTab } from './components/TopBar';
import {
  CalendarEventItem,
  clearAccessToken,
  createCalendarEvent,
  googleSignIn,
  initAuth,
  listUpcomingEvents,
  logout,
} from './services/googleCalendar';
import {
  ensureUserProfile,
  isTutorAdminUser,
  MathsDoubtRecord,
  subscribeDoubts,
  subscribeZoomSessions,
  ZoomSessionRecord,
} from './services/mathsPortalDb';

function OpenMathsApp() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('home');

  // Auth, Firestore & Google Calendar State
  const [user, setUser] = useState<User | null>(null);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [doubts, setDoubts] = useState<MathsDoubtRecord[]>([]);
  const [zoomSessions, setZoomSessions] = useState<ZoomSessionRecord[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null
  );
  const [confirmBusy, setConfirmBusy] = useState(false);

  const isAdmin = useMemo(() => isTutorAdminUser(user), [user]);
  const openDoubtsCount = useMemo(
    () => doubts.filter((d) => d.status === 'open').length,
    [doubts]
  );

  // Keyboard shortcut: 'Escape' closes drawer back to Home
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape' && !confirmDialog) {
        setActiveTab('home');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDialog]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = initAuth((nextUser, token) => {
      setUser(nextUser);
      setCalendarToken(token);
      if (nextUser) {
        ensureUserProfile(nextUser).catch((err) => {
          console.error('User profile sync error:', err);
        });
      } else {
        setDoubts([]);
        setZoomSessions([]);
        setCalendarEvents([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore doubts & group zoomSessions whenever signed in
  useEffect(() => {
    if (!user) return;
    setDbError(null);

    const unsubDoubts = subscribeDoubts(
      user,
      isAdmin,
      (list) => setDoubts(list),
      (err) => setDbError(err.message)
    );
    const unsubZoom = subscribeZoomSessions(
      user,
      isAdmin,
      (list) => setZoomSessions(list),
      (err) => setDbError(err.message)
    );

    return () => {
      unsubDoubts();
      unsubZoom();
    };
  }, [user, isAdmin]);

  const fetchCalendarEvents = useCallback(async (token: string) => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const items = await listUpcomingEvents(token);
      setCalendarEvents(items);
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
        clearAccessToken();
        setCalendarToken(null);
        setCalendarError(
          'Your Google Calendar session expired. Please sign in again.'
        );
      } else {
        setCalendarError(
          err instanceof Error
            ? err.message
            : 'Unable to load Google Calendar events.'
        );
      }
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (calendarToken) {
      fetchCalendarEvents(calendarToken);
    }
  }, [calendarToken, fetchCalendarEvents]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setCalendarError(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setCalendarToken(res.accessToken);
      await ensureUserProfile(res.user);
    } catch (err) {
      console.error('Sign in failed:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setCalendarToken(null);
    setCalendarEvents([]);
    setDoubts([]);
    setZoomSessions([]);
    if (activeTab === 'admin') {
      setActiveTab('home');
    }
  };

  const handleSaveSessionToCalendar = useCallback(
    async (session: ZoomSessionRecord) => {
      if (!calendarToken) return;
      try {
        const start = new Date(session.scheduledAtIso);
        const end = new Date(
          start.getTime() + session.durationMinutes * 60_000
        );
        const descLines = [
          'OpenMaths OL — Free Group Zoom Doubt Clearing',
          `Join Zoom: ${session.zoomLink}`,
          session.meetingId ? `Meeting ID: ${session.meetingId}` : '',
          session.passcode ? `Passcode: ${session.passcode}` : '',
          session.notes ? `Notes: ${session.notes}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        await createCalendarEvent(calendarToken, {
          summary: `OpenMaths OL: ${session.title}`,
          location: session.zoomLink,
          description: descLines,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
        });
        fetchCalendarEvents(calendarToken);
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
          clearAccessToken();
          setCalendarToken(null);
        }
      }
    },
    [calendarToken, fetchCalendarEvents]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      {/* Top Navigation Bar */}
      <TopBar
        activeTab={activeTab}
        isAdmin={isAdmin}
        user={user}
        isSigningIn={isSigningIn}
        openDoubtsCount={openDoubtsCount}
        onSelectTab={setActiveTab}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Database Error Notice if any */}
      {dbError && (
        <div className="fixed top-20 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900 shadow-md">
          {dbError}
        </div>
      )}

      {/* Simple, Interactive, Modern Home Page */}
      <HomePage
        user={user}
        isAdmin={isAdmin}
        isSigningIn={isSigningIn}
        calendarToken={calendarToken}
        doubts={doubts}
        zoomSessions={zoomSessions}
        onSignIn={handleSignIn}
        onNavigateTab={setActiveTab}
        onSaveSessionToCalendar={handleSaveSessionToCalendar}
      />

      {/* Slide-Over O/L Maths Doubt, Group Zoom, Tutor Desk & Calendar Drawer */}
      <DoubtPortalDrawer
        activeTab={activeTab}
        isAdmin={isAdmin}
        user={user}
        calendarToken={calendarToken}
        isSigningIn={isSigningIn}
        doubts={doubts}
        zoomSessions={zoomSessions}
        calendarEvents={calendarEvents}
        calendarLoading={calendarLoading}
        calendarError={calendarError}
        onChangeTab={setActiveTab}
        onCloseDrawer={() => setActiveTab('home')}
        onSignIn={handleSignIn}
        onRefreshCalendar={() =>
          calendarToken && fetchCalendarEvents(calendarToken)
        }
        onRequestConfirm={setConfirmDialog}
        onCloseConfirm={() => setConfirmDialog(null)}
        onSetConfirmBusy={setConfirmBusy}
        onAuthExpired={() => {
          clearAccessToken();
          setCalendarToken(null);
        }}
      />

      {/* Custom Accessible Confirmation Dialog */}
      <ConfirmationModal
        dialog={confirmDialog}
        isBusy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmDialog(null);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OpenMathsApp />
    </ErrorBoundary>
  );
}
