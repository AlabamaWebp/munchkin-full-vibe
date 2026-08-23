# Project status

Current milestone:

```text
V2 final audit complete; live-game blockers remain
```

## Game log targeting (2026-08-23)

- targeted card plays now show the acting player and the player who was
  targeted; this makes Curse entries explicitly identify who received them.

## Companion power in profile (2026-08-23)

- character-sheet companion and mount slots now receive and display their
  authored combat bonus, rather than rendering the Equipment-only fallback of
  `+0`.

## Curse timing (2026-08-23)

- ordinary hand Curses are now server-authorized throughout an in-progress game:
  on any player's turn, during combat, and during a combat-reaction window;
- Curse plays during combat carry the current combat address and, when they
  resolve immediately, reset the reaction window through the existing
  authoritative intervention flow; protection and card-choice responses remain
  blocking until resolved;
- player-specific available intents now expose legal Curse targets in combat and
  during the reaction window, so the mobile card menu offers the action whenever
  it is currently legal.

## Current-phase card activity (2026-08-23)

- `app-game-stage` now presents the newest visible card event for the current
  game phase, including its matching action text and a card-detail entry point;
- multi-card events, such as sales, use a compact selectable card rail above
  the displayed card;
- the presentation is derived only from the server-projected event log and its
  authoritative phase stamp, so cards automatically leave the stage when play
  moves to a new phase (for example, after opening another Door or ending a
  turn).
- cards and their summaries on the game stage now use the selected catalog
  locale; private Door/Treasure draws are projected to other players only as
  an identity-free question-mark card with the deck and count.
- card activity is additionally scoped to the current turn number, preventing
  a card played during a previous `TURN_START` from reappearing at the start
  of the next turn.
- simultaneous combat rewards are grouped into recipient tabs; each viewer sees
  their own reward identities while the other recipients remain question-mark
  cards.
- starting-hand deals remain private history only and are intentionally omitted
  from the in-stage card activity area.
- combat reward captions now state that cards were received (with their count)
  instead of falling back to the misleading “card played” wording.
- multi-card utility draws now combine into one in-stage card selector; public
  summaries identify whether the closed cards came from the Door or Treasure
  deck.
- card-receipt captions now explicitly state whether the recipient got the
  card openly or facedown.

## Optional-set card interaction (2026-08-23)

- connected the server-authorized optional-set intents to the card details UI:
  Companions can be played into their own slots, Double Identity permissions can
  be activated or discarded, and Arsenal attachments can select an eligible
  equipped item;
- added public character-sheet slots for a hireling, mount, active role
  permissions, and every active Class/Race card, so a second role remains
  inspectable and actionable;
- added Angular coverage for the three previously unreachable actions and the
  new public slots.

## Sale card selection UI (2026-08-23)

- item-sale rows now show each card's artwork on the left and an independent `i`
  button that opens the same card-details dialog used by the hand;
- selected sale cards have a clear amber highlight and expose their selected
  state to assistive technology;
- aligned the information button in a dedicated row column so it stays vertically
  centered on mobile;
- applied the same artwork, selection, and card-details interaction to charity
  card choices;
- added Angular coverage for sale and charity artwork, selection, and details.
- removed the persistent unequip buttons from the current player's profile;
  available `UNEQUIP_ITEM` actions now appear in the selected equipped card's
  details menu, preserving server-authoritative availability.
- added server-authoritative `DISCARD_ROLE` for active Class/Race cards, with
  explicit `Сбросить класс` and `Сбросить расу` actions available from the role-card details menu; the selected role is removed from the public role zone and placed in the matching discard pile;
- sale and charity rows now open card information by clicking the artwork and
  use a full-height selection control without a separate information button.
- sale rows now mark equipped items separately from cards held in hand.
- the expanded hand menu now renders only compact card type, bonus, and price
  facts alongside the artwork and name, while the dock keeps its short card view.
- compact hand cards now let the artwork fill all remaining space above the
  name and single facts row.
- removed the unused `i` button from compact hand cards; clicking the card
  itself remains the details entry point.
- compact hand card names now use the active locale formatter, including the
  Russian card catalog when Russian is selected.
- compact card names are centered both horizontally and vertically within their
  two-line title area.

## UI combat pass (2026-08-23)

