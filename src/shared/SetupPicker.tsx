// "Choose your setup": a character-select style screen for picking the look of
// the extension. The big card is a live preview of the highlighted setup; the
// grid below holds every setup. Light and Dark flip the preview between the
// setup's two versions. Equip puts it on everywhere.

import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  Check,
  DiceFive,
  Moon,
  Sun,
} from '@phosphor-icons/react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Mascot } from './Brand';
import { type Mode, SETUPS, type Setup, findSetup } from './setups';
import { chooseSetup, currentLook, subscribeLook } from './theme';

const MODES: { id: Mode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** The look the page shows right now, kept current when it changes. */
export function useLook() {
  return useSyncExternalStore(subscribeLook, currentLook);
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A small square of a setup: its background with a slab of its surface and button. */
function Swatch({ setup, mode }: { setup: Setup; mode: Mode }) {
  return (
    <span className="setup-swatch" data-theme={mode} data-setup={setup.id} aria-hidden="true">
      <span className="setup-chip" />
    </span>
  );
}

/**
 * Three swatches fanned like a hand of cards, the current setup in front. They
 * spread wider when the button around them is hovered. `size` is one card in px.
 */
export function SetupStack({ size = 32 }: { size?: number }) {
  const look = useLook();
  const current = findSetup(look.setup) ?? SETUPS[0];
  const [left, right] = ['aurora', 'retro', 'paper']
    .filter((id) => id !== current.id)
    .map((id) => findSetup(id) as Setup);
  const cards: [Setup, number][] = [
    [left, -1],
    [right, 1],
    [current, 0],
  ];
  return (
    <span className="setup-fan" style={{ '--s': `${size}px` } as CSSProperties} aria-hidden="true">
      {cards.map(([setup, lean]) => (
        <span key={setup.id} className="setup-fan-card" style={{ '--i': lean } as CSSProperties}>
          <Swatch setup={setup} mode={look.theme} />
        </span>
      ))}
    </span>
  );
}

export default function SetupPicker({ onClose }: { onClose?: () => void }) {
  const look = useLook();
  // Which version the preview and tiles show. Starts as, and follows, the page.
  const [mode, setMode] = useState<Mode>(look.theme);
  const [focusId, setFocusId] = useState(look.setup);
  const [dir, setDir] = useState(0);
  const [rolling, setRolling] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const equipRef = useRef<HTMLButtonElement>(null);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const list = SETUPS;
  const focused = findSetup(focusId) ?? SETUPS[0];
  const index = Math.max(
    0,
    list.findIndex((setup) => setup.id === focused.id),
  );
  const wearing = focused.id === look.setup;
  const equipped = wearing && mode === look.theme;

  useEffect(() => () => clearTimeout(rollTimer.current), []);
  useEffect(() => setMode(look.theme), [look.theme]);

  // Keep the highlighted tile in view when the grid scrolls.
  useEffect(() => {
    gridRef.current
      ?.querySelector(`[data-id="${focusId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [focusId]);

  function show(id: string, direction: number) {
    if (id === focusId) return;
    setDir(direction);
    setFocusId(id);
    setFlash(null);
  }

  function step(delta: number) {
    const next = list[(index + delta + list.length) % list.length];
    show(next.id, Math.sign(delta));
  }

  function pickMode(next: Mode) {
    if (next === mode) return;
    setDir(0);
    setMode(next);
    setFlash(null);
  }

  function equip(id: string) {
    chooseSetup(id, mode, equipRef.current ?? undefined);
    setFlash((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }

  // Surprise me: the highlight hops across the grid, slowing down, then lands.
  function roll() {
    if (rolling) return;
    const pool = list.filter((setup) => setup.id !== focused.id);
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (reduceMotion()) {
      show(target.id, 1);
      return;
    }
    const hops = 10;
    let hop = 0;
    const next = () => {
      hop += 1;
      if (hop >= hops) {
        setRolling(null);
        show(target.id, 1);
        return;
      }
      setRolling(pool[Math.floor(Math.random() * pool.length)].id);
      rollTimer.current = setTimeout(next, 45 + hop * hop * 5);
    };
    next();
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const grid = gridRef.current;
    if (!grid) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      equip(focused.id);
      return;
    }
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
      Home: -index,
      End: list.length - 1 - index,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const target = list[Math.min(list.length - 1, Math.max(0, index + move))];
    show(target.id, Math.sign(move));
    requestAnimationFrame(() =>
      grid.querySelector<HTMLButtonElement>(`[data-id="${target.id}"]`)?.focus(),
    );
  }

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch' || reduceMotion()) return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 10).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    card.classList.add('is-tracking');
  }

  function untilt(event: PointerEvent<HTMLDivElement>) {
    const card = event.currentTarget;
    for (const name of ['--rx', '--ry', '--mx', '--my']) card.style.removeProperty(name);
    card.classList.remove('is-tracking');
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-1.5">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="icon-btn -ml-1.5"
            data-motion="back"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="text-[17px] font-semibold tracking-tight text-text">Choose your setup</h1>
        <span className="ml-auto text-xs tabular-nums text-text-muted">
          {index + 1} / {list.length}
        </span>
      </header>

      <div className="setup-stage mt-3" aria-hidden="true">
        <div
          key={`${focused.id}-${mode}`}
          data-theme={mode}
          data-setup={focused.id}
          className="setup-card p-3.5"
          style={{ '--dir': dir } as CSSProperties}
          onPointerMove={tilt}
          onPointerLeave={untilt}
        >
          <span className="setup-shine" />
          {flash?.id === focused.id && <span key={flash.n} className="setup-flash" />}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Mascot state="watching" follow={false} className="h-8 w-[35px]" />
              <span className="wordmark text-[17px] leading-none">
                sidekick<span className="dot">.</span>
              </span>
            </span>
            <span className="live-chip h-6 pl-2 pr-2.5 text-[11px]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green" />
              Recording
            </span>
          </div>
          <p className="timer mt-2.5 text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-text">
            12:48
          </p>
          <div className="option is-on mt-3 min-h-[40px] py-2">
            <span className="option-radio" />
            <span className="text-[13px] font-semibold">Research</span>
            <span className="ml-auto text-[11.5px] text-text-muted">14 steps</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <span className="btn-ghost py-2 text-[13px]">Pause</span>
            <span className="btn-primary py-2 text-[13px]">Stop and save</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          className="icon-btn shrink-0"
          data-motion="prev"
          aria-label="Previous setup"
          title="Previous"
        >
          <CaretLeft size={18} />
        </button>
        <div
          key={focused.id}
          className="view-in min-w-0 flex-1 text-center"
          style={{ '--dir': dir } as CSSProperties}
          aria-live="polite"
        >
          <h2 className="truncate text-[15px] font-semibold leading-tight text-text">
            {focused.name}
            {wearing && <span className="sr-only"> (equipped)</span>}
          </h2>
          <p className="mt-0.5 truncate text-xs text-text-muted">{focused.blurb}</p>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          className="icon-btn shrink-0"
          data-motion="next"
          aria-label="Next setup"
          title="Next"
        >
          <CaretRight size={18} />
        </button>
      </div>

      <fieldset
        className="segmented mt-3"
        style={
          {
            '--tabs': MODES.length,
            '--tab': MODES.findIndex((m) => m.id === mode),
          } as CSSProperties
        }
      >
        <legend className="sr-only">Preview version</legend>
        <span className="segmented-thumb" />
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => pickMode(m.id)}
            className="segmented-btn inline-flex items-center justify-center gap-1.5 py-1 text-[13px]"
            aria-pressed={mode === m.id}
          >
            {m.id === 'light' ? <Sun size={14} /> : <Moon size={14} />}
            {m.label}
          </button>
        ))}
      </fieldset>

      <div
        ref={gridRef}
        role="radiogroup"
        aria-label="Setups"
        onKeyDown={onGridKey}
        className="mt-3 grid max-h-[176px] grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-2 overflow-y-auto p-1.5"
      >
        {list.map((setup) => {
          const on = setup.id === look.setup;
          return (
            <button
              key={setup.id}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: a grid of radios with 2D arrow keys and Enter to equip, which native radios cannot do.
              role="radio"
              data-id={setup.id}
              aria-checked={setup.id === focused.id}
              aria-label={on ? `${setup.name}, equipped` : setup.name}
              title={setup.name}
              tabIndex={setup.id === focused.id ? 0 : -1}
              onClick={() => show(setup.id, Math.sign(list.indexOf(setup) - index))}
              onDoubleClick={() => equip(setup.id)}
              className={`setup-tile ${rolling === setup.id ? 'is-rolling' : ''}`}
            >
              <Swatch setup={setup} mode={mode} />
              {on && (
                <span
                  className="setup-badge pop grid h-4 w-4 place-items-center rounded-full"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                >
                  <Check size={10} weight="bold" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={roll}
          disabled={!!rolling}
          className="btn-ghost shrink-0 px-3.5"
          title="Land on a random setup"
        >
          <DiceFive size={18} className={rolling ? 'animate-spin' : ''} />
          Surprise me
        </button>
        <button
          ref={equipRef}
          type="button"
          onClick={() => equip(focused.id)}
          disabled={equipped}
          className="btn-primary flex-1"
        >
          {equipped ? (
            <>
              <Check key={look.setup} size={16} weight="bold" className="pop" />
              Equipped
            </>
          ) : wearing ? (
            `Switch to ${mode}`
          ) : (
            'Equip'
          )}
        </button>
      </div>
    </div>
  );
}
