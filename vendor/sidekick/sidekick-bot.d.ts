// Types for the vendored sidekick-bot.js, written by hand for the parts the
// extension uses.
import type { Camera, Group, Object3D } from 'three';

export interface SidekickUpdate {
  look?: { x: number; y: number };
  vx?: number;
  travel?: number;
  working?: boolean;
  listening?: boolean;
  sleeping?: boolean;
  typing?: boolean;
  engaged?: boolean;
  near?: number;
}

export interface Sidekick {
  object: Group;
  head: Object3D;
  update(dt: number, o?: SidekickUpdate): void;
  screenPosition(camera: Camera, w: number, h: number): { x: number; y: number };
  hitTest(x: number, y: number, camera: Camera, w: number, h: number): boolean;
  boop(): void;
  learned(): void;
  proud(): void;
  celebrate(): void;
  worry(): void;
  hop(strength?: number): void;
  land(): void;
  dispose(): void;
}

export function createSidekick(): Sidekick;
