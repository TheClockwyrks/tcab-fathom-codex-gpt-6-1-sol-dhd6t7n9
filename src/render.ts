import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { type ReadState, type Dir, center } from "./model";
import { menuItems, menuItemRect } from "./debug";
import { flood, distance, lineClear } from "./world";
export const BACKGROUND = "#03060c";
const cyan = "#8df8e5",
  dim = "#527783",
  amber = "#ffad70";
const font = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export function render(s: ReadState, { ctx: c }: RenderApi) {
  c.imageSmoothingEnabled = false;
  const text = (
    t: string,
    x: number,
    y: number,
    size = 14,
    color = cyan,
    align: CanvasTextAlign = "left",
  ) => {
    c.font = `${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(t, x, y);
  };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    color = "#16323c",
  ) => {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const circle = (x: number, y: number, r: number, color: string) => {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  };
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "#00000000");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const image = (
    sheet: string,
    frame: number,
    x: number,
    y: number,
    size = C.TILE,
  ) => {
    const img = s.assets[sheet]?.[frame];
    if (img) c.drawImage(img, x - size / 2, y - size / 2, size, size);
  };
  const facing = (d: Dir) => ({ down: 0, up: 2, left: 4, right: 6 })[d];
  const creature = (
    sheet: string,
    b: { x: number; y: number; dir: Dir },
    moving = true,
  ) =>
    image(
      sheet,
      facing(b.dir) + (moving ? Math.floor(s.simTime * 8) % 2 : 0),
      b.x,
      b.y,
    );
  const amberLight = (x: number, y: number) => {
    glow(x, y, 19, "#ff8b474f");
    c.fillStyle = amber;
    c.beginPath();
    c.arc(x, y, 3, 0, Math.PI * 2);
    c.fill();
  };
  // Tiny suspended particles give the empty water a sense of depth.
  for (let i = 0; i < 74; i++) {
    const x = (i * 193 + 37) % C.STAGE_W,
      y = (i * i * 71 + 23) % C.STAGE_H;
    c.fillStyle = i % 5 === 0 ? "#17313b" : "#0b1a23";
    c.fillRect(x, y, i % 5 === 0 ? 2 : 1, 1);
  }
  const title =
    s.screen === "title" || s.screen === "howto" || s.screen === "gameover";
  const drawTile = (x: number, y: number) => {
    if (s.visibility[y][x] === "u") {
      const b = center(x, y);
      image("trench-walls", 17, b.x, b.y);
      return;
    }
    const t = s.tiles[y][x],
      b = center(x, y);
    let frame = t === "#" ? 0 : t === "g" ? 18 : 16;
    if (t === "#") {
      for (const [i, d] of ["up", "right", "down", "left"].entries()) {
        const [dx, dy] = (
          { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] } as const
        )[d as Dir];
        if (s.tiles[y + dy]?.[x + dx] === "#") frame += 1 << i;
      }
    }
    c.globalAlpha = s.visibility[y][x] === "r" ? 0.24 : 1;
    image("trench-walls", frame, b.x, b.y);
    if (s.plankton[y][x] === "*") {
      c.fillStyle = cyan;
      c.shadowColor = cyan;
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(b.x, b.y, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
  };
  const maze = () => {
    c.fillStyle = BACKGROUND;
    c.fillRect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.save();
    c.beginPath();
    c.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
    c.clip();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) drawTile(x, y);
    glow(s.forager.x, s.forager.y, s.windowRadius, "#2ad5b313");
    for (const d of s.drifters) {
      if (d.lit) image("drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
      amberLight(d.x, d.y);
    }
    for (const p of s.predators)
      if (p.kind === "lanternjaw" && p.state !== "den") amberLight(p.x, p.y);
    c.restore();
    for (const p of s.predators)
      if (p.flaring) {
        c.save();
        c.beginPath();
        c.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
        c.clip();
        for (let y = 0; y < C.GRID_ROWS; y++)
          for (let x = 0; x < C.GRID_COLS; x++)
            if (distance(p, center(x, y)) <= C.FLARE_RADIUS + C.TILE)
              drawTile(x, y);
        c.restore();
      }
    for (const wave of s.pulses) {
      const map = flood(s, wave.ox, wave.oy);
      const color =
        wave.tint === "cyan"
          ? cyan
          : wave.tint === "violet"
            ? "#c6a0ff"
            : "#ff9959";
      c.strokeStyle = color;
      c.shadowColor = color;
      c.shadowBlur = 14;
      c.lineWidth = 2;
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (Math.abs(map[y][x] - wave.front) < 0.8) {
            const b = center(x, y);
            c.globalAlpha = Math.max(0, 1 - Math.abs(map[y][x] - wave.front));
            c.strokeRect(b.x - 13, b.y - 13, 26, 26);
          }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
    }
    for (const d of s.drifters)
      if (
        d.lit &&
        s.predators.some((p) => p.flaring && distance(p, d) <= C.FLARE_RADIUS)
      )
        image("drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
    for (const cloud of s.inkClouds) {
      glow(cloud.x, cloud.y, cloud.radius, "#000108fa");
      circle(cloud.x, cloud.y, cloud.radius, "#17232a");
    }
    for (const p of s.predators) {
      if (p.state === "den") continue;
      if (p.lit) {
        const steady =
          p.alert ||
          (distance(s.forager, p) <= s.visionRadius &&
            lineClear(s, s.forager, p)) ||
          s.predators.some(
            (f) => f.flaring && distance(f, p) <= C.FLARE_RADIUS,
          );
        if (!steady && p.mark > 0) c.globalAlpha = p.mark / C.SONAR_MARK_TIME;
        if (p.kind === "lanternjaw" && p.state === "wander")
          image("lanternjaw", 8 + (Math.floor(s.simTime * 8) % 8), p.x, p.y);
        else creature(p.kind, p);
        c.globalAlpha = 1;
      }
      if (p.alert) {
        const color = p.kind === "gloamfin" ? "#c4a1ff" : "#ffbe83";
        const r = 18 + (1 - p.alertLeft / C.ALERT_TIME) * 38;
        circle(p.x, p.y, r, color);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          line(
            p.x + Math.cos(a) * (r + 4),
            p.y + Math.sin(a) * (r + 4),
            p.x + Math.cos(a) * (r + 12),
            p.y + Math.sin(a) * (r + 12),
            color,
          );
        }
      }
      if (p.flareCharging || p.flaring || p.fade > 0) {
        const frame = p.flareCharging
          ? Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3))
          : p.flaring
            ? 3 +
              Math.min(
                2,
                Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
              )
            : 6 + Math.min(1, Math.floor((0.4 - p.fade) / 0.2));
        image("flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
      }
    }
    glow(s.forager.x, s.forager.y, 45, "#69ffe34a");
    creature("glimmerfin", s.forager, s.forager.moving);
    // The HUD sits outside both fog layers.
    line(64, 74, 1216, 74);
    line(64, 660, 1216, 660);
    text(C.TITLE_TEXT.split("").join(" "), 64, 31, 15);
    text(C.DIVE_LABEL, 64, 56, 11, dim);
    text(String(s.score).padStart(6, "0"), 640, 57, 48, cyan, "center");
    text("PLANKTON", 1110, 28, 11, dim, "right");
    text(String(s.planktonRemaining).padStart(3, "0"), 1110, 55, 22);
    text("M / " + (s.muted ? "MUTED" : "SOUND"), 1216, 26, 10, dim, "right");
    text("P / PAUSE", 1216, 51, 10, dim, "right");
    text(`DEPTH ${s.depth}`, 64, 697, 16);
    for (let i = 0; i < s.lives; i++)
      image("glimmerfin", 6, 238 + i * 28, 689, 24);
    const gauge = (label: string, x: number, cd: number, total: number) => {
      text(label, x, 685, 11, dim);
      c.fillStyle = "#10232d";
      c.fillRect(x, 695, 152, 4);
      c.fillStyle = cd === 0 ? cyan : "#456777";
      c.fillRect(x, 695, 152 * (1 - cd / total), 4);
      text(
        cd === 0 ? "READY" : `${cd.toFixed(1)}s`,
        x + 152,
        685,
        11,
        cd === 0 ? cyan : dim,
        "right",
      );
    };
    gauge("SPACE / SONAR", 450, s.sonar.cooldown, C.SONAR_COOLDOWN);
    gauge("SHIFT / INK", 722, s.ink.cooldown, C.INK_COOLDOWN);
    text("EAT TO GLOW. GLOW TO BE FOUND.", 1216, 697, 11, dim, "right");
  };
  if (!title) maze();
  if (title) {
    text("F / 01", 64, 47, 13, dim);
    text("ABYSSAL EXPLORATION PROGRAM", 1216, 47, 11, dim, "right");
    line(64, 66, 1216, 66);
    // A sonar chart, composed from the actual trench art, introduces the dive.
    const cx = 934,
      cy = 354,
      r = 241;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    glow(cx, cy, r, "#105b5640");
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const b = center(x, y),
          px = b.x + 400,
          py = b.y - 40;
        if (Math.hypot(px - cx, py - cy) > r) continue;
        const t = s.tiles[y][x];
        c.globalAlpha = t === "#" ? 0.35 : 0.5;
        image("trench-walls", t === "#" ? 10 : 16, px, py);
        if (t === "." && (x + y) % 2 === 0) {
          c.fillStyle = "#75e2d6";
          c.fillRect(px - 1, py - 1, 2, 2);
        }
      }
    c.globalAlpha = 1;
    const g = c.createLinearGradient(cx - r, 0, cx + r, 0);
    g.addColorStop(0, BACKGROUND);
    g.addColorStop(0.55, "#02080d00");
    g.addColorStop(1, "#02080d88");
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.restore();
    for (const rad of [80, 160, 241]) circle(cx, cy, rad, "#21434a");
    line(cx - r - 20, cy, cx + r + 20, cy, "#17323b");
    line(cx, cy - r - 20, cx, cy + r + 20, "#17323b");
    c.save();
    c.strokeStyle = "#7af8db";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, r, -1.8, -0.35);
    c.stroke();
    c.restore();
    glow(cx - 36, cy + 40, 90, "#5bffdf35");
    image("glimmerfin", 6, cx - 36, cy + 40, 32);
    amberLight(cx + 93, cy - 68);
    image("lanternjaw", 8 + (Math.floor(s.simTime * 8) % 8), cx + 93, cy - 68);
    image("gloamfin", 4, cx - 97, cy - 80);
    text("36° N / 18° E", cx, 626, 11, dim, "center");
    text("SIGNAL: FAINT", cx, 646, 10, "#709c9f", "center");
    if (s.screen === "title") {
      text("A BIOLUMINESCENT MAZE CHASE", 160, 180, 12, dim);
      c.font = `bold 104px ${font}`;
      c.fillStyle = "#c7fff0";
      c.textAlign = "left";
      c.shadowColor = "#35c9a750";
      c.shadowBlur = 35;
      c.fillText(C.TITLE_TEXT, 152, 290);
      c.shadowBlur = 0;
      text(C.TAGLINE_TEXT, 162, 333, 20, cyan);
      text(
        "Carry a little light into a very deep dark.",
        162,
        377,
        13,
        "#80a0a8",
      );
    } else if (s.screen === "gameover") {
      text("SIGNAL LOST", 160, 233, 48, "#ffb69b");
      text(`FINAL SCORE  ${s.score}`, 160, 302, 22);
      text(`DEPTH ${s.depth} REACHED`, 160, 346, 15, dim);
    }
  }
  if (s.screen === "howto") {
    c.fillStyle = BACKGROUND;
    c.fillRect(100, 100, 620, 540);
    text("FIELD GUIDE / 01", 130, 145, 12, dim);
    text("Read the dark.", 130, 198, 38);
    const rows = [
      ["MOVE", "ARROWS / WASD — swim; release to stop."],
      ["SONAR", "SPACE — map the bends. Sound carries."],
      ["INK", "SHIFT — hide your light from hungry eyes."],
      ["LIGHT", "Eat plankton to grow your circle of vision."],
      ["LANTERNJAW", "Hunts your glow. An amber mote may be bait."],
      ["GLOAMFIN", "Hunts sound. Violet pings hear around corners."],
      ["FLAREFISH", "Its flare sees through stone. Ink breaks its fix."],
    ];
    for (const [i, [name, copy]] of rows.entries()) {
      text(name, 130, 248 + i * 43, 12, i < 4 ? cyan : amber);
      text(copy, 130, 266 + i * 43, 11, "#97b2b8");
    }
    text("P / ESC  PAUSE     M  MUTE", 130, 583, 12, dim);
    text("ENTER / ESC / CLICK  ← BACK", 130, 622, 12, cyan);
  }
  if (
    s.screen === "paused" ||
    s.screen === "gameover" ||
    s.screen === "title"
  ) {
    if (s.screen === "paused") {
      c.fillStyle = "#02080de8";
      c.fillRect(112, 180, 450, 466);
      text("DIVE SUSPENDED", 160, 270, 12, dim);
      text("Hold your breath.", 160, 326, 30);
    }
    for (const [i, item] of menuItems(s).entries()) {
      const rect = menuItemRect(s, i)!;
      const active = i === s.menuIndex;
      c.fillStyle = active ? "#10302e" : "#061219";
      c.fillRect(rect.x, rect.y, rect.w, rect.h);
      c.strokeStyle = active ? "#69cdb3" : "#142b34";
      c.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      text(
        active ? "›" : "·",
        rect.x + 18,
        rect.y + 31,
        22,
        active ? cyan : dim,
      );
      text(item, rect.x + 49, rect.y + 30, 15, active ? "#c7fff0" : dim);
      text(`0${i + 1}`, rect.x + rect.w - 20, rect.y + 29, 10, dim, "right");
    }
  }
  if (s.screen === "countdown" || s.screen === "cleared") {
    c.fillStyle = "#02080dcf";
    c.fillRect(400, 276, 480, 148);
    text(
      s.screen === "countdown" ? "DIVE" : `DEPTH ${s.depth} CLEARED`,
      640,
      327,
      26,
      cyan,
      "center",
    );
    text(
      s.screen === "countdown"
        ? String(Math.ceil(s.screenLeft))
        : "+500 / DESCENDING",
      640,
      382,
      24,
      "#c7fff0",
      "center",
    );
  }
  if (title) {
    line(64, 674, 1216, 674);
    text("↑ ↓ SELECT    ENTER CONFIRM", 64, 704, 11, dim);
    text(
      "LIGHT IS LIFE. LIGHT IS A LIABILITY.",
      640,
      704,
      11,
      "#6f999b",
      "center",
    );
    text(
      "M / " + (s.muted ? "MUTED" : "SOUND ON"),
      1216,
      704,
      11,
      dim,
      "right",
    );
  }
}
