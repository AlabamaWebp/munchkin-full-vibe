# Architecture decisions

## ADR-001 — Server-authoritative state

All authoritative game state exists on the server.

Clients submit actions, not calculated results.

Reason:

Prevents desynchronization, cheating and duplicated rules.

---

## ADR-002 — Pure game engine

Game rules live in a framework-independent TypeScript package.

Reason:

Testability and separation of concerns.

---

## ADR-003 — In-memory persistence

Initial games are stored in server memory.

Reason:

The LAN MVP does not require durable persistence.

---

## ADR-004 — Angular Signals

Frontend application state uses Angular Signals rather than NgRx.

Reason:

The application state is small enough and the server remains the source of truth.

---

## ADR-005 — Socket.IO

Realtime networking uses Socket.IO.

Reason:

Rooms, reconnection support and straightforward NestJS integration.

---

## ADR-006 — Full state projections

After meaningful state changes, the server may send a complete player-specific `GameView`.

Reason:

Game state is small and simplicity is more valuable than premature network optimization.

---

## ADR-007 — Permanent player identity is not socket identity

`socket.id` is never used as the permanent player identity.

Reason:

Socket connections are transient and change after reconnects.

---

## ADR-008 — Data-driven cards

Card behavior must be represented through typed data/effects rather than checks against card names.

Reason:

Allows scalable card content, multiple copies and testable rules.

---

## ADR-009 — One generic gameplay socket command

Most gameplay actions travel through:

```text
game:command
```

rather than introducing a new Socket.IO transport event for every mechanic.

Reason:

Keeps networking separate from domain rules and simplifies protocol evolution.

---

## ADR-010 — npm workspaces without a monorepo task runner

The repository uses native npm workspaces. Root scripts call workspace scripts in
an explicit dependency-safe order, and `concurrently` is used only to run the two
development servers together.

Reason:

The current four-workspace repository does not need the additional concepts or
configuration of Nx or another monorepo task runner.

---

## ADR-011 — Branded string domain identifiers

Game, player, card definition, and physical card instance identities are strings
with distinct TypeScript brands. Values entering the domain pass through small
parsers that normalize surrounding whitespace and reject empty identifiers.

Reason:

Strings remain natural JSON and transport values, while brands prevent accidental
mixing of unrelated identifiers during development.

---

## ADR-012 — Randomness is injected and kept outside game state

Random behavior is accessed through `RandomSource` in `CommandContext`. The first
implementation is a deterministic seeded source. Neither the source nor its
internal generator state is stored in `GameState`.

Reason:

Injected randomness makes rule tests reproducible while keeping authoritative game
state plain JSON data without functions or runtime objects.

---

## ADR-013 — Commands return immutable domain results

Gameplay and lobby changes after game creation are performed through
`executeCommand`. Successful commands return a new `GameState` plus events;
invalid commands return the original state, no events, and a typed domain error.

Reason:

A single non-throwing validation contract is straightforward for later server and
Socket.IO integration, while preserving failed-command atomicity.

---

## ADR-014 — Domain events declare public or private visibility

Every game event declares whether it is public. Private events also identify their
recipient player. Initial deals, facedown draws, and private discards use private
events; revealed Door cards and turn changes use public events.

Reason:

Privacy is a domain concern. Marking visibility at event creation prevents future
transport code from having to infer whether a card identity is safe to broadcast.

---

## ADR-015 — Lobby records are separate from domain game state

Before a match is connected to the game engine, NestJS keeps an in-memory lobby
record containing its room code, public status, host player identity, ordered
players, and transient socket associations. Clients receive a public `LobbyState`
projection that never contains socket identities.

The room creator is the initial host. During the pre-session milestone, a
disconnected player is removed immediately; if that player was the host, hosting
passes to the next player in join order. Stable disconnected participants and
session resumption replace this temporary behavior in Milestone 4.

Reason:

This satisfies real-time lobby behavior while keeping transport lifecycle data out
of `GameState`, preserving the identity boundaries needed for reconnection, and
avoiding premature game synchronization before Milestone 5.

---

## ADR-016 — Process-lifetime resumable sessions

Each lobby player receives a cryptographically random session token. The Angular
client stores the room code, player identity, and token in `localStorage` and
submits them through `session:resume` after a refresh or Socket.IO reconnect.
The server retains disconnected players and rebinds a valid session to the new
socket without changing the player identity.

Reason:

This supports recovery without accounts or a database while keeping `socketId`,
`playerId`, `sessionToken`, and room identity separate. Sessions intentionally
expire when the server process restarts.

---

## ADR-017 — Explicit player-specific game projections

NestJS stores the complete authoritative `GameState` and creates a separate
`GameView` for every connected player after game start and successful commands.
The view contains the recipient's full hand but represents every player's hand
publicly only by its card count. Hidden deck cards and other players' card
instances are never serialized into the recipient's view.

Reason:

Making privacy an explicit projection step provides a testable boundary and
prevents Angular or transport broadcasting from accidentally exposing hidden
game information.

