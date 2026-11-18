// The 3D Sidekick, the same Three.js character as the /sidekick page on the
// Drafted site (vendor/sidekick/sidekick-bot.js). Brand loads this file only
// when WebGL works and reduced motion is off; otherwise it shows the flat 2D
// mascot.

import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Sidekick, createSidekick } from '../../vendor/sidekick/sidekick-bot.js';
import type { MascotState } from './Brand';

const FOV = 30;
const CAMERA_Z = 16;
// Sidekick spans about 3.1 by 3.8 units at scale 1 (pods to pods, antenna to shadow).
const BODY_W = 3.4;
const BODY_H = 4.2;

export type Sidekick3DHandle = { boop: () => void; celebrate: () => void };

export default function Sidekick3D({
  state,
  getLook,
  onError,
  ref,
}: {
  state: MascotState;
  /** Where to look, about -1 to 1 each way, or null to look around on its own. */
  getLook: () => { x: number; y: number } | null;
  /** WebGL failed: the caller should show the 2D mascot instead. */
  onError: () => void;
  ref?: Ref<Sidekick3DHandle>;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const botRef = useRef<Sidekick | null>(null);
  // The render loop reads the latest props without restarting.
  const props = useRef({ state, getLook });
  props.current = { state, getLook };

  useImperativeHandle(
    ref,
    () => ({
      boop: () => botRef.current?.boop(),
      celebrate: () => botRef.current?.celebrate(),
    }),
    [],
  );

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      onError();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);
    camera.updateMatrixWorld();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 6);
    scene.add(key);
    const rimMint = new THREE.PointLight(0x00e5a0, 42, 20, 1.6);
    scene.add(rimMint);
    const rimPale = new THREE.PointLight(0xd7ffee, 16, 20, 1.6);
    scene.add(rimPale);
    scene.add(new THREE.AmbientLight(0x88aa99, 0.25));

    const bot = createSidekick();
    botRef.current = bot;
    scene.add(bot.object);

    let w = 0;
    let h = 0;
    let fit = 1;
    const resize = () => {
      const r = box.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      w = r.width;
      h = r.height;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const vh = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      fit = Math.min(vh / BODY_H, (vh * camera.aspect) / BODY_W);
      rimMint.position.set(-3.5 * fit, 1.5 * fit, -2);
      rimPale.position.set(3.5 * fit, -1 * fit, -1.5);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    // Only animate while the page is visible: a side panel can stay open for hours.
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const start = last;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(Math.max((now - last) / 1000, 1 / 240), 0.05);
      last = now;
      t += dt;
      if (w < 1) return;

      // Pop in, then sit centred at the size that fits the box.
      const e = Math.min(1, (now - start) / 1600);
      bot.object.scale.setScalar(
        Math.max(0.0001, fit * (e < 1 ? 1 - (1 - e) ** 3 * Math.cos(e * 7) : 1)),
      );

      const { state: s, getLook: look } = props.current;
      // With no cursor yet, a gentle look around that never turns its back.
      const target = look() ?? {
        x: Math.sin(t * 0.6) * 0.3 + Math.sin(t * 1.7) * 0.06,
        y: Math.cos(t * 0.45) * 0.12 + 0.05,
      };
      bot.update(dt, {
        look: target,
        listening: s === 'watching',
        working: s === 'capturing',
        sleeping: s === 'paused',
      });
      renderer.render(scene, camera);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      bot.dispose();
      botRef.current = null;
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [onError]);

  // The canvas reaches past the mascot's box so the antenna and shadow fit
  // around a full-size head.
  return (
    <span className="relative block h-full w-full">
      <span ref={boxRef} className="pointer-events-none absolute -inset-[30%] block">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      </span>
    </span>
  );
}
