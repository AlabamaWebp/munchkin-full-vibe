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
    +--> later: LOOK_FOR_TROUBLE
    |
    +--> LOOT_ROOM when allowed
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
- after a non-combat Door resolution, the player may loot one facedown Door card
  or skip looting and end the turn;
- ending the turn advances cyclically through join order, increments the turn
  number, and returns to `TURN_START`.

The card identities in an initial deal or facedown room loot are private. The
revealed kicked-Door card is public.

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

- kicking a Door that contains a Monster starts combat for the active player;
- player power is the player's level plus equipment bonuses plus temporary
  combat bonuses calculated by the engine;
- monster power is the monster's data-driven level;
- the active player may play Treasure cards typed as `TEMPORARY_BONUS` from
  their hand into their own combat; the card's effects are applied and the card
  is immediately moved to the Treasure discard pile;
- the player wins only when player power is strictly greater than monster power;
  a tie is not a victory;
- a defeated monster is moved to the Door discard pile, its data-driven level
  reward is applied, and its full Treasure reward is drawn privately;
- combat rewards are atomic: combat is not resolved if the Treasure deck cannot
  provide every promised card;
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
- all players may play a `TEMPORARY_BONUS` card for the player side during an
  active combat, including combats in which they are neither the active player
  nor the accepted helper;
- all players may play a typed `MONSTER_MODIFIER` card for the Monster side;
  Monster modifiers use explicit `MONSTER_COMBAT_BONUS` effects and never rely
  on card names;
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
  power does not exceed the Monster power;
- running away rolls one six-sided die through the injected `RandomSource`;
- a result of 5 or 6 succeeds, while 1–4 fails;
- a successful escape applies no bad stuff;
- a failed escape applies the Monster's typed, data-driven bad-stuff effects to
  the active player; development effects may lose levels or discard random cards
  from the hand or equipment;
- losing levels can never reduce a player below level one;
- the accepted helper does not make a separate escape roll and does not receive
  bad stuff under the current simplified rules;
- after either escape result, the Monster is discarded, the active player's
  temporary combat bonus is cleared, help and combat history are removed with
  the combat state, and the game proceeds to `END_TURN`;
- the public escape roll and result remain in the game state until the turn ends,
  so every player and a reconnecting client can see the outcome.

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
  rejects equipping it without that role, and a role replacement returns newly
  illegal equipment to its owner's hand;
- a Curse held in hand may target any player. Its typed effects resolve
  immediately and the Curse is discarded; expanded effects include losing a
  Class or Race and death;
- equipment has a data-driven gold value. During their own non-combat turn, a
  player may sell owned items worth at least 1,000 gold total and gains one level
  per complete 1,000 gold; clients never submit the level gain;
- outside combat, any player may give owned equipment to another player. The
  recipient receives it into their private hand and equips it separately;
- the end-turn hand limit is five cards. Every excess card must be given to a
  lowest-level player. If the active player is tied for lowest level, the excess
  is discarded instead;
- death keeps the player's level but discards their hand, equipment, Class, and
  Race. The player remains dead until their next turn, then returns and draws up
  to four available Door and four available Treasure cards.

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

Use original fictional cards.

Suggested initial test content:

### Monsters

- Rat — low level;
- Goblin — low level;
- Orc — medium level;
- Troll — high level;
- Dragon — very high level.

### Equipment

- Wooden Sword;
- Helmet;
- Boots;
- Armor;
- Great Sword.

### Temporary bonuses

- Small Potion;
- Large Potion;
- Lucky Charm.

### Curses

- Lose 1 Level;
- Discard Helmet;
- Lose an Item.

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

The winning level is 10. Reaching level 10 through any authoritative level gain
(including combat rewards or selling items) immediately finishes the game.

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
CARD_DRAWN
CURSE_RESOLVED
COMBAT_STARTED
CARD_PLAYED
COMBAT_UPDATED
COMBAT_WON
RUN_AWAY_ATTEMPTED
TREASURE_GAINED
LEVEL_GAINED
TURN_ENDED
GAME_FINISHED
```

Public and private information must be separated when events are later exposed to clients.

## Game log

The UI should eventually show a readable event log such as:

```text
16:42 Dmitry kicked the door.
16:42 A Goblin appeared.
16:43 Dmitry equipped a Sword.
16:43 Ivan played a Potion on the monster.
16:44 Dmitry won the combat.
16:44 Dmitry gained 1 level.
```

The log should be derived from trustworthy server/game-engine events rather than client assumptions.
