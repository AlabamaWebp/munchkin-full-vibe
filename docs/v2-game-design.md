# Munchkin LAN V2 game design contract

## Status and authority

This document is the gameplay and presentation contract for V2. It refines the
current rules in `docs/GAME_RULES.md`; where the two disagree, V2 implementation
work must follow this document and update the older document in the milestone
that changes production behavior.

V2 preserves the existing foundations:

- the server is authoritative;
- clients send intentions, never calculated outcomes;
- rules live in the framework-independent TypeScript game engine;
- state and every interrupted flow are JSON-serializable and reconnect-safe;
- every viewer receives a privacy-filtered full `GameView`;
- Door and Treasure remain the only two decks;
- the game supports 1–6 players, with 3–6 as the real target;
- level 10 remains the victory level;
- the ordinary target duration is 35–60 minutes.

The numbers below are initial production targets, not permission to hide tuning
inside code. They belong in card/config data and deterministic tests.

## Design principles

1. A normal turn should present one meaningful situation and a small number of
   clear choices.
2. Social interference, help, and negotiation create the chaos. Persistent
   bookkeeping does not.
3. Losing may cost tempo, cards, or position, but early losses must not remove a
   player's ability to participate.
4. A card ability must be explainable in one or two short sentences, fit on a
   compact mobile card, use an existing typed primitive, and be testable without
   checking the card name.
5. No ability may introduce a unique state machine only for itself. New state is
   justified only by a reusable rule such as negotiation, protection, or a
   pending choice.
6. Tiers are balance metadata. The UI may communicate danger or rarity through
   presentation, but it does not need to display `T1`, `T2`, or `T3` literally.

### Card authoring gate

Every ability must pass all seven questions before entering a catalog:

1. Is it understandable in one or two sentences?
2. Does it create a decision instead of only bookkeeping?
3. Does its meaning fit on a small mobile card?
4. Does it avoid new state used by only this one definition?
5. Can existing typed primitives express it?
6. Can valid, invalid, and edge behavior be tested deterministically?
7. Does it avoid an early-game trap or death-spiral amplifier?

Any “no” means simplify or reject the card, not extend the engine automatically.

## Complete game loop

### Lobby

Before the match:

- every player chooses `MALE` or `FEMALE` for their own character;
- the host chooses `BALANCED` or `CLASSIC_CHAOS`;
- the host enables any optional card sets; `CORE` is always enabled;
- the host cannot start until every player has chosen Sex and the selected
  catalog can satisfy the bounded starting-deal requirements;
- mode and enabled sets become immutable when the game starts.

Sex is public, supplies no inherent bonus, and is used only by a small number of
explicit card conditions.

### Setup

Each player starts at level 1 with four Door and four Treasure cards. In
`BALANCED`, one of the four Treasure cards is guaranteed to be a neutral,
actually equippable Tier-1 starter item. Setup reserves those items in one
bounded pass before dealing the remaining cards; it never redraws in a loop.

The starting player is selected through `RandomSource`. The first turn begins in
`TURN_START`.

### Turn

```text
TURN_START
  -> manage public cards/equipment when legal
  -> KICK_DOOR
  -> reveal and resolve one Door
       Monster -> COMBAT
       Curse   -> optional target-only protection -> effects
       Other   -> take the revealed card into hand
  -> POST_DOOR when no combat remains
       LOOK_FOR_TROUBLE with one hand Monster
       or LOOT_ROOM facedown
       or SCAVENGE when strictly eligible
       or END_TURN
  -> END_TURN
       satisfy hand limit / charity
       advance to the next player
```

`SCAVENGE` replaces `LOOT_ROOM`; a player never receives both in one turn.
Combat victory goes directly to `END_TURN`. Running away completes every
combatant/encounter attempt and then goes to `END_TURN`.

## Balance goals

The tuning target is the whole match, not equality of every individual draw.

| Measure                                                      | Initial target                        |
| ------------------------------------------------------------ | ------------------------------------- |
| Leader's personal turns before victory                       | 5–7                                   |
| Turns that create combat, including Look for Trouble         | 70–85%                                |
| Unmodified solo win chance against the player's current band | 55–70% before other players interfere |
| Typical final win chance after social interference           | 40–60%                                |
| Typical permanent power at levels 1–3                        | 2–7                                   |
| Typical permanent power at levels 4–6                        | 9–16                                  |
| Typical permanent power at levels 7–9                        | 17–23                                 |
| Typical levels per won combat                                | 1 early, 1–2 mid, about 2 late        |

