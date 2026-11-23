// The first-run guide: four short screens with a practice button on the first
// three, so students try Start, Stop and the Synced check before they record.
// Nothing here talks to the background. The buttons only change what you see.

import { ArrowLeft, ArrowRight, CheckCircle, Pause, Play, Stop } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { type MascotState, SidekickFigure } from '../shared/Brand';
import { CLOSING_CHECK, GUIDE_STEPS, type GuideStepId, SAFETY_NETS } from '../shared/guide';

const MOOD: Record<GuideStepId, [MascotState, MascotState]> = {
  start: ['watching', 'capturing'],
  stop: ['capturing', 'done'],
  check: ['waiting', 'done'],
  safety: ['watching', 'watching'],
};

export default function Guide({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<Record<string, boolean>>({});
  const step = GUIDE_STEPS[index];
  const didTry = !!tried[step.id];
  const last = index === GUIDE_STEPS.length - 1;
  const canContinue = !step.practice || didTry;

  return (
    <div className="flex flex-col px-5 pb-5 pt-4">
      <header className="flex items-center justify-between">
        <ol
          className="flex items-center gap-1.5"
          aria-label={`Step ${index + 1} of ${GUIDE_STEPS.length}`}
        >
          {GUIDE_STEPS.map((item, i) => (
            <li
              key={item.id}
              aria-current={i === index ? 'step' : undefined}
              className={`h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                i === index ? 'w-6 bg-green' : i < index ? 'w-1.5 bg-green/60' : 'w-1.5 bg-ink/15'
              }`}
            />
          ))}
        </ol>
        <button type="button" onClick={onDone} className="text-xs text-text-muted hover:text-text">
          Skip
        </button>
      </header>

      <div key={`${step.id}-title`} className="view-in mt-4 flex items-center gap-3">
        <SidekickFigure state={MOOD[step.id][didTry ? 1 : 0]} className="h-14 w-[60px]" />
        <h1 className="text-lg font-semibold leading-tight text-text">{step.title}</h1>
      </div>

      <p key={`${step.id}-body`} className="view-in mt-3 text-[15px] leading-snug text-text/80">
        {step.body}
      </p>

      <div className="mt-4">
        {step.id === 'start' && (
          <StartPractice done={didTry} onTry={() => setTried({ ...tried, start: true })} />
        )}
        {step.id === 'stop' && (
          <StopPractice done={didTry} onTry={() => setTried({ ...tried, stop: true })} />
        )}
        {step.id === 'check' && (
          <CheckPractice done={didTry} onTry={() => setTried({ ...tried, check: true })} />
        )}
        {step.id === 'safety' && (
          <>
            <ul className="space-y-2.5">
              {SAFETY_NETS.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-text">
                  <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-green" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-btn border border-ink/10 px-3 py-2.5 text-sm text-text">
              {CLOSING_CHECK}
            </p>
          </>
        )}
      </div>

      <output className="mt-3 block min-h-[40px] text-sm text-green">
        {didTry ? step.after : ''}
      </output>

      <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0}
          className="btn-ghost"
          aria-label="Back"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={last ? onDone : () => setIndex(index + 1)}
          disabled={!canContinue}
          className="btn-primary"
        >
          {last ? 'Got it' : canContinue ? 'Next' : 'Try the button above'}
          {!last && canContinue && <ArrowRight size={16} weight="bold" />}
        </button>
      </div>
    </div>
  );
}

/** A small card that looks like the popup, so the buttons feel real without recording anything. */
function Demo({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-btn border border-ink/10 bg-ink/[0.03] p-3">
      {children}
      <p className="mt-3 text-center text-xs text-text-faint">Practice only, nothing is recorded</p>
    </div>
  );
}

function Pulse() {
  return <span aria-hidden="true" className="pulse-dot h-2 w-2 rounded-full bg-green" />;
}

function useSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

const clock = (s: number) => `0:${String(s).padStart(2, '0')}`;

function StartPractice({ done, onTry }: { done: boolean; onTry: () => void }) {
  const seconds = useSeconds(done);
  return (
    <Demo>
      {done ? (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-text-muted">
            <Pulse />
            Recording
          </p>
          <p className="text-2xl font-semibold tabular-nums text-text">{clock(seconds)}</p>
        </div>
      ) : (
        <button type="button" onClick={onTry} className="btn-primary w-full ring-4 ring-green/30">
          <Play size={16} weight="fill" />
          Start
        </button>
      )}
    </Demo>
  );
}

function StopPractice({ done, onTry }: { done: boolean; onTry: () => void }) {
  return (
    <Demo>
      {done ? (
        <p className="text-center text-sm font-medium text-text">Session saved</p>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-text-muted">
            <Pulse />
            Recording
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled className="btn-ghost">
              <Pause size={16} weight="fill" />
              Pause
            </button>
            <button type="button" onClick={onTry} className="btn-primary ring-4 ring-green/30">
              <Stop size={16} weight="fill" />
              Stop and save
            </button>
          </div>
        </>
      )}
    </Demo>
  );
}

function CheckPractice({ done, onTry }: { done: boolean; onTry: () => void }) {
  return (
    <Demo>
      <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] pb-3 text-xs text-text-muted">
        <span>Signed in as you@school.edu</span>
        <output className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-green' : 'bg-orange'}`}
          />
          {done ? 'Synced' : 'Uploading'}
        </output>
      </div>
      {!done && (
        <button
          type="button"
          onClick={onTry}
          className="btn-ghost mt-3 w-full ring-4 ring-green/30"
        >
          Check again
        </button>
      )}
    </Demo>
  );
}
