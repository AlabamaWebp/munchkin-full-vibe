# Game rules and implementation scope

This document describes the planned rules for the custom LAN card game inspired by Munchkin.

It intentionally starts with a simplified core and expands later.

Do not copy copyrighted Munchkin card artwork or card text into the repository.

Use fictional development cards and original wording.

## Core concepts

Each player has:

- a level;
- a private hand;
- public equipment;
- temporary bonuses where applicable;
- class/race information in later milestones.

The game has:

- Door deck;
- Treasure deck;
- Door discard pile;
- Treasure discard pile;
- current active player;
- current phase;
- optional combat;
- optional pending decision;
- game log/events.

## Initial turn flow

The first simplified engine should support phases conceptually similar to:

```text
TURN_START
    |
    v
KICK_DOOR
    |
    v
DOOR_RESOLUTION
    |
    +--> COMBAT if monster
    |
    +--> resolve curse
    |
    +--> add non-monster/non-curse card to hand
    |
    v
POST_DOOR
    |
    +--> LOOK_FOR_TROUBLE when a Monster is available in hand
    |
    +--> LOOT_ROOM when allowed
    |
    +--> END_TURN when the hand limit allows it
    |
    v
END_TURN
```

The exact enum may evolve, but phase transitions must remain explicit and testable.

### Milestone 2 development rules

The basic engine uses the following concrete development rules:

- a game may start with 1–6 players;
- each player receives four Door cards and four Treasure cards;
- both decks and the starting player are randomized through the injected
  `RandomSource`;
- kicking the Door reveals and removes the top Door card;
- a Monster creates combat state and pauses normal turn progression until the
  combat is resolved;
- a Curse resolves its typed effects, is discarded, and proceeds to `POST_DOOR`;
- any other Door card is revealed, added to the active player's hand, and proceeds
  to `POST_DOOR`;
- after a non-combat Door resolution, the player may play exactly one Monster
  from their own hand with `LOOK_FOR_TROUBLE`, loot one facedown Door card, or
  skip both and end the turn when the hand limit allows it;
- a Monster played with `LOOK_FOR_TROUBLE` leaves the private hand, becomes
  public, and starts the same normal combat as a Monster revealed by kicking the
  Door;
- ending the turn advances cyclically through join order, increments the turn
  number, and returns to `TURN_START`.

The card identities in an initial deal or facedown room loot are private. The
revealed kicked-Door card is public.

## Deck lifecycle and draws

Door and Treasure draws use the same server-authoritative lifecycle, while the
two deck types remain completely separate:

- `CLASSIC_CHAOS` shuffles enabled decks and consumes the top card in order;
- `BALANCED` selects each physical card with the level-based Door profile or the
  defeated encounter's final-strength Treasure profile, using only the injected
  `RandomSource`;
- a Balanced draw renormalizes weights across tiers currently present and falls
  back to a uniform present-tier choice when every preferred tier is absent;
- the matching discard is recycled only when its draw pile is empty;
- recycling the discard produces a public `DECK_RESHUFFLED` event that identifies
  only the Door or Treasure deck and never reveals card identities;
- every complete request is preflighted and rejects atomically when the matching
  draw pile plus discard contains too few physical cards;
- this lifecycle applies to kicking the Door, looting the room, typed card-draw
  effects, combat Treasure rewards, and both four-card revival draws;
- revival requires exactly four Door and four Treasure cards. If either combined
  deck and discard cannot provide all four, ending the preceding turn fails
  atomically and the player remains dead until the action can be completed.

## V2 gameplay core

The rules in this section supersede the earlier simplified milestone behavior.

- Balanced setup reserves one distinct neutral, legal Tier-1 starter Equipment
  instance per player, deals three weighted Treasure and four weighted Door
  cards, then shuffles each private hand. Classic Chaos deals normally.
- Makeshift Tools is a computed combat-power source for an eligible alive level-1
  active player in one ordinary weak Tier-1 encounter without a helper. It is
  recalculated from authoritative permanent power and is never a card or asset.
- At `POST_DOOR`, an eligible weak level-1 player may `SCAVENGE` instead of
  `LOOT_ROOM`. The engine uniformly selects one currently available legal
  recovery item; it does not search discard. Recovered items are explicitly
  non-sellable and non-tradeable, and a full-table-round cooldown applies.