- moved the approved combat UI from the development-only fixture into the live game flow: `LobbyClient`'s Socket.IO-fed `GameView` signal now renders the same `GameShellComponent`; the fixed `/dev/ui/combat` mock and its route override were removed;
- completed the first mobile combat layout pass: fixed-height table shell, turn controls, horizontally scrollable public-player and hand rails, one event capsule, character summary, intent-complete action dock, and warm table design tokens;
- no game-engine, server, or Socket.IO contracts were changed.
- added Angular coverage for the live application signal, empty equipment/no-class state, empty and five-card hands, long names, two-player rendering, combat win/loss totals, and history open/filter/close behavior.
- changed hand-card interaction so a card click always opens its details first; the server-authorized «Надеть» action is available only inside that detail sheet when its `EQUIP_ITEM` intent is projected.
- game history now displays newest turns and events first; combat, player, hand, and overlay accents use the warm brown/amber palette of the tabletop background instead of green.
- fixed stage prioritization: whenever a combat object is projected, the Monster card and combat panel stay visible even while escape resolution or a blocking decision is active; blocking choices remain their existing overlay.
- cards blocked solely by an occupied Equipment slot or insufficient hands now offer «Переодеть» in their details: the client sends the server-authorized unequip commands for only the conflicting items, then equips the selected item in order.
- «Переодеть» now includes the static Equipment combat-bonus change (for example, `+2 силы` or `-1 силы`) after replacing only the conflicting items.
- server-projected card sale and charity actions now appear in the primary bottom action dock outside combat, rather than in the menu; an empty dock stays silent on the viewer's own turn.
- game history now displays `ROLE_PLAYED` and `ROLE_DISCARDED` events, including the player, Class/Race kind, and card name.
- help-offer controls use the server-projected Treasure bounds: the
  selected amount is clamped to the current reward, the increment control disables at its
  maximum, and the UI shows the available `current / maximum` range.
- Help negotiation now has a single offer flow: the invited player can only accept or
  reject, while the active player can withdraw the request. Rejections, withdrawals, and
  new requests may repeat without a per-combat limit; the log and offer sheet show the
  promised/total Treasure count (for example, `2/3`).
- integrated the supplied tabletop background and completed a mobile visual-alignment pass for
  the combat shell: corrected the row allocation that collapsed the combat stage, then refined
  the combat card, score hierarchy, player rail, character summary, hand cards, action dock,
  and warm brass/wood surface treatment against the mobile reference; no UX or game logic changed.
- repeated the 390×844 comparison after product review: the combat focus is now a vertical card
  with a framed art field and reward plaque; the development fixture presents the two-player
  combat composition from the reference; action emphasis is card → help → escape; and the
  character strip now exposes equipped items instead of a count.

## Final audit (2026-08-22)

- fixed conditional Monster strength/reward-tier resolution, attachment cleanup
  and projection, raw-tier leakage, stable discard-decision validation, and
  compact-card touch targets; added focused regression coverage;
- repeated deterministic balance sampling with the documented 20,000-iteration
  seeds and an additional 5,000-iteration seed batch; no tuning change was
  justified;
- manually verified the active game document at 360×640, 390×844, 430×932, and
  desktop: no page scroll, primary action visible, and no sub-44 px buttons;
- V2 is not yet ready for a real party because deadline/default transitions,
  target-only Curse responses, unified server-projected intents/events, and
  cross-combat stale-command isolation remain incomplete;
- full findings and gate results: `docs/v2-final-audit.md`.
- design documentation now requires cosmetic local avatar selection in the
  lobby, with the selected avatar shown consistently in lobby and game player
  surfaces.

## Implemented

- replaced the development catalog with an explicit 80-definition / 192-card
  Core and complete Companions 12/24, Arsenal 16/36, and Dual Identity 12/24
  optional sets; all copies, tiers, sets, ids, and art keys are authored data;
- authored the full 20-Monster curve, 12-Curse severity curve, 20-slot Equipment
  economy, identity roles, combat resources, utilities, companions, weapon
  enhancers, protection, hunting gear, and second-role permissions;
- activated reusable companion replacement, Equipment attachment targets,
  conditional Equipment power/Run Away modifiers, and automatic typed Curse
  protection without card-name rules or client-calculated results;
- added complete RU/EN catalog localization with stable fallback behavior and a
  documented placeholder-art list; no artwork was generated;
