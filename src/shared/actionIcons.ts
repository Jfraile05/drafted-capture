// Explicit ActionType -> Phosphor component map. Importing the specific icons
// (rather than `import * as Phosphor`) is what lets the bundler tree-shake the
// ~9k-icon package down to the handful we actually render.
import {
  ArrowsLeftRight,
  ArrowsVertical,
  Camera,
  Command,
  CursorClick,
  DotsSixVertical,
  Globe,
  type IconProps,
  Keyboard,
  PlusSquare,
  Timer,
  XSquare,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { ActionType } from './types';

export const ACTION_ICON_COMPONENT: Record<ActionType, ComponentType<IconProps>> = {
  click: CursorClick,
  double_click: CursorClick,
  right_click: CursorClick,
  type: Keyboard,
  key: Command,
  scroll: ArrowsVertical,
  drag: DotsSixVertical,
  navigate: Globe,
  tab_open: PlusSquare,
  tab_close: XSquare,
  tab_switch: ArrowsLeftRight,
  wait: Timer,
  screenshot: Camera,
};
