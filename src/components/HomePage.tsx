import { User } from 'firebase/auth';
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  ExternalLink,
  MessageSquarePlus,
  Send,
  Video,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  isValidHttpsZoomUrl,
  MathsDoubtRecord,
  submitMathsDoubt,
  ZoomSessionRecord,
} from '../services/mathsPortalDb';
import { GoogleSignInButton } from './GoogleSignInButton';
import { WorkspaceTab } from './TopBar';

interface HomePageProps {
  user: User | null;
  isAdmin: boolean;
  isSigningIn: boolean;
  calendarToken: string | null;
  doubts: MathsDoubtRecord[];
  zoomSessions: ZoomSessionRecord[];
  onSignIn: () => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onSaveSessionToCalendar: (session: ZoomSessionRecord) => Promise<void>;
}

const WORKFLOW_STEPS = [
  {
    id: 'ask',
    tabLabel: '01. Ask',
    title: 'Post any maths doubt—no topic needed',
    body: 'Stuck on an equation, geometry proof, graph, or past paper question? Write your doubt directly without picking categories or rigid topics.',
    ctaLabel: 'Open Doubt Queue',
    targetTab: 'doubts' as WorkspaceTab,
  },
  {
    id: 'batch',
    tabLabel: '02. Queue',
    title: 'Doubts gather into a shared batch',
    body: 'Instead of fragmented text replies on the website, your questions stay queued so the tutor can prepare clear step-by-step live explanations for the whole group.',
    ctaLabel: 'Check My Doubts',
    targetTab: 'doubts' as WorkspaceTab,
  },
  {
    id: 'zoom',
    tabLabel: '03. Zoom',
    title: 'Discuss together in live group Zoom sessions',
    body: 'Your tutor schedules a free Zoom session anytime and broadcasts the link to all signed-in students so everyone learns from each worked solution live.',
    ctaLabel: 'View Zoom Sessions',
    targetTab: 'zoom' as WorkspaceTab,
  },
  {
    id: 'sync',
    tabLabel: '04. Calendar',
    title: 'Save upcoming sessions to Google Calendar',
    body: 'Add any scheduled group Zoom session straight to your Google Calendar with one click so you never miss a live walkthrough.',
    ctaLabel: 'Open Calendar Sync',
    targetTab: 'calendar' as WorkspaceTab,
  },
] as const;

