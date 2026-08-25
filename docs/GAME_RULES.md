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
  are optional. The host also chooses a bounded maximum hand size (3–10, default 5) and whether the optional double-Monster ambush Door is enabled. The start
  snapshot becomes immutable game configuration and is preserved by rematch.
- Victory is level 10. The engine changes the match to `FINISHED`, records the
  winner, and rejects later gameplay. The host may rematch the same roster or
  return the room to lobby.
- Setup deals four Door and four Treasure cards per player. Balanced mode also
  reserves a legal neutral Tier-1 starter Equipment per player and deals the
  remaining weighted cards; Classic Chaos shuffles then draws normally.
  Draw-only ambush Doors remain in hidden Door resources and are not dealt into
  starting hands.

## Turn and cards

The active player progresses through explicit phases: `TURN_START`,
`KICK_DOOR`, `DOOR_RESOLUTION`, `POST_DOOR`, `LOOT_ROOM`, and `END_TURN`.
Kicking a Door publicly reveals a Monster, Curse, or a card that enters the
active player's hand. At `POST_DOOR`, the player can Look for Trouble with a
hand Monster, Loot the Room, or use eligible Scavenge recovery. One of those
progressions is mandatory before the phase advances to `END_TURN`; direct End
Turn and Sale are illegal in `POST_DOOR`.

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

When enabled, an authored ambush Door atomically selects exactly two distinct
physical Monsters from the current Door resources, recycling the Door discard
only at the normal empty-pile boundary, and starts the ordinary multi-Monster
combat flow. Candidate
identities remain hidden, selection uses bounded `RandomSource` calls, and a
shortage rejects the whole Door resolution without partial movement.

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

Typed capacity modifiers can expand Head, Hands, Hireling, or Mount capacity.
Normal legality and deterministic revalidation apply when a capacity source is
lost: excess Equipment/companions return to the owner's hand, and attachments
on returned Equipment follow their host. For each Equipment card in the
viewer's hand, the server projects whether some currently legal equip/replacement
outcome increases permanent combat power, including restrictions, capacity,
hands, modifiers, and attachment loss; Angular does not simulate it.

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
primitives, including a bounded attempt to steal one exact public equipped item.
Costs and exact legal targets are projected as intents. A single JSON-safe usage
ledger enforces once-per-turn or once-per-combat limits and survives reconnect.
The initial equipped-theft content allows one paid attempt per turn at an
authored 1-in-6 success chance. Failure consumes the cost and usage; success
moves the same physical item into the thief's hand, then applies normal
attachment and equipment-revalidation rules to the victim.

A separate typed hand-theft effect targets another player and makes one bounded
engine-random selection from that player's eligible hidden hand. Candidate card
identities are never projected. The thief sees the moved card in their own hand,
the victim receives a private authoritative event naming it, and everyone else
receives only an identity-free public theft summary, including after reconnect.

Eligible positive-value Treasure can be sold under authoritative timing and
ownership rules: every complete 1,000 gold gives one level, any remainder is
lost, and sales cannot exceed level 9. Ordinary `GAIN_LEVEL` effects also stop at
9; only Monster victory reaches the standard level 10. The existing explicit
exceptional `victoryEligible` effect remains available to authored exceptional
content, but ordinary production content does not use it. Trading and charity
are server-authorized; charity resolves the configured end-turn hand limit with
an explicit recipient or authoritative random choice where allowed.

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
