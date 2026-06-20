import { ArrowsClockwise, Plus, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
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

  const loadSessions = useCallback(async (autoSelectNewest = false) => {
    setLoading(true);
    try {
      const list = await sendMessage<Session[]>('LIST_SESSIONS');
      setSessions(list);
      // When opened fresh (e.g. right after a capture stops), jump straight
      // into the newest session so the user can label it immediately.
      if (autoSelectNewest && list.length > 0) {
        setSelectedSessionId((cur) => cur ?? list[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions(true);
  }, [loadSessions]);

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

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="wordmark text-lg">
          drafted<span className="dot">.</span>
        </div>
        <button
          type="button"
          onClick={() => loadSessions()}
          className="p-2 rounded-btn hover:bg-bg-card transition-colors"
          title="Refresh sessions"
        >
          <ArrowsClockwise size={18} className="text-text-muted" weight="regular" />
        </button>
      </header>

      {liveSession && liveSession.state === 'capturing' && (
        <div className="px-4 py-2 bg-green/10 border-b border-green/20 text-sm text-green flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green pulse-dot" />
          Capturing in progress. Stop from the popup to review.
        </div>
      )}

      {!selectedSessionId && (
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-text-muted text-center py-8">Loading sessions...</div>}
          {!loading && sessions.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <div className="text-text-muted">No sessions recorded yet.</div>
              <div className="flex items-center justify-center gap-2 text-sm text-text-faint">
                <Plus size={16} weight="regular" />
                Start capturing from the popup to create a session
              </div>
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-text-muted">{sessions.length} sessions</div>
                <button
                  type="button"
                  onClick={handleClearAllSessions}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs bg-coral/20 text-coral rounded-btn hover:bg-coral/30 transition-colors"
                >
                  <Trash size={14} weight="regular" />
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="card p-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleSessionSelect(s.id)}
                      className="flex-1 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="font-medium text-text">
                        {new Date(s.started_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-text-muted mt-1">
                        {s.outcome.total_steps} steps · {s.segments.length} segments
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id)}
                      className="p-2 rounded-btn hover:bg-coral/20 text-text-muted hover:text-coral transition-colors flex-shrink-0"
                      title="Delete session"
                    >
                      <Trash size={16} weight="regular" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {selectedSessionId && selectedSession && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <SubmitBar session={selectedSession} onSessionUpdate={handleSessionUpdate} />
          <div className="flex border-b border-white/[0.06]">
            {(['timeline', 'replay', 'segments', 'export'] as Tab[]).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? 'text-green border-b-2 border-green'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'timeline' && (
              <div className="h-full flex flex-col">
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
