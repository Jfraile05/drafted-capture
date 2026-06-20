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
              className={`px-3 py-1.5 text-xs rounded-btn transition-colors capitalize ${
                viewMode === mode
                  ? 'bg-violet/20 text-violet border border-violet/30'
                  : 'bg-bg-input text-text-muted hover:bg-bg-card'
              }`}
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
                <Target size={24} weight="bold" className="text-green animate-pulse" />
                <div
                  className="absolute inset-0 rounded-full ring"
                  style={{ boxShadow: '0 0 0 0 rgba(77,255,160,0.45)' }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-64 bg-bg-input rounded-btn border border-white/[0.06] flex items-center justify-center text-text-faint text-sm">
            No screenshot
          </div>
        )}
      </div>

      {viewMode === 'screenshots' && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="text-text-muted">
              Step {currentIndex + 1} / {session.steps.length}
            </div>
            <div className="text-text-muted">{fmtDuration(elapsed)}</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-btn bg-bg-card hover:bg-bg-card-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretLeft size={20} weight="bold" className="text-text" />
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green/20 text-green rounded-btn hover:bg-green/30 transition-colors"
            >
              {playing ? (
                <>
                  <Pause size={20} weight="fill" />
                  Pause
                </>
              ) : (
                <>
                  <Play size={20} weight="fill" />
                  Play
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= session.steps.length - 1}
              className="p-2 rounded-btn bg-bg-card hover:bg-bg-card-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretRight size={20} weight="bold" className="text-text" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-text-muted">Speed:</div>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-xs px-3 py-1 rounded-btn transition-colors ${
                  speed === s
                    ? 'bg-violet/20 text-violet border border-violet/30'
                    : 'bg-bg-input text-text-muted hover:bg-bg-card'
                }`}
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