- Any eligible positive-value Treasure may be sold when its definition permits
  it. The engine validates ownership, uniqueness, timing, value, and sellability;
  each complete 1,000 gold grants one level and the remainder is lost. A sale is
  unavailable at level 9 and a selection that would cross the pre-victory level
  limit is rejected atomically.
- One public help offer may exist per combat. The active player proposes a helper
  and 0 through the total Treasure reward currently provided by all Monsters in
  the combat; promised Treasures may never exceed the reward the combat can give.
  The invitee may accept,
  reject, or counter, and the active player may accept/reject the counter or
  cancel an outstanding offer. Commands use stable offer ids and combat revisions.
  Acceptance creates one immutable reconnect-safe agreement.
- At victory, only the active player receives levels. The helper receives the
  smaller of the promised count and final Treasure count, and the active player
  receives the remainder. The full reward is drawn atomically and shuffled before
  partitioning; public events reveal counts only, while each recipient privately
  receives only their own card identities.
- When a helper joined a losing combat, each encounter is processed in
  encounter-major order: active player, then helper. Every living combatant rolls
  independently with server randomness and typed modifiers. Death records later
  attempts as skipped; pending Bad Stuff choices and shared-effect progress are
  serialized so reconnect resumes without reroll or duplicate resolution.
- Sex, Class, Race, Monster tags, Equipment tags, and approved card-family
  conditions are typed data evaluated by the engine; card names never select a
  rule. Their contributions are separate sources in the projected breakdown.
- A player normally has one Class and one Race. A non-stacking role-permission
  card raises one capacity to two; duplicate role definitions remain illegal.
  Losing permission with two roles creates a reconnect-safe choice of which role
  to keep, then revalidates equipment once and returns incompatible items and
  their attachments to the private hand.

## Core V1 feature set

Implement before advanced rule systems:

- player levels;
- Door deck;
- Treasure deck;
- private hand;
- equipment;
- monsters;
- basic combat;
- temporary combat bonuses;
- help from another player;
- interference by other players;
- rewards;
- run away;
- bad stuff;
- loot room;
- end turn;
- victory condition.

## Milestone 7 equipment rules

- equipment may be equipped or unequipped only by the active player during
  `TURN_START`, `POST_DOOR`, or `END_TURN`, and never while combat is active;
- a player may equip one Head item, one Body item, and one Feet item;
- a player has two hands and may use them for either two one-handed items or one
  two-handed item;
- equipping moves a card from the private hand to public equipment; unequipping
  returns it to the private hand;
- combat power is derived by the engine as player level plus equipped combat
  bonuses plus the current temporary combat bonus;
- class, race, and other complex equipment restrictions remain part of the
  expanded-rules milestone.

## Milestone 8 combat rules

- kicking a Door that contains a Monster or playing one owned hand Monster with
  `LOOK_FOR_TROUBLE` starts combat for the active player;
- player power is the player's level plus equipment bonuses plus temporary
  combat bonuses calculated by the engine;
- monster power is the monster's data-driven level;
- the active player may play Treasure cards typed as `TEMPORARY_BONUS` from
  their hand into their own combat; the card's effects are applied and the card
  is immediately moved to the Treasure discard pile;
- the player wins only when player power is strictly greater than monster power;
  a tie is not a victory;
- a defeated monster is moved to the Door discard pile, its data-driven level
  reward is applied, and its full Treasure reward is drawn privately, recycling
  the Treasure discard when required;
- combat rewards are atomic: combat is not resolved if the Treasure draw pile
  and discard together cannot provide every promised card;
- temporary combat power is cleared after victory, and the game proceeds to
  `END_TURN`;
- losing combat, running away, and bad stuff remain part of Milestone 10.

## Milestone 9 multiplayer combat rules

- during their combat, the active player may request help from one other player;
  the pending request may be redirected until somebody accepts it;
- only the requested player may accept, and an accepted helper cannot be
  replaced during that combat;
- the helper contributes their level and equipped combat bonuses to the player
  side; combat power remains derived entirely by the engine;
- all players may play a `TEMPORARY_BONUS` card for the player side or for one
  explicitly addressed Monster encounter during an active combat, including
  combats in which they are neither the active player nor the accepted helper;
- all players may play a typed `MONSTER_MODIFIER` card for one Monster encounter;
  Monster modifiers use typed effects, require a stable encounter target, and
  never rely on card names;
- a combat card must target the side permitted by its typed definition; cards
  played on the wrong side are rejected atomically;
