import { CaretLeft, CaretRight, MonitorPlay, Pause, Play, Target } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { getRecording } from '../shared/storage/db';
import type { Session } from '../shared/types';
import { fmtDuration } from '../shared/utils/format';
import { useScreenshot } from './useScreenshot';

interface ReplayProps {
  session: Session;
}

type ViewMode = 'screenshots' | 'video';

export function Replay({ session }: ReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('screenshots');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const currentStep = session.steps[currentIndex];
  const screenshotUrl = useScreenshot(currentStep?.screenshot?.hash);

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

    const step = session.steps[currentIndex];
    const durationMs = step.duration_to_next ?? 1000;
    const scaledDuration = Math.max(100, Math.min(5000, durationMs / speed));

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, session.steps.length - 1));
    }, scaledDuration);

    return () => clearTimeout(timer);
  }, [playing, currentIndex, speed, session.steps]);

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setPlaying(false);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, session.steps.length - 1));
    setPlaying(false);
  };

  const handleTogglePlay = () => {
    if (currentIndex >= session.steps.length - 1) {
      setCurrentIndex(0);
    }
    setPlaying((prev) => !prev);
  };

  const elapsed = currentStep ? currentStep.timestamp - session.started_at : 0;

  const coord = currentStep?.action.coordinate;
  let crosshairStyle: React.CSSProperties = {};
  if (coord && currentStep?.screenshot && screenshotUrl) {
    const dpr = currentStep.screenshot.dpr;
    const imgW = currentStep.screenshot.width;
    const imgH = currentStep.screenshot.height;
    const pixelX = coord[0] * dpr;
    const pixelY = coord[1] * dpr;
    const leftPercent = (pixelX / imgW) * 100;
    const topPercent = (pixelY / imgH) * 100;
    crosshairStyle = { left: `${leftPercent}%`, top: `${topPercent}%` };
  }

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
            className="w-full h-auto rounded-btn border border-white/[0.06]"
            src={videoUrl}
          >
            Your browser does not support video playback.
          </video>
        ) : screenshotUrl ? (
          <div className="relative w-full">
            <img
              src={screenshotUrl}
              alt="Replay frame"
              className="w-full h-auto rounded-btn border border-white/[0.06]"
            />
            {coord && (
              <div
                className="absolute"
                style={{ ...crosshairStyle, transform: 'translate(-50%, -50%)' }}
              >
                <Target size={24} weight="bold" className="text-white drop-shadow" />
              </div>
            )}
          </div>
        ) : (
          <p className="flex h-48 w-full items-center justify-center rounded-btn border border-dashed border-white/10 text-xs text-text-faint">
            No screenshot for this step
          </p>
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
              onClick={handlePrev}
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
              onClick={handleNext}
              disabled={currentIndex >= session.steps.length - 1}
              className="icon-btn disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next step"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-text-muted">Speed</span>
            {[0.5, 1, 2, 4].map((s) => (
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
