import {
  ClockCounterClockwise,
  Gear,
  Pause,
  Play,
  Plus,
  Question,
  SignOut,
  Stop,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import Brand, { setMascotMoment, useMascotState } from '../shared/Brand';
import SetupPicker, { SetupStack } from '../shared/SetupPicker';
import { SyncStatus } from '../shared/SyncStatus';
import ThemeToggle from '../shared/ThemeToggle';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import { activeElapsed, nextTimerTick, pauseTimestamp } from '../shared/activeTime';
import { signOutUser, useAuth } from '../shared/auth';
import { backgroundIsStale } from '../shared/buildCheck';
import { sendMessage, useLiveSessionState, useSettings } from '../shared/hooks';
import { pauseNotice } from '../shared/inactivity';
import type { LiveSession, Session, StepSummary } from '../shared/types';
import { fmtDuration, hostOf } from '../shared/utils/format';
import { LOCAL_WORKFLOW_ENABLED, LOCAL_WORKFLOW_UPLOADS } from '../shared/workflows';
import EarningsDashboard from './EarningsDashboard';
import Guide from './Guide';
import Login from './Login';
import Onboarding from './Onboarding';
import { PrivacyPrompt } from './PrivacyPrompt';
import WorkflowPicker from './WorkflowPicker';

export default function App() {
  const { session: liveSession, loaded: liveLoaded } = useLiveSessionState();
  const mascotState = useMascotState();
  const [settings, updateSettings] = useSettings();
  const { user, loading: authLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [replayGuide, setReplayGuide] = useState(false);
  const [showSetups, setShowSetups] = useState(false);
  const [controlBusy, setControlBusy] = useState<string | null>(null);
  const [controlError, setControlError] = useState('');
  const [controlPreview, setControlPreview] = useState<LiveSession | null>(null);
  const controlPendingRef = useRef<string | null>(null);
  const controlSequenceRef = useRef(0);
  const manuallyStoppedRef = useRef<string | null>(null);
  const prevSessionRef = useRef<LiveSession | null>(null);
  // Known before any click: Chrome only opens the side panel when open() is
  // called right inside the click, with no await before it.
  const windowIdRef = useRef<number | null>(null);

  // Tell the person when the background still runs an older build than this popup.
  // Never reload for them: that closes the popup and blanks an open review panel.
  const recording = !!liveSession;
  const [staleBackground, setStaleBackground] = useState(false);
  useEffect(() => {
    if (!liveLoaded) return;
    void sendMessage<{ build: string }>('GET_BUILD')
      .catch((error: unknown) => ({ error: String(error) }))
      .then((answer) => setStaleBackground(backgroundIsStale(answer)));
  }, [liveLoaded]);

  useEffect(() => {
    chrome.windows.getCurrent().then((win) => {
      windowIdRef.current = win.id ?? null;
    });
  }, []);

  useEffect(() => {
    const previous = prevSessionRef.current;
    prevSessionRef.current = liveSession;
    if (previous && !liveSession) {
      // A manual Stop waits for its archive response before submitting.
      if (
        controlPendingRef.current === 'STOP_CAPTURE' ||
        manuallyStoppedRef.current === previous.id
      )
        return;
      // Automatic stops also clear live state before the archive is ready.
      // The worker waits for cleanup, then returns this exact saved session.
      controlPendingRef.current = 'STOP_CAPTURE';
      setControlBusy('STOP_CAPTURE');
      void sendMessage<Session | null>('GET_SESSION', { id: previous.id })
        .then((archived) => {
          if (!archived) throw new Error('Capture stopped, but the session could not be saved.');
          setMascotMoment('done', null);
        })
        .catch((error) => setControlError(String(error)))
        .finally(() => {
          controlPendingRef.current = null;
          setControlBusy(null);
        });
    }
  }, [liveSession]);

  if (!settings.onboarding_complete) {
    return <Onboarding />;
  }

  if (showLogin) {
    return (
      <Login
        onCancel={() => setShowLogin(false)}
        onSuccess={() => {
          setShowLogin(false);
        }}
      />
    );
  }

  // Right after sign-in, and never over a session that is already recording.
  if (user && liveLoaded && !liveSession && (!settings.guide_seen || replayGuide)) {
    return (
      <Guide
        onDone={() => {
          updateSettings({ guide_seen: true });
          setReplayGuide(false);
        }}
      />
    );
  }

  if (showSetups) {
    return (
      <div className="view-in px-5 pb-4 pt-5">
        <SetupPicker onClose={() => setShowSetups(false)} />
      </div>
    );
  }

  const displayedSession = controlPreview ?? liveSession;
  const localOnly = displayedSession
    ? !!displayedSession.metadata.workflow?.local_only
    : LOCAL_WORKFLOW_ENABLED && !LOCAL_WORKFLOW_UPLOADS;
  const state = displayedSession?.state ?? 'idle';
  const isCapturing = state === 'capturing';
  const isPaused = state === 'paused';
  const isIdle = liveLoaded && state === 'idle';
  // The saved screen stays until the user picks what to do next.
  const isSaving = controlBusy === 'STOP_CAPTURE';
  const isSaved = isIdle && !isSaving && mascotState === 'done';
  async function control(
    type: 'START_CAPTURE' | 'PAUSE_CAPTURE' | 'RESUME_CAPTURE' | 'STOP_CAPTURE',
    workflowId?: string,
    annotationOptIn = false,
  ) {
    if (!liveLoaded) return;
    if (
      controlPendingRef.current &&
      (type !== 'STOP_CAPTURE' || controlPendingRef.current === type)
    )
      return;
    const sequence = ++controlSequenceRef.current;
    const requestedAt = Date.now();
    if (type === 'STOP_CAPTURE') manuallyStoppedRef.current = liveSession?.id ?? null;
    controlPendingRef.current = type;
    setControlBusy(type);
    setControlError('');
    if (displayedSession && type !== 'START_CAPTURE' && type !== 'RESUME_CAPTURE') {
      setControlPreview({
        ...displayedSession,
        state: 'paused',
        paused_at:
          displayedSession.state === 'paused' ? pauseTimestamp(displayedSession) : requestedAt,
      });
    }
    try {
      const result = await sendMessage<{ sessionId?: string | null }>(type, {
        requested_at: requestedAt,
        session_id: liveSession?.id,
        workflow_id: workflowId,
        annotation_opt_in: annotationOptIn,
      });
      if (type === 'STOP_CAPTURE') {
        if (!result?.sessionId)
          throw new Error('Capture stopped, but the session could not be saved.');
        setMascotMoment('done', null);
      }
    } catch (error) {
      if (type === 'STOP_CAPTURE') manuallyStoppedRef.current = null;
      if (sequence === controlSequenceRef.current)
        setControlError(
          error instanceof Error ? error.message : 'The control did not complete. Try again.',
        );
    } finally {
      if (sequence === controlSequenceRef.current) {
        controlPendingRef.current = null;
        setControlBusy(null);
        setControlPreview(null);
      }
    }
  }
  const handlePause = () => control('PAUSE_CAPTURE');
  const handleResume = () => control('RESUME_CAPTURE');
  const handleStop = () => control('STOP_CAPTURE');

  /** Opens the review side panel, then closes the popup so the panel has the screen. */
  function openPanel() {
    const windowId = windowIdRef.current;
    if (windowId === null) return;
    chrome.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch((err) => console.error('Failed to open side panel:', err));
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

  const statusTitle = !liveLoaded
    ? 'Loading session'
    : controlBusy === 'STOP_CAPTURE'
      ? 'Saving your session'
      : isCapturing
        ? 'Recording'
        : isPaused
          ? 'Paused'
          : isSaving
            ? 'Saving your session'
            : isSaved
              ? 'Session saved'
              : user
                ? 'Choose a workflow'
                : 'Sign in to start';

  return (
    <div className="flex flex-col px-5 pb-4 pt-5">
      <header className="flex items-center justify-between gap-2">
        <Brand size="text-[24px]" />
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          {/* The guide never opens over a session, so the button only shows
              before starting or after the session is saved. */}
          {!recording && (
            <button
              type="button"
              onClick={() => setReplayGuide(true)}
              className="icon-btn"
              data-motion="tilt"
              title="How it works"
              aria-label="How it works"
            >
              <Question size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenPanel}
            className="icon-btn"
            data-motion="tilt"
            title="Review sessions"
            aria-label="Review sessions"
          >
            <ClockCounterClockwise size={18} />
          </button>
          <button
            type="button"
            onClick={handleOpenOptions}
            className="icon-btn"
            data-motion="turn"
            title="Settings"
            aria-label="Settings"
          >
            <Gear size={18} />
          </button>
        </div>
      </header>

      {staleBackground && (
        <div
          role="alert"
          className="mt-3 rounded-btn border border-orange/40 bg-orange/[0.1] px-3 py-2 text-sm text-text"
        >
          Sidekick was updated, but part of it is still running the old version.{' '}
          {recording ? (
            'Stop and save your session, then reload it from chrome://extensions.'
          ) : (
            <button type="button" className="underline" onClick={() => chrome.runtime.reload()}>
              Reload Sidekick
            </button>
          )}
        </div>
      )}

      {user && isIdle && !isSaving && (
        <EarningsDashboard key={`${user.uid}-${localOnly}`} uid={user.uid} localOnly={localOnly} />
      )}

      <section className="pt-5">
        {(isCapturing || isPaused) && displayedSession ? (
          <>
            <p
              className={`live-chip view-in max-w-full ${isPaused ? 'bg-orange/15 text-orange' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${isCapturing ? 'pulse-dot bg-green' : 'bg-orange'}`}
              />
              {statusTitle}
              {displayedSession.metadata.workflow && (
                <span className="truncate font-normal text-text-muted">
                  {displayedSession.metadata.workflow.name}
                </span>
              )}
            </p>
            <LiveTimer live={displayedSession} />
            {isPaused && !displayedSession.privacy_gate && (
              <output className="mt-3 block text-sm text-text-muted">
                {pauseNotice(displayedSession)}
              </output>
            )}
          </>
        ) : (
          <h1
            key={statusTitle}
            className="view-in text-[17px] font-semibold tracking-tight text-text"
          >
            {statusTitle}
          </h1>
        )}
        {!(isCapturing || isPaused) && (!isIdle || isSaving || isSaved) && (
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {!liveLoaded
              ? 'Checking your current session.'
              : isSaving
                ? 'Hang on, this takes a few seconds.'
                : isSaved
                  ? localOnly
                    ? 'Your session is saved on this device. You can review it anytime.'
                    : 'Your session uploads automatically. You can review it anytime.'
                  : 'Sign in to see your assigned workflows.'}
          </p>
        )}
      </section>
      {controlError && (
        <p className="mt-3 text-sm text-coral" role="alert">
          {controlError}
        </p>
      )}

      {isSaved && (
        <div className="stagger mt-5 space-y-2.5">
          <button type="button" onClick={handleOpenPanel} className="btn-primary btn-lg w-full">
            Review session
          </button>
          <button
            type="button"
            onClick={() => setMascotMoment(null)}
            className="btn-ghost btn-lg w-full"
          >
            <Plus size={16} weight="bold" />
            New task
          </button>
        </div>
      )}

      {isIdle &&
        !isSaving &&
        !isSaved &&
        (user ? (
          <WorkflowPicker
            key={user.uid}
            uid={user.uid}
            busy={!!controlBusy}
            onStart={(id, annotationOptIn) => control('START_CAPTURE', id, annotationOptIn)}
          />
        ) : (
          <button
            type="button"
            className="btn-primary btn-lg mt-4 w-full"
            disabled={authLoading}
            onClick={() => setShowLogin(true)}
          >
            Sign in
          </button>
        ))}

      {(isCapturing || isPaused) && liveSession && (
        <div className="view-in mt-4 space-y-3">
          {liveSession.privacy_gate ? (
            <PrivacyPrompt
              key={liveSession.privacy_gate.id}
              gate={liveSession.privacy_gate}
              sessionId={liveSession.id}
              onStop={handleStop}
              stopping={isSaving}
            />
          ) : (
            <>
              <dl className="stagger grid grid-cols-3 gap-2">
                <Stat label="Steps" value={liveSession.step_count} />
                <Stat label="Clicks" value={liveSession.stats.clicks} />
                <Stat label="Keys" value={liveSession.stats.keystrokes} />
              </dl>

              <div className="grid grid-cols-2 gap-2">
                {isCapturing ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePause}
                      disabled={!!controlBusy}
                      className="btn-ghost btn-lg"
                    >
                      <Pause size={16} weight="fill" />
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      disabled={controlBusy === 'STOP_CAPTURE'}
                      className="btn-primary btn-lg"
                    >
                      <Stop size={16} weight="fill" />
                      Stop and save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleResume}
                      disabled={!!controlBusy}
                      className="btn-primary btn-lg"
                    >
                      <Play size={16} weight="fill" />
                      {liveSession.pause_reason === 'idle' ? 'Continue' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      disabled={controlBusy === 'STOP_CAPTURE'}
                      className="btn-ghost btn-lg"
                    >
                      <Stop size={16} weight="fill" />
                      Stop and save
                    </button>
                  </>
                )}
              </div>

              {liveSession.pause_reason === 'idle' && (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  disabled={!!controlBusy}
                  onClick={handlePause}
                >
                  Keep paused
                </button>
              )}
              {liveSession.recent.length > 0 && (
                <div className="pt-3">
                  <h2 className="mb-1 text-xs font-semibold text-text-muted">Recent steps</h2>
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
            </>
          )}
        </div>
      )}

      {!authLoading && (
        <footer className="mt-5 flex items-center gap-3 border-t border-ink/[0.07] pt-3.5 text-xs text-text-muted">
          {/* Choose your setup lives in the corner. Hidden while recording, like the guide. */}
          {!recording && (
            <button
              type="button"
              onClick={() => setShowSetups(true)}
              className="icon-btn -my-1 -ml-1.5 h-8 w-9 shrink-0"
              title="Choose your setup"
              aria-label="Choose your setup"
            >
              <SetupStack size={16} />
            </button>
          )}
          {user ? (
            <>
              <span className="min-w-0 flex-1 truncate">Signed in as {user.email}</span>
              <span className="flex shrink-0 items-center gap-3">
                <SyncStatus uid={user.uid} localOnly={localOnly} />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="-mr-2 flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-text transition-[background-color,transform] duration-200 hover:bg-ink/[0.07] active:scale-95"
                >
                  <SignOut size={14} />
                  Sign out
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1">Sign in to sync your sessions.</span>
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

function LiveTimer({ live }: { live: LiveSession }) {
  // Only forces a re-render. The time is read fresh on every render, so the
  // first frame after Resume shows the right number instead of a stale one.
  const [, setTick] = useState(0);
  const isPaused = live.state === 'paused';

  useEffect(() => {
    if (isPaused) return;
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(
        () => {
          setTick((t) => t + 1);
          schedule();
        },
        nextTimerTick(activeElapsed(live, Date.now())),
      );
    };
    const refresh = () => {
      clearTimeout(timeout);
      setTick((t) => t + 1);
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isPaused, live]);

  const elapsed = activeElapsed(live, Date.now());

  return (
    <p
      className={`timer mt-3.5 text-[52px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${
        isPaused ? 'text-text-muted' : 'text-text'
      }`}
    >
      {fmtDuration(elapsed)}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface flex flex-col-reverse px-3.5 py-3">
      <dd className="mt-1 overflow-hidden text-xl font-semibold leading-none tabular-nums text-text">
        <span key={value} className="tick">
          {value}
        </span>
      </dd>
      <dt className="text-[11.5px] leading-none text-text-muted">{label}</dt>
    </div>
  );
}

function StepRow({ step }: { step: StepSummary }) {
  const IconComponent = ACTION_ICON_COMPONENT[step.type];

  return (
    <li className="view-in flex h-10 items-center gap-2.5 border-t border-ink/[0.07] first:border-t-0">
      {IconComponent && <IconComponent size={16} className="shrink-0 text-text-muted" />}
      <span className="flex-1 truncate text-sm text-text">{step.label}</span>
      <span className="shrink-0 text-xs text-text-faint">{hostOf(step.url)}</span>
    </li>
  );
}
