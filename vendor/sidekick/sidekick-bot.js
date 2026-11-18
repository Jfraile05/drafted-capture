/**
 * Vendored from drafted-platform public/sidekick/sidekick-bot.js (1c4eec75, 2026-11-12),
 * unchanged apart from this note. Update it by copying that file again, not by editing it.
 *
 * Sidekick, the Drafted Labs character, as a framework-free Three.js module.
 *
 * One source for every surface: the static /sidekick landing page imports this file
 * directly (bare `three` resolved by its import map), and the React wrapper
 * components/sidekick/Sidekick3D.js imports it through the bundler.
 *
 *   const bot = createSidekick();
 *   scene.add(bot.object);          // place and scale bot.object however you like
 *   bot.update(dt, { look: { x, y } });   // every frame
 *   bot.boop(); bot.learned(); ...  // reactions
 *
 * The host owns placement (position and scale of bot.object), the camera and the look
 * target. Sidekick owns its own body: head turn, blinking, bounce, squash, the antenna
 * rope, ears, eyes, glow and celebrations. The camera is assumed to look down -Z.
 */
import * as THREE from 'three';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = THREE.MathUtils.clamp;

/** Light adds color and writes matching coverage, so glows read right on a transparent canvas. */
export const lightBlend = (m) => Object.assign(m, {
  transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
});

let sharedGlow = null;
/**
 * Soft glow falloff built by hand: color stays pure white and only alpha fades, so the faint
 * edges never turn black (a 2D canvas gradient loses its color there and draws a dark box).
 */
export function glowTexture() {
  if (sharedGlow) return sharedGlow;
  const n = 128, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const fall = r >= 1 ? 0 : (Math.exp(-r * r * 7) * 0.8 + Math.exp(-r * 3.2) * 0.32) * (1 - r * r) ** 2;
    d.set([255, 255, 255, Math.round(Math.min(1, fall) * 255)], (y * n + x) * 4);
  }
  sharedGlow = new THREE.DataTexture(d, n, n);
  sharedGlow.magFilter = sharedGlow.minFilter = THREE.LinearFilter;
  sharedGlow.needsUpdate = true;
  return sharedGlow;
}

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
};

/**
 * Build one Sidekick. Returns the scene object plus `update` and reaction methods.
 * Roughly 3.4 units tall (antenna to shadow) and 3 wide at scale 1, centred on its origin.
 */
