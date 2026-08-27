# Project status

Status date: 2026-08-27
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
- Core catalog (shown as **Нейро 1**) plus optional Companions, Arsenal, Dual
  Identity, Classic Fantasy, Clerical Errors, and Steed & Hirelings sets;
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

- 2026-08-27: completed a system-level responsive audit of the fixed game scene
  across `360×640`, `390×844`, `430×932`, `768×1024`, and `1024×768`. The shell
  now gives Stage the actual remainder, caps focused `3:4` artwork without crop,
  keeps required Bad Stuff/reward/totals visible, bounds action overflow and
  sheets, uses compact scrollable player/hand rails, and releases obsolete docks
  for finished results. Real browser checks covered solo and six-player tables,
  long Russian names, small/large hands, card reveal, combat/reaction/help,
  escape, blocking discard/Curse, cleanup/charity, reconnect restoration, and
  finished standings. No engine, rules, DTO, projection, or transport behavior
  changed.
- 2026-08-26: completed the portrait mobile visual-polish pass across the
  fixed game shell. The turn banner now groups menu, History, and fullscreen
  controls into one compact HUD; the player rail and recent event are dense
  status surfaces; combat keeps a larger 3:4 focused encounter visually tied
  to a compact total/difference score; and the action dock uses icon-led
  primary/secondary plaques. The own-character strip now shows projected
  role/equipment facts and the hand remains a fixed-width portrait rail with a
  persistent Full Hand gateway. No engine, rules, contract, projection, or
  transport behavior changed.
- 2026-08-26: completed the second mobile presentation pass for the fixed
  `390×844` game scene. The event capsule, combat totals, focused Monster card,
  contextual actions, character utility row, and hand dock now use the available
  height more densely without changing projected intents or workflows. Single-
  encounter rewards are shown only on the focused Monster; multi-Monster combat
  retains the aggregate reward line. The shared artwork primitive now enforces
  the canonical `3:4` portrait geometry across stage, hand, Full Hand, pickers,
  breakdowns, and Details.
- 2026-08-26: refined the shared mobile game shell hierarchy for the fixed
  `390×844` scene. Cleanup now gives the current hand-limit task the stage
  focus and keeps prior card receipts in the event capsule/history; charity is
  visually primary when its server-projected intent is blocking. HUD controls
  use consistent local SVG icons, player and character rails are compact, hand
  previews retain readable horizontal cards, and normal action/card metadata
  follows the sans-serif `12px+` mobile contract. No rules, projections, or
  transport contracts changed.
- 2026-08-26: extended the shared combat stage across active reaction, pending
  help, and serialized escape workflows. One compact status-strip pattern keeps
  the encounter and authoritative totals visible while exposing only projected
  workflow facts; reaction countdown rows no longer overlap after a response.
  Focused web coverage now exercises the help/escape status alongside the
  existing multi-Monster, exact-target, reaction, and reconnect flows.
- 2026-08-26: refocused the mobile combat shell around the local-card-art stage:
  the top HUD and single authoritative event capsule are compact, the public
  player rail scrolls instead of squeezing identities, and the encounter now
  receives the remaining table height. The contextual-action dock and a
  persistent horizontally scrollable hand sit beneath it; the character summary
  remains compact. Shared tabletop CSS tokens now drive the common surfaces,
  while the existing projected `GameView`, intent, command, privacy, reconnect,
  and accessibility flows remain unchanged.
- 2026-08-25: combat victory reaction windows now use a serialized,
  engine-owned two-minute deadline on declaration and on each valid
  post-intervention reset. The combat UI renders the projected deadline only as
  a local remaining-time countdown; expiry continues to be resolved by the
  authoritative engine after server wake-up/reconnect.
- 2026-08-25: live two-player regressions closed. Legal typed Hireling/Mount
  plays are now covered from all enabled sets and the shell also consumes
  server-projected companion replacement intents. Targeted combat reactions now
  retain the exact projected combat revision and reaction-window id; a newer
  snapshot closes superseded pickers/actions, while server stale-address
  rejection remains intact. Engine/server/web regression coverage follows a
  winning declaration, opponent intervention, refreshed reaction window, and
  rejection of the old address.
- 2026-08-26: deadline-bearing blocking chosen-discard decisions now display a live
  projected remaining-time countdown, using the combat reaction formatter and the
  same replacement-safe interval pattern. Overlay and center-stage motion now uses
  explicit Angular enter/leave hooks instead of passive base CSS animation rules;
  initial reconnect rendering remains motion-free and reduced-motion still removes
  decorative animation.
