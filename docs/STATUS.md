# Project status

Current milestone:

```text
Milestone 12.1 — Game process visibility (complete)
```

## Implemented

- targeted combat-help requests that name the selected player and can only be
  accepted by that player;
- temporary combat bonuses playable for either the adventurer or Monster side,
  with authoritative side-specific power updates and confirmation in the UI;
- own-turn-only item transfer, preventing Treasure equipment from appearing
  actionable to a player who is waiting for somebody else's turn;
- distinct card palettes for Monsters, Curses, equipment, temporary bonuses,
  Monster modifiers, Classes, Races, and other cards while retaining the Door
  and Treasure deck accents;
- seven-second temporary result notifications and viewer-aware waiting statuses
  that name the player currently choosing, fighting, or ending their turn;

- reusable standalone card-face, card-details, focus-management, and equipment-slot
  components shared by the hand, public-event area, game history, combat, and
  character sheet;
- a non-blocking central stack for newly revealed or publicly played cards, based
  on the existing authoritative game log and persisted per-viewer sequence
  acknowledgement so refresh/reconnect does not replay already seen notices;
- interactive game-history entries that open all viewer-visible related cards,
  localized effects, source/target, turn, phase, and actual server-confirmed result;
- responsive public character dialogs/bottom sheets with level, combat and
  equipment power, private hand count only, life/connection/combat roles, empty
  Head/Body/Feet/left-hand/right-hand/Class/Race slots, and a two-handed layout;
- a two-sided combat board with authoritative player, equipment, temporary,
  helper, Monster-base, and Monster-modifier breakdowns, plus clickable combat
  cards retained from the existing public combat history;
- server-projected expected actors and per-card unavailability reasons, hand-card
  playability indicators, highlighted valid player targets, and explicit
  confirmation before targeted or combat-card commands;
- brief result feedback for level, Treasure, escape, bad-stuff, death/revival, and
  equipment events, with `prefers-reduced-motion` support;
- keyboard-accessible dialogs with programmatic initial focus, visible focus,
  Escape handling, localized RU/EN strings, and verified zero page overflow at
  360, 390, and 412 px (excluding intentional hand scrolling);

- process-lifetime player sessions with random reconnect credentials stored by
  Angular in `localStorage`;
- automatic session recovery after refresh, temporary connection loss, or a new
  Socket.IO connection, without changing the permanent player identity;
- disconnected-player indication while preserving room membership and host
  authority;
- authoritative in-memory games created from the lobby roster when the host
  starts a match;
- generic `game:command` transport for the current Kick Door, Loot Room, and End
  Turn engine commands;
- complete player-specific `GameView` broadcasts after game start and successful
  commands;
- an explicit privacy projection: the recipient receives their own card
  identities and definitions, while another player's hand exposes only a count;
- synchronized deck counts, turn, phase, public player information, equipment,
  combat monster, and available server-derived actions;
- a mobile-first game screen with a player rail, central table/combat area,
  character and equipment panel, horizontally scrollable private hand, card
  details, connection feedback, and a persistent action bar;
- complete Russian localization of the home, lobby, game, connection/error,
  accessibility, and current card-content UI, used by default;
- an RU/EN language switcher that updates the page language, card text, plural
  forms, and document title immediately and remembers the choice locally;
- a root development launcher that owns both Angular and NestJS process trees
  and terminates both when the launcher stops or either child exits;
- Angular development hosting on `0.0.0.0:4200`, making the UI reachable through
  `localhost`, `127.0.0.1`, and the computer's LAN address;
- authoritative `EQUIP_ITEM` and `UNEQUIP_ITEM` commands routed through the
  existing generic `game:command` transport;
- typed Head, Body, Feet, and Hands equipment slots, including the two-hand
  capacity rule and validation for occupied slots, ownership, card type, phase,
  active player, and combat state;
- engine-derived equipment bonuses and total combat power, projected for every
  public player without trusting client calculations;
