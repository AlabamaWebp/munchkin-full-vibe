# Architecture

## High-level architecture

```text
Angular SPA
    |
Socket.IO
    |
NestJS
    |
Game application services
    |
Pure TypeScript game-engine
    |
GameState
```

## Monorepo

### `apps/web`

Angular application.

### `apps/server`

NestJS application.

### `packages/contracts`

Shared transport contracts and serializable public types.

### `packages/game-engine`

Framework-independent game domain and rules.

## Server-authoritative model

The server is the only authority capable of changing `GameState`.

Angular sends `GameCommand` objects.

Example:

```json
{
  "type": "PLAY_CARD",
  "cardId": "card-instance-id",
  "targetId": "optional-target"
}
```

The client must never send calculated combat strength, rewards, levels, or other authoritative results.

## Game engine

The engine should expose an API conceptually similar to:

```ts
executeCommand(
  state: GameState,
  command: GameCommand,
  context: CommandContext
): CommandResult
```

Conceptual result:

```ts
interface CommandResult {
  state: GameState;
  events: GameEvent[];
}
```

`GameEvent` is useful for:

- game log;
- UI notifications;
- debugging;
- animations later.

Events that contain hidden card identities carry an explicit private audience and
recipient player. Public events contain only information all players may learn.
Transport code introduced in a later milestone must route private events only to
their recipient.

## Command versus event

A command is an intention:

```text
PLAY_CARD
```

An event is something that actually happened:

```text
CARD_PLAYED
```

Flow:

```text
Angular
   |
   | game:command
   v
NestJS Gateway
   |
   v
Game Service
   |
   v
GameEngine.executeCommand()
   |
   +--> new GameState
   |
   +--> GameEvent[]
```

## Determinism

Randomness must be isolated behind a `RandomSource` abstraction so tests can provide deterministic results.

Random behavior includes:

- deck shuffling;
- dice rolls if used;
- other random mechanics.

## Game state

`GameState` contains only serializable data.

It must not contain:

- Socket objects;
- Angular objects;
- Nest providers;
- functions.

Conceptually:

```text
GameState
- id
- status
- players
- activePlayerId
- phase
- doorDeck
- treasureDeck
- doorDiscard
- treasureDiscard
- combat
- pendingDecision
- winnerId
- turnNumber
```

## Player state

`PlayerState` conceptually contains:

- id;
- name;
- level;
- hand;
- equipment;
- class cards;
- race cards;
- temporary modifiers;
- alive/dead state where required.

Socket/session information does not belong here.

## Session layer

Server maintains separate session information:

```text
PlayerSession
- playerId
- sessionToken
- socketId
- gameId
- connected
```

A session token is stored by Angular in `localStorage`.

`socket.id` must never be used as permanent player identity.

## Identity model

Keep these concepts separate:

```text
socketId
playerId
sessionToken
gameId
```

Example:

```text
socketId      transient network connection
playerId      permanent identity inside a running game
sessionToken  reconnect credential
gameId        game/room identity
```

## Projection

The server converts:

```text
GameState
```

into:

```text
GameView
```

for a specific viewer:

```ts
createGameView(state, viewerPlayerId);
```

This prevents leaking hidden information.

Example:

Player A may receive their own hand:

```text
Sword
Potion
Curse
```

but see player B only as:

```text
handCount: 5
```

## Socket model

Use Socket.IO rooms.

One Socket.IO room corresponds to one game room.

Suggested client events:

```text
lobby:create
lobby:join
lobby:set-ready
game:start
game:command
session:resume
```

Suggested server events:

```text
lobby:state
game:state
game:event
game:error
```

Use acknowledgements for command success/failure where convenient.

Avoid creating a separate transport event for every game mechanic. Most gameplay should travel through:

```text
game:command
```

## Reconnection

Angular stores:

```text
sessionToken
gameId
```

in `localStorage`.

When the socket reconnects it attempts to resume the session.

The server:

1. validates token;
2. associates the new socket with the existing player;
3. joins the socket to the appropriate Socket.IO room;
4. sends the current player-specific `GameView`.

## Angular state

Use an application `GameStore` implemented with Angular Signals.

The socket service receives state and feeds the store.

Components primarily render store state and dispatch actions.

Do not copy game rule logic to Angular.

Angular may calculate display-only values but never authoritative results.

Conceptual frontend flow:

```text
SocketService
     |
     v
GameStore
Angular Signals
     |
     +--> Players
     +--> Table
     +--> Hand
     +--> Actions
```

## NestJS structure

Suggested modules:

```text
AppModule

LobbyModule
- LobbyGateway
- LobbyService

GameModule
- GameGateway
- GameService
- GameRepository
- GameViewService

SessionModule
- SessionService
```

Do not create these mechanically if a simpler implementation fits the current milestone.

## Repository

Initial `GameRepository` is conceptually:

```ts
Map<GameId, GameState>;
```

No database.

## State synchronization

For the MVP, after a meaningful state change the server may send a complete player-specific `GameView`.

Do not prematurely optimize into dozens of tiny state patch events.

## Cards

Use a data-driven card model.

Do not switch on card names.

Separate the immutable definition from a physical card instance.

Conceptually:

```ts
interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  type: CardType;
  effects: EffectDefinition[];
}

interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: CardDefinitionId;
}
```

This supports multiple copies of the same card.

## Effects

Prefer typed, explicit effect definitions over a generic scripting language.

Initial conceptual union:

```ts
type EffectDefinition =
  | CombatBonusEffect
  | GainLevelEffect
  | LoseLevelEffect
  | DrawCardsEffect
  | DiscardCardEffect
  | EquipmentEffect
  | CurseEffect;
```

Do not attempt to make the effect system infinitely generic in early milestones.

## Production

Angular is built to static assets.

NestJS serves the Angular SPA using `ServeStaticModule` or an equivalent simple approach.

NestJS also hosts Socket.IO on the same application/port.

Listen on:

```text
0.0.0.0:3000
```

Final URL:

```text
http://LAN_IP:3000
```

Development may run Angular and NestJS separately, but production must require only one user-facing server URL.

## Optional finishing features

After core gameplay is stable:

- display LAN IP at startup;
- QR code for join URL;
- PWA installability;
- lightweight animations;
- improved game log.