- the active player receives all level and Treasure rewards under the current
  simplified rules; helper reward negotiation is intentionally deferred;
- the current combat stores a public ordered history of the encounter, help
  requests and acceptance, and every publicly played combat card;
- help and Monster bonuses disappear with the combat state after victory;
- losing combat, running away, and bad stuff remain part of Milestone 10.

## Milestone 10 losing-combat rules

- only the active player may run away, and only while their combined player-side
  power does not exceed total Monster-side power;
- running away rolls one six-sided die through the injected `RandomSource` for
  each Monster encounter, in combat order;
- a result of 5 or 6 succeeds, while 1–4 fails;
- a successful escape from one Monster applies no bad stuff for that encounter;
- a failed escape applies that Monster's typed, data-driven bad-stuff effects to
  the active player before attempting the next encounter; each discard effect
  explicitly declares whether cards are selected randomly by the engine or
  chosen by the affected player;
- a player-choice discard creates a serializable pending decision, blocks other
  gameplay commands, and resumes the interrupted effect sequence after the
  affected player submits exactly the required cards;
- losing levels can never reduce a player below level one;
- the accepted helper does not make a separate escape roll and does not receive
  bad stuff under the current simplified rules;
- after all escape attempts, every physical Monster and attached modifier is
  discarded, the active player's temporary combat bonus is cleared, help and
  combat history are removed with the combat state, and the game proceeds to
  `END_TURN`;
- all public escape rolls and results remain in the game state until the turn
  ends, so every player and a reconnecting client can see the outcome.

## Multi-Monster combat extension

- an active combat contains one or more ordered Monster encounters;
- every encounter receives a stable `encounterId` that remains unchanged for
  the lifetime of that combat and is the only valid target for a Monster-side
  modifier;
- each encounter stores a snapshot of its Monster's base strength, level reward,
  Treasure reward, bad stuff, its own strength and Treasure modifiers, and its
  publicly played physical cards;
- total Monster-side power is the sum of every encounter's current strength;
  each current strength is bounded below by one;
- an original typed `ADD_MONSTER_TO_COMBAT` effect requires its player to select
  a Monster from the same private hand. The effect card and selected Monster both
  leave that hand, the Monster receives a new encounter id, and both cards remain
  public with the combat until cleanup;
- a typed `CLONE_COMBAT_MONSTER` effect targets one encounter and creates a new
  encounter as an independent snapshot of the selected Monster, including all
  strength and Treasure changes already applied at that moment. Later changes to
  either encounter do not affect the other;
- typed `MODIFY_MONSTER` effects target exactly one encounter and may change both
  strength and Treasure reward. The development booster grants +5 strength and
  +2 Treasures; the development weakening applies -5 strength and -1 Treasure;
- a Monster's current Treasure reward is bounded below by zero;
- winning uses the sum of all current Monster Treasure rewards and all base level
  rewards. Reward availability is validated atomically before any combat change;
- victory discards every unique physical Monster, add/clone card, and attached
  Monster modifier participating in the combat, then grants the summed rewards;
- running away performs one ordered, independent die roll per Monster encounter.
  A failed roll immediately resolves that encounter's bad stuff before the next
  roll;
- if bad stuff requires a player choice, the current encounter, completed
  attempts, next encounter index, remaining effects, and pending decision stay in
  serializable state. After the addressed player answers—even after reconnect—the
  engine resumes with the next Monster rather than restarting the sequence;
- after all attempts, every physical combat Monster and modifier is discarded,
  temporary player combat power is cleared, the full ordered attempt summary is
  retained until turn end, and play moves to `END_TURN`;
- no multi-Monster behavior depends on a card name; card types, typed effects,
  encounter targets, and target validation are authoritative.

## Combat victory reaction window

- a winning combat is never completed by a direct client resolution command;
- while the player side is strictly stronger, the active combat player may send
  `DECLARE_COMBAT_VICTORY` for the current server-projected combat revision;
- in a one-player match that declaration rechecks the powers and resolves the
  combat immediately;
- in a multiplayer match it creates a serializable reaction window in
  `CombatState`. The claimant is confirmed automatically, and every other match
  participant must send `PASS_COMBAT_REACTION` for that exact window before the
  combat may end;
- connection status does not alter the participant list or confirmations. A
  disconnected player remains awaited and sees the same window after reconnect;