With roughly 0.75 combats per personal turn and late Monsters commonly granting
two levels, a leader needs approximately five to seven wins or equivalent
progress. At 3–6 players this is about 18–36 table turns. The UI and reaction
contract must keep an ordinary table turn near 60–100 seconds so that the target
duration remains credible.

A tie is always a loss for the player side. Balance simulations must therefore
use `playerPower > monsterPower`, never `>=`.

### Early-band sanity check

The intended eight Core Tier-1 Monsters use strengths
`1, 1, 2, 2, 3, 3, 4, 5` (mean 2.625). Tier-1 equipment is mostly `+1…+3`
with a mean near `+2`. A level-1 player with an ordinary starter item therefore
has power 2–4 and can beat some, not all, Tier-1 Monsters without help. Level,
additional equipment, one-shots, help, and the recovery rule quickly improve
that position.

Tier-2 starts at strength 6. A 25% Tier-2 early draw rate would repeatedly place
level-1 players with expected power around 3 into fights that require help or
multiple resources. That is too frequent for an anti-death-spiral design. The
V2 early weight is therefore reduced from the proposed 25% to 15%.

## Modes, tiers, and draws

### Card metadata

Every balance-sensitive Monster, Curse, Equipment, combat consumable, Monster
modifier, and utility card has `tier: 1 | 2 | 3`. Class and Race cards are Tier
1 because they are identity options rather than escalating rewards. Every card
also has `setId`.

### Balanced Door profile

The active player's level at the instant the Door draw starts selects the
profile. A multi-card effect snapshots its profile before the first card.

| Active level | Tier 1 | Tier 2 | Tier 3 |
| ------------ | -----: | -----: | -----: |
| 1–3          |    85% |    15% |     0% |
| 4–6          |    25% |    60% |    15% |
| 7–9          |     5% |    35% |    60% |

The middle and late hypotheses are retained for the first tuning pass. They
match typical permanent power bands once equipment and social resources exist.
They must still be verified by seeded simulations over 3-, 4-, and 6-player
matches before content freeze.

### Balanced Treasure profile

Treasure quality is based on the defeated encounter, not the active player's
level. Each Monster's reward slots use its effective tier at final resolution:

```text
effective tier = tier implied by final current strength

strength 1–5   -> Tier 1
strength 6–11  -> Tier 2
strength 12+   -> Tier 3
```

| Effective encounter tier | Tier 1 Treasure | Tier 2 Treasure | Tier 3 Treasure |
| ------------------------ | --------------: | --------------: | --------------: |
| 1                        |             80% |             20% |              0% |
| 2                        |             20% |             65% |             15% |
| 3                        |              5% |             30% |             65% |

This makes a strengthened low-tier Monster pay at the stronger profile while
retaining variance. In multi-Monster combat, each encounter contributes its own
reward slots. The complete reward is shuffled before helper allocation so the
helper is not systematically assigned the weakest or strongest encounter's
cards.

### Physical deck behavior

Balanced play does not create three physical decks. Door and Treasure each
remain one draw-pile array and one discard array.

For each weighted draw:

1. preflight the complete requested card count;
2. recycle the matching discard only when the draw pile is empty;
3. build indices for tiers currently present in that one draw pile;
4. renormalize the selected profile across non-empty, positive-weight tiers;
5. if none of the positive-weight tiers remain, renormalize uniformly across
   all tiers present so the game cannot deadlock at deck end;
6. select the tier once and then one physical instance in that tier through
   `RandomSource`;
7. remove that instance without reordering the other cards.

There is no retry loop. A recycle emits the existing identity-free public deck
event. The whole multi-card draw is atomic.

### Classic Chaos

`CLASSIC_CHAOS` shuffles each complete enabled deck and draws from the top. It
ignores all tier weights for Door, setup, and combat rewards. Tier metadata still
exists for card rules and diagnostics. The explicit Scavenge search remains
available because it is a recovery action, not an ordinary weighted draw.

## Starting-state guarantee

In `BALANCED` only, the engine:

1. collects all enabled physical Treasure instances whose definitions are
   `starterEligible`;
2. validates that at least one distinct instance exists per player;
3. chooses one per player uniformly without replacement;
4. removes the reserved instances from the Treasure pile;
5. deals three normal weighted Treasure cards and four weighted Door cards per
   player;
6. adds the reserved item and shuffles each private hand.

