import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
export type Dir = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareAge: number;
  fade: number;
  chaseSpeed: number;
  releaseAt: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  remainder: number;
  screenLeft: number;
  playTime: number;
  desired: Dir;
  heldDirections: Dir[];
  seed: number;
  tileMarks: number[][];
  pointerStarts: Record<number, number>;
  assets: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export const dirs: Dir[] = ["up", "right", "down", "left"];
export const vectors: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Dir): Dir => dirs[(dirs.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  tx,
  ty,
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
});
export const blank = (ch: string) =>
  Array.from({ length: C.GRID_ROWS }, () => ch.repeat(C.GRID_COLS));
export function clone(s: ReadState): FathomState {
  return {
    ...s,
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    drifters: s.drifters.map((d) => ({ ...d })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((i) => ({ ...i })),
    tileMarks: s.tileMarks.map((r) => [...r]),
    pointerStarts: { ...s.pointerStarts },
    heldDirections: [...s.heldDirections],
    assets: s.assets as Record<string, ImageBitmap[]>,
  };
}
export function put(rows: string[], x: number, y: number, ch: string) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
export function tileOf(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function makeMaze(): string[] {
  const a = blank("#").map((r) => r.split(""));
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (let x = 1; x < C.GRID_COLS - 1; x++)
      if (
        [1, 4, 7, 10, 13, 16].includes(y) ||
        [1, 4, 7, 10, 13, 22, 25, 28, 31, 34].includes(x)
      )
        a[y][x] = ".";
  for (let y = 6; y <= 10; y++) for (let x = 15; x <= 20; x++) a[y][x] = "#";
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) a[y][x] = "d";
  a[6][17] = "g";
  for (const y of [5, 11]) for (let x = 13; x <= 22; x++) a[y][x] = ".";
  for (const y of [4, 10]) for (let x = 14; x <= 21; x++) a[y][x] = "#";
  a[7][14] = a[7][21] = "#";
  a[7][0] = a[7][35] = ".";
  return a.map((r) => r.join(""));
}
export function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    fade: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    releaseAt: null,
  };
}
export function roster(depth: number) {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((k, i) => ({
    ...predator(k, 16 + (i % 4), 8),
    state: "den" as const,
    released: false,
    releaseAt: i * C.DEN_RELEASE_GAP,
  }));
}
export function reconcile(s: FathomState) {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown <= 0;
  s.ink.ready = s.ink.cooldown <= 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  for (const b of [s.forager, ...s.predators, ...s.drifters]) tileOf(b);
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state !== "chase"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
export function initial(
  assets: Record<string, ImageBitmap[]> = {},
): FathomState {
  const tiles = makeMaze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: blank("u"),
    forager: { ...center(13, 13), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenLeft: 2,
    playTime: 0,
    desired: "left",
    heldDirections: [],
    seed: 81723,
    tileMarks: Array.from(
      { length: C.GRID_ROWS },
      () => Array(C.GRID_COLS).fill(0) as number[],
    ),
    pointerStarts: {},
    assets,
  });
}
export function screen(s: FathomState, v: Screen) {
  s.screen = v;
  s.menuIndex =
    v === "title"
      ? s.titleIndex
      : v === "paused" || v === "gameover"
        ? 0
        : null;
  s.screenLeft = 2;
  if (v === "playing" && s.playTime === 0) {
    for (const p of s.predators) if (p.releaseAt === 0) p.released = true;
  }
  return s;
}
export function fresh(s: ReadState, depth = 1) {
  const n = initial(s.assets as Record<string, ImageBitmap[]>);
  n.muted = s.muted;
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  if (depth > 1) {
    n.depth = depth;
    n.score = s.score;
    n.lives = s.lives;
    n.predators = roster(depth);
  }
  return screen(reconcile(n), "countdown");
}
