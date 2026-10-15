import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type FathomState, type FathomDebugApi } from "./game";
import * as C from "./constants";
import { center, dirs, type ReadState } from "./model";
import { flood, neighbor, options } from "./world";
const engines: Engine<FathomState, FathomDebugApi>[] = [];
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => new Response(url));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(new URL("../" + (await blob.text()), import.meta.url).pathname),
  );
});
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});
async function setup(step = 1000 / C.TICK_HZ) {
  const events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
      origin: () => ({ x: 0, y: 0 }),
    },
  });
  await e.initialize();
  engines.push(e);
  const key = (code: string, down = true) => {
    const ev = new Event(down ? "keydown" : "keyup");
    Object.assign(ev, { code, repeat: false });
    events.dispatchEvent(ev);
  };
  const pose = (f: (s: ReadState, d: FathomDebugApi) => FathomState) =>
    e.apply((s) => f(s, e.debug));
  const pointer = (type: string, x: number, y: number, id = 1) => {
    const ev = new Event(type);
    Object.assign(ev, {
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    });
    events.dispatchEvent(ev);
  };
  return { e, key, pose, pointer, canvas };
}
function corridor(y = 3) {
  const a = Array.from({ length: C.GRID_ROWS }, () => "#".repeat(C.GRID_COLS));
  a[y] = "#" + ".".repeat(C.GRID_COLS - 2) + "#";
  return a;
}
async function fixture() {
  const h = await setup();
  h.pose((s, d) => d.setMaze(s, corridor()));
  h.pose((s, d) => d.clearPredators(s));
  h.pose((s, d) => d.clearPlankton(s));
  h.pose((s, d) => d.clearFog(s));
  h.pose((s, d) => d.setForagerTile(s, 4, 3));
  h.pose((s, d) => d.setScreen(s, "playing"));
  return h;
}
describe("maze and state contract", () => {
  it("lays out a connected symmetric maze with no dead ends or wide corridors and conforming proportions", async () => {
    const { e } = await setup();
    const s = e.state;
    const cells = [];
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x],
          mirror = s.tiles[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t !== ".") continue;
        cells.push({ tx: x, ty: y });
        expect(
          options(s, { ...center(x, y), dir: "up" }).length,
        ).toBeGreaterThanOrEqual(2);
        expect(
          [
            s.tiles[y]?.[x + 1],
            s.tiles[y + 1]?.[x],
            s.tiles[y + 1]?.[x + 1],
          ].every((t) => t === "."),
        ).toBe(false);
      }
    const map = flood(s, cells[0].tx, cells[0].ty);
    expect(cells.every((b) => Number.isFinite(map[b.ty][b.tx]))).toBe(true);
    const openness =
      cells.reduce(
        (n, b) => n + options(s, { ...center(b.tx, b.ty), dir: "up" }).length,
        0,
      ) / cells.length;
    expect(openness).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(openness).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(cells.length / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    const two = new Set(
      cells
        .filter(
          (b) => options(s, { ...center(b.tx, b.ty), dir: "up" }).length === 2,
        )
        .map((b) => b.ty * C.GRID_COLS + b.tx),
    );
    const lengths = [];
    while (two.size) {
      const first = two.values().next().value!;
      two.delete(first);
      const q = [first];
      for (const k of q)
        for (const d of dirs) {
          const b = neighbor(
              s,
              k % C.GRID_COLS,
              Math.floor(k / C.GRID_COLS),
              d,
            ),
            nk = b.ty * C.GRID_COLS + b.tx;
          if (two.delete(nk)) q.push(nk);
        }
      lengths.push(q.length);
    }
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(s.planktonRemaining).toBe(cells.length);
    expect(s.visibility.every((r) => /^u+$/.test(r))).toBe(true);
  });
  it("poses immutably, reconciles without sensing, rejects invalid arguments, and resets completely", async () => {
    const { e, pose } = await setup();
    const before = e.debug.snapshot(e.state);
    pose((s, d) => d.setBrightness(s, 1));
    expect(before.brightness).toBe(0);
    expect(e.state.windowRadius).toBe(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN,
    );
    pose((s, d) => d.reconcile(s));
    expect(e.state.visibility.every((r) => /^u+$/.test(r))).toBe(true);
    expect(() => e.debug.setMaze(e.state, ["bad"])).toThrow();
    expect(() => e.debug.setLives(e.state, -1)).toThrow();
    expect(() => e.debug.setPredatorMind(e.state, 30, false)).toThrow();
    pose((s, d) => d.setDepth(s, 9));
    expect(e.state.predators).toHaveLength(6);
    expect(e.state.sonar.range).toBe(C.SONAR_RANGE_MIN);
    pose((s, d) => d.reset(s));
    expect(e.debug.snapshot(e.state)).toEqual(before);
  });
});
describe("fixed-step play", () => {
  it("moves at the specified speed, stops on release, reverses midtile and cannot cross rock", async () => {
    const { e, key } = await fixture();
    const x = e.state.forager.x;
    key("ArrowRight");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(x + 16);
    key("ArrowRight", false);
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(x + 16);
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(x);
    await e.advance(120);
    expect(e.state.forager.tx).toBe(1);
    expect(e.state.forager.x).toBeGreaterThanOrEqual(center(1, 3).x);
  });
  it("buffers a perpendicular turn until the junction center", async () => {
    const { e, key, pose } = await fixture();
    const map = corridor();
    map[2] = map[2].slice(0, 5) + "." + map[2].slice(6);
    pose((s, d) => d.setMaze(s, map));
    key("ArrowRight");
    await e.advance(10);
    key("ArrowRight", false);
    key("ArrowUp");
    await e.advance(20);
    expect(e.state.forager.x).toBeCloseTo(center(5, 3).x);
    await e.advance(15);
    expect(e.state.forager.y).toBeLessThan(center(5, 3).y);
  });
  it("uses the same ticks under uneven and uniform frame deltas", async () => {
    const a = await fixture(),
      b = await fixture();
    b.e.setClock(new SequenceClock([5, 20, 25]));
    a.key("ArrowRight");
    b.key("ArrowRight");
    await a.e.advance(120);
    await b.e.advance(60);
    expect(a.e.debug.snapshot(a.e.state)).toEqual(
      b.e.debug.snapshot(b.e.state),
    );
  });
  it("eats exactly once, holds brightness, then decays on the half-life", async () => {
    const { e, pose } = await fixture();
    pose((s, d) => d.setPlankton(s, 4, 3, true));
    pose((s, d) => d.setPlankton(s, 20, 3, true));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON);
    expect(e.state.brightness).toBe(C.BRIGHT_PER_EAT);
    await e.advance(120);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    await e.advance(108);
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2);
  });
  it("keeps an empty posed maze in play but descends after the last mote is eaten", async () => {
    const { e, pose } = await fixture();
    await e.advance(5);
    expect(e.state.screen).toBe("playing");
    pose((s, d) => d.setPlankton(s, 4, 3, true));
    await e.advance(1);
    expect(e.state.screen).toBe("cleared");
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    await e.advance(240);
    expect(e.state.depth).toBe(2);
    expect(e.state.screen).toBe("countdown");
  });
  it("wraps continuously with one tile of travel between mouth centers", async () => {
    const { e, pose, key } = await fixture();
    const map = corridor();
    map[3] = ".".repeat(C.GRID_COLS);
    pose((s, d) => d.setMaze(s, map));
    pose((s, d) => d.setForagerTile(s, 0, 3));
    key("ArrowLeft");
    await e.advance(30);
    expect(e.state.forager.x).toBeCloseTo(center(35, 3).x);
    expect(e.state.forager.tx).toBe(35);
  });
});
describe("sensing and hunters", () => {
  it("remembers light, reveals the first rock and leaves ground beyond it dark", async () => {
    const { e } = await fixture();
    await e.advance(1);
    expect(e.state.visibility[3][4]).toBe("l");
    expect(e.state.visibility[2][4]).toBe("l");
    expect(e.state.visibility[1][4]).toBe("u");
  });
  it("sends sonar around corners, keeps amber bodies unmarked, and alerts sound hunters on arrival", async () => {
    const { e, pose, key } = await fixture();
    pose((s, d) => d.addPredator(s, "gloamfin", 10, 3));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    pose((s, d) => d.addPredator(s, "lanternjaw", 10, 3));
    pose((s, d) => d.setPredatorTravel(s, 1, false));
    key("Space");
    await e.advance(1);
    expect(e.state.predators[0].alert).toBe(false);
    await e.advance(52);
    expect(e.state.predators[0].alert).toBe(true);
    expect(e.state.predators[0].lit).toBe(true);
    expect(e.state.predators[1].mark).toBe(0);
    expect(e.state.sonar.cooldown).toBeGreaterThan(0);
  });
  it("ink drops a light fix immediately while hearing ignores ink and stone", async () => {
    const { e, pose, key } = await fixture();
    pose((s, d) => d.addPredator(s, "lanternjaw", 7, 3));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    pose((s, d) => d.addPredator(s, "gloamfin", 6, 3));
    pose((s, d) => d.setPredatorTravel(s, 1, false));
    await e.advance(1);
    expect(e.state.predators[1].hearingLock).toBe(true);
    expect(e.state.predators[1].state).toBe("chase");
  });
  it("releases on live play alone and freezes the complete world while paused", async () => {
    const { e, key } = await setup();
    key("Enter");
    await e.advance(120);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.predators.every((p) => !p.released)).toBe(true);
    await e.advance(120);
    expect(e.state.screen).toBe("playing");
    expect(e.state.predators[0].released).toBe(true);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("paused");
    const before = e.debug.snapshot(e.state);
    await e.advance(60);
    const after = e.debug.snapshot(e.state);
    expect({ ...after, simTime: before.simTime }).toEqual(before);
    key("Escape", false);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
  });
  it("costs one reserve on contact, preserves eaten plankton and fog, and ends the last attempt", async () => {
    const { e, pose } = await fixture();
    pose((s, d) => d.setScore(s, 150));
    pose((s, d) => d.addPredator(s, "lanternjaw", 4, 3));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.lives).toBe(C.START_LIVES - 1);
    expect(e.state.score).toBe(150);
    expect(e.state.screen).toBe("countdown");
    pose((s, d) => d.setLives(s, 0));
    pose((s, d) => d.setForagerTile(s, 4, 3));
    pose((s, d) => d.clearPredators(s));
    pose((s, d) => d.addPredator(s, "gloamfin", 4, 3));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    pose((s, d) => d.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
  });
  it("admits drifters only while food remains and respects the cap", async () => {
    const { e, pose } = await fixture();
    pose((s, d) => d.setMaze(s, e.debug.reset(s).tiles));
    pose((s, d) => d.setForagerTile(s, 13, 13));
    pose((s, d) => d.setPlankton(s, 1, 1, true));
    pose((s, d) => d.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    pose((s, d) => d.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(2);
    pose((s, d) => d.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(C.DRIFTER_MAX);
  });
});
describe("screens and pointer menus", () => {
  it("remembers the confirmed title selection, supports how-to by pointer, and resets a restarted dive", async () => {
    const { e, key, pose, pointer } = await setup();
    key("ArrowDown");
    await e.advance(1);
    key("ArrowDown", false);
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    expect(e.state.screen).toBe("howto");
    expect(e.state.titleIndex).toBe(1);
    pointer("pointerdown", 800, 500);
    pointer("pointerup", 800, 500);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    pose((s, d) => d.setMenuIndex(s, 0));
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    await e.advance(240);
    pose((s, d) => d.setScore(s, 1234));
    key("KeyP");
    await e.advance(1);
    key("KeyP", false);
    key("ArrowDown");
    await e.advance(1);
    key("ArrowDown", false);
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toBe(0);
    expect(e.state.lives).toBe(C.START_LIVES);
  });
  it("requires both pointer edges within the same item and uses reported hit regions", async () => {
    const { e, pointer } = await setup();
    const a = e.debug.menuItemRect(e.state, 0)!,
      b = e.debug.menuItemRect(e.state, 1)!;
    pointer("pointerdown", a.x + 10, a.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    pointer("pointerdown", b.x + 10, b.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    expect(e.debug.menuItemRect(e.state, 0)).toBeNull();
  });
  it("mirrors mute on every screen without suppressing event emission", async () => {
    const { e, key, pose } = await fixture();
    const cues: string[] = [];
    e.events.on("cue:played", (ev) => cues.push(ev.cue));
    key("KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    key("Space");
    await e.advance(1);
    expect(cues).toContain(C.CUES.sonar);
    pose((s, d) => d.setScreen(s, "title"));
    key("KeyM", false);
    key("KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(false);
  });
});
describe("hunter timing, fixtures and Kindle blackout", () => {
  it("lights and remembers a flare through rock, then blacks it out beyond the window", async () => {
    const { e, pose, canvas } = await fixture();
    const map = corridor();
    map[3] = map[3].slice(0, 15) + "#" + map[3].slice(16);
    pose((s, d) => d.setMaze(s, map));
    pose((s, d) => d.setForagerTile(s, 4, 3));
    pose((s, d) => d.addPredator(s, "flarefish", 20, 3));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(840);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(60);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.visibility[3][20]).toBe("l");
    expect(e.state.visibility[2][20]).toBe("l");
    const b = center(20, 3);
    const lit = canvas.getContext("2d").getImageData(b.x, b.y, 1, 1).data;
    await e.advance(170);
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.visibility[3][20]).toBe("r");
    const dark = canvas.getContext("2d").getImageData(b.x, b.y, 1, 1).data;
    expect(lit[0] + lit[1] + lit[2]).toBeGreaterThan(
      dark[0] + dark[1] + dark[2],
    );
    expect([...dark.slice(0, 3)]).toEqual([3, 6, 12]);
  });
  it("takes a flare lock through rock, ends the bloom and emits an acquisition alert", async () => {
    const { e, pose } = await fixture();
    const map = corridor();
    map[3] = map[3].slice(0, 7) + "#" + map[3].slice(8);
    pose((s, d) => d.setMaze(s, map));
    pose((s, d) => d.addPredator(s, "flarefish", 9, 3));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(902);
    const p = e.state.predators[0];
    expect(p.state).toBe("chase");
    expect(p.alert).toBe(true);
    expect(p.flaring).toBe(false);
    expect(p.detectRange).toBe(C.LANTERN_RANGE_BASE);
  });
  it("searches a stale sound fix and emits one orange ping before giving up", async () => {
    const { e, pose } = await fixture();
    pose((s, d) => d.setForagerTile(s, 10, 3));
    pose((s, d) => d.addPredator(s, "gloamfin", 4, 3));
    pose((s, d) => d.setPredatorState(s, 0, "chase"));
    pose((s, d) => d.setForagerTile(s, 25, 3));
    await e.advance(220);
    expect({
      state: e.state.predators[0].state,
      x: e.state.predators[0].x,
      fix: e.state.predators[0].fix,
    }).toEqual({
      state: "search",
      x: expect.any(Number),
      fix: { tx: 10, ty: 3 },
    });
    const orange = new Set<number>();
    for (let i = 0; i < 650; i++) {
      await e.advance(1);
      for (const p of e.state.pulses) if (p.tint === "orange") orange.add(p.ox);
    }
    expect(orange.size).toBe(1);
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("holds closed and isolated fixture bodies, even with a running mind", async () => {
    const { e, pose, key } = await fixture();
    const map = Array.from({ length: C.GRID_ROWS }, () =>
      "#".repeat(C.GRID_COLS),
    );
    map[3] = map[3].slice(0, 4) + "." + map[3].slice(5);
    pose((s, d) => d.setMaze(s, map));
    key("ArrowRight");
    await e.advance(40);
    expect(e.state.forager.x).toBe(center(4, 3).x);
    expect(e.state.forager.moving).toBe(false);
    pose((s, d) => d.setMaze(s, corridor()));
    pose((s, d) => d.addPredator(s, "lanternjaw", 12, 3));
    pose((s, d) => d.setMaze(s, map));
    const x = e.state.predators[0].x;
    await e.advance(120);
    expect(e.state.predators[0].x).toBe(x);
  });
  it("respects mind and travel separately, and eats drifters regardless of either flag", async () => {
    const { e, pose } = await fixture();
    pose((s, d) => d.addPredator(s, "gloamfin", 6, 3));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    await e.advance(5);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].hearingLock).toBe(false);
    pose((s, d) => d.setPredatorMind(s, 0, true));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].hearingLock).toBe(true);
    expect(e.state.predators[0].x).toBe(center(6, 3).x);
    pose((s, d) => d.spawnDrifter(s, 4, 3));
    pose((s, d) => d.setDrifterMind(s, 0, false));
    pose((s, d) => d.setDrifterTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(0);
    expect(e.state.score).toBe(C.SCORE_DRIFTER);
  });
});
