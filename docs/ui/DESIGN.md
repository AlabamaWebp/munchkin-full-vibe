# UI design language

## Status and sources of truth

This document defines the visual language for the Munchkin LAN interface. It is
an implementation guide, not a new game specification.

The sources have the following priority:

1. `GameView`, `AvailableIntentView`, and the existing engine rules determine
   what the player can see and do.
2. `docs/PRODUCT.md` and the authoritative `docs/v2-game-design.md` determine
   product and gameplay intent.
3. [`reference/combat-mobile.png`](reference/combat-mobile.png) determines the
   visual direction: a dark fantasy table, framed cards, warm metal, and a clear
   theatrical focus on the current encounter.
4. This document determines presentation and responsive behavior.

The reference must not introduce a rule, a card property, a character portrait,
or an action that is absent from the projected game model. Game logic, backend,
and Socket.IO contracts are outside the visual redesign.

## Priorities

- Primary viewport: portrait mobile, `390 x 844` CSS pixels.
- Supported mobile width: from `360px`.
- The in-game document must not scroll vertically.
- Safe areas and browser dynamic toolbars must be handled with `100dvh` and
  `env(safe-area-inset-*)`.
- Tablet and desktop layouts are required, but only after the mobile layout and
  all mobile workflows are complete and verified.
- The application remains fully usable without Internet access. Do not require
  remote fonts, icon services, or texture CDNs.

## Design principles

### The current decision is the visual center

The most important question on every screen is: "What is happening, and who can
act?" The stage, blocking message, and primary action receive the strongest
contrast. Navigation, equipment, and history remain available but subordinate.

### The server explains availability

The UI renders `availableIntents`, `expectedAction`, deadlines, projected
totals, and `unavailableCardReasons`. It does not reconstruct legality from the
phase, card text, player power, or the identity of a card.

A display-only difference between already projected combat totals is allowed.
Predicting rewards, escape outcomes, or whether an unprojected action should be
legal is not.

### Dense, not cramped

Mobile uses the whole viewport as a game surface. Information is layered:

- the current state and common actions stay on the table;
- details open in a bounded bottom sheet;
- long history and a full hand scroll only inside their sheets;
- horizontally variable collections, such as the hand or player rail, may
  scroll horizontally without causing page-level movement.

Text must not be made unreadably small merely to imitate the reference.

### Ornament supports hierarchy

The fantasy treatment comes from color, typography, borders, restrained
gradients, and shallow texture. Decorative frames must never reduce text
contrast, cover focus outlines, or consume touch space.

## Visual direction

### Mood

The table should feel like a warm, dimly lit dungeon room rather than a generic
green dashboard. Use dark timber, leather, parchment, oxidized brass, and muted
forest green. The center may be lighter than the edges to suggest a pool of
table light.

Do not copy artwork or ornamental assets from the reference. Existing original
card illustrations remain the primary imagery. Background texture should be
implemented with lightweight CSS gradients or new original assets.

### Semantic color tokens

The exact values may be tuned during visual QA, but components should consume
semantic tokens rather than isolated hex values.

| Token                    | Starting value | Use                                        |
| ------------------------ | -------------: | ------------------------------------------ |
| `--color-canvas`         |      `#080b09` | Viewport outside the table                 |
| `--color-table`          |      `#24180f` | Main wood/leather field                    |
| `--color-surface`        |      `#17130f` | Panels and cards                           |
| `--color-surface-raised` |      `#2b2117` | Sheets and highlighted panels              |
| `--color-forest`         |      `#173b29` | Turn banner and positive primary action    |
| `--color-gold`           |      `#d4aa58` | Active borders, headings, rewards          |
| `--color-brass`          |      `#8d632e` | Secondary borders and icons                |
| `--color-danger`         |      `#a54836` | Losing combat, errors, destructive outcome |
| `--color-curse`          |      `#75518d` | Curse category only                        |
| `--color-success`        |      `#4f8358` | Confirmed/winning state                    |
| `--color-text`           |      `#f3e4c7` | Primary text                               |
| `--color-text-muted`     |      `#b9aa91` | Secondary text                             |
| `--color-focus`          |      `#fff1a8` | Keyboard focus ring                        |

