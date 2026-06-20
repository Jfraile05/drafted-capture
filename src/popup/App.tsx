import {
  ArrowsClockwise,
  ClockCounterClockwise,
  Gear,
  Pause,
  Play,
  SignOut,
  Stop,
  User,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import { signOutUser, useAuth } from '../shared/auth';
import { sendMessage, useLiveSession, useSettings } from '../shared/hooks';
import { submitLatestUnsubmitted } from '../shared/submitManager';
import type { CaptureState, CaptureStats, StepSummary } from '../shared/types';
import { actionLabel, fmtDuration, hostOf } from '../shared/utils/format';
import Login from './Login';
import Onboarding from './Onboarding';

export default function App() {
  const liveSession = useLiveSession();
  const [settings] = useSettings();
  const { user, loading: authLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [intent, setIntent] = useState('');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const prevStateRef = useRef<CaptureState | null>(null);

  useEffect(() => {
    const prevState = prevStateRef.current;
    const currentState = liveSession?.state ?? null;
    prevStateRef.current = currentState;

    if ((prevState === 'capturing' || prevState === 'paused') && currentState === null) {
      setShowSavedToast(true);
      // Auto-submit the just-archived session to Drafted (no-op if signed out).
      submitLatestUnsubmitted().catch(() => {});
      const timer = setTimeout(() => setShowSavedToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [liveSession?.state]);

  if (!settings.onboarding_complete) {
    return <Onboarding />;
  }

  if (showLogin) {
    return (
      <Login
        onSuccess={() => {
          setShowLogin(false);
        }}
      />
    );
  }

  const state = liveSession?.state ?? 'idle';
  const isCapturing = state === 'capturing';
  const isPaused = state === 'paused';
  const isIdle = state === 'idle';

  const handleToggleCapture = async () => {
    await sendMessage('TOGGLE_CAPTURE', { intent: intent.trim() || undefined });
    setIntent('');
  };

  const handlePause = async () => {
    await sendMessage('PAUSE_CAPTURE');
  };

  const handleResume = async () => {
    await sendMessage('RESUME_CAPTURE');
  };

  const handleStop = async () => {
    await sendMessage('STOP_CAPTURE');
  };

  const handleOpenPanel = async () => {
    try {
      const window = await chrome.windows.getCurrent();
      if (window.id !== undefined) {
        await chrome.sidePanel.open({ windowId: window.id });
      }
    } catch (err) {
      console.error('Failed to open side panel:', err);
    }
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return (
    <div className="p-5 space-y-5 atmosphere min-h-[340px]">
      <header className="flex items-center justify-between">
        <div className="wordmark text-xl">
          drafted<span className="dot">.</span>
        </div>
        <div className="flex items-center gap-2">
          {!authLoading &&
            (user ? (
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-bg-card border border-border">
                <User size={16} weight="fill" className="text-green" />
                <span className="text-text-muted text-xs max-w-[120px] truncate">{user.email}</span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-text-muted hover:text-text transition-colors"
                  title="Sign out"
                >
                  <SignOut size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className="text-text-muted hover:text-green text-xs transition-colors"
              >
                sign in
              </button>
            ))}
          <button
            type="button"
            onClick={handleOpenPanel}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text transition-colors"
            title="Open timeline panel"
          >
            <ClockCounterClockwise size={20} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={handleOpenOptions}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text transition-colors"
            title="Settings"
          >
            <Gear size={20} weight="duotone" />
          </button>
        </div>
      </header>

      {isIdle && (
        <div className="flex flex-col items-center justify-center py-6 space-y-5">
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="what are you about to do? (optional)"
            rows={2}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text text-sm placeholder:text-text-faint resize-none focus:border-border-active focus:outline-none transition-colors"
          />
          <button
            type="button"
            onClick={handleToggleCapture}
            className="relative w-24 h-24 rounded-full bg-gradient-to-br from-bg-card to-bg-card-hover border border-border hover:border-green hover:shadow-green-glow transition-all duration-300 flex items-center justify-center group"
          >
            <div className="w-12 h-12 rounded-full bg-green flex items-center justify-center">
              <Play className="text-bg" size={24} weight="fill" />
            </div>
          </button>
          <div className="text-center space-y-1">
            <p className="text-text font-semibold">start capturing</p>
            <p className="text-text-muted text-xs max-w-[280px]">
              everything you do becomes training data. stop anytime.
            </p>
          </div>
        </div>
      )}

      {(isCapturing || isPaused) && liveSession && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isCapturing && (
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-green pulse-dot" />
                  <div className="absolute inset-0 rounded-full ring" />
                </div>
              )}
              {isPaused && <div className="w-3 h-3 rounded-full bg-orange" />}
              <span className="text-text font-semibold">
                {isCapturing ? 'capturing' : 'paused'}
              </span>
            </div>
            <LiveTimer startedAt={liveSession.started_at} isPaused={isPaused} />
          </div>

          <StatsGrid stats={liveSession.stats} stepCount={liveSession.step_count} />

          <div className="flex gap-2">
            {isCapturing && (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className="flex-1 py-2 px-3 rounded-lg border border-border text-text text-sm font-medium hover:bg-bg-card transition-colors flex items-center justify-center gap-2"
                >
                  <Pause size={16} weight="fill" />
                  pause
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex-1 py-2 px-3 rounded-lg bg-coral text-text text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Stop size={16} weight="fill" />
                  stop
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  type="button"
                  onClick={handleResume}
                  className="flex-1 py-2 px-3 rounded-lg bg-green text-bg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <ArrowsClockwise size={16} weight="bold" />
                  resume
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex-1 py-2 px-3 rounded-lg border border-border text-text text-sm font-medium hover:bg-bg-card transition-colors flex items-center justify-center gap-2"
                >
                  <Stop size={16} weight="fill" />
                  stop
                </button>
              </>
            )}
          </div>

          {liveSession.recent.length > 0 && (
            <div className="space-y-2">
              <p className="text-text-muted text-xs font-medium uppercase tracking-wider">
                recent activity
              </p>
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {liveSession.recent
                  .slice()
                  .reverse()
                  .map((step, idx) => (
                    <StepRow key={`${step.index}-${step.timestamp}`} step={step} delay={idx * 50} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showSavedToast && (
        <div className="card p-4 space-y-3 rise">
          <p className="text-text text-sm">session saved. open the panel to review and label.</p>
          <button
            type="button"
            onClick={handleOpenPanel}
            className="w-full py-2 bg-green text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            open panel
          </button>
        </div>
      )}

      {isIdle && (
        <p className="text-text-faint text-xs text-center">
          captures across all tabs · ctrl/cmd+shift+y toggles
        </p>
      )}
    </div>
  );
}

function LiveTimer({ startedAt, isPaused }: { startedAt: number; isPaused: boolean }) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isPaused]);

  return <div className="text-text-muted text-sm font-mono">{fmtDuration(elapsed)}</div>;
}

function StatsGrid({ stats, stepCount }: { stats: CaptureStats; stepCount: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatChip label="steps" value={stepCount} />
      <StatChip label="clicks" value={stats.clicks} />
      <StatChip label="keys" value={stats.keystrokes} />
      <StatChip label="scrolls" value={stats.scrolls} />
      <StatChip label="nav" value={stats.navigations} />
      <StatChip label="shots" value={stats.screenshots} />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-bg-card border border-border text-center">
      <div className="text-text font-semibold text-base">{value}</div>
      <div className="text-text-muted text-xs">{label}</div>
    </div>
  );
}

function StepRow({ step, delay }: { step: StepSummary; delay: number }) {
  const IconComponent = ACTION_ICON_COMPONENT[step.type];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border rise"
      style={{ animationDelay: `${delay}ms` }}
    >
      {IconComponent && (
        <IconComponent size={16} weight="duotone" className="text-green flex-shrink-0" />
      )}
      <span className="text-text text-sm flex-1 truncate">{step.label}</span>
      <span className="text-text-muted text-xs flex-shrink-0">{hostOf(step.url)}</span>
    </div>
  );
}
