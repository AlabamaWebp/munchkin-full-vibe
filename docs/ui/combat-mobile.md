# Mobile combat screen

Status: **CURRENT SUPPORTING UI CONTRACT**. The mapped combat layout is
implemented in the live game shell. Follow-up work is visual/device QA, not a
replacement rules or transport design.

## Purpose

This specification translates the visual direction of
[`reference/combat-mobile.png`](reference/combat-mobile.png) into the combat
model that exists in the project. It does not add rules or change commands.

Primary target: portrait `390 x 844`. The document and game root do not scroll.
The supplied reference is `941 x 1672` and therefore cannot be treated as a
pixel-for-pixel viewport template. Its hierarchy, material language, and combat
focus are retained; dimensions and density follow the real target viewport.

## Authoritative data available to the screen

The screen consumes the existing player-specific `GameView`:

- turn context: `activePlayerId`, `turnNumber`, `phase`, `expectedAction`;
- public players: name, Sex, level, hand count, equipment, roles, companion
  slots, death state, and projected combat-power breakdown;
- private self data: full `self.hand`;
- combat address: `combatId` and mutable `revision`;
- encounters: one or more stable `encounterId` values, Monster card, art,
  current strength, current Treasure reward, level reward, Bad Stuff,
  modifiers, and played cards;
- side totals: `combat.playerPower` and `combat.monsterPower`;
- helper offer/agreement, contribution, and deadlines;
- victory reaction window and waiting/confirmed players;
- serialized run-away progress;
- `availableIntents` with exact targets, ids, deadlines, and reason codes;
- audience-filtered event history and prioritized presentation;
- owned-card unavailability reasons.

The component must not infer a legal command from card type or from whether one
number is greater than another. Totals and intent availability are already
authoritative.

## Reference-to-model mapping

| Reference element                 | Real source                                                                                                             | Decision                                                                                                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Ваш ход" banner                  | `activePlayerId`, `viewerPlayerId`, `turnNumber`, `phase`                                                               | Keep the banner style. Say "Ваш ход" only for the active viewer; otherwise show whose combat it is.                                                                                                                                                                    |
| "Выбита дверь · Бой"              | `phase` plus `combat !== null`                                                                                          | Use localized real phase and a combat label. Do not create a new phase.                                                                                                                                                                                                |
| Menu                              | Existing menu sheet                                                                                                     | Keep, restyle.                                                                                                                                                                                                                                                         |
| History button                    | `presentation` and `gameLog`                                                                                            | No dedicated HUD button. The recent-events strip is the entry into the bounded History sheet.                                                                                                                                                                          |
| "Показывать историю" checkbox     | No corresponding setting                                                                                                | Omit. Up to three recent events stay visible; the recent strip opens full history explicitly.                                                                                                                                                                          |
| Player-versus-Monster row         | `combat.playerId`, helper data, `combat.monsters`                                                                       | Rework as public player rail plus combat participants. A Monster has no Class/Race field; never show fictional role copy.                                                                                                                                              |
| Player color                      | Public player color selected in the lobby                                                                               | Use the selected color consistently in the player rail and character summary. Monster uses its real `artKey`; color remains cosmetic.                                                                                                                                  |
| Recent actions with "minutes ago" | `presentation`, `gameLog`, `combat.history`                                                                             | Show authoritative summaries in sequence order, without relative time because events have no timestamp.                                                                                                                                                                |
| Large Monster card                | Focused `combat.monsters[]` encounter                                                                                   | Keep as the stage focus. Support multiple encounters via horizontal tabs/chips.                                                                                                                                                                                        |
| Monster strength badge            | `currentStrength`                                                                                                       | Keep. Label it as focused-Monster strength, distinct from total Monster-side power.                                                                                                                                                                                    |
| Reward strip                      | `currentTreasures`, `baseLevelRewards`                                                                                  | Keep. Values are per focused encounter. Show modifiers when present.                                                                                                                                                                                                   |
| Info button                       | Projected `GameCardView`                                                                                                | Keep. Open existing card details.                                                                                                                                                                                                                                      |
| Player/Monster score              | `combat.playerPower`, `combat.monsterPower`, `combat.monsters[].baseLevelRewards`, `combat.monsters[].currentTreasures` | Keep. Show total level and Treasure rewards only for multi-Monster aggregate context; a single encounter's reward stays on the focused card. The signed difference is display-only and stays compact under the totals. A tie is losing, so zero uses losing treatment. |
| "Не хватает 2 силы"               | Difference of projected totals                                                                                          | Allowed as presentation: "Не хватает N" for `difference <= 0`, "Перевес N" for positive values. Do not use it to enable actions.                                                                                                                                       |
| "Можно усилиться..." hint         | `availableIntents`                                                                                                      | Generate only from actual intent categories: playable combat cards, help, victory declaration, reaction, or escape. Otherwise show who is expected to act.                                                                                                             |
| "Сыграть карту"                   | One or more owned-card `PLAY_CARD` intents                                                                              | Keep as a gateway that opens the hand filtered to cards playable in this combat. Target selection uses the exact intent.                                                                                                                                               |
| "Позвать на помощь"               | `PROPOSE_HELP` and subsequent offer intents                                                                             | Keep only when projected. The sheet must support helper choice and the projected Treasure range.                                                                                                                                                                       |
| "Сбежать" with fixed level loss   | `RUN_AWAY`; Monster Bad Stuff and server roll                                                                           | Keep the action, replace the false fixed penalty with "Попытаться сбежать" and a Bad Stuff details route. Outcome is not predicted.                                                                                                                                    |
| Own character/equipment bar       | `self`, equipment, roles, `combatPower`, `handCount`                                                                    | Keep as a compact summary. Detailed slots remain in the character sheet.                                                                                                                                                                                               |
| Five visible hand cards           | `self.hand`, card intents, reasons                                                                                      | Keep the prominent hand, but use a horizontally scrollable rail and do not assume exactly five cards. Show `count / 5`; an over-limit hand is valid until resolved.                                                                                                    |