A starter-eligible card must be Tier 1, neutral Equipment, legal at level 1,
have no Class/Race/Sex condition, and grant `+1…+2` combat power. At least five
Core definitions and twelve physical Core copies satisfy this rule. A catalog
that cannot satisfy the selected player count fails setup atomically with a
configuration error.

Revival keeps its ordinary atomic four-Door/four-Treasure deal using the selected
mode. The starter reservation is setup-only; it never reaches into a non-empty
discard during play.

## Anti-death-spiral mechanics

Both mechanics are base V2 rules in both modes. They are deliberately small and
do not create currency, tokens, a third deck, or a saved combat buff.

### Makeshift Tools

This is a computed active-player combat contribution:

```text
permanentPower = level + equipment/role/companion permanent modifiers
makeshiftBonus = min(2, max(0, 3 - permanentPower))
```

The bonus is applied only when all are true:

- the active combat player is level 1 and alive;
- `permanentPower < 3`;
- no helper has joined;
- combat has exactly one encounter;
- that encounter's definition is Tier 1, its base strength is at most 3, and it
  is neither an added Monster nor a clone;
- run away has not started.

It is not a `CardInstance`, is never written to `PlayerState`, and cannot be
sold, traded, stolen, or retained. It is recalculated after every combat change
and appears as a separate `Makeshift Tools +N` line in the authoritative power
breakdown. It raises a naked or nearly naked level-1 player to power 3 before
temporary cards. With the Core weak-Monster distribution, that beats four of
the six strength-1…3 Monsters and still loses ties and every strength-3+ fight
without another resource.

### Scavenge

At `POST_DOOR`, `SCAVENGE` is offered instead of `LOOT_ROOM` only when all are
true:

- the active player is alive and level 1;
- the current turn's Door resolved without starting combat;
- permanent power is at most 2;
- the player has no currently legal positive-bonus Equipment in hand;
- the player owns no equipped item with more than `+1` bonus;
- no `SCAVENGED` event for that player exists in the previous full table round
  (`currentTurn - lastScavengeTurn >= playerCount`), unless none exists;
- the current Treasure draw pile contains an enabled `scavengeEligible`
  physical card that is legal in one of the player's currently free slots.

The server uniformly chooses one candidate that is eligible for this player from
the current Treasure draw pile, removes it in one bounded selection, gives it
privately to the player, and moves to `END_TURN`. It does not search the discard
before normal recycling. If no eligible card is currently present, Scavenge is
unavailable and Loot Room remains available.

A scavenge-eligible definition must be neutral Tier-1 Equipment, grant `+1…+2`,
have `goldValue <= 300`, and explicitly set `sellable: false` and
`tradeable: false`. Holding a legal item disables the next Scavenge. The
full-round cooldown, inability to sell/trade the recovered item, and replacement
of Loot Room prevent deliberate level, gold, and card-volume farming. Normal
hand-limit and charity rules still apply.

## Monster curve

The curve is authored, not generated by a linear formula.

| Tier | Core unique distribution | Strength           | Level reward             | Treasure count            | Bad Stuff                                                    |
| ---- | ------------------------ | ------------------ | ------------------------ | ------------------------- | ------------------------------------------------------------ |
| 1    | 8 Monsters               | `1,1,2,2,3,3,4,5`  | 1                        | six give 1, two give 2    | temporary, one card, or recoverable loss; no death           |
| 2    | 7 Monsters               | `6,7,8,9,10,11,11` | five give 1, two give 2  | four give 2, three give 3 | role loss, conditional item loss, stronger temporary effects |
| 3    | 5 Monsters               | `12,14,15,17,19`   | four give 2, one gives 1 | `3,3,4,4,5`               | severe; death on at most two Core Monsters                   |

Conditional modifiers may move current power outside these printed ranges. A
Monster's printed card still communicates its base strength, reward, short
ability, and Bad Stuff.

Representative patterns:

- **Dust Parliament** — Tier 1, strength 2, 1 Treasure. It gains `+2` when the
  active player has equipped `ARMOR`. Bad Stuff is a temporary `-1` to the next
  Run Away roll. Low number, awkward condition.
- **Archive Dragon** — Tier 3, strength 17, 2 levels, 5 Treasures. It is strong
  but unusually profitable; failed escape discards one chosen item and loses one
  level rather than automatically killing the player.
- **Mirror Duelist pair** — two low-copy Tier-2 Monsters, one `+3` against
  `MALE`, one `+3` against `FEMALE`, with equal rewards and severity. Sex is not
  a generally better or worse choice.
