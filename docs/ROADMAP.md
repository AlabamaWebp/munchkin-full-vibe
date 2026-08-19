# Roadmap

## Milestone 0 — Repository foundation

Goal:

Create a healthy monorepo and development environment.

Requirements:

- npm workspaces;
- Angular application;
- NestJS application;
- contracts package;
- game-engine package;
- strict TypeScript;
- lint;
- tests;
- root scripts;
- documentation;
- Git-friendly structure.

Done when:

- `npm install` succeeds;
- `npm run build` succeeds;
- `npm test` succeeds;
- `npm run lint` succeeds;
- `npm run dev` starts Angular and NestJS.

---

## Milestone 1 — Domain skeleton

Implement:

- `GameState`;
- `PlayerState`;
- `GamePhase`;
- `CardDefinition`;
- `CardInstance`;
- `CardType`;
- `GameCommand`;
- `GameEvent`;
- `CommandResult`;
- `RandomSource`.

Create deterministic unit tests.

No networking yet.

---

## Milestone 2 — Basic game engine

Status: complete.

Implement:

- create game;
- add players;
- start game;
- shuffle decks;
- deal starting cards;
- active player;
- turn progression;
- Kick Door;
- basic Door resolution;
- Loot Room;
- End Turn.

Use a small fictional test card set.

---

## Milestone 3 — Multiplayer lobby

Status: complete.

Implement Angular:

- home screen;
- player name;
- create room;
- join room;
- lobby.

Implement NestJS:

- room creation;
- room joining;
- short room codes;
- Socket.IO rooms;
- lobby synchronization.

Allow 1-player games in development mode.

---

## Milestone 4 — Session/reconnect

Implement:

- session token;
- `localStorage`;
- reconnect;
- refresh recovery;
- disconnected player indication.

Tests where practical.

---

## Milestone 5 — Game synchronization

Connect `game-engine` to NestJS.

Implement:

```text
game:command
```

and player-specific:

```text
game:state
```

Ensure private cards are never leaked.

---

## Milestone 6 — Mobile game UI

Implement:

- player list;
- current player;
- current phase;
- own character;
- equipment;
- horizontally scrollable hand;
- card details;
- action bar;
- loading/reconnecting/error states.

Target widths:

- 360px+;
- 390px+;
- 412px+.

No hover-only interactions.

Important tap targets should be approximately 44px or larger.

---

## Milestone 7 — Equipment

Implement:

- equipment cards;
- equip;
- unequip;
- combat power calculation;
- equipment display;
- validation.

---

## Milestone 8 — Combat

Implement:

- monster encounter;
- combat state;
- player power;
- monster power;
- temporary modifiers;
- victory;
- treasure rewards;
- level rewards.

At this point the application should begin to feel like an actual game.

---

## Milestone 9 — Multiplayer combat

Implement:

- request help;
- accept help;
- helper contribution;
- cards played by other players;
- monster modifiers;
- public combat history.

---

## Milestone 10 — Losing combat

Implement:

- run away;
- escape result;
- bad stuff;
- state cleanup.

---

## Milestone 11 — Expanded rules

Implement selected features:

- curses;
- classes;
- races;
- equipment restrictions;
- selling;
- trading;
- charity;
- death.

Each important rule requires tests.

---

## Milestone 12 — Game completion

Implement:

- winning level;
- winner;
- finished game;
- rematch;
- return to lobby.

---

## Milestone 13 — LAN production

Implement:

- Angular production build;
- Nest serves Angular;
- Socket.IO uses the same origin;
- host `0.0.0.0`;
- display LAN URL;
- optional QR join URL.

Done when phones can connect using:

```text
http://PC_LAN_IP:3000
```

without running a separate Angular development server.

---

## Milestone 14 — Hardening

Test using multiple phones.

Cover:

- refresh during own turn;
- disconnect during combat;
- duplicate player names;
- invalid room;
- host disconnect;
- repeated commands;
- invalid card id;
- attempting another player's action;
- joining a started game;
- empty deck / discard recycling;
- browser backgrounding;
- stale client state;
- repeated reconnects.

---

## Suggested version progression

```text
0.1  Game engine foundation
0.2  Rooms/lobby
0.3  Multiplayer socket synchronization
0.4  Cards/hand
0.5  Basic turn flow
0.6  Combat
0.7  Equipment
0.8  Player interaction
0.9  Reconnect + mobile UX
1.0  Fully playable LAN game
```
