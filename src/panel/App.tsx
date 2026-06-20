import { ArrowsClockwise } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { sendMessage, useLiveSession } from '../shared/hooks';
import type { Session } from '../shared/types';
import { Export } from './Export';
import { Inspector } from './Inspector';
import { Replay } from './Replay';
import { Segments } from './Segments';
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
            <div className="text-text-muted text-center py-8">
              No sessions recorded yet. Start capturing from the popup.
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => handleSessionSelect(s.id)}
                  className="w-full card p-4 hover:bg-bg-card-hover transition-colors text-left"
                >
                  <div className="font-medium text-text">
                    {new Date(s.started_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-text-muted mt-1">
                    {s.outcome.total_steps} steps · {s.segments.length} segments
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSessionId && selectedSession && (
        <div className="flex-1 flex flex-col overflow-hidden">
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