- added a seeded development-only balance harness, deterministic CI smoke test,
  multi-seed report, catalog invariants, expansion filtering, restrictions,
  timing/target, sellability, companion, attachment, protection, and permission
  coverage; see `docs/v2-balance-report.md`;

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

Verified on 2026-08-22 after the V2 gameplay-mechanics pass:

- `npm test` — succeeded; 26 test files/suites and 188 tests passed across all
  workspaces;
- `npm run test:e2e --workspace @munchkin-lan/server` — succeeded;
  2 suites and 3 HTTP/Socket.IO end-to-end tests passed;
- `npm run lint` — succeeded across all four workspaces with 0 errors;
- `npm run typecheck` — succeeded for all shared packages and applications;
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
- NestJS does not yet serve the Angular production files; development still uses
  Angular on port 4200 and NestJS on port 3000. The one-origin LAN package remains
  Milestone 13 work.

## Next

```text
V2 Milestone 04 — card content and balance tuning
```

Expand and tune the production Tier 1/2/3 catalog, role abilities, and permission
cards, then validate the target distributions with seeded simulations. The
previously planned one-origin LAN production packaging remains outstanding after
the V2 gameplay/content sequence.

# Card art prompt export

- Added `npm run generate:card-art-csv` to export the development card catalog to `generated/card-art-prompts.csv`.
- Regenerated the export on 2026-08-22 from the current game-engine catalog: 120 card definitions with unique IDs.

## V2 gameplay core (schema 5, complete)

- Introduced schema 5 game configuration, enabled-set filtering, PlayerSex,
  role arrays/capacity primitives, typed active effects, companion slots, and
  serialized V2 help/run-away containers.
- Added catalog tier/set/tag metadata and typed condition/modifier primitives;
  public game and lobby projections now carry V2 configuration, Sex, role, and
  companion facts without exposing private cards.
- Added host-controlled lobby settings and self-controlled Sex selection; room
  start requires every player to choose Sex.
- Added deterministic tier-aware Balanced draws, Classic Chaos top draws,
  atomic recycling, per-player starter reservation, computed Makeshift Tools,
  and authoritative Scavenge eligibility/recovery.
- Updated sales to cover eligible Treasure cards while preventing a sale from
  reaching level 10; added immutable offer/counter help agreements and private
  helper reward partitioning.
- Run away now processes every encounter in active/helper order with independent
  server rolls, death skipping, shared Bad Stuff handling, and reconnect-safe
  pending choices.
- Activated typed Sex/Class/Race/tag conditions, multi-role permissions and
  role-retention decisions with one equipment revalidation pass.
- Added authoritative commands, events, privacy-safe projections, availability
  reasons, and minimal Angular adapters without starting the planned UI redesign.
- All schema-4 fixtures were migrated and the full quality gate is green.

## Remaining V2 scope

- Card-content distribution and tuning, including broader Tier 2/3 coverage,
  production role abilities, permission cards, and seeded balance simulation,
  remain the card-balance Milestone 04 work.
- The remaining secondary UI work is listed under the mobile-shell section
  below; the fixed-viewport interaction redesign is now implemented.

## V2 mobile game shell

- Replaced the page-growing in-game composition and separate brand header with
  a safe-area-aware fixed `100dvh` shell containing standalone Player HUD,
  authoritative recent-event strip, state-selected Stage/Combat Stage, compact
  Hand Dock, and bounded Action Dock components.
- Added explicit Stage mapping for turn-ready, Door result, post-Door choice,
  combat, victory reaction, run away, blocking decision, cleanup, and finished
  states. Combat now leads with both totals and a signed difference, focuses one
  encounter while retaining multi-Monster tabs, and keeps rewards, modifiers,
  helper agreement, and Bad Stuff visible.
- Added direct playable-card interaction, automatic sole-target dispatch,
  multiple-use/target pickers, compact type-specific facts, playable-first hand
  preview, scrollable Full Hand/History/Details sheets, help negotiation, power
  breakdown, character sheet, and reconnect-safe blocking choices.
- Deleted the legacy full hand grid, long vertical character/combat/history
  composition, fixed action bar, mandatory Details-before-action route,
  duplicate public/feedback event signals, seen-sequence local storage, and
  semantic toast timers.
