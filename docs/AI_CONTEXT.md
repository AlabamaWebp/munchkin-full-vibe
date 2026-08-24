# Munchkin LAN — external AI context

Updated: 2026-08-24  
Repository commit: `f04e07814bb98e615d230892d58e47fe5cdfae1f`

This is a compact planning context, not a substitute for repository inspection.
Current implementation claims were checked against the working tree, contracts,
and tests. Treat code/tests as truth if a later branch changes the repository.

## Project

- Private, mobile-first LAN multiplayer card game inspired by the _shape_ of
  Munchkin, using original card names, text, and art. It is a learning project
  and game for friends, not a public service.
- A host runs it on a Windows/Linux PC. Friends join from phone/desktop browsers
  over local Wi-Fi. No accounts, internet, persistence, or matchmaking.
- Target is 3–6 players; 1–6 is supported for development. Android Chrome and
  desktop Chrome/Firefox are primary; iPhone Safari is secondary.
- Current baseline is a schema-5 V2 game ready for internal LAN live playtests.
  Single-origin production packaging and broad real-device validation are still
  pending.
- TypeScript throughout: Angular 22 frontend, NestJS 11 backend, Socket.IO 4,
  npm workspaces, Jest/Vitest-style unit suites, and strict lint/build scripts.
- NestJS listens on `0.0.0.0`. Today the Angular development server normally
  runs on port 4200 and connects to NestJS on port 3000. The backend does not
  yet serve the Angular production files, so the desired one-URL LAN deployment
  remains future work.

## Architecture

### Package ownership

