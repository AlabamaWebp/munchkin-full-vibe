# Munchkin LAN

A mobile-first LAN multiplayer card game inspired by Munchkin, built as a
full-stack learning project. The current build includes the basic game engine,
resumable multiplayer sessions, player-specific game synchronization,
equipment, basic combat and rewards, and a mobile-first game screen.

The project does not include copyrighted Munchkin artwork or card text. Future
development content will use fictional cards and original wording.

## Prerequisites

- Node.js 24.15.0 or newer
- npm 11.12.0 or newer

## Setup and commands

Install every workspace from the repository root:

```bash
npm install
```

Common commands:

```bash
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
```

`npm run dev` uses the root `start-dev.mjs` launcher. On Windows it delegates to
`start-dev.ps1`, which places both servers in a kill-on-close process job.
Pressing `Ctrl+C`, stopping/closing the launcher, or losing either child process
terminates both the Angular and NestJS process trees.

`npm run dev` first builds the two shared packages, then starts:

- Angular at `http://localhost:4200`, also reachable through `127.0.0.1` and the
  computer's LAN address;
- NestJS at `http://localhost:3000`.

The server exposes a project status endpoint at:

```text
GET http://localhost:3000/api/status
```

The final one-port LAN topology, where NestJS serves the production Angular
application at `http://<server-lan-ip>:3000`, is scheduled for Milestone 13.

## Repository layout

```text
munchkin-lan/
├── apps/
│   ├── server/          NestJS 11 application
│   └── web/             Angular 22 standalone application
├── docs/                Product, architecture, rules, roadmap, and status
├── packages/
│   ├── contracts/       Shared serializable transport contracts
│   └── game-engine/     Framework-free TypeScript game engine
├── AGENTS.md
├── package-lock.json
├── package.json
└── README.md
```

## Architecture boundaries

- The server is authoritative; clients will send intentions, not calculated
  outcomes.
- Game rules belong only in `packages/game-engine`.
- Shared network types belong in `packages/contracts`.
- The game engine has no Angular, NestJS, Express, or Socket.IO dependencies.
- Angular uses standalone components and Signals for application state.
- NestJS listens on `0.0.0.0:3000` and owns in-memory lobby and game state.
- A browser can create or join a four-character room, start a match, receive a
  private hand, send basic turn commands, and recover its session after refresh
  or a temporary connection loss.
- Initial game persistence will be in memory only.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/ROADMAP.md](docs/ROADMAP.md) for the planned system and milestones.