- a player who confirmed that they will not intervene cannot play a reaction in
  that window. If combat changes, earlier confirmations are reset and that player
  may react again; the claimant remains confirmed while their claim remains valid;
- the final confirmation atomically rechecks current player-side and Monster-side
  power before granting any level or Treasure reward;
- a valid intervention increments the combat revision. If the player side still
  leads, a new reaction-window id is created with only the claimant confirmed. If
  the lead is lost, the victory claim is cancelled and no reaction window remains;
- after a cancelled claim, restoring the player-side lead does not resume the old
  window. The active player must declare victory again for the new combat revision;
- reaction-window and combat-revision ids are server-authored. Duplicate or stale
  passes, declarations, and card reactions are rejected without changing state;
- while the window is active, the only allowed commands are the exact-window pass
  and typed combat reactions. Help, escape, equipment, economy, turn, and other
  gameplay commands are blocked; ordinary Curses remain an explicit exception and
  may be played against any player;
- allowed typed reactions are: a combat Curse targeting the active combat player
  or accepted helper; adding a selected owned hand Monster; cloning a selected
  encounter; strengthening or weakening a selected encounter; and a temporary
  bonus typed for either the player side or one selected Monster;
- `COMBAT_CURSE` is a distinct data-driven card type. Its typed combat modifier is
  temporary and is cleared from the active player or helper with combat cleanup;
- player-side and Monster-side temporary bonuses are distinguished by their typed
  effects. A card cannot be played on a side its definition does not permit.

## Expanded V1.1 feature set

Add after the core loop works end-to-end:

- classes;
- races;
- curses beyond simple effects;
- trading;
- selling items;
- charity;
- death;
- complex equipment restrictions;
- more complex card effects.

## Milestone 11 expanded rules

- a player may have at most one public Class and one public Race; playing a new
  card of the same role replaces and discards the previous card;
- Class and Race cards may be played only by the active player during
  `TURN_START`, `POST_DOOR`, or `END_TURN`, outside combat;
- equipment may declare a required Class or Race by definition id; the engine
  rejects equipping it without that role. After every Class or Race loss or
  replacement, including `DISCARD_ROLE` Curse effects, the engine revalidates
  all equipped items, returns every newly illegal item to its owner's private
  hand, and emits one public unequip event per item without exposing the hand;
- a Curse held in hand may target any player at any time during an in-progress
  game, including another player's turn, combat, and a combat-reaction window.
  Its typed effects resolve immediately and the Curse is discarded; an existing
  blocking protection or card-choice response must still finish before another
  command is accepted. Expanded effects include losing a Class or Race and death;
- equipment has a data-driven gold value. During their own non-combat turn, a
  player may sell owned items worth at least 1,000 gold total and gains one level
  per complete 1,000 gold; clients never submit the level gain;
- during their own non-combat turn, a player may give owned equipment to another
  player. The recipient receives it into their private hand and equips it
  separately;
- the end-turn hand limit is five cards. `GIVE_CHARITY` requires the active
  player to select exactly every excess hand card and, when not at minimum
  level, one recipient among all minimum-level players. A minimum-level actor
  instead discards the selected cards. The separate random option remains
  server-authoritative and selects the excess cards for the player;
- charity publishes only sender, recipient (when any), and count to everyone.
  The sender and recipient additionally receive the exact card identities in
  their private reconnect-safe history; no other player receives them;
- death keeps the player's level but discards their hand, equipment, Class, and
  Race. The player remains dead until their next turn, then returns after an
  atomic draw of exactly four Door and four Treasure cards using the normal deck
  recycling lifecycle.

## Development player count

Allow:

```text
1–6 players
```

during development.

Target real game:

```text
3–6 players
```

One-player mode is for testing UI, networking and engine flows.

## Development card set

The development catalog uses only original fictional names and text. It contains
20 unique Door definitions and 22 unique Treasure definitions, producing 56 Door
and 66 Treasure physical cards. This is sufficient for the initial eight-card
deal to six players and leaves enough variety for a normal match.

Door content includes eight Monsters across levels 1–18 with typed bad stuff,
six ordinary Curses, one combat Curse, two Classes, two Races, and a typed card
that adds a selected hand Monster to combat. Treasure content includes ten items
covering every equipment slot, player- and Monster-side one-shot bonuses,
strength/reward Monster modifiers, a weakening card, and Monster cloning.

