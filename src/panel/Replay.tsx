import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CaretLeft,
  CaretRight,
  Keyboard,
  MonitorPlay,
  Pause,
  Play,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import { activeOffset } from '../shared/activeTime';
import { getRecording } from '../shared/storage/db';
import type { Session, Step } from '../shared/types';
import { fmtDuration, stepLabel } from '../shared/utils/format';
import { nearestScreenshotIndex } from './nearestScreenshot';
import { feedSteps, pointPercent, rectPercent, stepDelay, typedText } from './replayOverlay';
import { useScreenshot } from './useScreenshot';

interface ReplayProps {
  session: Session;
}

type ViewMode = 'screenshots' | 'video';

const CLICKS = new Set(['click', 'double_click', 'right_click']);
const SCROLL_ICON = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight };

export function Replay({ session }: ReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('screenshots');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const currentStep = session.steps[currentIndex];
  const shotIndex = nearestScreenshotIndex(session.steps, currentIndex);
  const borrowed = shotIndex !== null && shotIndex !== currentIndex;
  const screenshotUrl = useScreenshot(
    shotIndex === null ? null : session.steps[shotIndex].screenshot?.hash,
  );
  const feed = feedSteps(session.steps, currentIndex);

  useEffect(() => {
    let objectUrl: string | null = null;
    getRecording(session.id)
      .then((blob) => {
        if (blob && blob.size > 0) {
          objectUrl = URL.createObjectURL(blob);
          setVideoUrl(objectUrl);
        }
      })
      .catch((err) => console.warn('Failed to load recording:', err));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session.id]);

  useEffect(() => {
    if (!playing || currentIndex >= session.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => {
        setCurrentIndex((prev) => Math.min(prev + 1, session.steps.length - 1));
      },
      stepDelay(session.steps, currentIndex, session.started_at, session.pauses, speed),
    );
    return () => clearTimeout(timer);
  }, [playing, currentIndex, speed, session.steps, session.started_at, session.pauses]);

  const goTo = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, session.steps.length - 1)));
    setPlaying(false);
  };

  const handleTogglePlay = () => {
    if (currentIndex >= session.steps.length - 1) {
      setCurrentIndex(0);
    }
    setPlaying((prev) => !prev);
  };

  const offset = (step: Step) => activeOffset(session.started_at, session.pauses, step.timestamp);
  const elapsed = currentStep ? offset(currentStep) : 0;

  // Typing plays out over most of the step while playing, and quickly when stepping by hand.
  const typeMs = playing
    ? Math.max(
        300,
        Math.min(
          1500,
          stepDelay(session.steps, currentIndex, session.started_at, session.pauses, speed) * 0.7,
        ),
      )
    : 700;

  return (
    <div className="h-full flex flex-col">
      {videoUrl && (
        <div className="border-b border-white/[0.06] px-4 py-2 flex items-center gap-2">
          {(['screenshots', 'video'] as ViewMode[]).map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`chip capitalize ${viewMode === mode ? 'chip-on' : ''}`}
            >
              {mode === 'video' && (
                <MonitorPlay size={14} weight="regular" className="inline mr-1" />
              )}
              {mode}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'video' && videoUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: screen recordings have no audio to caption
          <video
            controls
            controlsList="nodownload"
            className="w-full h-auto rounded-btn border border-white/[0.06]"
            src={videoUrl}
          >
            Your browser does not support video playback.
          </video>
        ) : (
          <>
            {screenshotUrl ? (
              <div className="relative w-full overflow-hidden rounded-btn border border-white/[0.06]">
                <img src={screenshotUrl} alt="Replay frame" className="block w-full h-auto" />
                {currentStep && !borrowed && (
                  <ActionOverlay key={currentIndex} step={currentStep} typeMs={typeMs} />
                )}
              </div>
            ) : (
              <p className="flex h-48 w-full items-center justify-center rounded-btn border border-dashed border-white/10 text-xs text-text-faint">
                No screenshots in this session
              </p>
            )}
            {borrowed && (
              <p className="mt-1.5 text-xs text-text-faint">
                No screenshot was taken at this step. Showing step {(shotIndex ?? 0) + 1}.
              </p>
            )}

            {feed.length > 0 && (
              <ol className="mt-4 space-y-1" aria-label="Actions so far">
                {feed.map((i, position) => {
                  const step = session.steps[i];
                  const Icon = ACTION_ICON_COMPONENT[step.action.type];
                  const current = i === currentIndex;
                  return (
                    <li key={i} className={position === 0 ? 'replay-drop' : ''}>
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        aria-current={current ? 'step' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-btn border-l-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                          current
                            ? 'border-green bg-green/[0.08] text-text'
                            : 'border-transparent text-text-muted hover:bg-white/[0.04]'
                        }`}
                      >
                        <Icon size={14} className={current ? 'text-green' : 'text-text-faint'} />
                        <span className="min-w-0 flex-1 truncate">{stepLabel(step)}</span>
                        <span className="tabular-nums text-text-faint">
                          {fmtDuration(offset(step))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>

      {viewMode === 'screenshots' && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs tabular-nums text-text-muted">
            <span>
              Step {currentIndex + 1} of {session.steps.length}
            </span>
            <span>{fmtDuration(elapsed)}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="icon-btn disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous step"
            >
              <CaretLeft size={18} weight="bold" />
            </button>

            <button type="button" onClick={handleTogglePlay} className="btn-primary flex-1">
              {playing ? (
                <>
                  <Pause size={16} weight="fill" />
                  Pause
                </>
              ) : (
                <>
                  <Play size={16} weight="fill" />
                  Play
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= session.steps.length - 1}
              className="icon-btn disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next step"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-text-muted">Speed</span>
            {[1, 2, 3].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`chip ${speed === s ? 'chip-on' : ''}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shows the step's action on its own screenshot: where a click landed, the
 *  field that was typed into and what was typed, a scroll, or a key press. */
function ActionOverlay({ step, typeMs }: { step: Step; typeMs: number }) {
  const { action, screenshot: shot } = step;
  if (!shot) return null;

  if (CLICKS.has(action.type) && action.coordinate) {
    const { left, top } = pointPercent(action.coordinate, shot);
    return (
      <span
        className="replay-click pointer-events-none absolute"
        style={{ left: `${left}%`, top: `${top}%` }}
        aria-hidden="true"
      >
        <span className="replay-ripple" />
        <span className="replay-ripple replay-ripple-late" />
        <span className="replay-dot" />
      </span>
    );
  }

  if (action.type === 'type') {
    const text = typedText(step);
    const rect = step.dom?.rect;
    const box = rect ? rectPercent(rect, shot) : null;
    const below = !box || box.top + box.height < 78;
    return (
      <>
        {box && (
          <span
            className="replay-field pointer-events-none absolute"
            style={{
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
            aria-hidden="true"
          />
        )}
        {text && (
          <span
            className="replay-bubble pointer-events-none absolute"
            style={
              box
                ? {
                    left: `${Math.min(box.left, 55)}%`,
                    ...(below
                      ? { top: `calc(${box.top + box.height}% + 6px)` }
                      : { bottom: `calc(${100 - box.top}% + 6px)` }),
                  }
                : { left: '50%', bottom: '10px', transform: 'translateX(-50%)' }
            }
          >
            <Keyboard size={12} weight="bold" className="shrink-0 text-green" />
            <Typewriter text={text} durationMs={typeMs} />
          </span>
        )}
      </>
    );
  }

  if (action.type === 'scroll' && action.scroll_direction) {
    const Icon = SCROLL_ICON[action.scroll_direction];
    return (
      <span className="replay-chip pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <Icon
          size={12}
          weight="bold"
          className={`text-green replay-nudge-${action.scroll_direction}`}
        />
        Scroll {action.scroll_direction}
      </span>
    );
  }

  if (action.type === 'key' && action.key) {
    return (
      <span className="replay-chip pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
        <span className="kbd">{action.key}</span>
      </span>
    );
  }

  return null;
}

function Typewriter({ text, durationMs }: { text: string; durationMs: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const every = Math.max(16, durationMs / Math.max(1, text.length));
    const timer = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) clearInterval(timer);
        return Math.min(n + 1, text.length);
      });
    }, every);
    return () => clearInterval(timer);
  }, [text, durationMs]);
  return (
    <span className="truncate">
      {text.slice(0, shown)}
      <span className="replay-caret" />
    </span>
  );
}
