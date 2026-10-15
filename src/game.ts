import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  type FathomState,
  type ReadState,
  dirs,
  clone,
  initial,
  reconcile,
  screen,
  fresh,
} from "./model";
import { debug, menuItems, menuItemRect, type FathomDebugApi } from "./debug";
import { tick, pulse } from "./world";
import { render, BACKGROUND } from "./render";
export { BACKGROUND };
export type {
  FathomState,
  Body,
  Predator,
  Drifter,
  Dir,
  Screen,
  Pulse,
  InkCloud,
} from "./model";
export type { FathomDebugApi } from "./debug";
function returnTitle(s: FathomState) {
  const n = initial(s.assets);
  n.titleIndex = s.titleIndex;
  n.muted = s.muted;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  return screen(n, "title");
}
function confirm(s: FathomState) {
  const i = s.menuIndex ?? 0;
  if (s.screen === "title") {
    s.titleIndex = i;
    return i === 0 ? fresh(s) : screen(s, "howto");
  }
  if (s.screen === "paused")
    return i === 0 ? screen(s, "playing") : i === 1 ? fresh(s) : returnTitle(s);
  if (s.screen === "gameover") return i === 0 ? fresh(s) : returnTitle(s);
  return s;
}
function inputs(s: FathomState, api: UpdateApi) {
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (api.input.pressed("pause")) return screen(s, "paused");
    const held = dirs.filter((d) => api.input.value(d) > 0);
    for (const d of held) if (!s.heldDirections.includes(d)) s.desired = d;
    s.heldDirections = held;
    if (api.input.pressed("a") && s.sonar.ready) {
      pulse(s, "forager");
      s.sonar.cooldown = C.SONAR_COOLDOWN;
      api.audio.play(C.CUES.sonar);
    }
    if (api.input.pressed("b") && s.ink.ready) {
      s.inkClouds.push({
        x: s.forager.x,
        y: s.forager.y,
        radius: C.INK_RADIUS,
        remaining: C.INK_LIFE,
      });
      s.ink.cooldown = C.INK_COOLDOWN;
      api.audio.play(C.CUES.ink);
    }
    return s;
  }
  if (
    s.screen === "paused" &&
    (api.input.pressed("pause") || api.input.pressed("back"))
  )
    return screen(s, "playing");
  if (s.screen === "countdown" || s.screen === "cleared") return s;
  let clicked = false;
  for (const sample of api.input.pointerSamples()) {
    let index = -1;
    for (let i = 0; i < menuItems(s).length; i++) {
      const r = menuItemRect(s, i)!;
      if (
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      )
        index = i;
    }
    if (index >= 0) s.menuIndex = index;
    if (sample.type === "down")
      s.pointerStarts[sample.id] = s.screen === "howto" ? -2 : index;
    if (sample.type === "up") {
      if (
        s.pointerStarts[sample.id] === (s.screen === "howto" ? -2 : index) &&
        (index >= 0 || s.screen === "howto")
      )
        clicked = true;
      delete s.pointerStarts[sample.id];
    }
  }
  if (s.screen === "howto") {
    if (clicked || api.input.pressed("confirm") || api.input.pressed("back"))
      return returnTitle(s);
    return s;
  }
  const count = menuItems(s).length;
  if (api.input.pressed("up"))
    s.menuIndex = ((s.menuIndex ?? 0) + count - 1) % count;
  if (api.input.pressed("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % count;
  if (api.input.pressed("back") && s.screen === "gameover")
    return returnTitle(s);
  if (clicked || api.input.pressed("confirm")) return confirm(s);
  return s;
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    for (const [i, cue] of Object.values(C.CUES).entries())
      api.audio.define(cue, {
        wave: i % 2 ? "sine" : "triangle",
        freq: [820, 420, 130, 260, 170, 90, 660][i],
        freqTo: [1120, 90, 50, 520, 980, 35, 1320][i],
        gain: 0.11,
        durationMs: [70, 420, 360, 300, 500, 650, 700][i],
      });
    const assets: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      Object.entries({
        glimmerfin: 8,
        lanternjaw: 16,
        gloamfin: 8,
        flarefish: 8,
        drifter: 8,
        "flare-bloom": 8,
        "trench-walls": 19,
      }).map(async ([name, count]) => {
        assets[name] = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            api.assets.loadImage(`${name}/${i}.png`),
          ),
        );
      }),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "sonar / ink",
      (s) => `${s.sonar.cooldown.toFixed(2)} / ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`predator ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "none";
      });
    return [initial(assets), debug];
  },
  update(state: ReadState, api, dt) {
    let s = inputs(clone(state), api);
    s.remainder += dt;
    const held = dirs.some((d) => api.input.value(d) > 0);
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder -= C.TICK_DT;
      const events = new Set<C.CueName>();
      s = tick(s, held, events);
      for (const cue of events) api.audio.play(cue);
    }
    return reconcile(s);
  },
  render,
};
