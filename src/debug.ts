import * as C from "./constants";
import {
  type ReadState,
  type FathomState,
  type Screen,
  type Dir,
  clone,
  initial,
  reconcile,
  roster,
  center,
  blank,
  put,
  predator,
  dirs,
} from "./model";
export function menuItems(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuItemRect(s: ReadState, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  return { x: 160, y: 418 + index * 62, w: 352, h: 48 };
}
function assert(v: unknown, message = "Invalid debug pose"): asserts v {
  if (!v) throw new RangeError(message);
}
function number(n: number, min = 0, max = Infinity, whole = false) {
  assert(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!whole || Number.isInteger(n)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  assert((den ? ".dg" : ".").includes(s.tiles[y][x]));
}
function direction(d: Dir) {
  assert(dirs.includes(d));
}
function pose(s: ReadState, fn: (n: FathomState) => void) {
  const n = clone(s);
  fn(n);
  return reconcile(n);
}
function pred(s: FathomState, index: number) {
  number(index, 0, s.predators.length - 1, true);
  return s.predators[index];
}
function drift(s: FathomState, index: number) {
  number(index, 0, s.drifters.length - 1, true);
  return s.drifters[index];
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) => ({
    ...initial(s.assets as Record<string, ImageBitmap[]>),
    muted: s.muted,
  }),
  snapshot(s: ReadState) {
    const n = clone(s);
    return {
      version: n.version,
      screen: n.screen,
      menuIndex: n.menuIndex,
      titleIndex: n.titleIndex,
      depth: n.depth,
      score: n.score,
      lives: n.lives,
      muted: n.muted,
      planktonRemaining: n.planktonRemaining,
      drifterIn: n.drifterIn,
      brightness: n.brightness,
      brightHold: n.brightHold,
      visionRadius: n.visionRadius,
      windowRadius: n.windowRadius,
      sonar: n.sonar,
      ink: n.ink,
      grid: n.grid,
      tiles: n.tiles,
      plankton: n.plankton,
      visibility: n.visibility,
      forager: n.forager,
      drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: n.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
      inkClouds: n.inkClouds,
      simTime: n.simTime,
    };
  },
  reconcile: (s: ReadState) => reconcile(clone(s)),
  setScreen: (s: ReadState, value: Screen) => {
    assert(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(value),
    );
    const n = clone(s);
    n.screen = value;
    n.menuIndex =
      value === "title"
        ? n.titleIndex
        : value === "paused" || value === "gameover"
          ? 0
          : null;
    n.screenLeft = 2;
    if (value === "playing" && s.screen !== "paused") n.playTime = 0;
    return n;
  },
  setMenuIndex: (s: ReadState, index: number) => {
    number(index, 0, menuItems(s).length - 1, true);
    return pose(s, (n) => {
      n.menuIndex = index;
    });
  },
  setTitleIndex: (s: ReadState, index: number) => {
    number(index, 0, C.TITLE_ITEMS.length - 1, true);
    return pose(s, (n) => {
      n.titleIndex = index;
    });
  },
  menuItemRect,
  setScore: (s: ReadState, n: number) => {
    number(n, 0, Infinity, true);
    return pose(s, (v) => {
      v.score = n;
    });
  },
  setLives: (s: ReadState, n: number) => {
    number(n, 0, Infinity, true);
    return pose(s, (v) => {
      v.lives = n;
    });
  },
  setDepth: (s: ReadState, n: number) => {
    number(n, 1, Infinity, true);
    return pose(s, (v) => {
      v.depth = n;
      v.predators = roster(n);
      v.playTime = 0;
    });
  },
  setMaze: (s: ReadState, rows: readonly string[]) => {
    assert(
      rows.length === C.GRID_ROWS &&
        rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
    );
    const all = rows.join("");
    assert(!/[dg]/.test(all) || all.split("g").length === 2);
    return pose(s, (n) => {
      n.tiles = [...rows];
    });
  },
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) => {
    tile(s, x, y);
    assert(typeof present === "boolean");
    return pose(s, (n) => put(n.plankton, x, y, present ? "*" : "-"));
  },
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = blank("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = blank("u");
      n.tileMarks = n.tileMarks.map((r) => r.map(() => 0));
    }),
  setForagerTile: (s: ReadState, x: number, y: number) => {
    tile(s, x, y);
    return pose(s, (n) => {
      Object.assign(n.forager, center(x, y), { moving: false });
    });
  },
  setForagerDir: (s: ReadState, d: Dir) => {
    direction(d);
    return pose(s, (n) => {
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    });
  },
  setBrightness: (s: ReadState, g: number) => {
    number(g, 0, 1);
    return pose(s, (n) => {
      n.brightness = g;
    });
  },
  setBrightHold: (s: ReadState, t: number) => {
    number(t, 0, C.BRIGHT_HOLD);
    return pose(s, (n) => {
      n.brightHold = t;
    });
  },
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, k: C.PredatorKind, x: number, y: number) => {
    assert(C.DEN_ORDER.includes(k));
    tile(s, x, y);
    return pose(s, (n) => {
      n.predators.push(predator(k, x, y));
    });
  },
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) => {
    tile(s, x, y, true);
    return pose(s, (n) => Object.assign(pred(n, i), center(x, y)));
  },
  setPredatorDir: (s: ReadState, i: number, d: Dir) => {
    direction(d);
    return pose(s, (n) => {
      pred(n, i).dir = d;
    });
  },
  setPredatorState: (s: ReadState, i: number, v: "den" | "wander" | "chase") =>
    pose(s, (n) => {
      assert(["den", "wander", "chase"].includes(v));
      const p = pred(n, i);
      assert(
        v === "den"
          ? "dg".includes(n.tiles[p.ty][p.tx])
          : n.tiles[p.ty][p.tx] === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    }),
  setPredatorReleased: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      assert(typeof v === "boolean");
      pred(n, i).released = v;
    }),
  setPredatorMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      assert(typeof v === "boolean");
      pred(n, i).mind = v;
    }),
  setPredatorTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      assert(typeof v === "boolean");
      pred(n, i).travel = v;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) => {
    tile(s, x, y);
    return pose(s, (n) => {
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    });
  },
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      assert(typeof v === "boolean");
      drift(n, i).mind = v;
    }),
  setDrifterTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      assert(typeof v === "boolean");
      drift(n, i).travel = v;
    }),
  setDrifterIn: (s: ReadState, t: number) => {
    number(t, 0, C.DRIFTER_INTERVAL);
    return pose(s, (n) => {
      n.drifterIn = t;
    });
  },
  setSonarCooldown: (s: ReadState, t: number) => {
    number(t);
    return pose(s, (n) => {
      n.sonar.cooldown = t;
    });
  },
  setInkCooldown: (s: ReadState, t: number) => {
    number(t);
    return pose(s, (n) => {
      n.ink.cooldown = t;
    });
  },
};
export type FathomDebugApi = typeof debug;