- **Map-Eater** — Tier 2, strength 8; `+3` against the Cartographers' Class but
  `-2` against the Lantern Folk Race. It uses existing role conditions and no
  special state.
- **Rust Choir** — Tier 2 `CONSTRUCT`; `+2` when the active player has `MAGIC`
  Equipment, but `-2` when the combat side has a `BLUNT` weapon. It uses two
  common fixed conditional modifiers.
- **Grave Lantern** — Tier 2 `UNDEAD`; one Class receives `+2` against it and a
  situational Arsenal card can protect against its Bad Stuff.

## Curses and protection

Every Curse declares severity independently of tier.

| Severity | Normal effects                                                                                                                          | Core share |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| `EARLY`  | temporary combat or Run Away penalty, discard one card, lock one slot until the end of the target's next turn, small conditional debuff |   5 unique |
| `MID`    | lose Class/Race, conditional Equipment loss, stronger temporary effect                                                                  |   5 unique |
| `LATE`   | destroy up to two items, discard up to three cards, or another explicitly severe effect                                                 |   2 unique |

Early Curses never cause death or unconditional multi-item destruction. Late
Curses are rare and weighted away from early play in Balanced mode.

Protection uses one target-only response, never a counterspell stack:

- a one-shot may cancel one Curse and then be discarded;
- an item guard may protect one selected legal Equipment card from the current
  Curse while other effects resolve;
- a role or utility card may automatically reduce a matching severity, Curse
  tag, or Monster-tag Bad Stuff through one typed situational modifier.

When a target has a usable one-shot or item guard, the Curse creates one
serializable `CURSE_RESPONSE` decision. Only the target may decline or use one
protection. Other players cannot respond, the protection cannot itself be
countered, and resolution then continues from stored effects. Automatic passive
protection is evaluated before offering the one response.

Temporary penalties live in a small typed `activeEffects` list with an explicit
expiry such as `END_OF_COMBAT` or `END_OF_TARGET_NEXT_TURN`; V2 does not add a
free-form status dictionary.

## Equipment

| Tier | Printed bonus | Typical value | Compensating constraints                                           |
| ---- | ------------: | ------------: | ------------------------------------------------------------------ |
| 1    |       `+1…+3` |       200–500 | mostly neutral; starter items are `+1…+2`                          |
| 2    |       `+3…+5` |       500–800 | two hands, one role/Sex condition, tag dependency, or lower copies |
| 3    |       `+5…+7` |     800–1,200 | two hands, meaningful condition, rare copies, or situational power |

The expected total equipped bonus is controlled by slot competition, hands,
restrictions, and copy count, not by reducing every card to the same value.
Starter equipment is not broadly Class/Race restricted.

Arsenal weapon enhancers use one reusable attachment rule: one enhancer per
equipped weapon, an explicit eligible Equipment tag/definition condition, and a
typed bonus. If the host Equipment returns to hand, its enhancer returns to hand;
if the host is destroyed or sold, its enhancer is discarded with it. No generic
card scripting is involved.

## Sale and victory

The default sellability rule is:

```text
sellable = definition.sellable
  ?? (definition.deck === TREASURE && definition.goldValue > 0)
```

Catalog validation always rejects sellability for Monsters, Curses, Class,
Race, role-permission cards, and service/debug cards. `sellable: false` wins over
the default. Equipment, one-shot combat items, and other real-value Treasure may
be sold.

Trading is intentionally narrower: by default only Equipment is tradeable, and
`tradeable: false` overrides that default. A future utility may opt in explicitly
only when its transfer has no unresolved owner-specific state.

Sale remains `1,000 gold = +1 level`. The engine calculates total value and level
gain. Selection is rejected atomically when it is empty, contains an ineligible
card, is below 1,000, or would grant more levels than the player can take before
level 10. At level 9 no sale action is offered. Remainder below 1,000 is lost as
today.

All level changes use one typed source:

- Monster combat may grant the final level;
- sale and ordinary `GAIN_LEVEL` stop at level 9;
- a specific card may bypass that restriction only with explicit
  `victoryEligible: true` authored in its effect;
- levels are capped at 10, so a two-level reward from level 9 finishes at 10,
  not 11.

The ordinary V2 Core contains no non-combat `victoryEligible` card. Therefore a
standard match ends only when level 10 is reached by defeating a Monster.

## Help negotiation

Only one negotiation and at most one helper may exist in a combat.

The agreement contains only helper identity and a Treasure count. V2 does not
support free text, debt, gold, arbitrary-card promises, or future-turn contracts.

### Offer state machine

