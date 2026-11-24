import { User } from 'firebase/auth';
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  CalendarEventItem,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../services/googleCalendar';
import {
  bulkUpdateDoubtStatusAsAdmin,
  deleteOpenDoubt,
  deleteZoomSession,
  DoubtStatus,
  isValidHttpsZoomUrl,
  markDoubtResolvedByStudent,
  MathsDoubtRecord,
  scheduleGroupZoomSessionAsAdmin,
  submitMathsDoubt,
  updateZoomSessionStatus,
  ZoomSessionRecord,
  ZoomSessionStatus,
} from '../services/mathsPortalDb';
import { ConfirmDialogState } from './ConfirmationModal';
import { GoogleSignInButton } from './GoogleSignInButton';
import { WorkspaceTab } from './TopBar';

interface DoubtPortalDrawerProps {
  activeTab: WorkspaceTab;
  isAdmin: boolean;
  user: User | null;
  calendarToken: string | null;
  isSigningIn: boolean;
  doubts: MathsDoubtRecord[];
  zoomSessions: ZoomSessionRecord[];
  calendarEvents: CalendarEventItem[];
  calendarLoading: boolean;
  calendarError: string | null;
  onChangeTab: (tab: WorkspaceTab) => void;
  onCloseDrawer: () => void;
  onSignIn: () => void;
  onRefreshCalendar: () => void;
  onRequestConfirm: (dialog: ConfirmDialogState) => void;
  onCloseConfirm: () => void;
  onSetConfirmBusy: (busy: boolean) => void;
  onAuthExpired: () => void;
}

