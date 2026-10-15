# Fathom

A bioluminescent deep-sea maze chase. Graze the trench's plankton, read the dark with sonar, and escape three hunters: the light-seeking Lanternjaw, the sound-seeking Gloamfin, and the Flarefish.

This is the **Kindle** dive. Your circular window grows as you eat. Explored corridors remain remembered, but disappear into darkness beyond that window. Clear every mote to descend; deeper mazes bring more hunters and shorter sonar reach.

## Run locally

Requires a current Node.js release supported by Vite.

```sh
npm ci
npm run dev
```

## Build and serve

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve it at a server root or under a sub-path; assets resolve relative to the page. No backend, remote fonts, credentials, or runtime services are needed.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Swim while held; buffer turns at junctions |
| Space | Sonar pulse |
| Shift | Ink cloud |
| P / Escape | Pause / resume |
| M | Mute |
| Up / Down | Select a menu item |
| Enter / Space | Confirm |
| Escape | Back |
| Pointer / touch | Select and activate menus |
| Backtick | Engine diagnostics |

The engine also provides a four-way pad and sonar/ink buttons on touch devices. Sonar reveals passages around corners, but a Gloamfin can hear it. Ink blinds light hunters; it cannot stop hearing. An amber glimmer could be a bonus drifter or a disguised Lanternjaw.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the actual engine over a headless canvas and a controlled clock. They cover maze constraints, immutable debug poses, movement, fixed-step timing, screens, pointer menus, fog and blackout, sonar, ink, hunter behavior, lives, and descent.

`src/game.ts` registers the engine integration. `model.ts` defines state and maze construction, `world.ts` implements the render-free simulation, `debug.ts` supplies scenario poses and snapshots, and `render.ts` draws the game. The debug API is available through the engine handle only; nothing is installed on the browser window.

The captured presentation is in [showcase/showcase.md](showcase/showcase.md).
