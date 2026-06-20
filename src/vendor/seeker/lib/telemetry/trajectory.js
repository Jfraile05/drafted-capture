/**
 * Trajectory buffer — captures fine-grained mouse, scroll, keystroke, focus,
 * and form interaction events while a student is working on a task.
 *
 * Design goals
 * - Capture enough signal to reconstruct the student's session for training
 *   data (mouse paths, click coordinates, field-level keystroke cadence, scroll
 *   depth, focus churn, idle gaps).
 * - Stay under PostHog's per-event size budget by chunking into fixed-size
 *   batches and flushing on interval / page hide / unmount.
 * - Sample mouse moves aggressively (~30 Hz) to avoid drowning the pipeline.
 */

const MOUSEMOVE_SAMPLE_MS = 35; // ~28 Hz
const SCROLL_SAMPLE_MS = 120;
const CHUNK_SIZE = 200; // events per chunk
const CHUNK_FLUSH_MS = 10_000; // max age before forced flush
const IDLE_THRESHOLD_MS = 20_000;

export default class TrajectoryBuffer {
  constructor({ onFlush, surface, sessionId }) {
    this.onFlush = onFlush; // (chunk) => void
    this.surface = surface;
    this.sessionId = sessionId;
    this.events = [];
    this.startedAt = Date.now();
    this.chunkIndex = 0;

    // Sampling throttles
    this._lastMouseMoveAt = 0;
    this._lastScrollAt = 0;

    // Aggregates
    this.totals = {
      mouse_moves: 0,
      mouse_clicks: 0,
      mouse_distance_px: 0,
      key_presses: 0,
      paste_count: 0,
      copy_count: 0,
      cut_count: 0,
      undo_count: 0,
      redo_count: 0,
      scroll_events: 0,
      max_scroll_depth: 0,
      focus_changes: 0,
      idle_periods: 0,
      total_idle_ms: 0,
    };

    // Last mouse pos for distance calc
    this._lastMouse = null;

    // Idle tracking
    this._lastInteractionAt = Date.now();
    this._idleTimer = null;
    this._isIdle = false;

    // Flush timer
    this._flushTimer = null;
  }

  start() {
    if (typeof window === 'undefined') return;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPaste = this._onPaste.bind(this);
    this._onCopy = this._onCopy.bind(this);
    this._onCut = this._onCut.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
    this._onFocusOut = this._onFocusOut.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onBeforeUnload = this._onBeforeUnload.bind(this);

    window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    window.addEventListener('mousedown', this._onMouseDown, { passive: true });
    window.addEventListener('click', this._onClick, { passive: true });
    window.addEventListener('keydown', this._onKeyDown, { passive: true });
    window.addEventListener('paste', this._onPaste, { passive: true });
    window.addEventListener('copy', this._onCopy, { passive: true });
    window.addEventListener('cut', this._onCut, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true, capture: true });
    window.addEventListener('focusin', this._onFocusIn, { passive: true });
    window.addEventListener('focusout', this._onFocusOut, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('pagehide', this._onBeforeUnload, { passive: true });

    this._flushTimer = window.setInterval(() => this.flush('interval'), CHUNK_FLUSH_MS);
    this._startIdleWatch();
  }