---

## ADR-018 — Typed equipment slots and derived combat power

Equipment definitions declare a typed Head, Body, Feet, or Hands slot. Hand
items additionally declare whether they use one or two of the player's two
available hands. The engine derives equipment bonus and total combat power from
the authoritative state rather than storing calculated totals or accepting them
from clients.

Reason:

Typed card data keeps equipment validation independent of card names, while
derived values cannot become stale or diverge between the server and clients.
Class, race, and other advanced restrictions can extend this data model later.

---

## ADR-019 — Typed combat sides and public per-combat history

Combat cards declare their effect semantics through `TEMPORARY_BONUS` with a
`COMBAT_BONUS` effect or `MONSTER_MODIFIER` with a
`MONSTER_COMBAT_BONUS` effect. Commands identify the intended player or Monster
side, and the engine validates the card-side pairing. Help state and an ordered
public action history live in the serializable `CombatState` and are projected
identically to every player.

Reason:

Explicit sides allow any player to interfere without client-calculated power or
card-name checks. Keeping the short history with the combat makes reconnects and
full-state synchronization deterministic without introducing a separate event
store before a persistent game log is needed.

---

## ADR-020 — Deterministic escape and persisted outcome summary

Run-away attempts use the injected `RandomSource` for a six-sided roll and apply
typed bad-stuff effects from the Monster definition. The resolved combat is
removed immediately, while a small public `lastRunAwayResult` summary remains in
`GameState` until the active player ends the turn.

Reason:

Randomness remains deterministic in rule tests, bad stuff stays data-driven, and
full-state projections can show the authoritative escape outcome after a socket
reconnect without introducing a separate persistent event store.

---

## ADR-021 — Explicit expanded-rule zones and typed economy actions

Class and Race are single-card public player zones, while death is an explicit
player-state flag. Equipment restrictions reference role definition ids. Sales,
trades, charity, role changes, and player-targeted Curses are authoritative
commands; card values, eligible recipients, hand limits, and resulting level
gains are derived by the engine.

Reason:

Explicit zones keep public information projectable without exposing hands, and
typed commands prevent the client from calculating economy or rule outcomes.
The model remains serializable and avoids card-name checks or duplicated Angular
rules.

---

## ADR-022 — Engine-owned completion and room-preserving replay

The game engine declares a winner as soon as an authoritative level gain reaches
the clearly defined winning level of 10. It changes the game status and phase to
`FINISHED`, records the winner, and rejects later gameplay commands. The room
host may then replace the finished in-memory game with a fresh game for the same
roster, or remove it and return the existing room to lobby status.

Reason:

Victory remains independent of transport and cannot be claimed by a client.
Keeping the lobby roster and process-lifetime sessions preserves reconnect
identity across both rematches and returns without introducing persistence or a
second room lifecycle.

---

## ADR-023 — Engine-event-backed, player-specific game history

Every successful domain command appends its emitted events to an ordered log in
the serializable authoritative `GameState`. Entries carry a stable sequence and
turn number. NestJS projects public entries to everyone and private entries only
to their declared recipient, enriching visible card references for presentation.
Angular renders this projection and never constructs authoritative history from
locally submitted actions.

Reason:

Keeping the complete history with the in-memory game makes it available after
refresh or reconnect and preserves the existing full-state synchronization model.
Reusing event visibility prevents the history UI from exposing another player's
hand while avoiding a separate event store or database.

---

## ADR-024 — Serializable pending card decisions

Card effects explicitly distinguish engine-random discards from discards chosen
by the affected player. A chosen discard stores a typed `pendingDecision` in
`GameState`, including the eligible zone, exact count, source card, remaining
effects, and typed completion context. All unrelated gameplay commands are
rejected until the addressed player resolves it.

The server projects selectable card identities only to the addressed player.
Other players receive the public source, required count, waiting state, and a
public discard summary, while identities from a private hand remain private.

Reason:

Keeping the interruption and continuation in serializable authoritative state
makes multi-step effects deterministic across full-state synchronization and
reconnection. Typed continuations preserve the data-driven rule model without
putting functions or a generic scripting runtime into game state.

---

## ADR-025 — Authoritative presentation metadata reuses the event log and GameView

Visible card projections include their typed effects. Match-log entries record
the authoritative phase alongside sequence and turn metadata, and each
player-specific `GameView` identifies the player expected to act plus reason
codes for unavailable owned-card actions. Angular may arrange these provided
totals and effects for presentation, but does not derive game legality or combat
outcomes.

The central public-card area is a transient view of public entries from the same
authoritative game log rather than a second event model. A client stores only the
highest displayed public-event sequence for the current game and viewer so an
already seen notice is not replayed after refresh; the authoritative entry remains
available in the player-specific game history.

Reason:

Reusing `GameView`, its audience-filtered log, and public combat history keeps one
privacy boundary and one source of truth while allowing the mobile UI to explain
cards and actions without copying engine rules. The local acknowledgement affects
only transient presentation and cannot hide or alter authoritative history.
