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