1. The active player proposes a helper and an integer number of Treasures from
   `0` through the combat's current expected reward.
2. The addressed player accepts, rejects, or counters with a different legal
   Treasure count. A counter cannot change the helper.
3. The active player accepts or rejects the counter. After rejection, the active
   player may make a new offer to any eligible helper.
4. The active player may cancel an outstanding offer at any time.

Offers and counters are public counts with stable offer ids. They do not block
combat cards, running away, or cancellation, so an offline invitee cannot
deadlock the game. Starting run away or declaring victory cancels an unaccepted
offer with an event.

No offer/counter/accept command is legal after a victory reaction or run-away
sequence has started. An already accepted agreement remains in force.

Acceptance creates an immutable public agreement:

```text
helperId
promisedTreasures
acceptedOfferId
agreedAtCombatRevision
```

It survives refresh, reconnect, combat revision changes, added/cloned Monsters,
and strength/Treasure modifiers. It ends only with combat cleanup.

### Reward allocation

At victory:

```text
helperCount = min(promisedTreasures, finalTreasureCount)
activeCount = finalTreasureCount - helperCount
```

If reward fell below the promise, the helper is paid first up to the final total.
If reward grew, every additional Treasure belongs to the active player. Only the
active player receives Monster level rewards.

The engine atomically preflights and draws all Treasure, shuffles the complete
reward privately, and partitions it by those counts. Everyone may see recipient
and count. Only each recipient receives their own card identities; neither the
other recipient nor spectators receive them.

## Helper risk and run away

If the side does not win, both the active player and accepted helper run away
independently from every Monster. The serialized order is encounter-major:

```text
encounter 1: active, helper
encounter 2: active, helper
...
```

Each combatant/encounter pair receives its own roll and result. The normal base
success remains 5–6 on a d6, modified by the affected combatant's typed Run Away
modifiers. A failure applies that encounter's Bad Stuff to that combatant unless
the Monster explicitly declares `ALL_COMBATANTS` targeting.

`ALL_COMBATANTS` Bad Stuff resolves at most once per encounter: after every
living combatant has rolled for that encounter, one or more failures apply the
shared effect once to each living combatant in active/helper order. The run-away
state records that shared resolution so a pending choice or reconnect cannot
apply it twice.

The run-away cursor, attempts, current combatant, current encounter, remaining
effects, and any player choice are state, not local UI. If a discard choice
interrupts the sequence, reconnect resumes after that exact combatant/encounter
pair. It never rerolls a completed pair.

If Bad Stuff kills a combatant, later pairs for that combatant are recorded as
`SKIPPED_DEAD` without rolling; the other combatant continues. Death during
run-away cannot coexist with victory rewards, so no dead-helper reward ambiguity
exists. A future card that kills a helper during an otherwise winning combat is
outside the V2 primitive set.

## Class, Race, Sex, and multiple roles

### Sex

`MALE | FEMALE` is chosen in the lobby, public in `PlayerState`, immutable during
the match, and neutral by itself. Fewer than 10% of Core definitions may mention
Sex. Any mirrored Sex-sensitive pair must have equal copy count, reward, and
severity.

### Roles

Each Class or Race definition has at most one passive modifier. Allowed examples
are:

- `+2` against one Monster tag;
- `+1` Run Away;
- `+1` to matching Equipment, with an authored cap;
- one situational Curse or Bad Stuff defense.

There is no skill tree, activated ability currency, or per-role cooldown.

By default a player may have one Class and one Race. A public
`ROLE_PERMISSION` card from `DUAL_IDENTITY` grants exactly one additional slot
for one role type; permissions do not stack beyond two Classes or two Races.
Duplicate role definition ids are forbidden.

Playing a role at capacity names the role being replaced. With one possible
replacement, the server projects it as the automatic target. With two, the UI
uses a compact picker.

If a permission disappears while two roles are active, the owner receives a
serialized `CHOOSE_ROLE_TO_KEEP` decision. After the choice, the other role is
discarded and Equipment is revalidated once. Every incompatible item, with any
attached enhancer, returns to the owner's hand. Death discards all roles and
permissions without creating that decision.

## Tags and conditions

V2 starts with this intentionally small vocabulary:

```text
Monster:   BEAST, CONSTRUCT, ARCANE, UNDEAD
Equipment: WEAPON, ARMOR, BLADE, BLUNT, MAGIC
Curse:     HEX, TRAP
```

A definition may have multiple relevant tags, for example `WEAPON + BLADE`.
New tags require at least three real definitions or interactions in the enabled
catalog; otherwise use a definition-id condition.

