# AGENTS.md

## Project

This repository contains a LAN multiplayer card game inspired by Munchkin.

The application is intended primarily as:

* a learning project;
* a private LAN multiplayer game for friends;
* a maintainable codebase that can continue evolving with AI-assisted development.

Before making architectural, gameplay, or other non-trivial changes, read the relevant project documentation.

Core documentation:

* `docs/PRODUCT.md`
* `docs/ARCHITECTURE.md`
* `docs/GAME_RULES.md`
* `docs/ROADMAP.md`
* `docs/STATUS.md`
* `docs/DECISIONS.md`

If present, also use:

* `docs/README.md` — documentation map and source-of-truth guidance;
* `docs/AI_CONTEXT.md` — compact planning context;
* relevant files under `docs/ui/`;
* relevant design-contract documents referenced by the documentation index.

Do not assume that an old implementation plan, audit, or historical document describes the current implementation.

The current production code and tests are the source of truth for what is currently implemented.

Explicitly authoritative product/game-design documents remain the source of truth for intended behavior where the implementation has not yet caught up.

---

## Role

Act as the primary software engineer for this project.

The user acts as product owner and architecture reviewer.

Do not require the user to implement routine code manually.

When requirements are sufficiently clear:

1. inspect the relevant implementation, tests, contracts and documentation;
2. determine the smallest coherent solution;
3. implement it;
4. update or add appropriate tests;
5. run relevant tests, lint and production builds;
6. fix regressions or failures caused by the change;
7. update affected canonical documentation.

Continue autonomously through ordinary implementation decisions.

Ask the user only when:

* a gameplay or product decision cannot reasonably be inferred;
* multiple materially different product behaviors are equally plausible;
* proceeding would require violating an explicit project constraint.

Do not ask for confirmation between normal implementation steps.

---

## Task scope

Prefer the smallest coherent change that fully satisfies the requirement.

Do not perform unrelated:

* refactors;
* dependency upgrades;
* formatting sweeps;
* architectural rewrites;
* feature additions.

Reuse existing abstractions and patterns when they are adequate.

Before introducing a new abstraction, service, state mechanism, or domain concept, inspect whether an equivalent mechanism already exists.

Prefer extending the existing implementation over creating a parallel system.

If the current implementation makes the requested change unsafe, inconsistent, or unnecessarily complex, improve the relevant architecture only as much as needed.

Do not preserve clearly broken architecture merely to minimize the diff.

Do not broaden vague requirements into an unlimited cleanup unless the task explicitly asks for a broad audit.

When performing an audit, define a clear stopping condition based on the requested behavior.

---

## Repository inspection

Before implementing a non-trivial change, inspect the relevant:

* production code;
* tests;
* shared contracts;
* game-engine implementation;
* active documentation.

Do not assume file names, APIs, state shapes, event names, or architectural patterns from the task description.

Follow the actual repository structure.

Do not duplicate functionality because the existing implementation was not inspected deeply enough.

When a task references UI behavior, trace the relevant flow far enough to understand where the underlying state or event originates.

When a task references gameplay behavior, inspect both the rule implementation and the client/server representation of its result.

---

## Architecture rules

* TypeScript everywhere.
* Angular frontend.
* NestJS backend.
* Socket.IO for realtime communication.
* Server-authoritative game state.
* Never trust gameplay calculations supplied by the client.
* Game rules belong in `packages/game-engine`.
* `packages/game-engine` must not depend on Angular, NestJS or Socket.IO.
* Shared network contracts belong in `packages/contracts`.
* Angular must never receive hidden cards belonging to another player.
* Keep authoritative game state JSON-serializable.
* Prefer simple architecture over unnecessary abstractions.
* Do not add a database until explicitly requested.
* Do not add Redis, Docker, NgRx, Nx, SSR or authentication unless explicitly requested.
* Use Angular Signals for client-side application state.
* Prefer standalone Angular components.
* Use strict TypeScript.
* Prefer small focused services and functions.
* Avoid `any`.
* Avoid duplicated domain logic between frontend and backend.

Angular may derive presentation-only values from received view state.

Angular must not independently reimplement authoritative gameplay rules.

If the UI requires information that can only be obtained by reproducing game rules, expose the necessary derived information from the server/game-engine instead.

---

## Game implementation invariants

