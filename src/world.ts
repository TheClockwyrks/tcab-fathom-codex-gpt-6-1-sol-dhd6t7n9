import * as C from "./constants";
import {
  type Body,
  type Dir,
  type FathomState,
  type ReadState,
  type Predator,
  dirs,
  vectors,
  opposite,
  center,
  tileOf,
  put,
  reconcile,
  roster,
  screen,
  fresh,
} from "./model";
const down = (t: number, dt = C.TICK_DT) => (t <= dt + 1e-7 ? 0 : t - dt);
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export function neighbor(s: ReadState, x: number, y: number, d: Dir) {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (
    ny === y &&
    (nx < 0 || nx >= C.GRID_COLS) &&
    s.tiles[y]?.[0] === "." &&
    s.tiles[y]?.[C.GRID_COLS - 1] === "."
  )
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return { tx: nx, ty: ny };
}
export function open(s: ReadState, x: number, y: number, den = false) {
  const t = s.tiles[y]?.[x];
  return t === "." || (den && (t === "g" || t === "d"));
}
export function options(s: ReadState, b: Body, den = false) {
  return dirs.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return open(s, n.tx, n.ty, den);
  });
}
export function flood(s: ReadState, tx: number, ty: number, den = false) {
  const out = Array.from(
    { length: C.GRID_ROWS },
    () => Array(C.GRID_COLS).fill(Infinity) as number[],
  );
  if (!open(s, tx, ty, den)) return out;
  out[ty][tx] = 0;
  const q = [{ tx, ty }];
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    for (const d of dirs) {
      const n = neighbor(s, b.tx, b.ty, d);
      if (open(s, n.tx, n.ty, den) && out[n.ty][n.tx] === Infinity) {
        out[n.ty][n.tx] = out[b.ty][b.tx] + 1;
        q.push(n);
      }
    }
  }
  return out;
}
export function lineClear(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  // Grid traversal visits every crossed cell, including thin intersections at
  // corners. The destination rock is a surface the light can illuminate.
  let x = Math.floor((a.x - C.GRID_ORIGIN_X) / C.TILE);
  let y = Math.floor((a.y - C.GRID_ORIGIN_Y) / C.TILE);
  const endX = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  const endY = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const deltaX = dx ? C.TILE / Math.abs(dx) : Infinity;
  const deltaY = dy ? C.TILE / Math.abs(dy) : Infinity;
  let nextX = dx
    ? (C.GRID_ORIGIN_X + (x + (sx > 0 ? 1 : 0)) * C.TILE - a.x) / dx
    : Infinity;
  let nextY = dy
    ? (C.GRID_ORIGIN_Y + (y + (sy > 0 ? 1 : 0)) * C.TILE - a.y) / dy
    : Infinity;
  while (x !== endX || y !== endY) {
    if (s.tiles[y]?.[x] === "#") return false;
    if (Math.abs(nextX - nextY) < 1e-10) {
      // A line through a grid corner must not leak between touching rocks.
      if (s.tiles[y]?.[x + sx] === "#" || s.tiles[y + sy]?.[x] === "#")
        return false;
      x += sx;
      y += sy;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      x += sx;
      nextX += deltaX;
    } else {
      y += sy;
      nextY += deltaY;
    }
  }
  return true;
}

