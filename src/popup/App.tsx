import { ClockCounterClockwise, Gear, Pause, Play, SignOut, Stop } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import Brand, { setMascotMoment } from '../shared/Brand';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import { signOutUser, useAuth } from '../shared/auth';
import { sendMessage, useLiveSession, useSettings } from '../shared/hooks';
import { submitLatestUnsubmitted } from '../shared/submitManager';
import type { CaptureState, StepSummary } from '../shared/types';
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
  const [uploading, setUploading] = useState(false);
  const prevStateRef = useRef<CaptureState | null>(null);

  useEffect(() => {
    const prevState = prevStateRef.current;
    const currentState = liveSession?.state ?? null;
    prevStateRef.current = currentState;

    if ((prevState === 'capturing' || prevState === 'paused') && currentState === null) {
      // A capture just stopped and archived. Two paths:
      //  - signed in  -> upload now, then open the panel to label/enrich.
      //  - signed out -> keep the data locally, prompt login; upload on login.
      if (user) {
        // Open the panel first (closest to the Stop gesture), then upload.
        openPanel();
        setUploading(true);
        setMascotMoment('capturing', 60000);
        submitLatestUnsubmitted()
          .catch(() => {})
          .finally(() => {
            setUploading(false);
            setMascotMoment('done');
          });
      } else {
        setShowLogin(true);
        setMascotMoment('done');
      }
      setShowSavedToast(true);
      const timer = setTimeout(() => setShowSavedToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [liveSession?.state, user]);

  if (!settings.onboarding_complete) {
    return <Onboarding />;
  }

  if (showLogin) {
    return (
      <Login
        onCancel={() => setShowLogin(false)}
        onSuccess={() => {
          setShowLogin(false);
          // Upload any session captured before signing in, then open to label.
          setUploading(true);
          setMascotMoment('capturing', 60000);
          submitLatestUnsubmitted()
            .catch(() => {})
            .finally(() => {
              setUploading(false);
              setMascotMoment('done');
              openPanel();
            });
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

  async function openPanel() {
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id !== undefined) {
        await chrome.sidePanel.open({ windowId: win.id });
      }
    } catch (err) {
      console.error('Failed to open side panel:', err);
    }
  }
  const handleOpenPanel = openPanel;

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

  const statusTitle = isCapturing
    ? 'Recording'
    : isPaused
      ? 'Paused'
      : uploading
        ? 'Saving your session'
        : showSavedToast
          ? 'Session saved'
          : 'Ready when you are';

  return (
    <div className="flex flex-col px-5 pb-4 pt-4">
      <header className="flex items-center justify-between">
        <Brand size="text-lg" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenPanel}
            className="icon-btn"
            title="Review sessions"
            aria-label="Review sessions"
          >
            <ClockCounterClockwise size={18} />
          </button>
          <button
            type="button"
            onClick={handleOpenOptions}
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
          >
            <Gear size={18} />
          </button>
        </div>
      </header>

      <section className="pt-5">
        <h1 className="text-base font-semibold text-text">{statusTitle}</h1>
        {(isCapturing || isPaused) && liveSession ? (
          <LiveTimer startedAt={liveSession.started_at} isPaused={isPaused} />
        ) : (
          <p className="mt-1 text-sm text-text-muted">
            {showSavedToast
              ? 'Open the review panel to label it.'
              : 'Sidekick learns from your clicks, typing and pages across tabs.'}
          </p>
        )}
      </section>

      {isIdle && (
        <div className="mt-5 space-y-2.5">
          {showSavedToast && (
            <button type="button" onClick={handleOpenPanel} className="btn-primary w-full">
              Review session
            </button>
          )}
          <label htmlFor="intent" className="sr-only">
            What are you about to do?
          </label>
          <textarea
            id="intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="What are you about to do? (optional)"
            rows={2}
            className="field resize-none"
          />
          <button
            type="button"
            onClick={handleToggleCapture}
            className={`${showSavedToast ? 'btn-ghost' : 'btn-primary'} w-full`}
          >
            <Play size={16} weight="fill" />
            Start capturing
          </button>
          <p className="text-center text-xs text-text-faint">Shortcut: Ctrl or Cmd + Shift + Y</p>
        </div>
      )}

      {(isCapturing || isPaused) && liveSession && (
        <div className="mt-5 space-y-5">
          <dl className="grid grid-cols-3 text-center">
            <Stat label="Steps" value={liveSession.step_count} />
            <Stat label="Clicks" value={liveSession.stats.clicks} />
            <Stat label="Keys" value={liveSession.stats.keystrokes} />
          </dl>

          <div className="grid grid-cols-2 gap-2">
            {isCapturing ? (
              <>
                <button type="button" onClick={handlePause} className="btn-ghost">
                  <Pause size={16} weight="fill" />
                  Pause
                </button>
                <button type="button" onClick={handleStop} className="btn-primary">
                  <Stop size={16} weight="fill" />
                  Stop and save
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={handleResume} className="btn-primary">
                  <Play size={16} weight="fill" />
                  Resume
                </button>
                <button type="button" onClick={handleStop} className="btn-ghost">
                  <Stop size={16} weight="fill" />
                  Stop and save
                </button>
              </>
            )}
          </div>

          {liveSession.recent.length > 0 && (
            <div>
              <h2 className="mb-1 text-xs font-medium text-text-muted">Latest steps</h2>
              <ul className="max-h-[132px] overflow-y-auto">
                {liveSession.recent
                  .slice()
                  .reverse()
                  .map((step) => (
                    <StepRow key={`${step.index}-${step.timestamp}`} step={step} />
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!authLoading && (
        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-xs text-text-muted">
          {user ? (
            <>
              <span className="truncate">Signed in as {user.email}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex shrink-0 items-center gap-1 hover:text-text"
              >
                <SignOut size={14} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <span>Sign in to submit your sessions.</span>
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className="shrink-0 font-medium text-text hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </footer>
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

  return <p className="mt-1 text-sm tabular-nums text-text-muted">{fmtDuration(elapsed)}</p>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-xl font-semibold tabular-nums text-text">{value}</dd>
      <dt className="text-xs text-text-muted">{label}</dt>
    </div>
  );
}

function StepRow({ step }: { step: StepSummary }) {
  const IconComponent = ACTION_ICON_COMPONENT[step.type];

  return (
    <li className="flex items-center gap-2 border-t border-white/[0.06] py-2 first:border-t-0">
      {IconComponent && <IconComponent size={16} className="shrink-0 text-text-muted" />}
      <span className="flex-1 truncate text-sm text-text">{step.label}</span>
      <span className="shrink-0 text-xs text-text-faint">{hostOf(step.url)}</span>
    </li>
  );
}