Conditions are flat typed atoms. A modifier's condition list is logical AND;
an atom's `anyOf` list is logical OR. V2 has no arbitrary nesting or `NOT`
expression language.

Supported atoms are:

- player has one of specified Class definition ids;
- player has one of specified Race definition ids;
- player Sex is a specified value;
- opposing Monster has any specified Monster tag;
- owner has an equipped card with any specified Equipment tag, optionally with
  a count threshold;
- affected card is one of specified definition ids;
- affected Curse has a specified severity or Curse tag.

Supported reusable modifiers are:

- fixed combat power against a matching Monster;
- capped bonus to matching equipped cards;
- Run Away roll modifier;
- one automatic Curse/Bad Stuff protection mode;
- one additional Class or Race slot;
- one weapon-enhancer attachment bonus.

Conditions and modifiers are evaluated by the engine and projected as resolved
breakdown lines. Angular never reimplements them.

## Optional card sets

`CORE` is always included. The host may independently enable these before start:

### Companions

- adds `HIRELING` and `MOUNT` public slots;
- maximum one of each per player;
- each supplies a combat bonus and at most one simple conditional modifier;
- companions have no hand, equipment, health, or private inventory;
- replacing one discards the previous card;
- proposed size: 12 unique / 24 physical, tier split 4/5/3.

### Arsenal

- weapon enhancers, Curse protection, Monster-hunting gear, situational defense,
  and unusual utility Treasure;
- uses the existing Equipment, attachment, protection, tag, and condition
  primitives;
- proposed size: 16 unique / about 36 physical, tier split 6/6/4.

### Dual Identity

- second-Class/second-Race permission cards;
- a small number of Sex/Class/Race interactions;
- unusual identity effects using the existing role and condition primitives;
- proposed size: 12 unique / about 24 physical, tier split 4/5/3.

Enabled definitions and physical copies are assembled once before `createGame`.
Disabled definitions are absent from `GameState`, not merely skipped during draw.

## Core Set structure

The new Core target is 80 unique definitions and 192 physical cards. This is
large enough for six-player setup and recycling without requiring 80 unrelated
abilities. Repetition comes from copies and combinations of a small primitive
set.

| Category          | Unique; tier split | Physical copies | Deck placement                                          | Power/value range                                               |
| ----------------- | ------------------ | --------------: | ------------------------------------------------------- | --------------------------------------------------------------- |
| Monster           | 20; `8/7/5`        |              48 | Door                                                    | strength 1–19, 1–2 levels, 1–5 Treasures                        |
| Curse             | 12; `5/5/2`        |              24 | Door                                                    | Early/Mid/Late severity as above                                |
| Class             | 4; `4/0/0`         |              12 | Door                                                    | one passive modifier each                                       |
| Race              | 4; `4/0/0`         |              12 | Door                                                    | one passive modifier each                                       |
| Equipment         | 20; `9/7/4`        |              45 | Treasure                                                | `+1…+7`, 200–1,200 gold                                         |
| Combat consumable | 8; `3/3/2`         |              22 | Treasure                                                | roughly `±2…±8`, 100–700 gold                                   |
| Monster modifier  | 6; `2/2/2`         |              14 | 4 Treasure definitions and 2 Door add/clone definitions | strength `±2…±6`, reward `-1…+2`, 200–800 gold when Treasure    |
| Utility           | 6; `3/2/1`         |              15 | 3 Door and 3 Treasure definitions                       | protection, draw, attachment, or narrow interaction; 0–800 gold |

This produces approximately 107 Door and 85 Treasure physical cards. Copy counts
are explicit per definition; the current implicit “two roles, three of everything
else” rule is not retained. Low-complexity staples receive three copies, narrow
or high-impact cards one or two.

At least five neutral Tier-1 Equipment definitions, totaling at least twelve
copies, are `starterEligible`. Scavenge eligibility may overlap only when the
card also satisfies the stricter non-sellable/non-tradeable recovery contract.

## Card presentation

### Compact Hand Card

Shown in the dock and full-hand sheet. It contains only decision-relevant facts:

- Monster: name, Strength, Treasure count, one short ability indicator;
- Equipment: name, bonus, slot/hands, restriction indicator;
- Curse: name and one-line consequence;
- combat card: main signed value, target side, timing indicator;
- Class/Race/companion: name and one short passive;
- a clear playable/unavailable state.

### Focused Stage Card

