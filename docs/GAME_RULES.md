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
- a Monster creates combat state and pauses normal turn progression pending the
  later combat milestone;
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

The game must have a configurable or clearly defined winning level.

Only the game engine may decide that a player has won.

The finished game state should identify the winner.

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