- Chromium overflow checks passed at `360x640`, `390x844`, `430x932`, and
  `1024x768`: document and game root client/scroll dimensions were identical on
  both axes. HUD, Stage, and Hand Dock had no internal overflow; the 8-card Full
  Hand sheet scrolled internally while the document remained `360x640`.

Secondary Milestone 06 UI work still remaining:

- complete an English translation pass for the Russian-first game-shell copy;
- add automated browser viewport/a11y coverage to CI (the current exact viewport
  pass is a manual Chromium QA run).

## V2 secondary interaction pass

- Added host Lobby controls for Balanced / Classic Chaos and the three optional
  sets before game start, while Core remains implicit and settings become
  read-only after start.
- Expanded the fixed shell with grouped Full Hand browsing, projected Sale and
  Charity sheets, turn-grouped All / Combat / Me history, detailed card metadata,
  compact Look For Trouble target facts, role/companion-aware character sheets,
  persistent hand-limit warnings, and explicit death/revival copy.
- Character sheets now use the compact equipment layout and expose only
  server-projected own unequip actions; other player sheets remain read-only.
- Added contextual command feedback, stale-sale/charity sheet closing, keyboard
  focus traps with focus return, and human-readable presentation labels instead
  of raw enums in the added sheets.

Verified on 2026-08-22 after the V2 mobile-shell redesign:

- `npm test` — succeeded; 29 test files/suites and 200 tests passed across all
  workspaces;
- `npm run test:e2e --workspace @munchkin-lan/server` — succeeded; 2 suites and
  3 end-to-end tests passed;
- `npm run lint` — succeeded across all workspaces with 0 errors;
- `npm run typecheck` — succeeded for all packages and applications;
- `npm run build` — succeeded for contracts, game engine, Angular, and NestJS;
- `npm run format:check` — succeeded across the repository.

## V2 final-audit blockers closed

- Every combat has a game-unique serialized `combatId`; combat commands validate
  it and the current mutable revision, while encounter, reaction, offer, and
  decision ids retain their separate scopes. Stale rejection is atomic.
- The engine owns absolute blocking deadlines through an injected clock and
  authoritative expiry transitions. NestJS timers only wake the current game,
  re-read state, publish the resulting view, and schedule the next deadline.
- Target-only Curse Response supports decline, private cancel protection, and
  protecting one affected Item through the existing pending-decision workflow.
- `AvailableIntentView` is now the sole action projection. Angular no longer
  reconstructs permissions from legacy action arrays, and event importance is
  assigned exhaustively by the authoritative projection.
- Focused regressions cover stale combat packets, fake-clock expiry and
  idempotency, old timers, reconnect views, Curse response privacy/defaults,
  intent ownership/states, and table-driven event importance.

Verified on 2026-08-22 after closing the final-audit blockers:

- `npm test` — succeeded; 30 test files/suites and 282 tests passed;
- `npm run test:e2e --workspace @munchkin-lan/server` — succeeded; 2 suites and
  3 end-to-end tests passed;
- `npm run lint` — succeeded across all workspaces with 0 errors;
- `npm run typecheck` — succeeded for all packages and applications;
- `npm run build` — succeeded for contracts, game engine, Angular, and NestJS;
- `npm run format:check` — succeeded across the repository;
- `npm run balance:simulate` — succeeded with the unchanged 120-definition,
  276-physical-card catalog and no notable balance shift.

## UI visual direction documented

- Added `docs/ui/DESIGN.md` with the shared mobile-first fantasy-table design
  language, fixed-viewport rules, accessibility baseline, responsive order, and
  an explicit preserve/replace audit of the current Angular UI.
- Added `docs/ui/combat-mobile.md`, mapping every relevant element of the combat
  reference to the existing player-specific `GameView` and
  `AvailableIntentView`, including multi-Monster combat, help negotiation,
  victory reactions, escape, private hand, and blocking workflows.
- The implementation plan targets `390 x 844` first, then compact mobile,
  tablet, and desktop. No production code, game logic, DTO, backend, or
  WebSocket protocol was changed in this documentation pass.

## Combat mobile visual QA pass

- Compared the combat shell at the target `390 x 844` viewport with
  `docs/ui/reference/combat-mobile.png` and completed two screenshot-based
  correction cycles.
- Fixed the wide-layout grid allocation after the action and character rows
  were added: all six table sections now retain an explicit row, so the combat
  stage cannot collapse at wider viewport sizes.
