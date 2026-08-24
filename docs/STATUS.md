# Project status

Status date: 2026-08-24
Current baseline: schema-5 V2 game is ready for internal LAN live playtesting;
single-origin production packaging and real-device validation remain.

## Working systems

- TypeScript npm-workspaces monorepo with Angular 22 frontend, NestJS 11 server,
  Socket.IO, shared contracts, and a framework-independent game engine.
- In-memory rooms with short codes, host controls, 1–6 players, pre-game Sex,
  unique player colors, mode/set selection, session-token resume, disconnect
  state, host-authorized rematch, and return to lobby.
- Schema-5 server-authoritative game state with JSON-safe interrupted workflows,
  deterministic random/clock injection, full player-specific `GameView`
  synchronization, audience-filtered history, available intents, unavailable
  card reasons, expected actor, and event presentation priority.
- Core catalog plus optional Companions, Arsenal, and Dual Identity sets;
  explicit definitions/copies, tiers, tags, original art keys, RU/EN localized
  presentation, typed effects/conditions/modifiers, equipment restrictions,
  attachments, companions, roles, Curse protection, and economy data.
- Balanced and Classic Chaos draws/setup, deck recycling, recovery, selling,
  trade/charity, multi-Monster combat, assistance/reward negotiation, reactions,
  serialized escape/Bad Stuff/death/revival, deadline defaults, victory, and
  game completion.
- Mobile-first fixed-viewport game shell with cards, details, target/help/choice
  sheets, history, public character state, projected action dock, color identity,
  fullscreen support, and responsive component coverage.

## Important current limitations

- Games, rooms, and resumable sessions are process-memory only.
- NestJS binds to `0.0.0.0`, but does not yet serve the Angular production build;
  development normally uses Angular on port 4200 and the game server on 3000.
- The balance harness is a deterministic development aid, not a substitute for
  real multiplayer playtests or a model of negotiation.
- The bundled card artwork is original project material/placeholder coverage;
  no copyrighted Munchkin text or artwork is used.

## Recent meaningful changes

- 2026-08-24: refined the V2 card-rule model so Details receives complete typed
  behavior and duration metadata, selected ordinary combat boosts can target
  either players or exact Monster encounters, and Core Classes/Races use three
  reusable server-authoritative active-ability families with one generic usage
  ledger.
- 2026-08-24: repaired deadline-resolved combat completion so a level-10 reward
  now shares the engine's authoritative finish transition with normal commands;
  the finished view renders server-projected final standings and host-only
  rematch/return-to-lobby controls.
- 2026-08-23: added selectable unique lobby/player colors, preserved into the
  authoritative player projection and used across lobby, HUD, own-character,
  and Curse-target UI.
- 2026-08-23: completed the live mobile shell pass and connected optional-set,
  sale/charity, role, help, history, targeted-card, and current-phase-card
  interactions to server-projected intents/events.
- 2026-08-22: closed the V2 live-play blockers for combat stale-address
  isolation, reconnect-safe deadlines, target-only Curse responses, and unified
  intent/event presentation. See [v2-release-audit.md](v2-release-audit.md).

## Next evidence to collect

1. Execute real 3–6 player LAN playtests and record balance/UX defects.
2. Package the one-origin NestJS-served production build and test LAN joining.
3. Add regression coverage for defects found in those sessions.