  stop() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('paste', this._onPaste);
    window.removeEventListener('copy', this._onCopy);
    window.removeEventListener('cut', this._onCut);
    window.removeEventListener('scroll', this._onScroll, { capture: true });
    window.removeEventListener('focusin', this._onFocusIn);
    window.removeEventListener('focusout', this._onFocusOut);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pagehide', this._onBeforeUnload);
    if (this._flushTimer) window.clearInterval(this._flushTimer);
    if (this._idleTimer) window.clearTimeout(this._idleTimer);
    this.flush('stop');
  }

  _push(type, data) {
    this.events.push({ t: Date.now() - this.startedAt, type, ...data });
    if (this.events.length >= CHUNK_SIZE) this.flush('size');
  }

  _markInteraction() {
    const now = Date.now();
    if (this._isIdle) {
      this.totals.total_idle_ms += now - this._lastInteractionAt;
      this._isIdle = false;
    }
    this._lastInteractionAt = now;
    this._resetIdleTimer();
  }

  _resetIdleTimer() {
    if (typeof window === 'undefined') return;
    if (this._idleTimer) window.clearTimeout(this._idleTimer);
    this._idleTimer = window.setTimeout(() => {
      this._isIdle = true;
      this.totals.idle_periods += 1;
      this._push('idle', { ms: IDLE_THRESHOLD_MS });
    }, IDLE_THRESHOLD_MS);
  }

  _startIdleWatch() {
    this._lastInteractionAt = Date.now();
    this._resetIdleTimer();
  }

  _onMouseMove(e) {
    const now = Date.now();
    if (now - this._lastMouseMoveAt < MOUSEMOVE_SAMPLE_MS) return;
    this._lastMouseMoveAt = now;
    this.totals.mouse_moves += 1;
    if (this._lastMouse) {
      const dx = e.clientX - this._lastMouse.x;
      const dy = e.clientY - this._lastMouse.y;
      this.totals.mouse_distance_px += Math.sqrt(dx * dx + dy * dy);
    }
    this._lastMouse = { x: e.clientX, y: e.clientY };
    this._push('mouse_move', { x: e.clientX, y: e.clientY });
    this._markInteraction();
  }

  _onMouseDown(e) {
    this._markInteraction();
  }

  _onClick(e) {
    this.totals.mouse_clicks += 1;
    const target = _describeTarget(e.target);
    this._push('click', {
      x: e.clientX,
      y: e.clientY,
      target,
      button: e.button,
    });
    this._markInteraction();
  }

  _onKeyDown(e) {
    // Count real key presses, ignore modifier-only.
    if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.totals.key_presses += 1;
    }
    const isUndo = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey;
    const isRedo = (e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y');
    if (isUndo) this.totals.undo_count += 1;
    if (isRedo) this.totals.redo_count += 1;

    const target = _describeTarget(e.target);
    this._push('key', {
      key: _sanitizeKey(e.key),
      mods: _modifierMask(e),
      target,
    });
    this._markInteraction();
  }

  _onPaste(e) {
    this.totals.paste_count += 1;
    let length = 0;
    try {
      const text = e.clipboardData?.getData('text') || '';
      length = text.length;
    } catch {
      /* noop */
    }
    const target = _describeTarget(e.target);
    this._push('paste', { length, target });
    this._markInteraction();
  }

  _onCopy(e) {
    this.totals.copy_count += 1;
    this._push('copy', { target: _describeTarget(e.target) });
    this._markInteraction();
  }

  _onCut(e) {
    this.totals.cut_count += 1;
    this._push('cut', { target: _describeTarget(e.target) });
    this._markInteraction();
  }

  _onScroll(e) {
    const now = Date.now();
    if (now - this._lastScrollAt < SCROLL_SAMPLE_MS) return;
    this._lastScrollAt = now;
    this.totals.scroll_events += 1;
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const viewportH = window.innerHeight || doc.clientHeight || 1;
    const fullH = Math.max(doc.scrollHeight, doc.offsetHeight, 1);
    const depth = Math.min(1, Math.max(0, (scrollTop + viewportH) / fullH));
    if (depth > this.totals.max_scroll_depth) this.totals.max_scroll_depth = depth;
    this._push('scroll', { y: Math.round(scrollTop), depth: Number(depth.toFixed(3)) });
    this._markInteraction();
  }

  _onFocusIn(e) {
    this.totals.focus_changes += 1;
    this._push('focus_in', { target: _describeTarget(e.target) });
    this._markInteraction();
  }

  _onFocusOut(e) {
    this._push('focus_out', { target: _describeTarget(e.target) });
  }

  _onVisibility() {
    this._push('visibility', { state: document.visibilityState });
    if (document.visibilityState === 'hidden') this.flush('visibility');
  }

  _onResize() {
    this._push('resize', { w: window.innerWidth, h: window.innerHeight });
  }

  _onBeforeUnload() {
    this.flush('unload');
  }

  /**
   * Force emit the current buffer as a chunk. Called on timer, unload,
   * size threshold, or submission.
   */
  flush(reason = 'manual') {
    if (!this.events.length && reason !== 'unload' && reason !== 'stop' && reason !== 'submit')
      return;
    const payload = {
      session_id: this.sessionId,
      surface: this.surface,
      chunk_index: this.chunkIndex++,
      chunk_reason: reason,
      chunk_started_ms: this.events[0]?.t ?? 0,
      chunk_ended_ms: this.events[this.events.length - 1]?.t ?? 0,
      event_count: this.events.length,
      events: this.events,
      totals_snapshot: { ...this.totals },
    };
    this.events = [];
    try {
      this.onFlush?.(payload);
    } catch (err) {
      // Never let telemetry break the page.
      if (typeof console !== 'undefined') console.warn('[telemetry] flush failed', err);
    }
  }

  summary() {
    return {
      session_id: this.sessionId,
      surface: this.surface,
      duration_ms: Date.now() - this.startedAt,
      chunks_emitted: this.chunkIndex,
      ...this.totals,
    };
  }
}

// Describe a DOM target tersely: tag + id + first data-telemetry-id + class tail.
function _describeTarget(el) {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName?.toLowerCase?.() || '';
  const id = el.id || null;
  const telemetryId = el.getAttribute?.('data-telemetry-id') || null;
  const role = el.getAttribute?.('role') || null;
  const type = el.getAttribute?.('type') || null;
  const name = el.getAttribute?.('name') || null;
  const ariaLabel = el.getAttribute?.('aria-label') || null;
  return {
    tag,
    id,
    telemetry_id: telemetryId,
    role,
    type,
    name,
    aria_label: ariaLabel ? ariaLabel.slice(0, 64) : null,
  };
}

// Don't leak typed content — only character class.
function _sanitizeKey(key) {
  if (!key) return null;
  if (key.length > 1) return key; // control keys: Enter, Tab, Backspace, ArrowUp etc.
  if (/[a-zA-Z]/.test(key)) return 'a';
  if (/[0-9]/.test(key)) return '1';
  if (/\s/.test(key)) return ' ';
  return '*';
}

function _modifierMask(e) {
  let m = 0;
  if (e.metaKey) m |= 1;
  if (e.ctrlKey) m |= 2;
  if (e.altKey) m |= 4;
  if (e.shiftKey) m |= 8;
  return m;
}
