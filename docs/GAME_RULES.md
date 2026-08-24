# Game rules

Status: **CURRENT IMPLEMENTATION SUMMARY**. The detailed, intentional gameplay
and presentation contract is [v2-game-design.md](v2-game-design.md), which is
**AUTHORITATIVE** when it explicitly states an intended rule. Code and tests
remain authoritative for what is implemented today.

## Match and setup

- A room supports 1–6 players (3–6 is the intended social game). The host starts
  after every player has chosen `MALE` or `FEMALE`; each player also has a unique
  cosmetic lobby color.
- The host selects `BALANCED` or `CLASSIC_CHAOS` and enabled card sets. Stable
  internal `CORE` is shown to players as **Нейро 1** and is mandatory. Companions,
  Arsenal, Dual Identity, Classic Fantasy, Clerical Errors, and Steed & Hirelings
  are optional. The start snapshot becomes immutable game configuration.
- Victory is level 10. The engine changes the match to `FINISHED`, records the
  winner, and rejects later gameplay. The host may rematch the same roster or
  return the room to lobby.
- Setup deals four Door and four Treasure cards per player. Balanced mode also
  reserves a legal neutral Tier-1 starter Equipment per player and deals the
  remaining weighted cards; Classic Chaos shuffles then draws normally.

## Turn and cards

The active player progresses through explicit phases: `TURN_START`,
`KICK_DOOR`, `DOOR_RESOLUTION`, `POST_DOOR`, `LOOT_ROOM`, and `END_TURN`.
Kicking a Door publicly reveals a Monster, Curse, or a card that enters the
active player's hand. At `POST_DOOR`, the player can Look for Trouble with a
hand Monster, Loot the Room, use eligible Scavenge recovery, or finish the
turn once hand-limit/charity requirements permit it.

Definitions are data, not card-name branches. They identify deck, set, tier,
tags, timing/target, typed effects, and any applicable equipment, Monster,
Curse, role, companion, permission, attachment, protection, or economy data.
The server also projects all rule-bearing conditions/modifiers and a derived
duration category, so Details can explain an action without parsing its name or
flavor text. Production catalog validation rejects behavior whose authored
effect, timing, target, or type-specific rules do not agree.
Physical copies retain separate instance identities. Door and Treasure decks are
independent; draws are atomic, recycle only the matching discard when needed,
and disclose no hidden identity while recycling.

The optional Classic Fantasy, Clerical Errors, and Steed & Hirelings packs are
original project content inspired only by broad fantasy-card-game interactions.
They contain no copied Munchkin artwork or card text. Their roles, item enhancers,
combat interference, Hirelings, and mounts use the same typed mechanics as the
rest of the production catalog; all cards remain Door or Treasure cards.

## Player build and economy

Players have public Equipment and attachments; hands remain private. Equipment
uses Head, Body, Feet, or Hands slots, with hand capacity and typed Class/Race
restrictions. Power is derived from level, equipment/attachments, roles,
companions, active effects, and eligible Makeshift Tools—not stored or supplied
by a client.

An equipped item's public projection includes the enhancer cards attached to
that host and its resolved current contribution. Details present typed passive
or conditional modifiers alongside those attachments; clients do not parse card
description text or recompute the total.

Class and Race are public role arrays with a normal capacity of one. A typed
permission card can expand a role capacity; loss of permission can require a
serialized choice of which role to retain. Hirelings and mounts occupy their own
public companion containers. Arsenal attachments apply only to their typed
eligible equipment targets.

An ordinary role may have at most one passive and one active ability. Active
roles reuse discard-for-combat, discard-for-Run-Away, or discard-to-draw
primitives. Costs and exact legal targets are projected as intents. A single
JSON-safe usage ledger enforces once-per-turn or once-per-combat limits.

Eligible positive-value Treasure can be sold under authoritative timing and
ownership rules: every complete 1,000 gold gives one level, any remainder is
lost, and sales cannot win the game. Trading and charity are server-authorized;
charity resolves the end-turn hand limit with an explicit recipient or
authoritative random choice where allowed.

## Combat, help, and escape

A combat has one or more ordered Monster encounters, each with a stable
encounter id and its own strength/reward modifiers and public played-card
history. The player side wins only when its derived total strictly exceeds the
combined Monster total. Temporary player bonuses, Monster modifiers, added
Monsters, clones, and combat Curses use typed targets and the current combat
address.

Side-neutral combat boosts are explicitly authored as such and project both the
player side and every exact Monster encounter. Player-only and Monster-only
cards remain illegal on the other side. All choices retain combat revision and
reaction-window stale-command protection; resulting sources appear in the
authoritative power breakdown and combat history.

An apparent win requires `DECLARE_COMBAT_VICTORY`; a reaction window lets all
eligible players pass or intervene. The final pass atomically rechecks power and
reward availability. A successful help offer is bounded by the current total
Treasure reward; acceptance creates an immutable agreement. On victory, only
the active player receives levels and the shuffled Treasure reward is split by
the agreement, with card identities private to each recipient.

Run away is an ordered, persisted sequence across encounters and combatants.
The engine rolls each attempt with injected randomness and resolves typed Bad
Stuff. Chosen discards, shared effects, death, and revival are serialized so a
refresh cannot reroll or repeat outcomes.

## Interruptions, events, and privacy

Card-choice discards, role retention, target-only Curse protection, help offers,
and victory reactions are explicit persisted workflows. They contain stable ids,
actor/target, continuation data where needed, and absolute deadlines. Engine
expiry defaults are authoritative and idempotent.

Successful actions append visibility-tagged events to match history. Each viewer
receives their own private card identities and public summaries where appropriate.
`AvailableIntentView`, expected actor data, card unavailability reasons, and
event priority are server projections; the UI must render them rather than
infer rules.

## Intentional limits

The game is an in-memory private LAN application. Server restart loses games and
sessions. It has no accounts, persistence, matchmaking, AI players, public
hosting, or copied Munchkin text/artwork.