## Mobile layout

The shell remains a fixed grid. The implemented `390 x 844` budget is a
reference for visual QA, not a set of component-specific hard-coded rules:

```text
┌──────────────────────────────────────┐
│ Turn banner + public player rail 88px│
├──────────────────────────────────────┤
│ Recent events (up to 3)          48px│
├──────────────────────────────────────┤
│                                      │
│ Encounter stage              minmax()│
│  encounter tabs · Monster · rewards  │
│  total score · state/help summary     │
│                                      │
├──────────────────────────────────────┤
│ Contextual combat actions        56px│
├──────────────────────────────────────┤
│ Own summary + hand rail         124px│
└──────────────────────────────────────┘
```

Use `100dvh` minus safe-area padding. The encounter stage receives all remaining
height through `minmax(0, 1fr)`. The recent-events strip shows the newest
authoritative summaries (up to three of them, excluding whatever the stage card
already explains) in one compact area and opens complete history on tap. The hand
rail shares a compact own-character utility row and scrolls horizontally with
height-derived `3:4` cards instead of squeezing the whole hand into equal columns.
A local menu preference may hide only the artwork rail; the character row and Full
Hand gateway remain visible while Stage receives the released height. Focused encounter and event cards are capped by
both available Stage space and a readable maximum, so a taller viewport adds
breathing room rather than stretching artwork. At compact heights, remove
decorative padding and secondary copy while retaining mandatory facts, a readable
portrait preview, and the Full Hand gateway. Do not reduce touch targets below
`44px` and do not introduce body scrolling.

### Turn banner

- Left: menu action; right: optional fullscreen action, all inside one restrained
  dark HUD surface. History opens only from the recent-events strip.
- Center: active context, for example "Ваш ход" / "Бой: Анна", followed by
  localized real phase and turn number.
- A connection warning replaces secondary subtitle space rather than adding
  height. Icon artwork remains visually smaller than the 44px tap targets.

### Player rail

- Contains every public player, not only the combat owner.
- Combat owner appears first, then accepted helper, then the remaining players
  in join order. This is display ordering only.