Adds current resolved values, reward, short Bad Stuff, condition result, modifier
chips, and current target. It never hides Bad Stuff behind a second navigation
level.

### Details Sheet

Contains full text, all typed facts, source set, related cards, and resolved
breakdown. It is independently scrollable and never required before a legal
play.

## Mobile layout contract

The in-game document is a fixed viewport from 360 px upward:

```text
GAME ROOT: height 100dvh; overflow hidden; safe-area padding
  TOP HUD       players, turn, phase, connection
  EVENT STRIP   2–3 meaningful authoritative events
  CENTER STAGE  exactly the current gameplay context
  HAND DOCK     compact playable-first preview + Full Hand control
  ACTION DOCK   at most 1 primary + 1–2 secondary actions
```

There is no document/page scroll on either axis. The browser brand/header is
folded into the Top HUD during play. Six players fit as compact, non-scrolling
avatar/status cells. The Hand Dock itself does not scroll; the Full Hand sheet
does.

Scrolling is allowed only inside sheets/dialogs, history, Full Hand, and long
target/selection pickers. Center Stage never becomes an unbounded board. In a
multi-Monster fight it shows the aggregate score, compact encounter chips, and
one focused encounter with visible reward and Bad Stuff; tapping another chip
changes focus locally, while one-tap combat details list every encounter.

At all times the root screen answers:

- whose turn it is;
- what just happened;
- what is happening now;
- which combat side leads and by how much;
- whether this viewer must act;
- the viewer's highest-priority legal action.

## UI state machine

The main Stage has one state at a time:

1. `TURN_READY` — active player and Kick Door;
2. `DOOR_REVEAL` — revealed card and its resolved consequence;
3. `POST_DOOR_CHOICE` — trouble, loot, Scavenge, or end;
4. `COMBAT_OPEN` — score, encounters, offers/agreement, legal interference;
5. `COMBAT_REACTION` — score plus deadline and viewer-specific reaction state;
6. `RUN_AWAY_SEQUENCE` — current combatant/encounter and completed result matrix;
7. `BLOCKING_DECISION` — discard, Curse defense, or role retention;
8. `TURN_CLEANUP` — hand limit/charity and End Turn;
9. `FINISHED` — winner and host lifecycle actions.

Server state selects the Stage state. Local UI state may select a focused
encounter or open a sheet, but may not invent a gameplay phase. On reconnect, a
blocking decision opens first and stale local pickers are discarded.

### Combat Stage

The primary visual is always:

```text
PLAYER SIDE POWER  vs  MONSTER SIDE POWER  (signed difference)
```

One tap opens the authoritative breakdown. Makeshift Tools, roles, Equipment,
companions, temporary effects, and helper contribution are distinct lines.
Every Monster immediately exposes current Strength, Treasure count, level
reward, short Bad Stuff, and modifier chips. The immutable help agreement is
displayed beside the helper.

### Interaction rules

Tapping a playable compact card starts its relevant action:

- zero targets sends the intention immediately;
- exactly one target selects it automatically;
- multiple targets open a compact picker;
- multiple genuinely different legal uses open a compact action menu;
- confirmation appears only for destructive sale, irreversible role/permission
  replacement, or similarly high-cost action.

An info affordance or press-and-hold opens Details. The mandatory
`card -> details -> action -> target -> confirmation` path is deleted.

## Unified event presentation

`eventLog` remains the one authoritative history. Projection assigns every
visible event one presentation priority; Angular does not maintain separate
semantic event systems.

### Blocking

Represents current state that requires this viewer: discard selection, Curse
response, role retention, help counter response, or combat reaction. It remains
until resolved or authoritatively expired. A historical event alone is never
used to infer that it is still blocking.

### Important

Shown on Stage or as a banner and retained in the recent strip until displaced
by newer Important events or explicitly dismissed: Door reveal, combat start,
help agreement, victory claim/cancel, combat win, reward, Curse consequence,
Scavenge, run-away result, Bad Stuff, death/revival, level change, and game end.

### Routine

Shown in recent/history as space permits: setup, turn transition, ordinary draw,
equip/unequip, role play, offer rejection, pass, reshuffle, sale, trade, and
charity summaries.

Animations/toasts may time out; Important and Blocking meaning may not. Every
auto-expiry emits a durable event and the complete entry remains in history.

## Timeouts and reconnect safety

To prevent a disconnected phone from freezing a six-player match:

- combat reaction windows have a fixed 20-second authoritative deadline;
- destructive private choices have a 60-second deadline;
- Curse protection defaults to decline;
- chosen discard defaults to server-random legal cards;
- role retention defaults to the oldest active role;
- missing reaction confirmations auto-pass together at expiry.