Catalog completeness rules:

- production definitions must not use `OTHER` as behaviorless filler;
- `effects: []` is valid only for a Monster, equipment, Class, or Race whose
  complete behavior is represented by its typed fields;
- every definition has a stable unique `id` and `artKey`;
- every Treasure has an explicit non-negative `goldValue`, including one-shot
  cards and modifiers;
- every equipment definition declares its slot, occupied hands (`0`, `1`, or
  `2`), combat bonus, and an explicit typed restrictions list (which may be
  empty); only Hands equipment may occupy one or two hands;
- every action card whose use is not inherent in its type declares typed
  permitted timing and target metadata;
- English source text and Russian localization must exist for every definition.

These presentation and legality metadata are projected unchanged in each visible
`GameCardView`; the client does not infer them from a name or description.

Exact numbers are implementation details and may be adjusted for testing.

## Card architecture rule

Never implement behavior by checking card names.

Wrong:

```ts
if (card.name === "Goblin") {
  // special logic
}
```

Correct approach:

- type;
- tags;
- monster stats;
- effect definitions;
- target rules;
- restrictions.

## Combat

Conceptually:

```text
player combat power =
  player level
  + equipped bonuses
  + temporary bonuses
  + helper contribution where allowed
```

Monster power comes from:

- monster base level;
- monster modifiers;
- temporary effects;
- special typed rules.

Clients never submit the resulting power number as authoritative input.

The server/game-engine derives it.

## Multiplayer combat

The active combat may later support:

- request help;
- accept help;
- helper contribution;
- other players playing modifiers;
- target selection;
- combat history.

## Losing combat

Losing combat should eventually support:

- run away;
- deterministic/testable escape resolution through `RandomSource`;
- bad stuff;
- player state cleanup.

## Victory

The winning level is 10. Monster combat may grant the final level; ordinary
sales and ordinary `GAIN_LEVEL` effects stop at level 9. A non-combat card may
grant the final level only when its typed effect explicitly declares
`victoryEligible: true`.

The combat reaction window delays only the resolution of a won combat. When the
eventually granted combat level reward reaches level 10, the game finishes
immediately in that same authoritative resolution. Levels are capped at 10.

Only the game engine may decide that a player has won.

The finished game state identifies the winner, clears active combat, and rejects
all later gameplay commands. The host may start a rematch with the same room
roster and sessions or return everyone to the pre-game lobby.

## Validation

Every command must validate:

- actor exists;
- actor is allowed to act now;
- correct phase;
- referenced card exists;
- referenced card belongs to the expected zone;
- target is valid;
- the action is permitted by the card/rule;
- no hidden client-provided calculations are trusted.

Invalid actions must fail consistently with a domain-specific error/result.

## Game events

Important state transitions should produce domain events.

Examples:

```text
GAME_STARTED
CARDS_DEALT
TURN_STARTED
DOOR_KICKED
DECK_RESHUFFLED
LOOKED_FOR_TROUBLE
CARD_DRAWN
CARD_DISCARD_REQUIRED
CARDS_DISCARDED_SUMMARY
CURSE_RESOLVED
COMBAT_STARTED
CARD_PLAYED
COMBAT_UPDATED
COMBAT_VICTORY_DECLARED
COMBAT_REACTION_PASSED
COMBAT_REACTIONS_RESET
COMBAT_VICTORY_CANCELLED
COMBAT_WON
RUN_AWAY_ATTEMPTED
TREASURE_GAINED
LEVEL_GAINED
LEVEL_LOST
TURN_ENDED
GAME_FINISHED
```

Public and private information must be separated when events are exposed to
clients. Everyone may see that a player must discard or has discarded a number
of cards, but identities from a private hand remain visible only to their owner.

## Game log

The UI shows a readable, complete event log such as:

```text
16:42 Dmitry kicked the door.
16:42 A Goblin appeared.
16:43 Dmitry equipped a Sword.
16:43 Ivan played a Potion on the monster.
16:44 Dmitry won the combat.
16:44 Dmitry gained 1 level.
```

The game screen also shows a compact synchronized list of the latest public
events so the result of an action is visible without opening the complete log.

The log is accumulated in authoritative game state from trustworthy game-engine
events rather than client assumptions. It survives reconnection for the lifetime
of the match. Public entries are identical for every player, while private entries
are projected only to their recipient and must never reveal another player's
hidden cards.