| Location               | Responsibility                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/game-engine` | Pure authoritative domain: schema, catalog, commands, effects, draws, combat, events, deadlines, deterministic random/clock abstractions. No Angular/NestJS/Socket.IO imports. |
| `packages/contracts`   | Socket payloads plus public serializable lobby/game projections and client command unions.                                                                                     |
| `apps/server`          | NestJS gateway/services; in-memory rooms/sessions/games; authentication by resumable session token; command parsing; deadline timers; player-specific projection.              |
| `apps/web`             | Angular standalone components and Signals. Renders server snapshots, holds only local UI state, and sends projected legal intents as commands.                                 |

### Authority, state, and projection

- The server alone owns/mutates complete `GameState`. Clients send intentions,
  never calculated combat power, dice results, rewards, level gains, or legality.
- Engine `executeCommand` validates a domain command and returns either a new
  immutable state plus visibility-tagged events or an unchanged state plus a
  typed domain error. Invalid operations are atomic.
- Server stores game state by room code in memory. Successful commands produce
  a fresh `GameView` for every connected player; the frontend does not apply
  local state patches.
- `createGameView(state, viewerId)` is the critical privacy boundary. A viewer
  sees their own hand/card identities and permitted private log events; other
  hands are counts only. Future deck identities never enter the projection.
- The game event log is serializable match history stored in `GameState`, not a
  database/event store. Public/private event visibility controls projection.
- Lobby/session data is separate from game state. Session token, player id,
  room code, and socket id are distinct concepts. Browser storage retains the
  token/identity and Socket.IO reconnect resumes the player while the server
  process remains alive.

### Socket and workflow flow

1. Browser uses `lobby:create` or `lobby:join`; later it calls
   `session:resume` using locally stored credentials.
2. Lobby state is broadcast as `lobby:state`; host manages settings and starts
   the game.
3. Browser sends `game:command` with a typed `GameClientCommand`. The gateway
   derives actor identity from its socket/session instead of trusting payload.
4. Game service validates transport ids, calls the engine, schedules the next
   persisted deadline, and sends per-player `game:state` snapshots.
5. Host-only `game:rematch` and `game:return-to-lobby` handle a finished match.

Stable identifiers prevent stale commands from targeting new workflows: combat
id plus revision; encounter id; reaction-window id; help-offer id; pending
decision id; and Curse-response id. A client should source these only from its
current `AvailableIntentView`.

### Frontend state

- `LobbyClient` owns Angular Signals for socket connection, current lobby,
  current game view, session identity, request pending state, and errors.
- `App` renders home/lobby or the active game shell. `GameShellComponent` and
  focused components render cards, stages, combat, player HUD, hand dock,
  recent events, and sheets.
- Local state is presentational only: selected card/target/encounter, open
  dialog/sheet, locale, fullscreen. It can arrange server-provided data but
  cannot decide that a move is legal or calculate consequences.
- The game view contains `availableIntents`, `expectedAction`, unavailability
  reasons, exact workflow addresses/deadlines, and authoritative presentation
  buckets. New UI should consume these rather than introduce parallel lists.

## Domain

### Core state

- `GameState` schema 5 includes immutable config, status/phase, ordered players,
  active player, card definitions, Door/Treasure draw/discard piles, combat,
  pending decision, Curse response, deadline/workflow counters, event log,
  turn number, winner, and last run-away summary. It must remain JSON-safe.
- Status is lobby, in-progress, or finished. Explicit phases are lobby,
  turn-start, kick-door, door-resolution, post-door, loot-room, end-turn, and
  finished.
- `PlayerState` has identity/name, selected Sex and optional color, level,
  private hand, public equipment/attachments, Class/Race arrays, role-permission
  cards, hireling/mount slots, death state, and typed active effects.
- `GameView` is the audience-filtered snapshot: public players, viewer’s full
  self state, combat/pending workflow view, allowed intents, filtered history,
  event presentation, deck counts, expected action, and unavailability reasons.

### Cards, sets, and mechanics data

- Definitions are immutable catalog data; instances are physical copies with
  distinct instance ids. Never implement gameplay by matching a card name.
- Definitions cover deck/set/tier/tags, art key, original text, sale/trade flags,
  timing/target, typed effects, equipment, Monster/Curse, role, companion,
  permission, protection, and attachment metadata as applicable.
- Typed effects include player/Monster/exact authored-side combat modification,
  add/clone Monster, level gain/loss, draws, random/chosen discards, role
  discard, and death. Card views project rule-bearing metadata plus a derived
  duration category for Details.
- Conditions/modifiers express Sex, Class/Race, Monster tag, equipped-tag,
  specific definition, and Curse matching. Reusable modifiers cover combat
  power, equipment-tag scaling, run-away roll, and automatic protection.
- An ordinary Class/Race may have one passive and one active ability. Active
  abilities reuse discard-for-combat, discard-for-Run-Away, and discard-to-draw
  primitives; one JSON-safe turn/combat-scoped usage ledger serves every role.
- Card sets: mandatory `CORE`; optional `COMPANIONS`, `ARSENAL`, and
  `DUAL_IDENTITY`. Start config selects `BALANCED` or `CLASSIC_CHAOS` and set
  ids; disabled-set definitions and physical copies are removed at game creation.
- Balanced draws select from the present physical pile with tier profiles;
  Classic Chaos draws from shuffled piles. Door and Treasure recycle their own
  discard only when necessary. Complete multi-card requests preflight available
  cards and fail atomically.

### Turn, build, and economy

- Setup deals four Door plus four Treasure cards; Balanced additionally reserves
  a legal neutral Tier-1 starter item for each player. Doors resolve into combat,
  Curse, or private hand movement; post-door offers Look for Trouble, Loot Room,
  eligible Scavenge recovery, or end-turn.
- Equipment has Head/Body/Feet/Hands slots and one/two-hand capacity. Its
  restrictions and all power are engine-derived. Attachments target typed eligible
  equipped items; public player views expose attachments and public role zones.
- Class/Race are role arrays with a normal capacity of one. Permission cards may
  expand capacity; a lost permission can create a retained-role decision.
  Hireling and mount cards occupy distinct companion containers.
- Eligible positive-value Treasure can be sold: each full 1,000 gold grants one
  level, remainder is lost, and sale cannot deliver the winning level. Trade and
  charity are authoritative commands; charity enforces hand-limit progression.

### Combat, help, and losing

- A combat belongs to the active player and has a game-local stable combat id,
  mutable revision, and ordered Monster encounters. Each encounter preserves its
  own id, base/current strength, rewards, tags, Bad Stuff, modifiers, and public
  played-card history. Multi-Monster total is the sum of current strengths.
- Player-side power is derived from current participants, level, equipment,
  roles, companions, active effects, attachments, and eligible Makeshift Tools.
  A tie loses. Combat cards use typed player-side, exact encounter, hand-Monster,
  equipment, or player targets.
- Side-neutral boosts opt in through typed card data and project both the player
  side and every exact encounter; one-sided boosts remain narrow.
- Winning is declared, then opens a persisted reaction window. Eligible players
  pass or intervene using the current window/revision; a final pass atomically
  rechecks total power and reward availability before resolution.
- One help offer can be open at a time. Its Treasure promise is 0 through the
  current total reward; offers can be proposed/accepted/rejected/cancelled.
  Acceptance makes an immutable agreement. On victory active player gets levels;
  drawn Treasure is shuffled then split by the agreement, with identities private
  to recipients and public counts only.
- Run away serializes encounter-major/combatant progress, rolls, outcomes,
  shared Bad Stuff, and continuations. It never rerolls a completed attempt.
  Death/revival and chosen-discard Bad Stuff remain reconnect-safe.

### Interruptions, deadlines, and history

- Pending discard selection, role retention, Curse response, help offers, and
  combat reactions are explicit serializable workflows with stable ids.
- Absolute deadlines use an injected engine clock. The engine owns default,
  idempotent expiry transitions; NestJS timers merely wake it and reread current
  state. Offline players are not silently removed from reaction eligibility.
- Curse protection may resolve immediately when no response is possible; target
  choices expose only safe/selectable information to the affected viewer.
- Domain events have public/private audience. Server projection enriches visible
  cards, assigns `BLOCKING`, `IMPORTANT`, or `ROUTINE`, and makes blocking mean
  the current viewer can act. Angular does not persist a second notification log.

### Completion and room lifecycle

- An authoritative eligible level gain to 10 ends the match immediately and
  records winner/finished phase. Finished games reject gameplay commands.
- The existing host can create a fresh rematch for the same room roster, or
  remove the finished game and return that room to its lobby. Sessions remain
  process-lifetime; a server restart clears both rooms and games.

## Important invariants for prompts

- Preserve server authority and the pure game-engine boundary.
- Preserve player-specific hidden-information projection; do not expose another
  hand, hidden draw, or future deck identity through state, events, or UI.
- Keep game state and every interrupted flow JSON-serializable and reconnect-safe.
- Use typed/data-driven definitions, effects, conditions, modifiers, and targets;
  never add card-name checks or a duplicate Angular rules engine.
- Keep invalid command handling atomic and use stable ids/revisions for delayed
  or repeated workflow/combat packets.
- Use injected `RandomSource` and `Clock` for random/time behavior so rule tests
  remain deterministic. Timers must not become a second source of truth.
- Let the server project legal intents, expected actor, availability reason, and
  event priority. Angular may format/present values but not infer permissions.
- Keep Deck type separation, physical-card uniqueness, and atomic card draws.
- Keep persistence explicitly in memory unless a product decision adds storage.
- Add focused valid/invalid/edge tests for rule changes and preserve privacy tests.

## Current implementation status

Working: lobby/session reconnect; game creation/config; original Core plus all
three optional sets; data-driven cards/build/economy; multi-Monster combat/help/
reactions/run-away; deadlines and Curse response; player-specific views/intents/
history; victory/rematch/lobby return; mobile-first Angular shell; deterministic
engine, server, contracts, and frontend test coverage.

Important incomplete/known areas:

- Production deployment is two-process/two-origin in development; NestJS does
  not yet serve Angular static output or present the final single LAN URL.
- No durable persistence, accounts, authentication, Internet/cloud deployment,
  matchmaking, AI opponents, database, Redis, SSR, GraphQL, NgRx, or Nx.
- Deterministic balance simulation exists but real 3–6-player LAN playtesting
  and broad device/accessibility verification are still needed.

## Documentation map

- Product goals/constraints: [PRODUCT.md](PRODUCT.md)
- Current technical architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Implemented rules overview: [GAME_RULES.md](GAME_RULES.md)
- Intentional detailed V2 game/UI rules: [v2-game-design.md](v2-game-design.md)
- UI visual contract: [ui/DESIGN.md](ui/DESIGN.md)
- Architecture/product rationale: [DECISIONS.md](DECISIONS.md)
- Current status and remaining plan: [STATUS.md](STATUS.md) and
  [ROADMAP.md](ROADMAP.md)
- Historical V2 plans/audits and balance evidence: [README.md](README.md)