Deadlines and default policies are serialized. A server timer asks the engine to
advance an expired state; the engine rechecks the deadline and exact decision id.
Resume also advances already-expired state before projection. Tests use an
injected clock. Every default emits `DECISION_EXPIRED` or
`COMBAT_REACTION_EXPIRED` plus the normal resolution events.

Help offers are not globally blocking and need no timeout; the active player can
cancel or continue. Accepted agreements have no deadline.

## Edge cases and design review

### Exploits

- **Scavenge farming:** strict power/hand checks, once-per-round event cooldown,
  no sale or trade value, and replacement of Loot Room prevent economic farming.
- **Sale victory:** sale is unavailable at level 9 and any selection that would
  cross level 9 is rejected before cards move.
- **Tier manipulation:** a Treasure profile uses final encounter strength;
  strengthening then weakening cannot retain a higher tier unless final strength
  still qualifies. Explicit reward modifiers still change reward count as their
  authored cost/benefit.
- **Sex optimization:** no inherent modifier, less than 10% Core usage, and
  symmetric pair counts prevent a dominant lobby choice.

### Complexity control

- Flat conditions, capped modifiers, one passive per role/companion, one Curse
  response, max two Classes/Races, and one attachment per weapon are hard limits.
- There is no generic scripting language, counter stack, companion inventory,
  pity currency, draft, shop, or third deck.

### Deadlocks and reconnect

- All blocking decisions and reaction windows serialize ids, cursor/deadline,
  eligible choices, continuation, and deterministic default.
- An offline help invitee cannot block combat. An accepted offline helper remains
  a combatant and is covered by the same run-away state on reconnect/expiry.
- Stale or duplicate commands include decision/window/revision ids and fail
  atomically.

### Atomicity

- Setup reserves all starter cards before changing state.
- Multi-card weighted draws, full combat rewards, helper partitioning, sale,
  death/revival, and role-permission collapse preflight every required resource.
- The final reaction expiry/pass rechecks power, reward availability, agreement,
  and winner in the same engine transition.

### Privacy

- Tiers and future deck order are never projected.
- Offers, agreement counts, recipients, and public cards are public.
- Starting hands, Scavenge identity, reward partitions, charity cards, and
  chosen private discards are visible only to entitled players.
- Helper and active player receive only their own Treasure identities.

### One-player mode

- No help controls are projected.
- Victory declaration resolves immediately without a stored reaction wait.
- Scavenge cooldown uses one turn, and charity discards excess because there is
  no other recipient.
- Setup still validates one starter item in Balanced mode.

### Six-player flow

- One simultaneous 20-second reaction deadline replaces sequential waiting for
  five manual passes.
- Top HUD fits six status cells without page or rail scrolling.
- Only one help offer exists at once, and offers do not gate interference.

### Multi-Monster and helper cases

- Agreement is per combat, not per encounter.
- Final reward is the sum of final encounter reward counts; helper receives the
  clamped promised count after the combined reward is shuffled.
- Added Monsters and clones preserve stable encounter ids, definition tier,
  tags, snapshot semantics, and independent modifiers.
- Run away records every combatant/encounter pair. Helper death skips only that
  helper's later pairs; the active player continues.

### Reward modification after agreement

- Reduced reward clamps helper payment to the final total.
- Increased reward belongs to the active player.
- Zero final reward produces zero cards without invalidating the agreement or
  level rewards.

### Deck recycling

- Weighted selection operates only on the current one physical draw pile.
- Recycling occurs only at empty-pile boundaries and preserves Door/Treasure
  separation.
- Tier absence renormalizes without retry loops. Combined shortage rejects the
  whole action.

### Hand limit and charity

- Active-player combat rewards and Scavenge enter hand before `END_TURN`, so the
  existing five-card limit and charity apply normally.
- A helper may temporarily exceed five cards outside their turn and resolves the
  excess only at the end of their next own turn.
- Role/equipment revalidation may increase hand size and is handled by the same
  cleanup rule, never an immediate privacy-leaking forced transfer.

### Minimal architecture changes

V2 needs only these foundation extensions: a serializable `GameConfig`, injected
clock/deadline advancement, richer typed card metadata/conditions, union-based
pending decisions, and richer player-specific action/event projections. It does
not change server authority, in-memory persistence, full-view synchronization,
Socket.IO transport shape, or the pure game-engine boundary.
