# Project status

Current milestone:

```text
Milestone 12.4 — Mobile-first card presentation (complete)
```

## Implemented

- replaced all behaviorless production `OTHER` cards with original functional
  content and expanded the set to 20 unique Door and 22 unique Treasure
  definitions (56 Door and 66 Treasure physical cards for 3–6 players);
- added eight varied Monsters, six ordinary and one combat Curse, two Classes,
  two Races, ten equipment items, one-shot bonuses for both combat sides,
  Monster strength/reward modifiers, weakening, adding, and cloning;
- added a stable unique `artKey` to every production definition, explicit
  `goldValue` to every Treasure, and typed play timing/target metadata for action
  cards, all passed through player-specific `GameCardView` projections;
- moved production equipment power and value to explicit typed metadata: slot,
  occupied hands, combat bonus, gold value, and an explicit Class/Race
  restrictions list; sales and combat power remain engine-derived;
- completed original English source copy and Russian localization for every
  catalog definition without changing the card-face layout;
- added catalog completeness coverage for definition/art-key uniqueness, minimum
  definition and copy counts, absence of fillers, empty-effect policy, Treasure
  values, action policies, equipment fields, and complete RU translations;

- direct `RESOLVE_COMBAT` removal in favor of a versioned
  `DECLARE_COMBAT_VICTORY` / `PASS_COMBAT_REACTION` protocol, with immediate
  single-player resolution and atomic final-confirmation power/reward checks;
- a JSON-serializable, reconnect-safe combat reaction window containing the
  claimant, combat revision, monotonic window id, confirmed permanent player ids,
  and derived waiting list; disconnected players remain awaited;
- exact-window stale/duplicate command rejection, confirmed-player intervention
  blocking, full confirmation reset after every intervention, and automatic claim
  cancellation when the player side loses its strict lead;
- reaction-window command gating plus typed combat Curse, add-Monster, clone,
  selected-Monster strengthen/weaken, player-side bonus, and selected-Monster-side
  bonus reactions, without client-submitted power or card-name rules;
- original Combat Curse! Tangled Bootlaces, Heroic Snack Break, and Ominous Stage
  Light development cards, including typed side restrictions and RU localization;
- player-specific reaction projection and a mobile RU/EN panel showing confirmed
  and awaited players, disconnected waiters, available reaction cards, pass state,
  and versioned UI commands;
- focused engine coverage for multiplayer waiting, reconnect-safe serialization,
  final-pass resolution, solo resolution, command blocking, confirmed-player
  locking, reset/cancel behavior, every allowed typed reaction, invalid targets,
  and stale/duplicate races; plus server projection/validation and Angular UI
  coverage;

- schema version 4 multi-Monster combat with stable branded `encounterId`
  values, ordered participants, stored base parameters, independent strength and
  Treasure modifiers, and public per-Monster played-card attachments;
- total Monster-side power plus atomic summed level/Treasure rewards, including
  the strength floor of one, Treasure floor of zero, and unique physical-card
  cleanup for all participating Monsters, add/clone cards, and modifiers;
- original typed add-Monster and clone-Monster cards: adding consumes a selected
  owned hand Monster, while cloning creates an independent snapshot containing
  every modifier and reward change already applied to its target;
- encounter-addressed typed Monster modifiers, including a +5 strength/+2
  Treasure booster and a -5 strength/-1 Treasure weakening, with no card-name
  rules or client-submitted calculations;
- sequential per-Monster run-away rolls and bad stuff, with serializable progress,
  ordered public attempt events, reconnect-safe chosen-card pending decisions,
  and automatic continuation at the next Monster;
- updated transport contracts, authoritative event/history projection,
  player-specific `GameView`, RU/EN labels, target selection, multi-Monster combat
  board, per-Monster modifiers/rewards/bad stuff, and ordered escape results;
- focused engine coverage for valid and invalid encounter targets, adding,
  cloning and snapshot independence, reward sums, lower bounds, physical cleanup,
  multiple Monsters, sequential escape, and reconnect continuation;

- authoritative `LOOK_FOR_TROUBLE` in `POST_DOOR`, requiring exactly one owned
  Monster from the active player's hand, publishing that Monster, removing it
  from the private hand, and starting the normal combat lifecycle;
- server-projected `LOOK_FOR_TROUBLE` availability and exact eligible Monster
  ids, a localized RU/EN one-Monster selection dialog, public game-history/card
  presentation, and generic Socket.IO command routing without client-calculated
  combat state;
- one atomic Door/Treasure draw mechanism that consumes the current pile first,
  deterministically shuffles the matching discard through `RandomSource` only
  when needed, and continues across the pile boundary;
- cyclic draws applied to kicking the Door, room loot, typed draw effects, combat
  Treasure rewards, and exact four-Door/four-Treasure revival, with no partial
  state change when the combined matching pile is too short;
- a public identity-free `DECK_RESHUFFLED` event, projected into synchronized
  game history with localized RU/EN text;
- deterministic engine, projection, transport-validation, and Angular coverage
  for ordinary draws, boundary recycling, empty discard, independent Door and
  Treasure recycling, revival atomicity, and valid/invalid
  `LOOK_FOR_TROUBLE` actions;

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
- a multi-row private-hand grid with two readable cards per row at the 360 px
  minimum target, no horizontal carousel, stable minimum card widths, and natural
  wrapping through every later row;
