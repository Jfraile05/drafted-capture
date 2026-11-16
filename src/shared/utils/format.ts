import type { Action, ActionType, Session, Step } from '../types';

/** Phosphor icon name for an action type (used as a string key by UIs). */
export const ACTION_ICON: Record<ActionType, string> = {
  click: 'CursorClick',
  double_click: 'CursorClick',
  right_click: 'CursorClick',
  type: 'Keyboard',
  key: 'Command',
  scroll: 'ArrowsVertical',
  drag: 'DotsSixVertical',
  navigate: 'Globe',
  tab_open: 'PlusSquare',
  tab_close: 'XSquare',
  tab_switch: 'ArrowsLeftRight',
  wait: 'Timer',
  screenshot: 'Camera',
};

/** Human-readable one-line label for an action. Pass the step's DOM context
 *  to name what was clicked instead of where. */
export function actionLabel(action: Action, dom?: Step['dom']): string {
  const target = targetName(dom);
  const on = target ? ` "${target}"` : '';
  switch (action.type) {
    case 'click':
      return target ? `Click${on}` : 'Click on page';
    case 'double_click':
      return target ? `Double-click${on}` : 'Double-click on page';
    case 'right_click':
      return target ? `Right-click${on}` : 'Right-click on page';
    case 'type':
      return action.text ? `Type "${truncate(action.text, 32)}"` : 'Type';
    case 'key':
      return action.key ? `Press ${action.key}` : 'Press a key';
    case 'scroll':
      return `Scroll ${action.scroll_direction ?? ''}`.trim();
    case 'drag':
      return 'Drag';
    case 'navigate':
      return action.url ? `Go to ${hostOf(action.url)}` : 'Go to page';
    case 'tab_open':
      return action.url ? `Open ${hostOf(action.url)} in a new tab` : 'Open a new tab';
    case 'tab_close':
      return 'Close tab';
    case 'tab_switch':
      return 'Switch tab';
    case 'wait':
      return 'Wait';
    case 'screenshot':
      return 'Screenshot';
    default:
      return action.type;
  }
}

export function stepLabel(step: Step): string {
  return actionLabel(step.action, step.dom);
}

/** Visible name of the element acted on, or null when there is nothing
 *  readable (or the field is sensitive). */
export function targetName(dom: Step['dom'] | undefined): string | null {
  if (!dom || dom.sensitive) return null;
  const raw = (dom.aria_label || dom.text || '').replace(/\s+/g, ' ').trim();
  return raw ? truncate(raw, 40) : null;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function workflowTitle(session: Session): string {
  return session.intent?.trim() || session.segments[0]?.label.trim() || 'Untitled workflow';
}