- 2026-08-25: completed the projected-state frontend pass. Lobby hand-limit and
  double-ambush controls now follow host-only settings; combat filtering is
  derived from current legal intents (including Clone), and eligible equipment
  upgrades are server-hinted in both hand surfaces. Card pickers consistently
  expose artwork and Details without losing selection, optional companion/role
  slots follow enabled sets, and POST_DOOR actions remain intent-gated. Theft
  selects only server-approved targets, preserves hidden hands, and presents
  authoritative outcomes. Shared restrained sheet/stage motion respects reduced
  motion; focused Angular coverage and local 390×844/360×640 browser checks
  passed.
- 2026-08-25: completed a catalog pressure and interaction pass. Equipped theft
  is now data-authored at 2/6 while retaining its paid once-per-turn limit;
  hidden-hand theft, all four capacity modifiers, ordinary level-up, and optional
  ambush retain the previous generic mechanics. Added side-neutral negative
  combat pressure, a Magic Equipment package, and Construct companion/role
  links; raised selected mid/late Core Monsters without changing early pressure.
  Russian catalog names now have a test-enforced no-English-fallback guarantee,
  including «Проклятие! Узел клятв». The refreshed deterministic report records
  the pressure movement and remaining live-playtest uncertainty.
- 2026-08-25: added the next authoritative gameplay foundations: exact-side
  combat interference, bounded equipped and hidden-hand theft with reconnect-safe
  privacy, typed Head/Hands/Hireling/Mount capacity modifiers and revalidation,
  configurable hand limit, optional atomic two-Monster ambush Doors, non-combat
  level-9 cap, mandatory post-Door progression, and server-derived Equipment
  upgrade/replacement hints. New optional-set cards use original project names
  and text; deterministic engine/server coverage exercises randomness,
  atomicity, privacy, reconnect, and legality.
- 2026-08-25: completed the final browser command-path verification: active
  role abilities, exact-Monster modifiers, a real level-9 combat victory to
  level 10 across two clients, and one-player combat. Role-action sheets now
  close their parent character sheet before accepting cost input; solo combat
  no longer projects an impossible help request.
- 2026-08-24: added a fixed, development-only browser-QA scenario endpoint,
  guarded out of production, for reconstructing authoritative blocker, Curse,
  equipment, combat, escape, ability, and finished states. The targeted pass
  also localized decision-source and exact-Monster-picker names and uses the
  winner's selected Sex for the Russian results verb.
- 2026-08-24: browser-based UI audit corrected Russian immediate-event, charity, help-reward, and completed-escape copy. Completed escape attempts now project and render their authoritative combatant id, so helper results are distinguishable and Angular can use a stable attempt key.
- 2026-08-24: refined in-game information architecture around the authoritative
  `GameView`: pending decisions now project visual candidate-card metadata only
  to the addressed player; equipped item projections nest enhancer cards and
  server-resolved contributions; Details exposes typed passive facts. The mobile
  shell now separates card inspection from selection, names every active player
  in the turn bar, and filters only typed/sequence-known duplicate event
  presentations while keeping reconnect-safe domain history intact.
- 2026-08-24: expanded the selectable catalog with three original optional
  fantasy-inspired packs: Classic Fantasy, Clerical Errors, and Steed &
  Hirelings. Their mechanics reuse the role, attachment, companion, protection,
  and combat-target primitives; lobby display metadata keeps `CORE` stable while
  presenting it as “Нейро 1”. Catalog/setup/lobby/reconnect coverage now includes
  the expanded selection.
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

- 2026-08-26: extended the combat tabletop presentation system across the
  entry/create/join flow, lobby and host settings, stage messaging, finished
  results, character equipment, and card details. Shared semantic tokens now
  drive the warm timber, brass, and leather surfaces while the existing
  GameView/available-intent interaction paths and fixed-height game shell stay
  unchanged.

## Next evidence to collect

1. Execute real 3–6 player LAN playtests and record balance/UX defects. Prioritize
   the deterministic all-packs signal: lower weak level-1 solo beatability and
   higher early permanent-loss/recovery pressure are documented in the balance
   report appendix and require real multiplayer validation before catalog tuning.
2. Package the one-origin NestJS-served production build and test LAN joining.
3. Add regression coverage for defects found in those sessions.