- Strengthened the fantasy-table hierarchy, turn banner, two-player rail,
  recent-event capsule, Monster frame and strength badge, parchment reward,
  combat totals and losing-state guidance, action hierarchy, character and
  Equipment summary, and five-card hand presentation.
- Kept the existing `GameView`, available intents, command payloads, dialogs,
  and game rules unchanged. The new reward declension is display-only.
- Browser QA confirmed exact `390 x 844` document dimensions, no page overflow,
  and a five-card hand rail whose client and scroll widths both equal `379px`.

Verified on 2026-08-23 after the combat mobile visual QA pass:

- `npm test` — succeeded; 30 test files/suites and 282 tests passed;
- `npm run lint` — succeeded across all workspaces with 0 errors;
- `npm run build` — succeeded for contracts, game engine, Angular, and NestJS;
  Angular retained the existing initial-bundle budget warning (`506.71 kB`
  versus the `500 kB` warning budget).

## Combat responsive adaptation

- Added a compact-height presentation for `360 x 640`: the Monster, score,
  actions, profile, and hand stay inside the fixed viewport, secondary action
  copy is reduced, and all primary action targets remain at least `56px` high.
- Preserved the reference-aligned vertical composition through phone and small
  tablet widths, including the intermediate `600 x 900` viewport.
- Added a two-column table from `768px`: combat and contextual actions remain
  the visual focus on the left, while the own-character summary and a two-column
  private-hand rail remain visible on the right.
- Constrained wide layouts to a centered `72rem` table and enlarged the Monster
  proportionally without stretching cards or profile Equipment beyond their
  frames.
- Browser QA passed at `360 x 640`, `390 x 844`, `430 x 932`, `600 x 900`,
  `768 x 1024`, `1024 x 768`, `1366 x 768`, and `1440 x 900`. The document,
  stage, action dock, character summary, and hand reported no overflow on either
  axis at every checkpoint.

Verified on 2026-08-23 after the responsive adaptation:

- `npm test` — succeeded; 30 test files/suites and 282 tests passed;
- `npm run lint` — succeeded across all workspaces with 0 errors;
- `npm run build` — succeeded for contracts, game engine, Angular, and NestJS;
  the Angular initial bundle is `509.52 kB`, retaining the existing `500 kB`
  warning budget.

## Combat hand mobile refinement

- The combat shell represents the eight-card starting hand.
- The in-game hand uses a horizontally scrollable, snap-aligned card rail with
  readable card widths instead of squeezing five cards into the viewport.
- The Full Hand dialog now fills the viewport; the hand button remains available
  whenever the player has cards.
- Expanded the losing-combat hint and changed card artwork to contain and center
  the entire image rather than cropping it.
- Removed the persistent hand-limit warning, increased the mobile card-rail
  width in favor of horizontal scrolling, and added several recent-event
  examples to the combat development fixture.

## Combat overlays and palette refinement

- Reduced the mobile action dock height so the losing-combat hint keeps its own
  readable row at `390 x 844` without reducing action-label legibility.
- Made profile, card details, history, menu, and action panels fill the viewport
  on mobile and raised card details above the profile overlay when opened from
  Equipment.
- Reworked overlay, Equipment, and action surfaces toward the warm brown,
  amber, and olive palette of the game background.

## Recent actions presentation

- Changed the recent-actions strip to a vertical, newest-first list.
- Kept the source list capped at the latest three events and clipped overflow
  without horizontal scrolling, so a tight viewport still shows the newest
  visible entry first.

## Overlay sizing and recent-actions containment

- Constrained the recent-actions host and strip to their grid row so the latest
  three entries redistribute into the available height with ellipsis instead
  of painting under the combat card.
- Standardized profile, card, history, menu, and action panels as bottom sheets
  occupying 90% of the viewport, including the full-hand panel.

## Combat viewport sizing

- Kept the player strip fully visible without horizontal scrolling by fitting
  player tiles into the available header width.
- Made recent actions use a larger readable type size while preserving the
  newest entry at short heights.
- Put monster tabs into a horizontally scrollable strip and let the focused
  monster card expand into the free combat-stage space; the dev combat fixture
  now contains four monsters for responsive testing.
- Increased the combat score area and power numerals so larger totals remain
  legible.
