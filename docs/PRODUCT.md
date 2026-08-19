# Product specification

## Goal

Build a mobile-friendly multiplayer card game inspired by Munchkin.

The game runs on a Windows or Linux PC on the local network.

Friends connect using their phone browsers over Wi-Fi.

No internet connection or user accounts are required.

## Target experience

1. Server owner starts the application on a PC.
2. Application displays its LAN URL.
3. Host opens the game.
4. Host creates a room.
5. A short room code is generated.
6. Friends open the application on their phones.
7. They enter their name and room code.
8. Players appear in the lobby in real time.
9. Host starts the game.
10. Players receive private hands.
11. A complete game can be played from beginning to victory.
12. A disconnected phone can reconnect to the same player.

## Players

Target:

- 3–6 players.

For development:

- allow 1–6 players so the application can be tested alone.

## Platforms

Primary:

- Android Chrome;
- desktop Chrome/Firefox.

Secondary:

- iPhone Safari.

## UI

Mobile-first.

Portrait orientation must be fully usable.

Minimum practical target width:

```text
360px
```

Avoid desktop-style board layouts.

The game screen consists conceptually of:

- other players;
- current turn / phase;
- central game area;
- combat area when relevant;
- own equipment;
- own cards;
- persistent actions/navigation.

## MVP principles

Game correctness and usability are more important than animations.

Do not initially optimize socket traffic.

Sending a fresh player-specific `GameView` after an action is acceptable.

## Privacy of game information

The server owns the complete `GameState`.

Each player receives a player-specific `GameView`.

A player may see:

- their own hand;
- public equipment;
- public player information;
- public cards on the table.

They must not receive:

- identities of cards in another player's hand;
- future deck cards.

## Persistence

Initial version keeps games only in memory.

Restarting the server may destroy active games.

Player reconnection during the lifetime of the process is required.

## Out of scope initially

- cloud hosting;
- accounts;
- passwords;
- matchmaking;
- rankings;
- database persistence;
- AI opponents;
- public deployment;
- monetization;
- Redis;
- microservices;
- SSR;
- GraphQL;
- NgRx;
- Nx.

## Definition of a playable 1.0

A group of friends connected to the same Wi-Fi can:

- create and join a room;
- start a match;
- receive private hands;
- equip items;
- kick the door;
- encounter monsters and curses;
- fight monsters;
- use temporary bonuses;
- interfere with another player's combat;
- request and accept help;
- run away;
- receive treasure and levels;
- end a turn;
- reconnect after a temporary network loss or page refresh;
- continue until a player reaches the victory condition.

The application must be usable from phones without manual intervention in server state.
