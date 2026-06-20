import type { Action, ActionType, Step } from '../types';

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

/** Human-readable one-line label for an action. */
export function actionLabel(action: Action): string {
  switch (action.type) {
    case 'click':
      return action.coordinate ? `Click at ${fmtCoord(action.coordinate)}` : 'Click';
    case 'double_click':
      return action.coordinate ? `Double-click at ${fmtCoord(action.coordinate)}` : 'Double-click';
    case 'right_click':
      return action.coordinate ? `Right-click at ${fmtCoord(action.coordinate)}` : 'Right-click';
    case 'type':
      return `Type "${truncate(action.text ?? '', 32)}"`;
    case 'key':
      return `Press ${action.key ?? ''}`;
    case 'scroll':
      return `Scroll ${action.scroll_direction ?? ''}`.trim();
    case 'drag':
      return 'Drag';
    case 'navigate':
      return `Navigate ${action.url ? hostOf(action.url) : ''}`.trim();
    case 'tab_open':
      return `Open tab ${action.url ? hostOf(action.url) : ''}`.trim();
    case 'tab_close':
      return 'Close tab';
    case 'tab_switch':
      return 'Switch tab';
    case 'wait':
      return 'Wait';
    case 'screenshot':
      return 'Screen state';
    default:
      return action.type;
  }
}

export function stepLabel(step: Step): string {
  return actionLabel(step.action);
}

function fmtCoord([x, y]: [number, number]): string {
  return `${Math.round(x)}, ${Math.round(y)}`;
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