- server-derived per-card equip and unequip availability, with mobile UI actions,
  localized slot details, equipment bonuses, and combat-power display;
- public equipment events and focused engine, projection, and Angular coverage
  for valid, invalid, and edge-case equipment actions;
- authoritative temporary-bonus card play during the active player's combat,
  with typed target validation, server-side effect resolution, and immediate
  Treasure discard;
- engine-derived player and monster power comparison, with ties correctly
  treated as not won and an explicit combat-resolution command;
- data-driven level and Treasure rewards for each Monster, atomic reward
  validation, Monster discard, temporary-power cleanup, and transition to
  `END_TURN` after victory;
- public combat, level, and reward events while individual Treasure identities
  remain private to their recipient;
- synchronized combat power, Monster power, rewards, playable temporary cards,
  and server-derived combat actions in every player-specific `GameView`;
- a localized mobile combat panel with power comparison, reward preview,
  temporary-bonus feedback, card-play controls, and victory action;
- focused engine coverage for valid bonus play and victory plus invalid targets,
  invalid card types, ties, and insufficient rewards; projection and Angular
  coverage for combat actions and rendering;
- authoritative `REQUEST_HELP` and `ACCEPT_HELP` commands with one addressable
  pending request, redirect-before-accept behavior, and validation against
  self-help, unknown players, unsolicited acceptance, and multiple helpers;
- engine-derived combined player-side power using the accepted helper's level
  and public equipment bonuses, while combat rewards remain with the active
  player under the documented simplified rules;
- combat-card play by every participant through the existing generic command,
  with explicit player/Monster target sides and no client-provided power;
- typed, data-driven `MONSTER_MODIFIER` cards and
  `MONSTER_COMBAT_BONUS` effects, including two localized fictional development
  cards, Monster-side validation, discard handling, and power projection;
- serializable public per-combat history for the encounter, help requests and
  acceptance, and cards played on either side, preserved across full-state
  synchronization and reconnects while the combat is active;
- player-specific available help and combat-card actions, combined/helper and
  Monster bonus projections, and a localized mobile UI for requesting or
  accepting help, playing for either side, and reading the combat history;
- focused engine coverage for valid and invalid multiplayer actions, server
  projection coverage for helper views and both card sides, and Angular coverage
  for multiplayer combat controls and history rendering;
- server unit coverage for reconnect credentials and projections, Socket.IO E2E
  coverage for two-player start, private state, game commands, disconnect, and
  resume, and Angular coverage for stored-session parsing and primary screens.
- an authoritative `RUN_AWAY` command available only to the active player in a
  combat they are not currently winning;
- a deterministic six-sided escape roll through the injected `RandomSource`,
  with success on 5–6 and failure on 1–4;
- typed, data-driven Monster bad stuff for level loss and explicitly random or
  player-chosen hand/equipment discard, including five fictional
  development-Monster consequences and the level-one lower bound;
- complete losing-combat cleanup after either outcome: Monster discard,
  temporary-bonus reset, removal of helper and combat history with combat state,
  and transition to `END_TURN`;
- a public, reconnect-safe escape-result summary that is cleared when the turn
  ends, plus public escape and bad-stuff domain events;
- server-derived victory-versus-run-away actions and a localized mobile UI that
  previews Monster bad stuff and shows the die roll, escape result, and whether
  bad stuff was applied;
- focused engine tests for successful and failed escape, bad-stuff edge cases,
  invalid actors and winning-combat rejection; projection and Angular coverage
  for the new action and visible outcome.
- public single-card Class and Race zones, authoritative role replacement, and
  typed role restrictions for equipment, including automatic unequipping after
  an incompatible role replacement;
- player-targeted Curse play from private hands, including typed role loss and
  death effects without card-name checks;
- data-driven equipment values and authoritative sales, with one engine-derived
  level per complete 1,000 gold and atomic validation of item selections;
- equipment trading into another player's private hand outside combat;
- a five-card end-turn hand limit and authoritative charity to a lowest-level
  player, or discard when the active player is tied for lowest level;