- Scoped card-art fallback state to the failed image URL, so switching from a
  card without artwork back to a card with artwork restores the image.
- Tightened the player HUD grid to keep the complete player tiles visible,
  enlarged recent-action text while retaining at least the newest entry, and
  constrained focused monster artwork to a full portrait image without crop.
- Kept history filters at their natural height instead of letting the sheet grid
  stretch the tab row vertically; centered the monster image inside a bounded
  portrait viewport.
- Limited history access to the recent-actions panel, moved fullscreen toggle
  to the top-right HUD button, and reduced the recent-actions list to two
  entries.
- Isolated the central monster artwork to its own bounded layer and reserved
  space for names in compact hand cards so bottom cards show both image and
  title.
- Simplified and shortened the character summary to identity, level, power,
  and hand count; equipment artwork is no longer shown there.

## Latest UI update

- Убрана дублирующая запись о сокровищах без количества: в логе остаётся запись
  `получил сокровища: N`.
- В нижней строке карточек меню руки у монстров теперь отображается их сила
  рядом с типом и стоимостью, аналогично бонусу снаряжения.
- Меню полной руки теперь остаётся открытым после надевания снаряжения; закрываются
  только карточка и меню действия, чтобы можно было сразу продолжить выбор карт.

- В `app-hand-dock` сводка персонажа и компактная кнопка открытия меню руки
  теперь находятся в одной строке; прежняя кнопка `.full-hand`, перекрывавшая
  карточки руки, удалена.
- Строка сводки и меню руки закреплена внизу hand dock, а список последних
  действий выводит пять последних доступных игроку записей, включая обычные
  действия. На мобильных устройствах карточки руки скрыты, чтобы освободить
  высоту для игровой сцены и событий; на desktop они остаются в правой панели
  над этой строкой.

- Компактные окна выбора (продажа, поиск неприятностей и другие списки) и меню
  «Все действия» теперь подстраивают высоту под содержимое; прокрутка остаётся
  только при превышении доступной высоты экрана.

- Улучшены русские описания карт: классы и расы теперь показывают конкретный
  постоянный бонус и условие его применения, а Utility-карты — колоду и точное
  количество карт, которые они добирают. Описания строятся из типизированных
  эффектов каталога, поэтому не дублируют игровую логику в интерфейсе.
- Проклятия теперь также показывают конкретное последствие: потерю уровня,
  сброс карты из руки или предмета, потерю класса/расы и смерть.
- Исправлены `artKey` проклятий: префикс `curse-` теперь сохраняется, поэтому
  карта «Проклятие! Не тот поворот» загружает `curse-wrong-turn.png`.

- Добавлены переносимые по строкам вкладки руки для проклятий, монстров, рас и
  классов. Вкладка боевых карт теперь показывает только усиления с таймингом
  `ACTIVE_COMBAT`.

- The general "Look for trouble" action now always opens the Monster picker,
  including when exactly one legal Monster is in hand. Combat begins only after
  the player explicitly chooses that card.
- Menu action buttons now size to their content instead of stretching across the sheet.
- Bottom hand cards now use a narrower image-oriented layout with a full-height contained illustration and one-line ellipsized name.
- Small game-screen labels and controls now use more readable type sizes while retaining truncation and compact layout constraints.
- Compact card names now wrap to at most two lines before truncating.
- Typography was increased across the game screen, and the centered combat monster artwork now has a stricter responsive height limit so it stays inside the viewport.
- The help action keeps its secondary label readable, and the help dialog now sizes its action buttons to their content.
- The combat power sheet now shows each Monster's image, strength, level reward, Treasure reward, and attached modifier cards; the development Map-Eater encounter includes a +5 strength / +1 Treasure modifier card.
- History now has tabs for the current turn and each player, with event colors grouped by category.
- The full hand view now lays out three cards per row on compact screens.
- The character summary now shows the character's sex directly below the nickname.
- Bottom hand cards show only their card names below the artwork.
- Card artwork in the hand and active combat uses the card's full 3:4 image without cropping.

## Lobby start gate

- Кнопка «Начать игру» у ведущего теперь заблокирована, пока каждый игрок в
  комнате не выберет пол персонажа. Серверная проверка `SEX_REQUIRED` сохранена
  как авторитетная защита, а интерфейс показывает ведущему причину блокировки.