function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HomePage({
  user,
  isAdmin,
  isSigningIn,
  calendarToken,
  doubts,
  zoomSessions,
  onSignIn,
  onNavigateTab,
  onSaveSessionToCalendar,
}: HomePageProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickQuestion, setQuickQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [savingCalId, setSavingCalId] = useState<string | null>(null);

  const openDoubtsCount = useMemo(
    () => doubts.filter((d) => d.status === 'open').length,
    [doubts]
  );

  const upcomingSessions = useMemo(
    () =>
      zoomSessions.filter(
        (s) => s.status === 'scheduled' || s.status === 'live'
      ),
    [zoomSessions]
  );

  const activeStep = WORKFLOW_STEPS[activeStepIndex];

  const handleQuickSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitMathsDoubt(user, {
        title: quickTitle,
        question: quickQuestion,
      });
      setQuickTitle('');
      setQuickQuestion('');
      setFeedback({
        tone: 'ok',
        text: 'Doubt added to the Zoom queue. It will be covered live in an upcoming group Zoom session.',
      });
    } catch (err) {
      setFeedback({
        tone: 'err',
        text:
          err instanceof Error ? err.message : 'Unable to submit your doubt.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="h-[calc(100vh-4rem)] w-full overflow-y-auto bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 sm:py-12">
        {/* ================= HERO + INTERACTIVE QUICK DOUBT BOX ================= */}
        <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-7">
            <p className="text-xs font-semibold tracking-wide text-blue-700">
              Free &amp; Open-Source O/L Mathematics Student Portal
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.08]">
              Ask Any O/L Maths Doubt. Solve Together Live on Zoom.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
              Submit any maths question without topic restrictions. Your tutor
              collects student doubts together and schedules free live group
              Zoom sessions for all signed-in students.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('doubts')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                <MessageSquarePlus className="h-4 w-4" />
                <span>{isAdmin ? 'View Doubt Queue' : 'Ask a Doubt'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('zoom')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <Video className="h-4 w-4 text-blue-700" />
                <span>Zoom Sessions</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('admin')}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
                >
                  <span>Tutor Desk</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 tabular-nums">
              {user ? (
                <>
                  <span>
                    {openDoubtsCount} doubt{openDoubtsCount === 1 ? '' : 's'}{' '}
                    queued
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {upcomingSessions.length} upcoming group Zoom session
                    {upcomingSessions.length === 1 ? '' : 's'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Open to all signed-in students</span>
                </>
              ) : (
                <>
                  <span>No topic restrictions</span>
                  <span aria-hidden="true">·</span>
                  <span>Live bulk Zoom walkthroughs</span>
                  <span aria-hidden="true">·</span>
                  <span>100% free for O/L students</span>
                </>
              )}
            </div>
          </div>

          {/* Interactive Quick Doubt Card */}
          <div className="lg:col-span-5">
            <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    Quick Doubt Submission
                  </h2>
                  <span className="text-xs text-slate-500">
                    No topic needed
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Questions are answered live during group Zoom sessions rather
                  than text replies here.
                </p>

                {feedback && (
                  <div
                    role="status"
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      feedback.tone === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    <div>{feedback.text}</div>
                    {feedback.tone === 'ok' && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('doubts')}
                        className="mt-1 font-semibold underline"
                      >
                        View my queued doubts
                      </button>
                    )}
                  </div>
                )}

                {user ? (
                  <form onSubmit={handleQuickSubmit} className="mt-4 space-y-3">
                    <div>
                      <label
                        htmlFor="home-doubt-title"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Question Summary
                      </label>
                      <input
                        id="home-doubt-title"
                        type="text"
                        required
                        minLength={3}
                        maxLength={140}
                        value={quickTitle}
                        onChange={(e) => setQuickTitle(e.target.value)}
                        placeholder="e.g. 2023 Past Paper Q7 or quadratic equation"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="home-doubt-question"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Your Doubt
                      </label>
                      <textarea
                        id="home-doubt-question"
                        required
                        minLength={5}
                        maxLength={2500}
                        rows={4}
                        value={quickQuestion}
                        onChange={(e) => setQuickQuestion(e.target.value)}
                        placeholder="Write your question or paste the steps where you got stuck..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>
                          {submitting ? 'Submitting...' : 'Send Doubt'}
                        </span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Sign in with Google to ask doubts
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      Signed-in students can post any maths question and join
                      every scheduled group Zoom session automatically.
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
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================= INTERACTIVE WORKFLOW & LIVE ZOOM SCHEDULE ================= */}
        <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Interactive Step Switcher */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                How Live Doubt Clearing Works
              </h2>

              <div
                role="tablist"
                aria-label="How OpenMaths OL works"
                className="mt-4 flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
              >
                {WORKFLOW_STEPS.map((step, idx) => {
                  const active = idx === activeStepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveStepIndex(idx)}
                      className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {step.tabLabel}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <h3 className="text-base font-semibold text-slate-900">
                  {activeStep.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {activeStep.body}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => onNavigateTab(activeStep.targetTab)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                <span>{activeStep.ctaLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Upcoming Group Zoom Sessions Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  Upcoming Group Zoom Sessions
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateTab('zoom')}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  View all
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                All signed-in students can join scheduled sessions to cover
                queued doubts together.
              </p>

              {!user ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  Sign in with Google above to view upcoming group Zoom links,
                  meeting IDs, and add sessions to your Google Calendar.
                </div>
              ) : upcomingSessions.length === 0 ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-medium text-slate-800">
                    No upcoming Zoom sessions scheduled yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isAdmin
                      ? 'Open the Tutor Desk anytime to publish a group Zoom link for all signed-in students.'
                      : 'Submit your doubts now so they are included when your tutor schedules the next live session.'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('admin')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      <Video className="h-3.5 w-3.5" />
                      <span>Schedule Group Zoom</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {upcomingSessions.slice(0, 2).map((session) => {
                    const safeUrl = isValidHttpsZoomUrl(session.zoomLink);
                    return (
                      <div key={session.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
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
                              {typeof session.doubtCount === 'number' &&
                                session.doubtCount > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {session.doubtCount} doubt
                                      {session.doubtCount === 1 ? '' : 's'}{' '}
                                      queued
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
                          <p className="text-xs text-slate-600">
                            {session.notes}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {calendarToken && (
                            <button
                              type="button"
                              disabled={savingCalId === session.id}
                              onClick={async () => {
                                setSavingCalId(session.id);
                                try {
                                  await onSaveSessionToCalendar(session);
                                } finally {
                                  setSavingCalId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              <span>
                                {savingCalId === session.id
                                  ? 'Saving...'
                                  : 'Add to Calendar'}
                              </span>
                            </button>
                          )}

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
          </div>
        </section>

        {/* Quiet Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <span>
            OpenMaths OL · Free &amp; Open-Source O/L Maths Doubt Clearing
          </span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => onNavigateTab('doubts')}
              className="font-medium text-slate-700 hover:text-blue-700"
            >
              Ask Doubt
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('zoom')}
              className="font-medium text-slate-700 hover:text-blue-700"
            >
              Zoom Sessions
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('calendar')}
              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-blue-700"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Google Calendar</span>
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
