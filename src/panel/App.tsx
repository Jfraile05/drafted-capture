import {
  ArrowLeft,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  Palette,
  TagSimple,
  Trash,
} from '@phosphor-icons/react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import Brand from '../shared/Brand';
import SetupPicker from '../shared/SetupPicker';
import { SessionSyncStatus } from '../shared/SyncStatus';
import ThemeToggle from '../shared/ThemeToggle';
import { sendMessage, useLiveSession } from '../shared/hooks';
import type { QualityReview } from '../shared/quality';
import { ARCHIVED_SESSION_CHANGE } from '../shared/storage/sessionUpdates';
import type { Session } from '../shared/types';
import { workflowTitle } from '../shared/utils/format';
import { Inspector } from './Inspector';
import { QualityCard } from './QualityCard';
import { Replay } from './Replay';
import { Segments } from './Segments';
import { Timeline } from './Timeline';

type Tab = 'timeline' | 'replay' | 'segments';
const TABS: Tab[] = ['timeline', 'replay', 'segments'];

export function App() {
  const liveSession = useLiveSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  // The step just viewed, so the list returns to it after closing the details.
  const [lastViewedStep, setLastViewedStep] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [showSetups, setShowSetups] = useState(false);
  // Which way the tab content slides in: right for a tab further along, left
  // for one before it. Only updated when the tab changes.
  const tabMotion = useRef({ tab: activeTab, dir: 1 });
  if (tabMotion.current.tab !== activeTab) {
    tabMotion.current = {
      tab: activeTab,
      dir: TABS.indexOf(activeTab) < TABS.indexOf(tabMotion.current.tab) ? -1 : 1,
    };
  }
  const [review, setReview] = useState<QualityReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const loadSessions = useCallback(async (autoSelectNewest = false, quiet = false) => {
    const sequence = ++loadSequence.current;
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const list = await sendMessage<Session[]>('LIST_SESSIONS');
      // The worker answers { error } instead of throwing when it fails.
      if (!Array.isArray(list)) throw new Error((list as { error?: string })?.error ?? 'No answer');
      if (sequence !== loadSequence.current) return;
      setSessions(list);
      setSelectedSession((current) =>
        current ? (list.find((session) => session.id === current.id) ?? null) : current,
      );
      setLoadError(null);
      // When opened fresh (e.g. right after a capture stops), jump straight
      // into the newest session so the user can label it immediately.
      if (autoSelectNewest && list.length > 0) {
        setSelectedSessionId((cur) => cur ?? list[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      if (sequence === loadSequence.current && !quiet) {
        setLoadError(String(err).replace(/^Error:\s*/, ''));
      }
    }
    if (sequence === loadSequence.current) setLoading(false);
  }, []);

  useEffect(() => {
    const onArchiveChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'session' && changes[ARCHIVED_SESSION_CHANGE]) void loadSessions(false, true);
    };
    const onFocus = () => void loadSessions(false, true);
    chrome.storage.onChanged.addListener(onArchiveChange);
    window.addEventListener('focus', onFocus);
    loadSessions(true);
    return () => {
      chrome.storage.onChanged.removeListener(onArchiveChange);
      window.removeEventListener('focus', onFocus);
      loadSequence.current++;
    };
  }, [loadSessions]);

  // The panel can stay open while a capture runs. Reload the list when the
  // capture ends so the new session shows up without a manual refresh.
  const wasActive = useRef(false);
  const isActive = liveSession !== null && liveSession.state !== 'idle';
  useEffect(() => {
    if (wasActive.current && !isActive) loadSessions(true);
    wasActive.current = isActive;
  }, [isActive, loadSessions]);

  useEffect(() => {
    let cancelled = false;
    if (selectedSessionId) {
      sendMessage<Session | undefined>('GET_SESSION', { id: selectedSessionId })
        .then((s) => {
          if (!cancelled) setSelectedSession(s ?? null);
        })
        .catch(() => {
          if (!cancelled) setSelectedSession(null);
        });
    } else {
      setSelectedSession(null);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const taskId = selectedSession?.submission?.drafted_task_id;
  useEffect(() => {
    let cancelled = false;
    setReview(null);
    if (taskId) {
      sendMessage<QualityReview | null>('GET_SESSION_QUALITY', { taskId })
        .then((result) => {
          if (!cancelled) setReview(result);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const handleSessionSelect = (id: string) => {
    setSelectedSessionId(id);
    setSelectedStepIndex(null);
    setLastViewedStep(null);
    setRangeStart(null);
    setRangeEnd(null);
    setActiveTab('timeline');
  };

  const handleStepSelect = (index: number) => {
    setSelectedStepIndex(index);
    if (rangeStart === null) {
      setRangeStart(index);
      setRangeEnd(null);
    }
  };

  const handleShiftStepSelect = (index: number) => {
    if (rangeStart !== null) {
      setRangeEnd(index);
    }
  };

  const handleSetRangeEnd = () => {
    if (selectedStepIndex !== null && rangeStart !== null) {
      setRangeEnd(selectedStepIndex);
    }
  };

  const handleClearRange = () => {
    setRangeStart(null);
    setRangeEnd(null);
  };

  const handleSessionUpdate = (updatedSession: Session) => {
    setSelectedSession((current) => (current?.id === updatedSession.id ? updatedSession : current));
    setSessions((prev) => prev.map((s) => (s.id === updatedSession.id ? updatedSession : s)));
  };

  const handleClearAllSessions = async () => {
    if (!confirm('Delete all sessions? This cannot be undone.')) return;
    setLoading(true);
    try {
      for (const s of sessions) {
        await sendMessage('DELETE_SESSION', { id: s.id });
      }
      setSessions([]);
      setSelectedSessionId(null);
      setSelectedSession(null);
    } catch (err) {
      console.error('Failed to clear sessions:', err);
    }
    setLoading(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await sendMessage('DELETE_SESSION', { id: sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setSelectedSession(null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleLabelRange = () => {
    setActiveTab('segments');
  };

  const tabLabels: Record<Tab, string> = {
    timeline: 'Steps',
    replay: 'Replay',
    segments: 'Tasks',
  };

  const closeSession = () => {
    setSelectedSessionId(null);
    setSelectedStepIndex(null);
    handleClearRange();
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <header className="flex h-[76px] shrink-0 items-center justify-between gap-2 border-b border-ink/[0.07] px-4">
        <Brand size="text-[24px]" />
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setShowSetups((open) => !open)}
            className="icon-btn"
            data-motion="tilt"
            aria-label="Choose your setup"
            aria-expanded={showSetups}
            title="Choose your setup"
          >
            <Palette size={18} />
          </button>
          {!selectedSession && (
            <button
              type="button"
              onClick={() => loadSessions()}
              className="icon-btn"
              data-motion="spin"
              aria-label="Refresh sessions"
              title="Refresh"
            >
              <ArrowsClockwise size={18} />
            </button>
          )}
        </div>
      </header>

      {showSetups && (
        <div
          className="view-in absolute inset-x-0 bottom-0 top-[76px] z-20 overflow-y-auto px-4 py-4"
          style={{ background: 'var(--atmosphere)' }}
        >
          <div className="mx-auto max-w-[420px]">
            <SetupPicker onClose={() => setShowSetups(false)} />
          </div>
        </div>
      )}

      {selectedSession && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-ink/[0.07] px-2.5 py-2">
          <button
            type="button"
            onClick={closeSession}
            className="icon-btn"
            data-motion="back"
            aria-label="Back to all sessions"
            title="All sessions"
          >
            <ArrowLeft size={18} />
          </button>
          <h1
            className="min-w-0 flex-1 truncate text-sm font-semibold text-text"
            title={`${workflowTitle(selectedSession)} (${fmtSessionDate(selectedSession.started_at)})`}
          >
            {workflowTitle(selectedSession)}
          </h1>
          <span className="shrink-0 rounded-pill bg-ink/[0.06] px-2.5 py-1 text-xs text-text-muted">
            {selectedSession.outcome.total_steps} steps
          </span>
        </div>
      )}

      {liveSession && liveSession.state === 'capturing' && (
        <p className="view-in mx-3 mt-3 flex shrink-0 items-center gap-2 rounded-[14px] bg-green/10 px-3.5 py-2.5 text-xs text-green-ink">
          <span className="h-2 w-2 shrink-0 rounded-full bg-green pulse-dot" />
          Recording. Stop from the popup to review it here.
        </p>
      )}

      {!selectedSessionId && (
        <div className="view-in flex-1 overflow-y-auto">
          {loading && <p className="py-10 text-center text-sm text-text-muted">Loading sessions</p>}
          {!loading && loadError && (
            <div className="space-y-3 px-4 py-10 text-center">
              <p className="text-sm text-text">Couldn't load your sessions.</p>
              <p className="text-xs text-text-faint">{loadError}</p>
              <button type="button" onClick={() => loadSessions()} className="btn-ghost">
                Try again
              </button>
            </div>
          )}
          {!loading && !loadError && sessions.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-text">No sessions yet</p>
              <p className="mt-1 text-sm text-text-muted">
                Start a recording from the popup. Sessions appear here when you stop.
              </p>
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <>
              <h1 className="px-4 pb-2.5 pt-4 text-xs font-semibold text-text-muted">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </h1>
              <ul className="stagger space-y-2 px-3">
                {sessions.map((s) => (
                  <li key={s.id} className="surface lift group flex items-center gap-1 pr-1.5">
                    <button
                      type="button"
                      onClick={() => handleSessionSelect(s.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l-[16px] px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.03]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">
                          {workflowTitle(s)}
                        </span>
                        <span className="mt-0.5 block text-xs text-text-muted">
                          {fmtSessionDate(s.started_at)}, {s.outcome.total_steps} steps
                          {s.segments.length > 0
                            ? `, ${s.segments.length} ${s.segments.length === 1 ? 'task' : 'tasks'}`
                            : ''}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-xs ${s.submission?.drafted_task_id ? 'text-green' : 'text-text-muted'}`}
                      >
                        <SessionSyncStatus session={s} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id)}
                      className="icon-btn text-text-faint hover:text-coral"
                      data-motion="tilt"
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <Trash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 pb-5 pt-4">
                <button
                  type="button"
                  onClick={handleClearAllSessions}
                  className="text-xs text-text-faint transition-colors hover:text-coral"
                >
                  Delete all sessions
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {selectedSessionId && selectedSession && (
        <div className="view-in flex flex-1 flex-col overflow-hidden" style={slideFrom(1)}>
          <div className="shrink-0 px-4 pb-1 pt-3">
            <SessionSyncStatus session={selectedSession} />
          </div>
          {review ? (
            <QualityCard review={review} />
          ) : (
            taskId && (
              <p className="surface-pressed mx-3 my-2 shrink-0 px-3.5 py-2.5 text-xs leading-relaxed text-text-muted">
                Quality review in progress. It shows up here a few minutes after upload.
              </p>
            )
          )}
          <nav
            className="segmented mx-3 mb-2 mt-1 shrink-0"
            aria-label="Session views"
            style={{ '--tabs': TABS.length, '--tab': TABS.indexOf(activeTab) } as CSSProperties}
          >
            <span className="segmented-thumb" aria-hidden="true" />
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                className="segmented-btn"
              >
                {tabLabels[tab]}
              </button>
            ))}
          </nav>

          <div
            key={activeTab}
            className="view-in flex-1 overflow-hidden"
            style={slideFrom(tabMotion.current.dir)}
          >
            {activeTab === 'timeline' && (
              <div
                key={selectedStepIndex === null ? 'steps' : 'step'}
                className="view-in flex h-full flex-col"
                style={slideFrom(selectedStepIndex === null ? -1 : 1)}
              >
                {selectedStepIndex === null ? (
                  <Timeline
                    session={selectedSession}
                    selectedIndex={lastViewedStep}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onStepSelect={handleStepSelect}
                    onShiftStepSelect={handleShiftStepSelect}
                    onLabelRange={handleLabelRange}
                    stepNotes={review?.step_notes}
                  />
                ) : (
                  // One step at a time, full height, so the list and the
                  // screenshot never squeeze each other.
                  <>
                    <div className="flex shrink-0 items-center gap-1 border-y border-ink/[0.07] px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setLastViewedStep(selectedStepIndex);
                          setSelectedStepIndex(null);
                        }}
                        className="icon-btn"
                        data-motion="back"
                        aria-label="Back to all steps"
                        title="All steps"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <span className="flex-1 text-sm font-medium tabular-nums text-text">
                        Step {selectedStepIndex + 1} of {selectedSession.steps.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedStepIndex(selectedStepIndex - 1)}
                        disabled={selectedStepIndex === 0}
                        className="icon-btn disabled:cursor-not-allowed disabled:opacity-30"
                        data-motion="prev"
                        aria-label="Previous step"
                      >
                        <CaretLeft size={18} weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStepIndex(selectedStepIndex + 1)}
                        disabled={selectedStepIndex >= selectedSession.steps.length - 1}
                        className="icon-btn disabled:cursor-not-allowed disabled:opacity-30"
                        data-motion="next"
                        aria-label="Next step"
                      >
                        <CaretRight size={18} weight="bold" />
                      </button>
                    </div>
                    {rangeStart !== null && rangeEnd !== null && (
                      <div className="shrink-0 px-3 pt-3">
                        <button
                          type="button"
                          onClick={handleLabelRange}
                          className="btn-ghost w-full"
                        >
                          <TagSimple size={16} />
                          Name these {Math.abs(rangeEnd - rangeStart) + 1} steps as a task
                        </button>
                      </div>
                    )}
                    <Inspector
                      key={selectedStepIndex}
                      session={selectedSession}
                      stepIndex={selectedStepIndex}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      onSetRangeEnd={handleSetRangeEnd}
                      onClearRange={handleClearRange}
                      onSessionUpdate={handleSessionUpdate}
                    />
                  </>
                )}
              </div>
            )}
            {activeTab === 'replay' && <Replay session={selectedSession} />}
            {activeTab === 'segments' && (
              <Segments
                key={selectedSession.id}
                session={selectedSession}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onSessionUpdate={handleSessionUpdate}
                onClearRange={handleClearRange}
                onRangeChange={(start, end) => {
                  setRangeStart(start);
                  setRangeEnd(end);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Slide direction for .view-in: 1 from the right, -1 from the left. */
function slideFrom(dir: number): CSSProperties {
  return { '--dir': dir } as CSSProperties;
}

/** "Nov 4, 2:14 PM" */
function fmtSessionDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