export function createSidekick() {
  const glowTex = glowTexture();
  const glow = (scale, opacity = 1, color = 0x00e5a0) => {
    const s = new THREE.Sprite(lightBlend(new THREE.SpriteMaterial({ map: glowTex, color, opacity })));
    s.scale.setScalar(scale); return s;
  };
  // rounded rectangle mask in the visor patch's UV space
  const roundMask = (ix, iy, r) => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(ix * w, iy * h, w - 2 * ix * w, h - 2 * iy * h, r); g.fill();
  });

  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xedf2ef, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.16, sheen: 0.6, sheenColor: new THREE.Color(0xb8ffe6), sheenRoughness: 0.5 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x1b2422, roughness: 0.32, metalness: 0.6, clearcoat: 0.7 });
  const bezel = new THREE.MeshPhysicalMaterial({ color: 0x3a4743, roughness: 0.25, metalness: 0.7, clearcoat: 1, alphaMap: roundMask(0, 0, 120), alphaTest: 0.5 });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x030807, roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.7, alphaMap: roundMask(0.03, 0.075, 104), alphaTest: 0.5 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x5cffc4, toneMapped: false });

  // object: host placement > squash: bounce deformation > rig: hop and lean > head
  const object = new THREE.Group();
  const squash = new THREE.Group(); object.add(squash);
  const rig = new THREE.Group(); squash.add(rig);
  const head = new THREE.Group(); rig.add(head);

  // wide egg head
  const A = 1.34, B = 0.98, C = 1.08;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), ceramic);
  shell.scale.set(A, B, C); head.add(shell);
  const patch = (r) => new THREE.SphereGeometry(r, 96, 48, Math.PI / 2 - 1.02, 2.04, Math.PI / 2 - 0.47, 0.9);
  shell.add(new THREE.Mesh(patch(1.008), bezel));
  shell.add(new THREE.Mesh(patch(1.016), visorMat));

  // sit things on the ellipsoid surface
  const Zup = new THREE.Vector3(0, 0, 1);
  const onHead = (obj, az, el, lift) => {
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const n = new THREE.Vector3(d.x / A, d.y / B, d.z / C).normalize();
    obj.position.set(d.x * A, d.y * B, d.z * C).addScaledVector(n, lift);
    obj.quaternion.setFromUnitVectors(Zup, n);
  };

  // tall oval eyes, with happy arcs for good moments
  const eyeGeo = new THREE.CapsuleGeometry(0.095, 0.2, 8, 24);
  const happyGeo = new THREE.TorusGeometry(0.12, 0.034, 10, 32, Math.PI);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    const pill = new THREE.Mesh(eyeGeo, lightMat); pill.scale.z = 0.3; e.add(pill);
    const happy = new THREE.Mesh(happyGeo, lightMat); happy.position.y = -0.03; happy.visible = false; e.add(happy);
    const g = glow(0.8, 0.5); g.position.z = 0.03; e.add(g);
    e.userData = { s, pill, happy, g };
    head.add(e); return e;
  });

  // round side pods that pulse while it listens
  const ears = [-1, 1].map((s) => {
    const ear = new THREE.Group();
    ear.position.set(s * (A - 0.05), 0.02, 0);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 48), graphite);
    pod.rotation.z = Math.PI / 2; pod.position.x = s * 0.05; ear.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 48), lightMat);
    ring.rotation.y = Math.PI / 2; ring.position.x = s * 0.155; ear.add(ring);
    const halo = glow(0.9, 0); halo.position.x = s * 0.2; ear.add(halo);
    ear.userData = { ring, halo };
    head.add(ear); return ear;
  });

  // top cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.08, 48), graphite); cap.position.y = B - 0.02; head.add(cap);
  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.013, 8, 64), lightMat); capRing.rotation.x = Math.PI / 2; capRing.position.y = B + 0.005; head.add(capRing);

  // Antenna: arcs up and forward so the bulb dangles in front of the face. It is simulated
  // as a short rope (see update), so its tube is rebuilt every frame.
  const antenna = new THREE.Group(); antenna.position.y = B + 0.02; head.add(antenna);
  const REST = [[0, 0, 0], [-0.02, 0.25, 0.04], [-0.07, 0.5, 0.16], [-0.14, 0.68, 0.38], [-0.23, 0.7, 0.66], [-0.3, 0.56, 0.92], [-0.34, 0.32, 1.1], [-0.35, 0.04, 1.2], [-0.35, -0.24, 1.24]].map((p) => new THREE.Vector3(...p));
  const STIFF = [1, 0.85, 0.7, 0.55, 0.42, 0.32, 0.24, 0.19, 0.15]; // firm at the root, loose toward the bulb
  const SEG = REST.slice(1).map((p, i) => p.distanceTo(REST[i]));
  const rope = REST.map(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3() })); // world position now / last frame
  let ropeReady = false;
  const livePts = REST.map((p) => p.clone());
  const curve = new THREE.CatmullRomCurve3(livePts);
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, 0.046, 12), graphite); antenna.add(stalk);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x5cffc4, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 18), bulbMat); antenna.add(bulb);
  // the halo is drawn on top (no depth test) so the head never slices it; it fades when the bulb swings behind
  const bulbGlow = glow(1.5, 0.7), bulbCore = glow(0.5, 1, 0xd7ffee);
  [bulbGlow, bulbCore].forEach((g, i) => { g.material.depthTest = false; g.renderOrder = 10 + i; antenna.add(g); });
  const BULB_ON = new THREE.Color(0x5cffc4), BULB_DIM = new THREE.Color(0x0c3a2c);
  const ropeKick = new THREE.Vector3(); // queued velocity impulse, world axes, head units per second

  // ground shadow + glow
  const shadowTex = canvasTex(256, 128, (g) => {
    const grd = g.createRadialGradient(128, 64, 0, 128, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(2, 0, 0, 1, -128, 0); g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, -1.62, -0.6); object.add(shadow);
  const floorGlow = glow(1, 0.18); floorGlow.scale.set(3.4, 0.55, 1); floorGlow.position.set(0, -1.62, -0.5); object.add(floorGlow);

  // celebration ring
  const burst = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: 0xd7ffee, transparent: true, opacity: 0, toneMapped: false }));
  burst.rotation.x = 1.35; object.add(burst);

  const S = {
    yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, tilt: 0, tiltT: 3,
    blink: 0, blinkT: 1.5, happyUntil: 0, worryUntil: 0, shake: 0,
    spin: 0, spinV: 0, boop: 0, boopV: 0, hopPhase: 0, lean: 0,
    energy: 0, burstT: 1, flash: 0, work: 0, listen: 0, breath: 0, sleep: 0, t: 0,
  };
  const tmpT = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const bulbW = new THREE.Vector3(), headW = new THREE.Vector3();
  const nowMs = () => performance.now();

  /**
   * Advance one frame.
   * @param {number} dt seconds since the last frame (clamp it on the host side)
   * @param {object} [o]
   * @param {{x:number,y:number}} [o.look] where to look, roughly -1..1 each way (x right, y down)
   * @param {number} [o.vx] sideways speed in head units per second, for leaning into a move
   * @param {number} [o.travel] 0..1, how much it is flying somewhere (livelier hops)
   * @param {boolean} [o.working] busy: the antenna light fades on and off
   * @param {boolean} [o.listening] the ears pulse and the head tilts
   * @param {boolean} [o.sleeping] eyes droop, antenna sags
   * @param {boolean} [o.typing] eyes narrow a little, as if reading
   * @param {boolean} [o.engaged] a little extra energy (it is showing something)
   * @param {number} [o.near] 0..1, how close the cursor is: eyes widen
   */
  function update(dt, o = {}) {
    const now = nowMs();
    S.t += dt;
    const t = S.t;
    const look = o.look || { x: 0, y: 0 };
    const travel = o.travel || 0, vx = o.vx || 0, near = o.near || 0;

    S.sleep = damp(S.sleep, o.sleeping ? 1 : 0, 2, dt);
    const lx = Number.isFinite(look.x) ? look.x : 0, ly = Number.isFinite(look.y) ? look.y : 0;
    const tyaw = clamp(lx * 0.95, -0.8, 0.8), tpitch = clamp(ly * 0.7, -0.45, 0.55) + S.sleep * 0.3;
    S.yaw = damp(S.yaw, tyaw, 5, dt);
    S.pitch = damp(S.pitch, tpitch, 5, dt);
    S.eyeX = damp(S.eyeX, clamp(lx * 1.2, -1, 1), 14, dt);
    S.eyeY = damp(S.eyeY, clamp(-ly * 1.2, -1, 1), 14, dt);
    // safety net: a single bad frame must never freeze the head for good
    for (const k of ['yaw', 'pitch', 'roll', 'eyeX', 'eyeY']) if (!Number.isFinite(S[k])) S[k] = 0;

    // a curious head tilt now and then
    S.tiltT -= dt;
    if (S.tiltT <= 0) { S.tilt = [-0.14, 0, 0.12, 0][Math.floor(Math.random() * 4)]; S.tiltT = 2.5 + Math.random() * 4; }

    // spin: the click / celebration move, settling on a full turn
    S.spinV *= Math.exp(-dt * 2.4);
    S.spin += S.spinV * dt;
    S.spin = damp(S.spin, Math.round(S.spin / (Math.PI * 2)) * Math.PI * 2, S.spinV < 1 ? 4 : 0, dt);

    S.shake = Math.max(0, S.shake - dt * 1.6);
    S.listen = damp(S.listen, o.listening ? 1 : 0, 5, dt);
    head.rotation.y = S.yaw + S.spin + Math.sin(t * 32) * 0.22 * S.shake;
    head.rotation.x = S.pitch;
    S.roll = damp(S.roll, -S.yaw * 0.14 + S.tilt * (1 - S.listen) + S.listen * 0.2 + S.sleep * 0.12, 3, dt);
    head.rotation.z = S.roll;

    // bounce: a soft hover hop, livelier while it travels
    const amp = (0.55 + travel * 1.2) * (1 - S.sleep * 0.7);
    S.hopPhase += dt * (2.3 + travel * 5);
    const hop = Math.abs(Math.sin(S.hopPhase));
    const contact = 1 - Math.min(1, hop / 0.22);
    rig.position.y = hop * 0.16 * amp - S.sleep * 0.12;
    S.lean = damp(S.lean, clamp(-vx * 0.035, -0.3, 0.3), 6, dt);
    rig.rotation.z = S.lean;

    S.boopV += (-S.boop * 140 - S.boopV * 9) * dt;
    S.boop += S.boopV * dt;
    const sy = 1 + S.boop * 0.09 - contact * 0.07 * amp + travel * 0.04;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    squash.scale.set(sxz, sy, sxz);
    squash.position.y = (sy - 1) * 0.98; // squash from the bottom, not the middle

    const lift = rig.position.y + squash.position.y;
    shadow.scale.setScalar(1 - lift * 0.35);
    shadow.material.opacity = 0.75 - lift * 0.6;

    /* antenna rope: the root rides on the head; every node keeps its momentum in world
       space, feels a little gravity and is pulled back toward the rest shape. So it trails
       behind each hop, turn and flight, then swings back on its own. */
    object.updateWorldMatrix(true, true);
    const ws = tmpS.setFromMatrixScale(object.matrixWorld).x, N = rope.length;
    // While it pops in from nothing the rope points collapse onto each other, and a tube
    // through identical points has no direction (NaN). Hold the antenna until it has size.
    if (!(ws >= 0.02)) ropeReady = false;
    else {
      const keep = Math.pow(0.9, dt * 60);
      for (let i = 0; i < N; i++) {
        const w = i / (N - 1);
        tmpT.copy(REST[i]); tmpT.y -= S.sleep * 0.35 * w * w; tmpT.z -= S.sleep * 0.15 * w;
        antenna.localToWorld(tmpT);
        const n = rope[i];
        if (!ropeReady || i === 0) { n.p.copy(tmpT); n.q.copy(tmpT); continue; }
        tmpD.subVectors(n.p, n.q).multiplyScalar(keep).addScaledVector(ropeKick, ws * dt * w);
        n.q.copy(n.p);
        n.p.add(tmpD);
        n.p.y -= 2 * ws * dt * dt * w;
        n.p.lerp(tmpT, 1 - Math.pow(1 - STIFF[i], dt * 60));
      }
      ropeReady = true;
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < N; i++) {
          const a = rope[i - 1].p, b = rope[i].p;
          tmpD.subVectors(b, a);
          const len = tmpD.length() || 1e-6;
          tmpD.multiplyScalar(1 - (SEG[i - 1] * ws) / len);
          if (i === 1) b.sub(tmpD); else { a.addScaledVector(tmpD, 0.5); b.addScaledVector(tmpD, -0.5); }
        }
      }
      for (let i = 0; i < N; i++) antenna.worldToLocal(livePts[i].copy(rope[i].p));
      stalk.geometry.dispose();
      stalk.geometry = new THREE.TubeGeometry(curve, 56, 0.046, 12);
    }
    ropeKick.set(0, 0, 0);
    const end = livePts[N - 1];
    bulb.position.copy(end); bulbGlow.position.copy(end); bulbCore.position.copy(end);

    // eyes
    S.blinkT -= dt;
    if (S.blinkT <= 0) { S.blink = 1; S.blinkT = Math.random() < 0.2 ? 0.2 : 2 + Math.random() * 3.5; }
    S.blink = Math.max(0, S.blink - dt * 7);
    const happy = now < S.happyUntil, worry = now < S.worryUntil;
    const lid = 1 - Math.sin(S.blink * Math.PI);
    eyes.forEach((ey) => {
      const { s, pill, happy: hp, g } = ey.userData;
      onHead(ey, s * 0.3 + S.eyeX * 0.2, 0.05 + S.eyeY * 0.12, 0.03);
      pill.visible = !happy; hp.visible = happy;
      const open = worry ? 0.55 : o.typing ? 0.85 : 1 + near * 0.12;
      pill.scale.y = damp(pill.scale.y, Math.max(0.08, lid * open * (1 - S.sleep * 0.85)), 30, dt);
      pill.scale.x = damp(pill.scale.x, 1 + near * 0.1, 10, dt);
      pill.rotation.z = damp(pill.rotation.z, worry ? s * -0.45 : 0, 10, dt);
      g.material.opacity = (0.4 + 0.15 * Math.sin(t * 3 + s)) * (1 - S.sleep * 0.6);
    });
    ears.forEach((ear, i) => {
      ear.scale.setScalar(damp(ear.scale.x, happy ? 1 + 0.14 * Math.sin(t * 18 + i * Math.PI) : 1, 12, dt));
      const wave = 0.5 + 0.5 * Math.sin(t * 9 - i * 0.8);
      ear.userData.ring.scale.setScalar(1 + S.listen * 0.22 * wave);
      ear.userData.halo.material.opacity = S.listen * (0.25 + 0.55 * wave);
    });

    // energy: brighter while celebrating, typing or showing something
    S.energy = damp(S.energy, happy ? 1 : o.typing ? 0.6 : o.engaged ? 0.4 : 0.15, 2.5, dt);
    floorGlow.material.opacity = 0.16 + S.energy * 0.12;
    const pulse = 0.5 + 0.5 * Math.sin(t * (2 + S.energy * 5));
    S.flash = Math.max(0, S.flash - dt * 0.9);
    // The antenna light breathes. Idle: a slow, shallow swell (about 4s). Working: a calm
    // fade fully on and off (about 2s). The pace eases between the two, so it never snaps.
    S.work = damp(S.work, o.working ? 1 : 0, 1.6, dt);
    S.breath += dt * Math.PI * 2 * (0.25 + 0.27 * S.work);
    const b0 = 0.5 - 0.5 * Math.cos(S.breath), breath = b0 * b0 * (3 - 2 * b0);
    const idleLevel = 0.5 + 0.3 * breath, workLevel = 0.1 + 0.9 * breath;
    const level = Math.min(1, (idleLevel + (workLevel - idleLevel) * S.work) * (1 - S.sleep * 0.7) + S.flash * 0.35);
    bulbMat.color.copy(BULB_DIM).lerp(BULB_ON, 0.25 + 0.75 * level);
    bulb.getWorldPosition(bulbW); head.getWorldPosition(headW);
    const inFront = clamp((bulbW.z - headW.z) / (0.5 * (ws || 1)) + 0.6, 0, 1);
    bulbGlow.material.opacity = 0.7 * level * inFront;
    bulbGlow.scale.setScalar(1.2 + 0.55 * level + S.flash * 0.25);
    bulbCore.material.opacity = (0.3 + 0.7 * level) * inFront;
    bulbCore.scale.setScalar(0.44 + level * 0.12);
    bulb.scale.setScalar(0.92 + pulse * 0.14 * (0.4 + S.energy));

    S.burstT = Math.min(1, S.burstT + dt / 1.1);
    burst.scale.setScalar(1 + S.burstT * 2.2);
    burst.material.opacity = (1 - S.burstT) * 0.9;
  }

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const toScreen = (v, camera, w, h) => { v.project(camera); return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h }; };
  /** Where the head is on screen, in CSS pixels of a w by h canvas. */
  function screenPosition(camera, w, h) { head.getWorldPosition(v1); return toScreen(v1, camera, w, h); }
  /** Is a point (CSS pixels within the canvas) on Sidekick's head? An oval sized to the head. */
  function hitTest(x, y, camera, w, h) {
    head.getWorldPosition(v1);
    const unit = tmpS.setFromMatrixScale(object.matrixWorld).x;
    v2.copy(v1).add(new THREE.Vector3(unit, 0, 0));
    const c = toScreen(v1, camera, w, h), e = toScreen(v2, camera, w, h);
    const px = Math.hypot(e.x - c.x, e.y - c.y); // one head unit in pixels
    if (!(px > 0)) return false;
    const nx = (x - c.x) / (px * 1.6), ny = (y - c.y) / (px * 1.25);
    return nx * nx + ny * ny < 1;
  }

  const t0 = () => nowMs();
  return {
    object, head, state: S,
    /** visor point in head space, handy as a beam origin */
    visorPoint: new THREE.Vector3(0, 0.08, C + 0.05),
    update, screenPosition, hitTest,
    /** where the antenna bulb is right now, in world space: the scan beam starts here */
    bulbWorldPosition: (target) => bulb.getWorldPosition(target),
    /** a click or tap: squash, a quick spin, a happy squint */
    boop() { S.boopV = 9; S.happyUntil = t0() + 900; S.spinV += 4; ropeKick.set((Math.random() - 0.5) * 3, 2, 1); },
    /** a small win: a nod and a soft swell of light */
    learned() { S.boopV += 3.5; S.flash = 1; S.happyUntil = Math.max(S.happyUntil, t0() + 380); ropeKick.y += 0.8; },
    /** a bigger win: a spin and a happy squint */
    proud() { S.happyUntil = t0() + 1500; S.spinV += 7; S.flash = 1; S.boopV += 5; ropeKick.y += 1.5; },
    /** the biggest win: a full spin with a ring of light */
    celebrate() { S.happyUntil = t0() + 3600; S.spinV = 15; S.burstT = 0; S.boopV = 8; ropeKick.y += 2.5; },
    /** something went wrong: a frown and a head shake */
    worry() { S.worryUntil = t0() + 900; S.shake = 1; S.boopV = -4; },
    /** waking up or arriving somewhere: a little hop */
    hop(strength = 7) { S.boopV = strength; S.blink = 1; },
    /** landing after a flight: squash down */
    land() { S.boopV -= 6; ropeKick.y -= 1.5; },
    dispose() {
      object.traverse((n) => {
        n.geometry?.dispose?.();
        const m = n.material; if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mat) => { if (mat.map && mat.map !== glowTex) mat.map.dispose(); mat.alphaMap?.dispose?.(); mat.dispose(); });
      });
    },
  };
}