function inked(s: ReadState, a: Body) {
  const b = s.forager,
    dx = b.x - a.x,
    dy = b.y - a.y,
    l = dx * dx + dy * dy;
  return s.inkClouds.some((c) => {
    const t = l
      ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l))
      : 0;
    return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y) <= c.radius;
  });
}
function random(s: FathomState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function wander(s: FathomState, b: Body, den = false): Dir {
  const o = options(s, b, den),
    f = o.filter((d) => d !== opposite(b.dir)),
    pool = f.length ? f : o;
  return pool[Math.floor(random(s) * pool.length)] ?? b.dir;
}
function path(
  s: ReadState,
  b: Body,
  fix: { tx: number; ty: number },
  den = false,
): Dir | null {
  const map = flood(s, fix.tx, fix.ty, den);
  return (
    options(s, b, den)
      .filter((d) => {
        const n = neighbor(s, b.tx, b.ty, d);
        return Number.isFinite(map[n.ty][n.tx]);
      })
      .sort((a, c) => {
        const na = neighbor(s, b.tx, b.ty, a),
          nc = neighbor(s, b.tx, b.ty, c);
        return map[na.ty][na.tx] - map[nc.ty][nc.tx];
      })[0] ?? null
  );
}
const atCenter = (b: Body) => distance(b, center(b.tx, b.ty)) < 1e-5;
/** Integrate to the next center, decide, then spend the remaining distance. */
export function move(
  s: FathomState,
  b: Body,
  speed: number | (() => number),
  choose: () => Dir | null,
  den = false,
) {
  if (!open(s, b.tx, b.ty, den)) return false;
  let left = C.TICK_DT,
    moved = false;
  while (left > 1e-7) {
    if (atCenter(b)) {
      const chosen = choose();
      if (chosen === null) break;
      b.dir = chosen;
      const n = neighbor(s, b.tx, b.ty, b.dir);
      if (!open(s, n.tx, n.ty, den)) break;
    }
    const [dx, dy] = vectors[b.dir];
    const local = dx ? b.x - C.GRID_ORIGIN_X : b.y - C.GRID_ORIGIN_Y;
    const mod = (((local - C.TILE / 2) % C.TILE) + C.TILE) % C.TILE;
    let gap = dx + dy > 0 ? C.TILE - mod : mod;
    if (gap < 1e-5) gap = C.TILE;
    const rate = typeof speed === "number" ? speed : speed();
    const step = Math.min(left * rate, gap);
    b.x += dx * step;
    b.y += dy * step;
    if (b.x < C.GRID_ORIGIN_X) b.x += C.GRID_COLS * C.TILE;
    if (b.x >= C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE)
      b.x -= C.GRID_COLS * C.TILE;
    tileOf(b);
    left -= step / rate;
    moved = true;
  }
  return moved;
}
export function acquire(p: Predator, tx: number, ty: number, always = false) {
  if (p.state !== "chase" || always) {
    if (p.kind !== "lanternjaw") {
      p.alertLeft = C.ALERT_TIME;
      p.alert = true;
    }
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  if (p.flaring) p.fade = 0.4;
  p.state = "chase";
  p.fix = { tx, ty };
  p.linger = C.LINGER_TIME;
  p.flareAge = -1;
  p.flareCharging = p.kind === "flarefish" ? false : null;
  p.flaring = p.kind === "flarefish" ? false : null;
  p.flareRadius = p.kind === "flarefish" ? 0 : null;
}
function drop(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.flareIn = C.FLARE_INTERVAL;
}
export function pulse(
  s: FathomState,
  source: "forager" | "gloamfin",
  owner: number | null = null,
  tint: "cyan" | "violet" | "orange" = "cyan",
) {
  const b = owner === null ? s.forager : s.predators[owner];
  s.pulses.push({
    source,
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: source === "forager" ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
  });
}
export function sense(s: FathomState) {
  const v = s.visibility.map((r) => r.replace(/l/g, "r").split(""));
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const b = center(x, y);
      const passive =
        distance(s.forager, b) <= s.visionRadius && lineClear(s, s.forager, b);
      const flare = flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
      if (passive || flare || s.tileMarks[y][x] > 0) v[y][x] = "l";
    }
  s.visibility = v.map((r) => r.join(""));
  for (const b of [...s.predators, ...s.drifters]) {
    const passive =
      distance(s.forager, b) <= s.visionRadius && lineClear(s, s.forager, b);
    b.lit = passive || flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
    if ("kind" in b) {
      const p = b as Predator;
      p.lit = p.state !== "den" && (p.lit || p.alert || p.mark > 0);
    }
  }
}
export function tick(
  s: FathomState,
  held: boolean,
  events: Set<C.CueName>,
): FathomState {
  s.simTime += C.TICK_DT;
  if (s.screen === "countdown") {
    s.screenLeft -= C.TICK_DT;
    sense(s);
    if (s.screenLeft <= 1e-7) screen(s, "playing");
    return s;
  }
  if (s.screen === "cleared") {
    s.screenLeft -= C.TICK_DT;
    return s.screenLeft <= 1e-7 ? fresh(s, s.depth + 1) : s;
  }
  if (s.screen !== "playing") return s;
  const dt = C.TICK_DT;
  s.playTime += dt;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decay = Math.max(0, dt - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - dt }))
    .filter((c) => c.remaining > 1e-7);
  for (const row of s.tileMarks)
    for (let x = 0; x < row.length; x++) row[x] = Math.max(0, row[x] - dt);
  if (held) {
    if (s.desired === opposite(s.forager.dir)) s.forager.dir = s.desired;
    s.forager.moving = move(s, s.forager, C.FORAGER_SPEED, () =>
      options(s, s.forager).includes(s.desired) ? s.desired : s.forager.dir,
    );
  } else s.forager.moving = false;
  if (s.plankton[s.forager.ty]?.[s.forager.tx] === "*") {
    put(s.plankton, s.forager.tx, s.forager.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    events.add(C.CUES.eat);
    if (!s.planktonRemaining) {
      s.score += C.SCORE_CLEAR;
      events.add(C.CUES.descend);
      return screen(s, "cleared");
    }
  }
  reconcile(s);
  for (const [index, p] of s.predators.entries()) {
    p.alertLeft = down(p.alertLeft);
    p.alert = p.alertLeft > 1e-7;
    p.mark = down(p.mark);
    p.fade = down(p.fade);
    if (p.releaseAt !== null && s.playTime + 1e-7 >= p.releaseAt)
      p.released = true;
    if (!p.mind) continue;
    if (p.state === "den") {
      if (!p.released || !s.tiles.some((r) => r.includes("d"))) continue;
      const gy = s.tiles.findIndex((r) => r.includes("g")),
        gx = gy < 0 ? -1 : s.tiles[gy].indexOf("g");
      if (gx < 0) continue;
      const exit = dirs
        .map((d) => neighbor(s, gx, gy, d))
        .find((n) => open(s, n.tx, n.ty));
      if (!exit) continue;
      if (p.travel) move(s, p, p.speed, () => path(s, p, exit, true), true);
      if (s.tiles[p.ty]?.[p.tx] === ".") p.state = "wander";
      continue;
    }
    if (p.kind === "gloamfin") {
      p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
      p.pingIn = down(p.pingIn);
      p.sincePing += dt;
      if (p.hearingLock) acquire(p, s.forager.tx, s.forager.ty);
      if (
        p.state === "chase" &&
        p.fix &&
        !p.hearingLock &&
        atCenter(p) &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty
      ) {
        p.state = "search";
        p.searchTime = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.searchTime += dt;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
      }
      const special =
        p.state === "search" &&
        !p.searchPing &&
        p.searchTime >= C.GLOAMFIN_SEARCH_DELAY;
      if (
        !p.hearingLock &&
        p.sincePing + 1e-7 >= C.GLOAMFIN_PING_MIN_GAP &&
        (p.pingIn <= 0 || special)
      ) {
        pulse(s, "gloamfin", index, special ? "orange" : "violet");
        p.pingIn = C.GLOAMFIN_PING_INTERVAL;
        p.sincePing = 0;
        if (special) p.searchPing = true;
        events.add(C.CUES.predatorPing);
      }
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * dt) /
            C.GLOAMFIN_RAMP_TIME,
      );
    } else {
      const blind = inked(s, p),
        sees =
          !blind &&
          distance(p, s.forager) <= (p.detectRange ?? 0) &&
          lineClear(s, p, s.forager),
        bloom = !blind && p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS;
      if (blind && p.state === "chase") {
        drop(p);
        p.flareAge = -1;
      } else if (sees || bloom) acquire(p, s.forager.tx, s.forager.ty);
      else if (p.state === "chase") {
        p.linger -= dt;
        if (p.linger <= 0) drop(p);
      }
      if (p.kind === "flarefish" && p.state === "wander") {
        if (p.flareAge < 0) {
          p.flareIn = down(p.flareIn);
          if (p.flareIn <= 0) p.flareAge = 0;
        } else {
          const was = p.flareAge;
          p.flareAge += dt;
          if (was < C.FLARE_CHARGE && p.flareAge + 1e-7 >= C.FLARE_CHARGE)
            events.add(C.CUES.flare);
          if (p.flareAge + 1e-7 >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
            p.flareAge = -1;
            p.flareIn = C.FLARE_INTERVAL;
            p.fade = 0.4;
          }
        }
        p.flareCharging = p.flareAge >= 0 && p.flareAge + 1e-7 < C.FLARE_CHARGE;
        p.flaring = p.flareAge + 1e-7 >= C.FLARE_CHARGE;
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
      }
    }
    reconcile(s);
    if (p.travel) {
      move(
        s,
        p,
        () =>
          p.kind === "gloamfin" && p.state === "chase"
            ? p.chaseSpeed
            : p.state === "search"
              ? C.PREDATOR_SPEED
              : p.speed,
        () => {
          const old = p.dir;
          let d: Dir | null;
          if (p.state === "chase" && p.fix) {
            d = path(s, p, p.fix);
            if (p.tx === p.fix.tx && p.ty === p.fix.ty) {
              if (p.kind === "gloamfin" && !p.hearingLock) {
                p.state = "search";
                p.searchTime = 0;
                p.searchPing = false;
              } else return null;
            }
          } else if (
            p.state === "search" &&
            p.fix &&
            flood(s, p.fix.tx, p.fix.ty)[p.ty][p.tx] >= C.GLOAMFIN_SEARCH_ROAM
          )
            d = path(s, p, p.fix);
          else d = wander(s, p);
          if (
            p.kind === "gloamfin" &&
            p.state === "chase" &&
            d !== null &&
            d !== old &&
            d !== opposite(old)
          )
            p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
          return d;
        },
      );
    }
  }
  for (const wave of s.pulses) {
    const old = wave.front;
    wave.front += C.SONAR_WAVE_SPEED * dt;
    const map = flood(s, wave.ox, wave.oy);
    const hit = (x: number, y: number) =>
      map[y]?.[x] <= wave.front && map[y]?.[x] >= old - 1e-7;
    if (wave.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (hit(x, y)) {
            s.tileMarks[y][x] = C.SONAR_MARK_TIME;
            for (const d of dirs) {
              const n = neighbor(s, x, y, d);
              if (s.tiles[n.ty]?.[n.tx] === "#")
                s.tileMarks[n.ty][n.tx] = C.SONAR_MARK_TIME;
            }
          }
      for (const p of s.predators)
        if (p.state !== "den" && hit(p.tx, p.ty) && p.kind !== "lanternjaw") {
          p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind)
            acquire(p, s.forager.tx, s.forager.ty, true);
        }
    } else if (!wave.caught && hit(s.forager.tx, s.forager.ty)) {
      const p = wave.owner === null ? null : s.predators[wave.owner];
      if (p?.mind && p.state !== "den")
        acquire(p, s.forager.tx, s.forager.ty, true);
      wave.caught = true;
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn <= 1e-7 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const y = s.tiles.findIndex((r) => r.includes("g"));
    if (y >= 0) {
      const x = s.tiles[y].indexOf("g"),
        exit = dirs
          .map((d) => neighbor(s, x, y, d))
          .find((n) => open(s, n.tx, n.ty));
      if (exit) {
        s.drifters.push({
          ...center(x, y),
          dir: "up",
          mind: true,
          travel: true,
          lit: false,
        });
        s.drifterIn = C.DRIFTER_INTERVAL;
      }
    }
  }
  for (const d of s.drifters)
    if (d.mind && d.travel)
      move(
        s,
        d,
        C.DRIFTER_SPEED,
        () => wander(s, d),
        s.tiles[d.ty]?.[d.tx] === "g",
      );
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === s.forager.tx && d.ty === s.forager.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (
    s.predators.some(
      (p) =>
        p.state !== "den" && p.tx === s.forager.tx && p.ty === s.forager.ty,
    )
  ) {
    events.add(C.CUES.caught);
    if (s.lives === 0) return screen(s, "gameover");
    s.lives--;
    s.forager = { ...center(13, 13), dir: "left", moving: false };
    s.desired = "left";
    s.brightness = 0;
    s.brightHold = 0;
    s.predators = roster(s.depth);
    s.drifters = [];
    s.drifterIn = C.DRIFTER_INTERVAL;
    s.pulses = [];
    s.inkClouds = [];
    s.sonar.cooldown = 0;
    s.ink.cooldown = 0;
    s.playTime = 0;
    s.tileMarks = s.tileMarks.map((r) => r.map(() => 0));
    screen(s, "countdown");
  }
  reconcile(s);
  sense(s);
  return s;
}
