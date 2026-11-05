import { ArrowLeft, ArrowsClockwise, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Brand from '../shared/Brand';
import { sendMessage, useLiveSession } from '../shared/hooks';
import type { Session } from '../shared/types';
import { Export } from './Export';
import { Inspector } from './Inspector';
import { Replay } from './Replay';
import { Segments } from './Segments';
import { SubmitBar } from './SubmitBar';
import { Timeline } from './Timeline';

type Tab = 'timeline' | 'replay' | 'segments' | 'export';

export function App() {
  const liveSession = useLiveSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSessions = useCallback(async (autoSelectNewest = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await sendMessage<Session[]>('LIST_SESSIONS');
      // The worker answers { error } instead of throwing when it fails.
      if (!Array.isArray(list)) throw new Error((list as { error?: string })?.error ?? 'No answer');
      setSessions(list);
      // When opened fresh (e.g. right after a capture stops), jump straight
      // into the newest session so the user can label it immediately.
      if (autoSelectNewest && list.length > 0) {
        setSelectedSessionId((cur) => cur ?? list[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setLoadError(String(err).replace(/^Error:\s*/, ''));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions(true);
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
    if (selectedSessionId) {
      sendMessage<Session | undefined>('GET_SESSION', { id: selectedSessionId })
        .then((s) => setSelectedSession(s ?? null))
        .catch(() => setSelectedSession(null));
    } else {
      setSelectedSession(null);
    }
  }, [selectedSessionId]);

  const handleSessionSelect = (id: string) => {
    setSelectedSessionId(id);
    setSelectedStepIndex(null);
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
    setSelectedSession(updatedSession);
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
    export: 'Export',
  };

  const closeSession = () => {
    setSelectedSessionId(null);
    setSelectedStepIndex(null);
    handleClearRange();
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3">
        <Brand size="text-lg" className="pl-1" />
        {!selectedSession && (
          <button
            type="button"
            onClick={() => loadSessions()}
            className="icon-btn"
            aria-label="Refresh sessions"
            title="Refresh"
          >
            <ArrowsClockwise size={18} />
          </button>
        )}
      </header>

      {selectedSession && (
        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 py-1.5">
          <button
            type="button"
            onClick={closeSession}
            className="icon-btn"
            aria-label="Back to all sessions"
            title="All sessions"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="min-w-0 truncate text-sm font-semibold text-text">
            {fmtSessionDate(selectedSession.started_at)}
          </h1>
          <span className="shrink-0 text-xs text-text-muted">
            {selectedSession.outcome.total_steps} steps
          </span>
        </div>
      )}

      {liveSession && liveSession.state === 'capturing' && (
        <p className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-text-muted">
          <span className="h-2 w-2 rounded-full bg-[#FF239B] pulse-dot" />
          Recording. Stop from the popup to review it here.
        </p>
      )}

      {!selectedSessionId && (
        <div className="flex-1 overflow-y-auto">
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
                Start capturing from the popup. Finished sessions show up here.
              </p>
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <>
              <ul>
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="group flex items-center gap-2 border-b border-white/[0.06] pr-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleSessionSelect(s.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text">
                          {fmtSessionDate(s.started_at)}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {s.outcome.total_steps} steps
                          {s.segments.length > 0
                            ? `, ${s.segments.length} ${s.segments.length === 1 ? 'task' : 'tasks'}`
                            : ''}
                        </span>
                      </span>
                      {s.submission?.drafted_task_id && (
                        <span className="shrink-0 text-xs text-text-muted">Submitted</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id)}
                      className="icon-btn text-text-faint hover:text-coral"
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <Trash size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={handleClearAllSessions}
                  className="text-xs text-text-faint hover:text-coral"
                >
                  Delete all sessions
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {selectedSessionId && selectedSession && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <SubmitBar session={selectedSession} onSessionUpdate={handleSessionUpdate} />
          <nav
            className="flex shrink-0 gap-1 border-b border-white/[0.06] px-2"
            aria-label="Session views"
          >
            {(['timeline', 'replay', 'segments', 'export'] as Tab[]).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-text text-text'
                    : 'border-transparent text-text-muted hover:text-text'
                }`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'timeline' && (
              <div className="flex h-full flex-col">
                <Timeline
                  session={selectedSession}
                  selectedIndex={selectedStepIndex}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  onStepSelect={handleStepSelect}
                  onShiftStepSelect={handleShiftStepSelect}
                  onLabelRange={handleLabelRange}
                />
                {selectedStepIndex !== null && (
                  <Inspector
                    session={selectedSession}
                    stepIndex={selectedStepIndex}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onSetRangeEnd={handleSetRangeEnd}
                    onClearRange={handleClearRange}
                    onSessionUpdate={handleSessionUpdate}
                  />
                )}
              </div>
            )}
            {activeTab === 'replay' && <Replay session={selectedSession} />}
            {activeTab === 'segments' && (
              <Segments
                session={selectedSession}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onSessionUpdate={handleSessionUpdate}
                onClearRange={handleClearRange}
              />
            )}
            {activeTab === 'export' && (
              <Export
                session={selectedSession}
                onDelete={() => {
                  setSelectedSessionId(null);
                  loadSessions();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
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