- Each chip shows the selected color, truncated name, level, and hand count.
  Active, self,
  dead, helper, and waiting-for-reaction states have text/icon support as well as
  color.
- The rail scrolls horizontally for 5-6 players and opens the existing player
  detail sheet on tap.

### Recent events

Show the newest authoritative summaries on the table in one compact strip —
up to three events, newest first, each a single truncated line. Prefer
`important`/`blocking` summaries over routine ones, exclude any event sequence
the stage card already explains, and never render the same event at full size
and in the strip at once. Tapping the whole strip opens History. If there is
no event, show a neutral "Игра начинается…" state. Do not invent an event time
or locally acknowledge authoritative events.

### Encounter stage

For one Monster, show a single framed encounter. For multiple Monsters:

- show horizontally scrollable encounter chips above the card;
- preserve `encounterId` as the selection key;
- show each encounter's name and `currentStrength` on its chip;
- show the selected encounter's art, rewards, Bad Stuff summary, and modifiers;
- keep the score board based on the total sides, not only the focused encounter.

The selected Monster card opens details. Long description/Bad Stuff text is
clamped; the full typed effects are available in the sheet. Played modifiers
may be shown as small attached-card markers and open the same details flow.

### Score board

Show:

- left: total player side `playerPower`;
- right: total Monster side `monsterPower`;
- status: one compact signed difference beneath the totals; do not repeat the
  same deficit as a second sentence or a separate reward/status panel;
- combat owner and accepted helper below the totals;
- promised helper Treasure when an agreement exists.

Tapping opens the existing power-breakdown sheet. That sheet uses the projected
player breakdown, helper contribution, and encounter values; it does not
recalculate domain power.

### Workflow status strip

The encounter card and totals remain mounted through combat workflows. A compact
shared strip directly above them gives reaction, pending-help, and active
run-away context without replacing the combat stage:

- reaction: required/sent state, response counts, and the projected countdown;
- help offer: named helper and promised Treasure count;
- run away: current combatant, exact Monster, and completed-attempt count.

This strip only formats the projected workflow state. It never creates an
action, predicts a result, or duplicates combat calculations.

### Action dock

The dock is built from `availableIntents` for the viewer. Visual priority:

1. Required curse/pending choice remains a blocking sheet above the combat
   screen.
2. If the viewer must respond to a victory claim, `PASS_COMBAT_REACTION` is the
   primary action. If already confirmed, show a waiting state instead of another
   pass action.
3. `DECLARE_COMBAT_VICTORY`, when projected, is the primary positive action.
4. Playable combat cards and help negotiation are contextual constructive
   actions; `RUN_AWAY` remains a restrained destructive-secondary action.
5. If no intent belongs to the viewer, show `expectedAction` as a waiting
   message and keep the hand inspectable.

The visible dock uses compact icon-led plaques with at least `44px` targets.
It must not promote `RUN_AWAY` when it is the only legal intent; a playable
card gateway may remain the constructive primary when it is available.

"Play card" is a presentation gateway, not a new command. It appears only when
at least one card in `self.hand` has a combat `PLAY_CARD` intent. Choosing a card
and target dispatches the existing exact command, including `combatId`,
`combatRevision`, `reactionWindowId`, and `encounterId` when required.

No intent may disappear because the first three buttons were sliced. If the
dock cannot show every direct action, provide an "All actions" sheet; card
intents remain reachable through the hand.

### Help states

The same stage must represent the whole existing workflow:

- no offer: show "Ask for help" only with `PROPOSE_HELP`;
- proposing: choose only from `helperIds` and only within the projected Treasure
  range;
- outstanding offer: name proposer/helper, Treasure count, and deadline;
- addressed player: expose only projected accept/reject/counter intents;
- active player on a counter: expose only projected accept/reject/cancel intents;
- accepted agreement: show helper, contribution, and promised Treasures as
  read-only facts.

Reconnect reconstructs the state from `GameView`; no local negotiation state is
authoritative.

### Victory reaction

When `reactionWindow` exists, keep the Monster and totals visible but add a
prominent reaction banner containing:

- claimant;
- confirmed and waiting counts;
- viewer-specific "response required" or "response sent" state;
- projected deadline.

The UI may render a local countdown to `expiresAtEpochMs`, but expiry behavior
remains server-owned. Any successful combat intervention can reset/cancel the
claim through the next authoritative view.

### Escape

Before the command, show Monster Bad Stuff rather than a guaranteed penalty.
During serialized escape, retain the encounter and total stage and show progress
for the current combatant and encounter in the workflow status strip. Render
completed attempts from `runAway` in encounter/combatant order. After combat
cleanup, render `lastRunAwayResult` until the next authoritative transition.

### Own character summary and hand

The character summary shows:

- initial/name, level, and public role labels;
- authoritative `self.combatPower` outside combined combat and the combat-side
  total separately when combat is active;
- up to three compact equipment/role/companion facts, with the remaining count
  indicated when the strip cannot show all of them;
- `self.hand.length / 5` and an explicit over-limit warning when applicable.

The hand rail sorts playable cards first without changing hand ownership or
identity. A card exposes two distinct interactions: use it through an available
intent, or open details. Unavailable cards stay readable and explain the server
reason. The full-hand sheet retains filters and economy/charity workflows.

## State coverage

The combat presentation must be checked in at least these states:

- active player losing, tied, and leading;
- viewer is the fighter, proposed helper, accepted helper, or observer;
- one and multiple Monsters, including clone/add and per-encounter modifiers;
- help offer, counteroffer, accepted agreement, cancellation, and expiry;
- victory declared: viewer waiting, viewer confirmed, and observer waiting;
- playable cards with one target, several encounter targets, player target, and
  hand-Monster target;
- run away before command, in progress, failed/succeeded attempts, Bad Stuff
  choice, and final result;
- pending discard, role retention, and Curse response overlays;
- reconnect into each blocking state;
- dead combatant/helper and 1-6 player tables;
- empty hand, five cards, and more than five cards.

## Implemented frontend mapping

| Current part                                                                         | Direction                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `GameShellComponent` signals, command routing, target/help/decision sheets           | Live game shell; preserve behavior while refining presentation.      |
| `GameStageComponent` and `selectStage`                                               | Uses the shared table framing/state switch.                          |
| `CombatStageComponent` totals, encounter focus, rewards, Bad Stuff, helper, reaction | Provides the combat model in the live layout.                        |
| `PlayerHudComponent`                                                                 | Uses a turn banner and scrollable player rail.                       |
| `RecentEventsComponent`                                                              | Provides authoritative recent event and History entry.               |
| `ActionDockComponent`                                                                | Uses intent-complete contextual actions.                             |
| `HandDockComponent` playable-first behavior                                          | Uses a readable horizontal rail.                                     |
| `CompactGameCardComponent` and `CardArtworkComponent`                                | Provides art lookup, labels, accessibility, and the live card frame. |
| `EquipmentLayoutComponent`                                                           | Appears in character sheets alongside a compact shell summary.       |
| Focus trap, autofocus, safe-area and fixed-viewport foundation                       | Present; preserve in follow-up work.                                 |

## Verification baseline

1. Re-run fixed-viewport and overflow checks at `360 x 640`, `390 x 844`,
   `430 x 932`, `768 x 1024`, and `1024 x 768` after visual changes, including
   safe-area/browser-toolbar conditions.
2. Validate the turn bar, player rail, and prioritized event capsule with 1–6
   player fixtures, long names, and color-only identity treatment.
3. Recheck focused encounter, total score, multi-Monster navigation,
   helper/reaction, escape, and blocking sheets on real mobile browsers.
4. Keep the intent-complete action presentation and construct all commands from
   `AvailableIntentView`; do not reintroduce phase/card-type legality inference.
5. Re-check the compact character summary, horizontal hand rail, and bounded
   full-hand/equipment/sale/charity/target sheets after visual changes.
6. Run unit tests, lint, typecheck, production builds, and browser QA for mobile
   state fixtures after relevant UI work.

This plan requires no engine, backend, DTO, or WebSocket protocol changes.