Clients send intentions/actions, never calculated gameplay results.

Example:

GOOD:

```text
PLAY_CARD { cardId }
```

BAD:

```text
ADD_COMBAT_POWER { amount: 5 }
```

The backend validates the action and the game engine calculates its consequences.

Prefer typed, data-driven mechanics over behavior tied to:

* card names;
* display text;
* translated strings;
* UI labels.

Example:

GOOD:

```ts
effect.type === 'discardCards'
```

Avoid:

```ts
card.name === 'Some specific card'
```

unless the card genuinely requires intentionally unique behavior that cannot reasonably be expressed through the existing typed mechanic system.

Card descriptions are presentation data and must not be the source of gameplay behavior.

Gameplay behavior should come from structured card/effect definitions.

Interrupted gameplay flows must remain:

* serializable;
* deterministic where required;
* reconnect-safe.

Do not keep essential interrupted-flow state only in process-local callbacks, promises, component state, or other non-serializable structures.

Preserve server authority across:

* combat;
* card use;
* pending decisions;
* reactions;
* help/reward negotiation;
* turn transitions;
* victory conditions.

A semantic gameplay event should have one authoritative domain representation.

Do not emit duplicate domain events for the same action merely to support different UI surfaces.

Different UI representations may consume the same underlying event/state when appropriate.

---

## Hidden information

Never expose information to a client that the player is not allowed to know.

This includes, where applicable:

* other players' hidden hand cards;
* unrevealed deck contents;
* private decisions;
* private card metadata that would leak hidden information.

Prefer explicit player-specific view/projection models over sending complete authoritative state and hiding fields in Angular.

Privacy must be enforced on the server.

---

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

NestJS must listen on:

```text
0.0.0.0
```

The final user must only need to open:

```text
http://<server-lan-ip>:3000
```

Do not introduce infrastructure that requires external cloud services for normal LAN gameplay unless explicitly requested.

Reconnect behavior should preserve the current game whenever reasonably possible.

---

## Frontend

The primary target is mobile gameplay.

Maintain the existing mobile-first product direction.

Prefer:

* clear current-state presentation;
* minimal unnecessary scrolling on the main game screen;
* explicit interactive states;
* reusable card presentation;
* consistent dialogs/sheets;
* clear distinction between information and available actions.

Do not duplicate the same information in adjacent UI surfaces unless each representation has a distinct purpose.

For example, avoid simultaneously showing the same card/action name as:

* redundant explanatory text;
* a card whose title already communicates it;
* an equivalent notification;

unless the duplication materially improves usability.

When showing selectable cards, prefer enough visual/contextual information for the player to make the decision without memorizing card names.

When a card can be inspected elsewhere in the game, reuse the existing card-detail presentation rather than creating a separate incompatible representation.

Do not solve missing domain information with frontend-only approximations.

---

## Card and effect design

Cards should expose their behavior clearly enough for the player to understand:

* what the card does;
* when it can be used;
* valid targets when relevant;
* important restrictions when relevant.

Structured gameplay definitions and player-facing descriptions must remain consistent.

When introducing reusable mechanics, prefer expressing them as typed effects/conditions/modifiers rather than creating one-off card-specific code.

Equipment modifiers, attachments, conditions and passive effects should preserve enough structured information for:

* game-engine calculations;
* serialization;
* reconnect;
* UI presentation;
* card inspection.

Avoid storing only a calculated total when the underlying modifiers are still needed for gameplay or presentation.

---

## Game lifecycle

Treat lobby, active game, game completion and replay/reset as explicit lifecycle states.

Game completion must not rely only on UI interpretation of player level or other derived values.

Victory must be represented authoritatively by the backend/game engine.

A completed game must not continue accepting ordinary gameplay actions.

Replay/rematch/reset flows must cleanly reset game-specific state without requiring a server restart.

Do not accidentally preserve state from a previous match when starting another game.

---

## Testing

Game rules require unit tests.

For every important rule, test as appropriate:

* valid action;
* invalid action;
* relevant edge cases;
* state transitions;
* privacy/visibility behavior when relevant;
* reconnect/serialization behavior when relevant.

Bug fixes should normally include a regression test when the behavior can reasonably be tested.

Prefer testing behavior and public contracts over implementation details.

Do not add meaningless tests solely to increase coverage.

Before considering a meaningful task complete, run the relevant available:

* tests;
* lint;
* production builds.

For narrow changes, targeted tests may be run during implementation, but the final verification should cover the affected packages sufficiently to detect integration regressions.

If a required check cannot be run, report that explicitly instead of claiming verification succeeded.

---

## Documentation

Documentation is part of the implementation.

After meaningful changes, update the documentation that represents the affected source of truth.

Documentation responsibilities:

* `docs/PRODUCT.md` — stable product goals and constraints.
* `docs/ARCHITECTURE.md` — current high-level architecture and system boundaries.
* `docs/GAME_RULES.md` — current gameplay rules and behavior.
* `docs/ROADMAP.md` — remaining/planned work.
* `docs/STATUS.md` — current implementation status and recent meaningful changes.
* `docs/DECISIONS.md` — durable architectural/product decisions and rationale.
* `docs/AI_CONTEXT.md` — compact planning context for external AI agents, when present.
* `docs/ui/*` — current UI/design contracts where applicable.

Do not update only `STATUS.md` when a change makes another canonical document stale.

Examples:

* architecture changed → update `ARCHITECTURE.md`;
* gameplay behavior changed → update `GAME_RULES.md`;
* roadmap item completed, replaced or invalidated → update `ROADMAP.md`;
* architectural/product decision introduced or changed → update `DECISIONS.md`;
* UI contract changed → update the relevant `docs/ui/*` document.

Do not silently change requirements documented in active authoritative documents.

If implementation intentionally diverges from an authoritative requirement, either implement the requirement or explicitly document the newly approved decision.

Keep historical plans, audits and completed implementation documents historical.

Do not rewrite historical documents to make them appear current.

If needed, mark their status clearly and point readers toward the current source of truth.

Update `docs/AI_CONTEXT.md` only when a change materially affects information useful for planning future work.

Do not update `AI_CONTEXT.md` for:

* local implementation details;
* trivial bug fixes;
* cosmetic changes;
* changes already adequately represented by its existing high-level description.

Before completing a meaningful task, check whether the implementation now contradicts any active documentation.

---

## Decisions

Record a decision in `docs/DECISIONS.md` when it is durable and likely to affect future implementation choices.

Good ADR/decision candidates include:

* architectural boundaries;
* authoritative ownership of state;
* important gameplay semantics;
* persistence/reconnect strategy;
* representation of reusable mechanics;
* significant UI/product rules;
* intentionally rejected architectural alternatives.

Do not create decision records for:

* routine implementation details;
* obvious bug fixes;
* temporary local choices;
* trivial refactors.

Preserve existing decision history.

If a previous decision is superseded, record that explicitly rather than silently rewriting its history.

---

## Dependencies

Prefer the existing dependency set.

Before adding a dependency, consider whether the task can reasonably be implemented using:

* the standard library;
* Angular/NestJS capabilities already in use;
* existing project dependencies;
* a small amount of straightforward project code.

Do not add a large framework or library to solve a small problem.

If a new dependency is justified:

* prefer mature and actively maintained packages;
* keep it scoped to the layer that needs it;
* avoid coupling the game engine to framework-specific dependencies.

Do not perform unrelated dependency upgrades during feature work.

---

## Code quality

Optimize primarily for:

1. correctness;
2. clarity;
3. maintainability;
4. testability;
5. reasonable simplicity.

Do not optimize for cleverness or minimum line count.

Prefer explicit domain concepts over ambiguous generic structures when the distinction matters.

Avoid:

* dead code;
* duplicated rule implementations;
* unnecessary abstractions;
* premature generic frameworks;
* hidden side effects;
* unexplained magic constants;
* broad type assertions used to bypass TypeScript.

Keep functions and services focused, but do not split code mechanically when doing so harms readability.

Use comments primarily to explain non-obvious intent or constraints rather than restating the code.

---

## Completion criteria

A task is complete when:

* requested behavior is implemented;
* relevant edge cases are handled;
* appropriate tests exist and pass;
* affected contracts remain consistent;
* lint passes for the affected project;
* relevant production builds pass;
* no known regression caused by the change remains;
* affected canonical documentation is current.

Do not claim completion when significant requested behavior remains knowingly unfinished.

If something cannot be completed because of a genuine external or product-level blocker, clearly identify the blocker and leave the repository in a consistent state.