Status must never be communicated by color alone. Pair it with a number, label,
icon, or change in copy. Final colors must be checked for contrast against their
actual gradient backgrounds.

### Typography

- Display face: `Georgia`, `Cambria`, `Times New Roman`, serif. Use for screen
  title, encounter name, and large combat totals.
- UI face: system sans-serif stack. Use for controls, facts, history, and card
  metadata.
- Minimum normal mobile text: `12px`; prefer `14px` for instructions and body
  copy. Small uppercase labels may use `11px` with additional letter spacing.
- Numbers that decide play, such as combat totals and level, use tabular figures
  when the selected system font supports them.
- Do not use all caps for sentences. Reserve it for short labels.

### Shape, depth, and spacing

- Base spacing unit: `4px`; common gaps are `4`, `8`, `12`, and `16px`.
- Interactive target: at least `44 x 44px`.
- Main panel radius: `12-16px`; compact chip radius: `8-10px`; status pill:
  fully rounded.
- Raised surfaces use one dark shadow and one subtle warm inner highlight.
- Active items receive a gold/green border. Disabled items remain readable and
  use reduced saturation, not very low opacity.
- Avoid deep stacks of borders. One frame establishes a surface; inner groups
  use spacing or a faint divider.

### Iconography and imagery

- Prefer a small local SVG icon set with consistent stroke and a text label.
- Emoji are not the final icon system because rendering differs across phones.
- Never use icon-only actions without an accessible name.
- Each player selects one unique lobby color. It is public cosmetic identity and
  must be shown consistently in the lobby, player rail, character summary, and
  target pickers; it does not affect game rules.
- Card art is addressed only through `GameCardView.artKey` and the existing
  local asset pipeline.

## Screen composition

The in-game shell is one fixed-height scene:

```text
safe-area viewport (100dvh, overflow: hidden)
├── turn bar / global controls
├── player rail
├── recent authoritative event
├── state-specific stage (takes remaining height)
├── contextual action dock
├── own-character summary
└── hand dock
```

The stage may change between turn start, Door reveal, combat, reaction, escape,
blocking decision, cleanup, and victory. The surrounding shell should remain
stable so controls do not jump unpredictably.

The finished stage is a results surface rather than a generic game-over notice.
It shows the authoritative winner plus every player's projected final level and
combat power. Only the host sees rematch and return-to-lobby controls;
non-hosts see the same results while waiting for the host's lifecycle decision.

## Lobby color selection

The lobby includes a color picker as part of each player's pre-game identity.
The player chooses one unused color; the choice is available to all players
through public lobby state and is included in game UI identity. The picker must:

- make the current selection and unavailable colors obvious with a visible
  border, label, or check;
- support keyboard navigation, screen-reader names, and touch targets of at
  least `44px`;
- allow the player to change the selection until the match starts;
- show the selected color in every lobby player row, including on reconnect;
- use the same color treatment in the in-game player rail and character summary;
- avoid uploads, remote URLs, and dependence on Internet access.

Color is cosmetic only. It must not affect Sex, role, cards, rules, or any
other gameplay calculation.

Only the stage is flexible in the vertical grid. Fixed regions should have a
compact-height variant for short viewports. If space is limited, reduce
ornament and secondary copy before reducing touch targets.

## Shared component patterns

### Turn bar

Shows whose turn it is, the public phase label, connection warning when needed,
and entry points to menu and history. "Your turn" is shown only when
`activePlayerId === viewerPlayerId`; otherwise name the active player.

### Player rail

Renders all public `players`. Each player shows initial, name, level, hand count,
active/self/dead state, and may open the existing character sheet. Equipment,
roles, and companion details stay in that sheet. For 5-6 players, use an
internally horizontal rail rather than shrinking names below legibility.

### Event capsule

Shows one blocking or important authoritative summary from `presentation`.
Tapping it opens full history. `GameLogEntryView` contains sequence, turn, phase,
and visibility but no wall-clock timestamp, so the UI must not show invented
"minutes ago" labels.

### Stage