function formatDateTimeShort(iso?: string): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimestamp(ts?: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function defaultDateTimeInput(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const STATUS_LABELS: Record<DoubtStatus, string> = {
  open: 'Queued for Zoom',
  scheduled: 'Included in Zoom',
  resolved: 'Discussed in Zoom',
};

const STATUS_TEXT_COLORS: Record<DoubtStatus, string> = {
  open: 'text-amber-700',
  scheduled: 'text-blue-700',
  resolved: 'text-emerald-700',
};

export function DoubtPortalDrawer({
  activeTab,
  isAdmin,
  user,
  calendarToken,
  isSigningIn,
  doubts,
  zoomSessions,
  calendarEvents,
  calendarLoading,
  calendarError,
  onChangeTab,
  onCloseDrawer,
  onSignIn,
  onRefreshCalendar,
  onRequestConfirm,
  onCloseConfirm,
  onSetConfirmBusy,
  onAuthExpired,
}: DoubtPortalDrawerProps) {
  // Student Topic-Free Doubt Form State
  const [doubtTitle, setDoubtTitle] = useState('');
  const [doubtQuestion, setDoubtQuestion] = useState('');
  const [doubtSubmitting, setDoubtSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Admin Desk: Schedule Group Zoom Session + Bulk Doubt Selection
  const [adminStatusFilter, setAdminStatusFilter] = useState<
    'all' | DoubtStatus
  >('all');
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedDoubtIds, setSelectedDoubtIds] = useState<string[]>([]);

  const [showZoomForm, setShowZoomForm] = useState(true);
  const [sessionTitle, setSessionTitle] = useState(
    'O/L Maths Live Doubt Clearing Session'
  );
  const [sessionZoomUrl, setSessionZoomUrl] = useState('https://zoom.us/j/');
  const [sessionMeetingId, setSessionMeetingId] = useState('');
  const [sessionPasscode, setSessionPasscode] = useState('');
  const [sessionWhen, setSessionWhen] = useState(defaultDateTimeInput);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [sessionNotes, setSessionNotes] = useState('');
  const [syncZoomToCalendar, setSyncZoomToCalendar] = useState(true);
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Google Calendar Quick Event & Reschedule State
  const [calTitle, setCalTitle] = useState('O/L Maths Study Session');
  const [calWhen, setCalWhen] = useState(defaultDateTimeInput);
  const [calDuration, setCalDuration] = useState(60);
  const [calSubmitting, setCalSubmitting] = useState(false);
  const [rescheduleEventId, setRescheduleEventId] = useState<string | null>(
    null
  );
  const [rescheduleWhen, setRescheduleWhen] = useState(defaultDateTimeInput);

  const openDoubts = useMemo(
    () => doubts.filter((d) => d.status === 'open'),
    [doubts]
  );

  const filteredAdminDoubts = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return doubts.filter((d) => {
      if (adminStatusFilter !== 'all' && d.status !== adminStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.question.toLowerCase().includes(q) ||
        d.studentName.toLowerCase().includes(q)
      );
    });
  }, [doubts, adminStatusFilter, adminSearch]);

  if (activeTab === 'home') {
    return null;
  }

  const showToast = (tone: 'ok' | 'err', text: string) => {
    setFeedbackMsg({ tone, text });
  };

  const handleDoubtSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setDoubtSubmitting(true);
    setFeedbackMsg(null);
    try {
      await submitMathsDoubt(user, {
        title: doubtTitle,
        question: doubtQuestion,
      });
      setDoubtTitle('');
      setDoubtQuestion('');
      showToast(
        'ok',
        'Your doubt is queued! Doubts are answered live together in the upcoming group Zoom session.'
      );
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'Unable to submit doubt.'
      );
    } finally {
      setDoubtSubmitting(false);
    }
  };

  const handleSaveZoomToCalendar = async (input: {
    title: string;
    zoomLink: string;
    startIso: string;
    durationMinutes: number;
    meetingId?: string;
    passcode?: string;
    notes?: string;
  }) => {
    if (!calendarToken) {
      showToast(
        'err',
        'Sign in with Google to save sessions to your Google Calendar.'
      );
      return;
    }
    try {
      const start = new Date(input.startIso);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      const descLines = [
        'OpenMaths OL — Free Group Zoom Doubt Clearing',
        `Join Zoom: ${input.zoomLink}`,
        input.meetingId ? `Meeting ID: ${input.meetingId}` : '',
        input.passcode ? `Passcode: ${input.passcode}` : '',
        input.notes ? `Notes: ${input.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await createCalendarEvent(calendarToken, {
        summary: `OpenMaths OL: ${input.title}`,
        location: input.zoomLink,
        description: descLines,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
      });
      showToast('ok', 'Zoom session added to your Google Calendar.');
      onRefreshCalendar();
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
        onAuthExpired();
      } else {
        showToast(
          'err',
          err instanceof Error
            ? err.message
            : 'Could not add to Google Calendar.'
        );
      }
    }
  };

  const handleScheduleGroupZoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setAdminSubmitting(true);
    setFeedbackMsg(null);
    try {
      const scheduledIso = new Date(sessionWhen).toISOString();
      await scheduleGroupZoomSessionAsAdmin(user, {
        title: sessionTitle,
        zoomLink: sessionZoomUrl,
        meetingId: sessionMeetingId,
        passcode: sessionPasscode,
        scheduledAtIso: scheduledIso,
        durationMinutes: sessionDuration,
        notes: sessionNotes,
        selectedDoubtIds,
      });

      if (syncZoomToCalendar && calendarToken) {
        await handleSaveZoomToCalendar({
          title: sessionTitle,
          zoomLink: sessionZoomUrl,
          startIso: scheduledIso,
          durationMinutes: sessionDuration,
          meetingId: sessionMeetingId,
          passcode: sessionPasscode,
          notes: sessionNotes,
        });
      }

      const countMsg =
        selectedDoubtIds.length > 0
          ? ` with ${selectedDoubtIds.length} queued doubt(s) attached`
          : '';
      setSelectedDoubtIds([]);
      setSessionNotes('');
      setShowZoomForm(false);
      showToast(
        'ok',
        `Group Zoom session published for all signed-in students${countMsg}.`
      );
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'Unable to schedule Zoom session.'
      );
    } finally {
      setAdminSubmitting(false);
    }
  };

  const toggleDoubtSelection = (id: string) => {
    setSelectedDoubtIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllOpen = () => {
    const openIds = openDoubts.map((d) => d.id);
    const allSelected =
      openIds.length > 0 && openIds.every((id) => selectedDoubtIds.includes(id));
    setSelectedDoubtIds(allSelected ? [] : openIds);
  };

  const handleBulkStatus = async (status: DoubtStatus) => {
    if (selectedDoubtIds.length === 0) return;
    setAdminSubmitting(true);
    try {
      await bulkUpdateDoubtStatusAsAdmin(selectedDoubtIds, status);
      showToast(
        'ok',
        `Updated ${selectedDoubtIds.length} doubt(s) to ${STATUS_LABELS[status]}.`
      );
      setSelectedDoubtIds([]);
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'Bulk update failed.'
      );
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleCreateCalendarReminder = async (e: FormEvent) => {
    e.preventDefault();
    if (!calendarToken) return;
    setCalSubmitting(true);
    setFeedbackMsg(null);
    try {
      const start = new Date(calWhen);
      const end = new Date(start.getTime() + calDuration * 60_000);
      await createCalendarEvent(calendarToken, {
        summary: calTitle.trim() || 'O/L Maths Study Session',
        location: 'OpenMaths OL Portal',
        description: 'O/L Mathematics study block.',
        startIso: start.toISOString(),
        endIso: end.toISOString(),
      });
      showToast('ok', 'Study reminder added to Google Calendar.');
      onRefreshCalendar();
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
        onAuthExpired();
      } else {
        showToast(
          'err',
          err instanceof Error
            ? err.message
            : 'Failed to create calendar event.'
        );
      }
    } finally {
      setCalSubmitting(false);
    }
  };

  return (
    <aside
      aria-label="O/L Maths Doubt & Group Zoom Workspace"
      className="pointer-events-auto fixed top-16 right-0 bottom-0 z-40 flex w-full max-w-[560px] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'doubts', label: 'Ask & Doubts' },
              { id: 'zoom', label: 'Zoom Sessions' },
              { id: 'calendar', label: 'Calendar' },
              ...(isAdmin
                ? [{ id: 'admin' as WorkspaceTab, label: 'Tutor Desk' }]
                : []),
            ] as { id: WorkspaceTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTab(t.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCloseDrawer}
          aria-label="Close workspace panel"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status Toast */}
      {feedbackMsg && (
        <div
          role="status"
          className={`mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
            feedbackMsg.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="shrink-0 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* ================= TAB 1: STUDENT ASK & DOUBTS ================= */}
        {activeTab === 'doubts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Ask Any O/L Maths Doubt
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                No topic limits—submit any maths question you are stuck on.
                Doubts are collected together and solved live in free group Zoom
                sessions open to all signed-in students rather than answered via
                text here.
              </p>
            </div>

            {!user ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Sign in to submit your doubt
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Signing in lets you queue doubts for the next group Zoom
                  session, access live Zoom links, and sync sessions to Google
                  Calendar.
                </p>
                <div className="mt-4">
                  <GoogleSignInButton
                    onClick={onSignIn}
                    disabled={isSigningIn}
                    label={
                      isSigningIn ? 'Signing in...' : 'Sign in with Google'
                    }
                  />
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleDoubtSubmit}
                className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Submit a Doubt to the Zoom Queue
                  </h3>
                  <span className="text-xs text-slate-500">
                    No topic required
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="drawer-doubt-title"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Question Summary
                  </label>
                  <input
                    id="drawer-doubt-title"
                    type="text"
                    required
                    minLength={3}
                    maxLength={140}
                    value={doubtTitle}
                    onChange={(e) => setDoubtTitle(e.target.value)}
                    placeholder="e.g. 2023 Past Paper Part II Q8 or simultaneous equations"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="drawer-doubt-question"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Your Doubt &amp; Where You Got Stuck
                  </label>
                  <textarea
                    id="drawer-doubt-question"
                    required
                    minLength={5}
                    maxLength={2500}
                    rows={4}
                    value={doubtQuestion}
                    onChange={(e) => setDoubtQuestion(e.target.value)}
                    placeholder="Type the question or describe the step you want covered in the next live Zoom session..."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onChangeTab('zoom')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>View Group Zoom Sessions</span>
                  </button>

                  <button
                    type="submit"
                    disabled={doubtSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      {doubtSubmitting ? 'Sending...' : 'Add to Zoom Queue'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Student's Submitted Doubts */}
            {user && (
              <div className="space-y-3 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    My Submitted Doubts ({doubts.length})
                  </h3>
                </div>

                {doubts.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No maths doubts queued yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Submit any question above to have it covered in a live
                      group Zoom session.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {doubts.map((doubt) => (
                      <div key={doubt.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">
                              {doubt.title}
                            </h4>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                              <span>{formatTimestamp(doubt.createdAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`font-medium ${
                                  STATUS_TEXT_COLORS[doubt.status]
                                }`}
                              >
                                {STATUS_LABELS[doubt.status]}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {doubt.status !== 'resolved' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestConfirm({
                                    title: 'Mark doubt as discussed?',
                                    description: `Mark "${doubt.title}" as discussed/resolved?`,
                                    confirmLabel: 'Mark Discussed',
                                    tone: 'primary',
                                    onConfirm: async () => {
                                      onSetConfirmBusy(true);
                                      try {
                                        await markDoubtResolvedByStudent(
                                          doubt.id
                                        );
                                        onCloseConfirm();
                                      } finally {
                                        onSetConfirmBusy(false);
                                      }
                                    },
                                  })
                                }
                                title="Mark discussed"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            )}
                            {doubt.status === 'open' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestConfirm({
                                    title: 'Delete queued doubt?',
                                    description: `Permanently remove "${doubt.title}" from the queue?`,
                                    confirmLabel: 'Delete Doubt',
                                    tone: 'danger',
                                    onConfirm: async () => {
                                      onSetConfirmBusy(true);
                                      try {
                                        await deleteOpenDoubt(doubt.id);
                                        onCloseConfirm();
                                      } finally {
                                        onSetConfirmBusy(false);
                                      }
                                    },
                                  })
                                }
                                title="Delete doubt"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                          {doubt.question}
                        </p>

                        {doubt.zoomJoinUrl &&
                          isValidHttpsZoomUrl(doubt.zoomJoinUrl) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                              <div className="text-xs text-emerald-950 tabular-nums">
                                <span className="font-semibold">
                                  Group Zoom Session
                                </span>
                                {doubt.zoomScheduledFor && (
                                  <>
                                    {' · '}
                                    <span>
                                      {formatDateTimeShort(
                                        doubt.zoomScheduledFor
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {calendarToken && doubt.zoomScheduledFor && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSaveZoomToCalendar({
                                        title: doubt.title,
                                        zoomLink: doubt.zoomJoinUrl!,
                                        startIso: doubt.zoomScheduledFor!,
                                        durationMinutes: 60,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                                  >
                                    <CalendarPlus className="h-3.5 w-3.5" />
                                    <span>Add to Calendar</span>
                                  </button>
                                )}
                                <a
                                  href={doubt.zoomJoinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  <span>Join Zoom</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: GROUP ZOOM SESSIONS ================= */}
        {activeTab === 'zoom' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Live Group Zoom Sessions
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Every scheduled Zoom session is open to all signed-in students
                to clear queued O/L Mathematics doubts live together.
              </p>
            </div>

            {!user ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Sign in to view scheduled Zoom links
                </h3>
                <p className="mt-1.5 text-xs text-slate-600">
                  All signed-in students automatically receive access to every
                  live group Zoom session link here.
                </p>
                <div className="mt-4">
                  <GoogleSignInButton
                    onClick={onSignIn}
                    disabled={isSigningIn}
                  />
                </div>
              </div>
            ) : zoomSessions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                <p className="text-sm font-medium text-slate-800">
                  No Zoom sessions scheduled yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add your doubts to the queue—your tutor schedules group Zoom
                  sessions whenever ready.
                </p>
                <button
                  type="button"
                  onClick={() => onChangeTab('doubts')}
                  className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  Ask a Doubt
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {zoomSessions.map((session) => {
                  const safeUrl = isValidHttpsZoomUrl(session.zoomLink);
                  return (
                    <div key={session.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {session.title}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                            <span>
                              {formatDateTimeShort(session.scheduledAtIso)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{session.durationMinutes} min</span>
                            <span aria-hidden="true">·</span>
                            <span>All Signed-In Students</span>
                            {typeof session.doubtCount === 'number' &&
                              session.doubtCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {session.doubtCount} doubt
                                    {session.doubtCount === 1 ? '' : 's'} queued
                                  </span>
                                </>
                              )}
                          </div>
                        </div>

                        <span className="text-xs font-medium capitalize text-blue-700 shrink-0">
                          {session.status}
                        </span>
                      </div>

                      {session.notes && (
                        <p className="text-xs leading-relaxed text-slate-600">
                          {session.notes}
                        </p>
                      )}

                      {(session.meetingId || session.passcode) && (
                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600 tabular-nums">
                          {session.meetingId && (
                            <span>Meeting ID: {session.meetingId}</span>
                          )}
                          {session.passcode && (
                            <span>Passcode: {session.passcode}</span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveZoomToCalendar({
                              title: session.title,
                              zoomLink: session.zoomLink,
                              startIso: session.scheduledAtIso,
                              durationMinutes: session.durationMinutes,
                              meetingId: session.meetingId,
                              passcode: session.passcode,
                              notes: session.notes,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          <span>Save to Calendar</span>
                        </button>

                        {safeUrl && (
                          <a
                            href={session.zoomLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                          >
                            <Video className="h-3.5 w-3.5" />
                            <span>Join Zoom</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: TUTOR ADMIN DESK ================= */}
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Tutor Admin Desk
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Schedule a group Zoom meeting anytime for all signed-in
                  students and attach queued doubts in bulk to discuss live.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowZoomForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <Video className="h-3.5 w-3.5" />
                <span>
                  {showZoomForm ? 'Hide Scheduler' : 'Schedule Group Zoom'}
                </span>
              </button>
            </div>

            {/* Schedule Group Zoom Meeting Anytime (All Signed-In Students) */}
            {showZoomForm && (
              <form
                onSubmit={handleScheduleGroupZoom}
                className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Schedule Group Zoom Session
                  </h3>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                    <Users className="h-3.5 w-3.5" />
                    <span>All Signed-In Students</span>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Session Title
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={140}
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="e.g. O/L Maths Doubt Clearing Session"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Zoom Meeting Link (https://)
                  </label>
                  <input
                    type="url"
                    required
                    value={sessionZoomUrl}
                    onChange={(e) => setSessionZoomUrl(e.target.value)}
                    placeholder="https://zoom.us/j/1234567890"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Meeting ID (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={sessionMeetingId}
                      onChange={(e) => setSessionMeetingId(e.target.value)}
                      placeholder="842 1904 2210"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Passcode (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={sessionPasscode}
                      onChange={(e) => setSessionPasscode(e.target.value)}
                      placeholder="OLMATHS"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={sessionWhen}
                      onChange={(e) => setSessionWhen(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Duration
                    </label>
                    <select
                      value={sessionDuration}
                      onChange={(e) =>
                        setSessionDuration(Number(e.target.value))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs tabular-nums"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Session Notes (optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Covering all student doubts queued this week..."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>

                {openDoubts.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs">
                    <span className="text-slate-700 tabular-nums">
                      Bulk doubts selected:{' '}
                      <strong className="text-slate-900">
                        {selectedDoubtIds.length}
                      </strong>{' '}
                      of {openDoubts.length} queued
                    </span>
                    <button
                      type="button"
                      onClick={handleSelectAllOpen}
                      className="font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                    >
                      {openDoubts.every((d) => selectedDoubtIds.includes(d.id))
                        ? 'Clear selection'
                        : `Select all ${openDoubts.length} open doubts`}
                    </button>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={syncZoomToCalendar}
                    onChange={(e) => setSyncZoomToCalendar(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Also add this session to my Google Calendar</span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={adminSubmitting}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {adminSubmitting
                      ? 'Publishing...'
                      : selectedDoubtIds.length > 0
                      ? `Publish Zoom & Attach ${selectedDoubtIds.length} Doubt(s)`
                      : 'Publish Group Zoom Session'}
                  </button>
                </div>
              </form>
            )}

            {/* Filter, Search & Bulk Actions for Student Doubts Queue */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'open', label: 'Queued' },
                      { id: 'scheduled', label: 'In Zoom' },
                      { id: 'resolved', label: 'Discussed' },
                    ] as { id: 'all' | DoubtStatus; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAdminStatusFilter(f.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                        adminStatusFilter === f.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {selectedDoubtIds.length > 0 && (
                  <button
                    type="button"
                    disabled={adminSubmitting}
                    onClick={() => handleBulkStatus('resolved')}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
                  >
                    Mark {selectedDoubtIds.length} Discussed
                  </button>
                )}
              </div>

              <input
                type="search"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Search by student name or question..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
            </div>

            {/* Bulk Student Doubts Queue (No Website Reply Forms — Discussed on Zoom) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Student Doubts Queue ({filteredAdminDoubts.length})
              </h3>

              {filteredAdminDoubts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-600">
                  No matching student doubts in this filter.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {filteredAdminDoubts.map((doubt) => {
                    const checked = selectedDoubtIds.includes(doubt.id);
                    return (
                      <div key={doubt.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoubtSelection(doubt.id)}
                              className="mt-1 rounded border-slate-300"
                            />
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">
                                {doubt.title}
                              </h4>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                                <span className="font-medium text-slate-700">
                                  {doubt.studentName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatTimestamp(doubt.createdAt)}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-medium ${
                                    STATUS_TEXT_COLORS[doubt.status]
                                  }`}
                                >
                                  {STATUS_LABELS[doubt.status]}
                                </span>
                              </div>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              bulkUpdateDoubtStatusAsAdmin(
                                [doubt.id],
                                doubt.status === 'resolved'
                                  ? 'open'
                                  : 'resolved'
                              )
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                          >
                            {doubt.status === 'resolved'
                              ? 'Reopen'
                              : 'Mark Discussed'}
                          </button>
                        </div>

                        <p className="pl-6 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                          {doubt.question}
                        </p>

                        {doubt.zoomScheduledFor && (
                          <div className="pl-6 text-xs text-blue-700 tabular-nums">
                            Linked Zoom:{' '}
                            {formatDateTimeShort(doubt.zoomScheduledFor)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Manage Scheduled Zoom Sessions */}
            {zoomSessions.length > 0 && (
              <div className="space-y-3 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Manage Scheduled Zoom Sessions ({zoomSessions.length})
                </h3>
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {zoomSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 p-3.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {s.title}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {formatDateTimeShort(s.scheduledAtIso)} ·{' '}
                          <span className="capitalize">{s.status}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Change status for ${s.title}`}
                          value={s.status}
                          onChange={(e) => {
                            const nextStatus = e.target
                              .value as ZoomSessionStatus;
                            onRequestConfirm({
                              title: 'Update Zoom session status?',
                              description: `Change "${s.title}" status from ${s.status} to ${nextStatus}?`,
                              confirmLabel: 'Update Status',
                              tone: 'primary',
                              onConfirm: async () => {
                                onSetConfirmBusy(true);
                                try {
                                  await updateZoomSessionStatus(
                                    s.id,
                                    nextStatus
                                  );
                                  onCloseConfirm();
                                } finally {
                                  onSetConfirmBusy(false);
                                }
                              },
                            });
                          }}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="live">Live</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            onRequestConfirm({
                              title: 'Delete Zoom session?',
                              description: `Remove "${s.title}" from the schedule?`,
                              confirmLabel: 'Delete Session',
                              tone: 'danger',
                              onConfirm: async () => {
                                onSetConfirmBusy(true);
                                try {
                                  await deleteZoomSession(s.id);
                                  onCloseConfirm();
                                } finally {
                                  onSetConfirmBusy(false);
                                }
                              },
                            })
                          }
                          aria-label={`Delete ${s.title}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: GOOGLE CALENDAR SYNC ================= */}
        {activeTab === 'calendar' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Google Calendar Schedule
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Manage your O/L Maths study blocks and synced group Zoom
                  sessions directly in Google Calendar.
                </p>
              </div>
              {calendarToken && (
                <button
                  type="button"
                  onClick={onRefreshCalendar}
                  disabled={calendarLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      calendarLoading ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {!calendarToken ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Connect Google Calendar
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Sign in with Google to view upcoming calendar events, add
                  group Zoom links, and reschedule study reminders.
                </p>
                <div className="mt-4">
                  <GoogleSignInButton
                    onClick={onSignIn}
                    disabled={isSigningIn}
                  />
                </div>
              </div>
            ) : (
              <>
                <form
                  onSubmit={handleCreateCalendarReminder}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900">
                    Add Study Block to Calendar
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Event Title
                    </label>
                    <input
                      type="text"
                      required
                      value={calTitle}
                      onChange={(e) => setCalTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={calWhen}
                        onChange={(e) => setCalWhen(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Duration
                      </label>
                      <select
                        value={calDuration}
                        onChange={(e) => setCalDuration(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                      >
                        <option value={30}>30 min</option>
                        <option value={60}>60 min</option>
                        <option value={90}>90 min</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={calSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {calSubmitting ? 'Saving...' : 'Add to Google Calendar'}
                      </span>
                    </button>
                  </div>
                </form>

                {calendarError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {calendarError}
                  </div>
                )}

                {calendarLoading ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((k) => (
                      <div
                        key={k}
                        className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                      />
                    ))}
                  </div>
                ) : calendarEvents.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-600">
                    No upcoming events found for the next 21 days.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {calendarEvents.map((ev) => {
                      const startStr = ev.start.dateTime || ev.start.date;
                      const isEditing = rescheduleEventId === ev.id;
                      return (
                        <div key={ev.id} className="p-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-900">
                                {ev.summary || '(Untitled Event)'}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                                {formatDateTimeShort(startStr)}
                                {ev.location ? ` · ${ev.location}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleEventId(
                                    isEditing ? null : ev.id
                                  );
                                  setRescheduleWhen(defaultDateTimeInput());
                                }}
                                title="Reschedule event"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestConfirm({
                                    title: 'Delete Google Calendar event?',
                                    description: `Are you sure you want to delete "${
                                      ev.summary || 'Untitled Event'
                                    }" from your Google Calendar?`,
                                    details: [
                                      `Time: ${formatDateTimeShort(startStr)}`,
                                    ],
                                    confirmLabel: 'Delete Event',
                                    tone: 'danger',
                                    onConfirm: async () => {
                                      onSetConfirmBusy(true);
                                      try {
                                        await deleteCalendarEvent(
                                          calendarToken,
                                          ev.id
                                        );
                                        onCloseConfirm();
                                        onRefreshCalendar();
                                      } finally {
                                        onSetConfirmBusy(false);
                                      }
                                    },
                                  })
                                }
                                title="Delete event"
                                className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isEditing && (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2.5">
                              <input
                                type="datetime-local"
                                value={rescheduleWhen}
                                onChange={(e) =>
                                  setRescheduleWhen(e.target.value)
                                }
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextStart = new Date(rescheduleWhen);
                                  const nextEnd = new Date(
                                    nextStart.getTime() + 60 * 60_000
                                  );
                                  onRequestConfirm({
                                    title: 'Reschedule Google Calendar event?',
                                    description: `Update "${
                                      ev.summary || 'Untitled Event'
                                    }" to ${formatDateTimeShort(
                                      nextStart.toISOString()
                                    )}?`,
                                    confirmLabel: 'Confirm Reschedule',
                                    tone: 'primary',
                                    onConfirm: async () => {
                                      onSetConfirmBusy(true);
                                      try {
                                        await updateCalendarEvent(
                                          calendarToken,
                                          ev.id,
                                          {
                                            startIso: nextStart.toISOString(),
                                            endIso: nextEnd.toISOString(),
                                          }
                                        );
                                        setRescheduleEventId(null);
                                        onCloseConfirm();
                                        onRefreshCalendar();
                                      } finally {
                                        onSetConfirmBusy(false);
                                      }
                                    },
                                  });
                                }}
                                className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800"
                              >
                                Save New Time
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
