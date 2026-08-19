# AGENTS.md

## Project

This repository contains a LAN multiplayer card game inspired by Munchkin.

The application is intended primarily as a learning project and a private LAN game for friends.

Read these files before making architectural or gameplay changes:

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/GAME_RULES.md`
- `docs/ROADMAP.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`

## Role

Act as the primary software engineer for this project.

The user acts as product owner and architecture reviewer.

Do not require the user to implement routine code manually.

When requirements are sufficiently clear:

1. inspect the existing code;
2. design the change;
3. implement it;
4. write/update tests;
5. run tests;
6. run lint;
7. run builds;
8. fix problems;
9. update `docs/STATUS.md`.

Ask the user only when a gameplay/product decision cannot reasonably be inferred.

## Architecture rules

- TypeScript everywhere.
- Angular frontend.
- NestJS backend.
- Socket.IO for realtime communication.
- Server-authoritative game state.
- Never trust calculations from the client.
- Game rules belong in `packages/game-engine`.
- `packages/game-engine` must not depend on Angular, NestJS or Socket.IO.
- Shared network contracts belong in `packages/contracts`.
- Angular must never receive hidden cards belonging to another player.
- Keep game state JSON-serializable.
- Prefer simple architecture over unnecessary abstractions.
- Do not add a database until explicitly requested.
- Do not add Redis, Docker, NgRx, Nx, SSR or authentication unless explicitly requested.
- Use Angular Signals for client-side application state.
- Prefer standalone Angular components.
- Use strict TypeScript.
- Prefer small focused services and functions.
- Avoid `any`.
- Avoid duplicated domain logic between frontend and backend.

## Networking

The final application must work entirely on a local Wi-Fi network.

Production topology:

```text
phone/browser
    |
HTTP + Socket.IO
    |
NestJS
    |
Angular static files + game server
```

NestJS must listen on `0.0.0.0`.

The final user must only need to open:

```text
http://<server-lan-ip>:3000
```

## Game architecture

Clients send intentions/actions, never calculated results.

Example:

GOOD:

```text
PLAY_CARD { cardId }
```

BAD:

```text
ADD_COMBAT_POWER { amount: 5 }
```

The backend verifies the action and `game-engine` calculates its consequences.

## Testing

Game rules require unit tests.

For every important rule, test:

- valid action;
- invalid action;
- relevant edge cases.

Before considering a task complete run:

- tests;
- lint;
- production builds.

## Documentation

After meaningful changes update `docs/STATUS.md`.

If an architectural decision is introduced or changed, record it in `docs/DECISIONS.md`.

Do not silently change requirements documented in `docs/`.