Owns the dominant card or decision. The stage is not a scroll container. Long
copy is clamped and details open in a sheet. Blocking workflows should also use
the existing modal/focus-trap path so they survive reconnect without ambiguity.

### Action dock

Renders only actions represented by `availableIntents` or a gateway to cards
that have such intents. It must not silently discard a reachable intent. When
more actions exist than fit, keep the current primary action visible and expose
the rest through a clearly labeled bounded sheet.

### Character summary

Shows self level, total projected combat power, compact public role/equipment
facts, and hand count. Tapping it opens the existing detailed character sheet.
It is a summary, not an alternative equipment rules implementation.

### Hand dock

Shows the viewer's private `self.hand`, with currently playable cards first.
Cards retain their identity and readable category. The dock may scroll
horizontally; it must not squeeze five cards into unreadable equal-width columns.
The full-hand sheet remains the route to filtering, sale, charity, and detailed
selection workflows.

Card Details renders server-projected typed effects, timing, targets,
conditions/modifiers, role abilities and a duration category. Flavor copy may
remain, but it cannot be the sole gameplay explanation. A side-neutral combat
card presents separate “players” and exact named-Monster choices. An active role
opens a bounded cost-card picker sourced only from its `AvailableIntentView`.

### Sheets and dialogs

- Mobile: bottom sheet, maximum `100dvh` minus safe areas.
- The header and primary footer remain fixed; only `.sheet-scroll` scrolls.
- Tablet/desktop may center the same dialog at a bounded width.
- Keep focus trap, focus return, Escape/close behavior, and visible focus rings.
- A blocking authoritative decision cannot be dismissed as though it were
  optional.

## Existing UI: preserve and replace

### Preserve

- `GameShellComponent` as the orchestrator of projected state and commands.
- Angular Signals and the single player-specific `GameView` input.
- `selectStage`, presentation-event mapping, intent-based playable-card
  collection, and server-provided unavailability reasons.
- Existing command construction, target pickers, help negotiation, sale,
  charity, history, character, power-breakdown, curse-response, and pending
  decision workflows.
- `CardArtworkComponent`, local card assets, focus-trap and autofocus behavior.
- The fixed `100dvh`/safe-area foundation and internal scrolling sheets.

### Replace or materially restyle

- The green dashboard palette and flat panel treatment.
- The current HUD grid that compresses all 5-6 players into equal columns.
- The multi-item recent-event strip; use one prioritized event capsule and full
  history for the rest.
- The compact two-column combat card; make the encounter the visual center while
  retaining totals, multi-Monster navigation, and details.
- The generic three-button action dock that slices the available action list.
- The five-column hand preview that makes cards too narrow.
- Emoji and text-character icons used as final visual assets.
- The self/equipment information hierarchy: keep detailed equipment in the
  sheet, but add a compact, reference-aligned character summary to the shell.

Component boundaries may stay when their responsibilities still fit. A visual
replacement does not require changes to engine, DTO, or WebSocket protocol.

## Responsive order

1. Complete and verify `390 x 844`.
2. Verify width fallback at `360px` and compact-height behavior.
3. Adapt the same hierarchy for `480-767px` without adding desktop-only
   behavior.
4. Tablet: use additional width for a larger stage and optional side details,
   while preserving the same action order.
5. Desktop: center the table, constrain reading widths, and optionally display
   history/character details beside the stage. Desktop enhancements must not
   become required to play.

## Accessibility and QA baseline

- No page-level vertical or horizontal overflow during a game.
- All controls reachable with keyboard and screen reader names.
- Visible focus indicator is never clipped by decorative frames.
- Touch targets are at least `44px`; horizontal rails use scroll padding and do
  not trap vertical page gestures outside the fixed game shell.
- `prefers-reduced-motion` removes decorative motion.
- Test Russian long names, 1 and 6 players, 0 and more than 5 hand cards, one and
  multiple Monsters, helper negotiation, reaction waiting, escape sequence,
  reconnect, and every blocking decision.
- At minimum, verify `360 x 640`, `390 x 844`, `430 x 932`, `768 x 1024`, and
  `1024 x 768`; mobile acceptance is the release gate for the redesign.