- explicit death and revival: death keeps level while discarding possessions
  and roles; the player revives with replacement cards on their next turn;
- player-specific projections and localized mobile controls for roles, Curses,
  item value, selling, trading, charity, and death;
- focused expanded-rule engine tests for valid actions, restrictions, invalid
  recipients, insufficient sale value, charity boundaries, and death cleanup.
- an engine-owned winning level of 10, reached through any authoritative level
  gain, with an atomic transition to `FINISHED`, a persistent winner identity,
  active-combat cleanup, and rejection of all later gameplay commands;
- a public `GAME_FINISHED` domain event and finished player-specific projections
  that remain safe across full synchronization and reconnects;
- host-only rematch and return-to-lobby Socket.IO actions that preserve the room
  roster, player identities, reconnect credentials, and connection status;
- a localized mobile victory screen naming the winner, offering replay/lobby
  controls to the host, and showing a waiting state to other players;
- focused engine, lobby, server, and Angular coverage for winning by combat or
  sale, post-finish command rejection, lifecycle authorization, unfinished-game
  rejection, and victory controls.
- an ordered, match-long game log accumulated from authoritative domain events,
  with stable sequence and turn metadata, persistence across full-state
  synchronization and reconnects, and no client-invented actions;
- player-specific log projection that exposes all public events and only the
  current viewer's private draws/deals/discards, including readable card details
  without leaking another player's hidden cards;
- an always-available localized Game History button and mobile dialog showing the
  complete chronological history during play and after victory.
- a compact synchronized latest-actions panel derived from public authoritative
  events, including explicit level-loss, pending-discard, and discard-summary
  outcomes visible to every player without opening the full history;
- typed player-choice discard effects with a reconnect-safe pending decision,
  exact server validation, blocked unrelated commands, private selectable card
  identities, and public waiting/result summaries;
- a mobile discard-selection panel for the affected player and a synchronized
  waiting state for everyone else;
- a multi-item sale dialog covering hand and equipped items, with a running
  authoritative-input total, complete 1,000-value level preview, unused-remainder
  preview, and atomic confirmation;
- server-random charity through the retained localized "Remove random excess
  cards" action, without trusting the client to select which excess cards leave
  the hand.

## Verification

The shared application header now includes a localized fullscreen control when
the browser supports the Fullscreen API. It tracks browser-driven fullscreen
changes, including exiting with Escape, and remains available in the lobby and
during play.

Verified on 2026-08-20 after the current gameplay and UI corrections:

- `npm test` — succeeded; 18 test files and 111 tests passed across all workspaces;
- `npm run test:e2e --workspace @munchkin-lan/server -- --runInBand` — succeeded;
  2 suites and 3 HTTP/Socket.IO end-to-end tests passed;
- `npm run lint` — succeeded across all four workspaces with 0 errors;
- `npm run build` — succeeded for shared packages, Angular, and NestJS;
- `npm run format:check` — succeeded across the repository.
- the live development application was inspected in the in-app browser at 360,
  390, and 412 px, including public events, reconnect/reload acknowledgement,
  card and character bottom sheets, combat-card confirmation, retained combat
  cards, keyboard Escape, focus, and horizontal-overflow checks.

## Intentional scope limits

- Sessions and games remain in memory and are lost when the NestJS process
  restarts, as required for the initial LAN version.
- Helper reward negotiation is intentionally deferred; all current combat
  rewards go to the active player.
- Helpers do not yet make separate escape rolls or receive bad stuff; Milestone
  10 intentionally uses one active-player escape resolution for the combat.
- NestJS does not yet serve the Angular production files; development still uses
  Angular on port 4200 and NestJS on port 3000. The one-origin LAN package remains
  Milestone 13 work.

## Next

```text
Milestone 13 — LAN production
```

Serve the Angular production build from NestJS on the same origin, listen on all
LAN interfaces, and display the LAN URL for phone clients.
