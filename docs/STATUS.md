# Project status

Current milestone:

```text
Milestone 3 — Multiplayer lobby (complete)
```

## Implemented

- shared, typed Socket.IO contracts for room creation, joining, start acknowledgements,
  public lobby state, and consistent lobby errors;
- four-character, human-friendly room codes generated on the server with collision
  avoidance and case-insensitive joining;
- an in-memory NestJS lobby service with a 1–6 player limit, normalized names,
  host authority, room closure after start, and cleanup on disconnect;
- stable random player identities that remain separate from transient Socket.IO
  connection identities;
- Socket.IO room membership and full public lobby-state broadcasts after create,
  join, start, and disconnect changes;
- host transfer to the next player in join order if the host disconnects;
- a responsive Angular home screen for entering a name, creating a room, or joining
  by code;
- a synchronized lobby screen with room code, live player list, host/current-player
  labels, connection feedback, errors, and a host-only start action;
- a development-mode one-player start flow that closes the lobby without yet
  creating or synchronizing authoritative game state;
- server unit coverage for valid, invalid, capacity, authority, identity, and
  disconnection cases, plus real Socket.IO end-to-end coverage with two clients;
- Angular component coverage for the home and host lobby flows and URL selection
  for local development versus same-origin production.

## Verification

Verified on 2026-08-19:

- `npm test` — succeeded; 10 test files and 55 tests passed across all workspaces;
- `npm run lint` — succeeded across all four workspaces with 0 errors;
- `npm run build` — succeeded for both packages, the Angular production build,
  and the NestJS production build; Angular's initial bundle was 224.08 kB raw and
  62.41 kB estimated transfer size;
- `npm run test:e2e --workspace @munchkin-lan/server -- --runInBand` — succeeded;
  2 suites and 3 HTTP/Socket.IO end-to-end tests passed;
- `npm run format:check` — succeeded across the repository.

## Intentional scope limits

- Starting a lobby changes its public status only. Connecting that action to
  `game-engine`, dealing cards, and emitting player-specific `GameView` projections
  remain Milestone 5 work.
- A disconnected socket is removed from its lobby. Persistent sessions, refresh
  recovery, reconnect credentials, and disconnected-player indication remain
  Milestone 4 work.
- The Angular development server connects to port 3000 on the same host. Serving
  Angular and Socket.IO from one production origin remains Milestone 13 work.

## Next

```text
Milestone 4 — Session/reconnect
```

Add resumable player sessions without conflating `sessionToken`, `playerId`,
`socketId`, or room/game identity.
