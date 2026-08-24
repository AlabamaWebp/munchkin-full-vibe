# Architecture

Status: **CURRENT**. This document describes the implemented technical
architecture. For gameplay intent, see [v2-game-design.md](v2-game-design.md).

## System shape

```text
Angular browser client
        | Socket.IO
NestJS gateway and application services
        | commands / player-specific projections
framework-independent game engine
        | immutable JSON-serializable GameState
in-memory room, session, and game maps
```

The repository is an npm-workspaces TypeScript monorepo:

- `packages/game-engine` owns card data, state, command validation, rule
  execution, deterministic randomness, time-based workflow advancement, and
  domain events. It has no Angular, NestJS, or Socket.IO dependency.
- `packages/contracts` owns Socket.IO payloads and public projected types such
  as `LobbyState`, `GameView`, `GameClientCommand`, and
  `AvailableIntentView`.
- `apps/server` owns NestJS/Socket.IO transport, in-memory lobby/session/game
  repositories, command parsing, deadline wake-up timers, and `GameState` to
  `GameView` projection.
- `apps/web` is an Angular standalone-component application. It renders the
  projected state and sends client commands; it does not calculate game rules.

`apps/server/src/main.ts` listens on `0.0.0.0`. In the current development
topology the Angular dev server runs separately (normally port 4200) and points
to the NestJS server (normally port 3000). NestJS does **not** yet serve the
Angular production build, so the single-URL LAN packaging remains work.

## Authority and command flow

The server holds complete `GameState`. A browser sends a typed intention over
`game:command`; the gateway identifies the actor from its resumable session,
the game service validates transport input and converts ids, and
`executeCommand` in the engine either returns a new state plus events or leaves
state unchanged with a typed error. The server persists the successful state,
arms the next deadline, and sends a freshly projected `game:state` to each
connected player.

Lobby actions use their own Socket.IO messages: create/join, session resume,
sex/color/settings selection, start, rematch, and return-to-lobby. `LobbyState`
and `GameView` are full snapshots rather than client patches. Command acks
report success or a typed error; state events remain the rendering authority.

No client command contains a calculated power, reward, level gain, random roll,
or inferred legality. Stable combat/workflow addresses (combat id and revision,
reaction-window id, offer id, decision id, or curse-response id) protect the
engine from duplicate and stale packets.

## State, privacy, and reconnect

`GameState` schema 5 is JSON-serializable and includes immutable match config,
players and card zones, Door/Treasure piles and discards, turn/phase, combat,
pending decisions and Curse response, log, counters, winner, and persisted
deadline-bearing workflows. It contains neither sockets nor functions.

Socket bindings and cryptographically generated session tokens live separately
in server lobby records. The web client saves room code, player id, and token in
`localStorage`; on reconnect it resumes the same player. Games and sessions are
process-lifetime only and are lost on server restart.

`createGameView(state, viewerId)` is the privacy boundary. It gives a player
their own card identities but other hands only counts, filters private log
events, hides future deck cards, and exposes public zones/cards. The view also
contains all currently legal viewer actions as `AvailableIntentView`, expected
actor information, unavailable-card reason codes, and authoritative event
presentation priority. Angular must not recreate those permissions locally.

## Rules execution and time

Card definitions are immutable data; physical `CardInstance`s carry only an
instance id and definition id. Typed effects, conditions, modifiers, equipment
restrictions, roles, companions, protections, and attachments are evaluated by
the engine. This includes side-neutral combat effects and the three reusable
role-ability primitives. Calculated power is derived at execution/projection
time.

Role ability usage is a generic JSON-safe player ledger scoped to a turn number
or combat id; there is no per-role state machine. The projection supplies exact
cost-card ids, targets, combat addresses, and reaction-window addresses.
`GameCardView` carries the rule-bearing fields needed by Details plus a
server-derived duration category, so Angular formats metadata but does not
evaluate gameplay rules.

Randomness comes from an injected `RandomSource`; tests provide deterministic
sources. A `Clock` is likewise injected. Blocking reaction windows, help offers,
pending decisions, and Curse responses persist absolute deadlines in state.
The engine owns expiration defaults. Server timers only wake the service, which
re-reads state and invokes the engine, making reconnect and superseded timers
safe.

Every successful command emits visibility-tagged domain events. The engine
appends them to the serializable match log; the server audience-filters and
enriches them for `GameView` presentation. This is not a separate persistent
event store.

## Frontend architecture

`LobbyClient` is the small Angular Signal-based transport state holder for
connection, lobby, game snapshot, session identity, request pending state, and
errors. `App` switches between home/lobby and the game shell. `GameShellComponent`
and focused presentational components render the server-projected game view,
manage local-only UI state (sheets, focused card/encounter, locale, fullscreen),
and translate an available intent into a contract command.

The UI is mobile-first and uses a fixed game viewport with bounded sheets and
horizontally scrollable rails where needed. Display-only arithmetic such as a
shown power difference is allowed; changing state or deciding that a card is
legal is not.

## Quality boundaries

- Keep rules and state transitions in `packages/game-engine` with deterministic
  unit tests.
- Keep public transport types in `packages/contracts`; do not leak engine-only
  types or hidden cards into browser payloads.
- Keep NestJS responsible for identity/session/transport and projections, not
  for duplicated rules.
- Keep production in memory until persistence is explicitly requested.
- Do not add accounts, a database, Redis, SSR, GraphQL, NgRx, Nx, or a second
  rules implementation without an explicit product decision.