- one deterministic copyright-safe illustration placeholder derived from each
  definition's stable `artKey`, reused unchanged in the hand, public-event stack,
  history thumbnails, combat, and card-details dialog;
- complete localized card-face and detail metadata for Monster base/current level,
  level/Treasure rewards and bad stuff; equipment slot, occupied hands, bonus,
  value, and Class/Race restrictions; Treasure values; modifier strength/Treasure
  changes; and typed permitted timing/target presentation;
- independently scrollable safe-area-aware card details with a persistent header,
  wrapping titles/facts, and explicit base-to-current Monster strength and Treasure
  values for modified and cloned encounters;
- a non-blocking central stack for newly revealed or publicly played cards, based
  on the existing authoritative game log and persisted per-viewer sequence
  acknowledgement so refresh/reconnect does not replay already seen notices;
- interactive game-history entries that open all viewer-visible related cards,
  localized effects, source/target, turn, phase, and actual server-confirmed result;
- responsive public character dialogs/bottom sheets constrained to safe-area-aware
  `100dvh`, with an always-accessible header/close control and an independently
  scrollable body for stats, statuses, and fully populated equipment; long player,
  equipment, Class, and Race names wrap without creating page overflow;
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
  360, 390, and 412 px, including multi-row hands without horizontal scrolling;

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
  character and equipment panel, wrapping private-hand grid, card details,
  connection feedback, and a persistent action bar;
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
  Monster-modification effects, including localized fictional development
  cards, encounter-target validation, cleanup, and power projection;
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
  typed role restrictions for equipment, including shared full-equipment
  revalidation after role replacement or `DISCARD_ROLE` Curse effects, public
  unequip events, and private-hand return for every incompatible item;
- player-targeted Curse play from private hands, including typed role loss and
  death effects without card-name checks;
- data-driven equipment values and authoritative sales, with one engine-derived
  level per complete 1,000 gold and atomic validation of item selections;
- equipment trading into another player's private hand outside combat;
- a five-card end-turn hand limit and authoritative selected or random charity
  to a chosen lowest-level player, or discard when the active player is tied for
  lowest level; a mobile exact-count selection dialog keeps the random option;
- public charity summaries reveal only sender, recipient, and count, while
  sender/recipient reconnect-safe private history includes the exact cards;
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
- one compact synchronized turn/activity panel that keeps the expected actor and
  action visible beside the three latest public authoritative events, including
  explicit level-loss, pending-discard, and discard-summary outcomes;
- history rows keep event text as the primary flexible content and expose card
  details through localized icon-only trailing controls with 44 px tap targets
  and complete accessible names;
- typed player-choice discard effects with a reconnect-safe pending decision,
  exact server validation, blocked unrelated commands, private selectable card
  identities, and public waiting/result summaries;
- a mobile discard-selection panel for the affected player and a synchronized
  waiting state for everyone else;
- a multi-item sale dialog covering hand and equipped items, with a running
  authoritative-input total, complete 1,000-value level preview, unused-remainder
  preview, and atomic confirmation;
- server-random charity remains available beside the exact-card charity dialog;
  both paths use the existing authoritative charity mechanics.

## Verification

The shared application header now includes a localized fullscreen control when
the browser supports the Fullscreen API. It tracks browser-driven fullscreen
changes, including exiting with Escape, and remains available in the lobby and
during play.

Verified on 2026-08-20 after the mobile-first card presentation pass:

- `npm test` — succeeded; 24 test files/suites and 164 tests passed across all
  workspaces;
- `npm run test:e2e --workspace @munchkin-lan/server -- --runInBand` — succeeded;
  2 suites and 3 HTTP/Socket.IO end-to-end tests passed;
- `npm run lint` — succeeded across all four workspaces with 0 errors;
- `npm run build` — succeeded for shared packages, Angular, and NestJS;
- `npm run format:check` — succeeded across the repository.

The focused mobile UI inspection on 2026-08-20 used a live one-player LAN match
with a long player name and eight-card hand at 360, 390, and 412 px. At 360 px it
rendered two 153 px cards in each of four rows; at 390 and 412 px the two columns
grew to 168 and 179 px. Every width had equal hand client/scroll width, zero page
overflow, and no card overlap. The same `artKey` placeholder was confirmed in the
hand, public zone, history, and details. A 360 × 640 details sheet kept its 73 px
header visible while the 520 px content viewport scrolled long metadata. The
multi-Monster fixture rendered two ordered encounter cards without overflow and
showed base/current level 8/13 plus Treasure reward 2→4. Long card/player text,
all metadata categories, and multi-row behavior are additionally covered by the
Angular component fixtures.

## Intentional scope limits

- Sessions and games remain in memory and are lost when the NestJS process
  restarts, as required for the initial LAN version.
- Helper reward negotiation is intentionally deferred; all current combat
  rewards go to the active player.
- Helpers do not make escape rolls or receive bad stuff. The active player makes
  one sequential escape attempt for each Monster encounter.
- NestJS does not yet serve the Angular production files; development still uses
  Angular on port 4200 and NestJS on port 3000. The one-origin LAN package remains
  Milestone 13 work.

## Next

```text
Milestone 13 — LAN production
```

Serve the Angular production build from NestJS on the same origin, listen on all
LAN interfaces, and display the LAN URL for phone clients.
