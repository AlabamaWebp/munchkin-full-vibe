# Munchkin LAN V2 implementation plan

## Scope and sequencing contract

This plan is for coding prompts 02–07. They are sequential and must not be
reordered. Every prompt starts from a green repository, changes production code,
adds focused tests, runs the complete test/lint/build suite, and updates
`docs/STATUS.md`. An architectural decision introduced during implementation
must also be recorded in `docs/DECISIONS.md` at that time.

The current design-only pass changes no production code.

## Current baseline that V2 replaces or extends

The repository currently has:

- `GameState.schemaVersion: 4` embedded with complete card definitions;
- one shuffled Door array and one Treasure array with atomic discard recycling;
- 20 Door and 22 Treasure definitions, producing 56 Door and 66 Treasure
  physical instances through implicit `copiesByDefinition` rules;
- `PlayerState.classCard` and `raceCard` as singular slots and no Sex;
- scalar `temporaryCombatBonus`;
- encounter-addressed, snapshot-based multi-Monster `CombatState`;
- `requestedHelperId` / `helperId`, `REQUEST_HELP` / `ACCEPT_HELP`, no reward
  agreement, and no helper Bad Stuff;
- active-player-only sequential run away;
- equipment-only sale and a global winner check after any level increase;
- a serialized match-long `eventLog` with audience-filtered projection;
- one global discard `pendingDecision` with a typed Curse/run-away continuation;
- a reaction window that waits indefinitely for every non-confirmed player;
- fragmented projection arrays (`availableActions`, equipment actions, combat
  card actions, expanded-rule actions, and unavailable reasons);
- an Angular page that grows vertically, renders a full hand grid in the
  document, uses local event/toast state, and often requires Details before play.

V2 should refactor these working foundations rather than introduce a second
engine, state store, transport, or event history.

## Final package ownership

### `packages/game-engine`

Owns all authoritative types and rules:

- configuration, tiers, sets, tags, conditions, card copies;
- weighted and Classic draw algorithms;
- setup guarantee, recovery rules, combat and rewards;
- role capacity, protection, companions, attachments;
- help negotiation/agreement and per-combatant run away;
- sale/victory policy;
- pending decisions, deadline validation, and domain events.

It remains free of Angular, NestJS, Socket.IO, wall-clock APIs, and transport
types.

### `packages/contracts`

Owns serialized client/server payloads and player-specific public view types. It
does not duplicate legality calculations.

### `apps/server`

Owns lobby/session connection data, host settings authorization, transport
validation, injected random/clock context, expired-state scheduling, private
projection, and full-view broadcasts.

### `apps/web`

Owns Angular Signals presentation state, fixed-viewport layout, sheets/pickers,
and dispatching projected intentions. It does not evaluate card conditions,
reward weights, sale levels, recovery eligibility, or combat power.

## Target schema and type changes

The exact field names may be adjusted only to fit established repository naming;
the represented information and invariants are required.

### Shared enums and ids

```ts
type GameMode = "BALANCED" | "CLASSIC_CHAOS";
type PlayerSex = "MALE" | "FEMALE";
type CardTier = 1 | 2 | 3;
type CardSetId = "CORE" | "COMPANIONS" | "ARSENAL" | "DUAL_IDENTITY";

type MonsterTag = "BEAST" | "CONSTRUCT" | "ARCANE" | "UNDEAD";
type EquipmentTag = "WEAPON" | "ARMOR" | "BLADE" | "BLUNT" | "MAGIC";
type CurseTag = "HEX" | "TRAP";
type CurseSeverity = "EARLY" | "MID" | "LATE";

type HelpOfferId = branded string;
type PendingDecisionId = branded string;
```

`EncounterId` remains unchanged. New ids are server/engine-authored and parsed
at boundaries like existing branded ids.

### Game configuration

```ts
interface GameConfig {
  readonly mode: GameMode;
  readonly enabledSetIds: readonly CardSetId[];
}
```

Invariants:

- `CORE` appears exactly once;
- enabled ids are unique and known;
- config is copied into `GameState` at creation and never changed in progress;
- disabled definitions and copies are absent from the state catalog/decks.

### Catalog definitions and physical copies

Replace the implicit catalog-wide copies rule with an explicit manifest:

```ts
interface CardCatalogEntry {
  readonly definition: CardDefinition;
  readonly copies: number;
}

interface CardDefinition {
  readonly id: CardDefinitionId;
  readonly artKey: string;
  readonly setId: CardSetId;
  readonly tier: CardTier;
  readonly name: string;
  readonly description: string;
  readonly type: CardType;
  readonly deck: DeckType;
  readonly tags: readonly (MonsterTag | EquipmentTag | CurseTag)[];
  readonly goldValue?: number;
  readonly sellable?: boolean;
  readonly tradeable?: boolean;
  readonly starterEligible?: boolean;
  readonly scavengeEligible?: boolean;
  readonly play?: CardPlayDefinition;
  readonly effects: readonly CardEffect[];
  readonly monster?: MonsterDefinition;
  readonly equipment?: EquipmentDefinition;
  readonly curse?: CurseDefinition;
  readonly role?: RoleDefinition;
  readonly companion?: CompanionDefinition;
  readonly rolePermission?: RolePermissionDefinition;
  readonly attachment?: AttachmentDefinition;
}
```

Add `UTILITY`, `HIRELING`, `MOUNT`, `ROLE_PERMISSION`, and `ATTACHMENT` to
`CardType`. Retain the existing explicit combat types where they provide useful
legality, and remove `OTHER` from production and contract unions.

The existing `GAIN_LEVEL` effect becomes
`{ type: "GAIN_LEVEL"; amount: number; victoryEligible?: boolean }`; omitted is
false. Catalog validation permits `victoryEligible: true` only on deliberately
reviewed definitions.

Keep `CardInstance` as instance id plus definition id. Acquisition source is not
stored on each card; Scavenge abuse is prevented by definition metadata and the
event-log cooldown.

Remove deprecated production fallbacks:

- `equipment.value`;
- `equipment.requiredClass` / `requiredRace`;
- missing `artKey` fallback;
- behaviorless `OTHER` definitions;
- inferred copy counts.

Test-only builders must construct complete definitions instead of making the
runtime accept incomplete production shapes.

### Conditions and modifiers

Use a finite discriminated union, flat AND semantics, and `anyOf` within an atom:

```ts
type ConditionDefinition =
  | {
      readonly type: "PLAYER_HAS_CLASS";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | {
      readonly type: "PLAYER_HAS_RACE";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | { readonly type: "PLAYER_SEX_IS"; readonly sex: PlayerSex }
  | { readonly type: "MONSTER_HAS_TAG"; readonly anyOf: readonly MonsterTag[] }
  | {
      readonly type: "EQUIPPED_HAS_TAG";
      readonly anyOf: readonly EquipmentTag[];
      readonly atLeast: number;
      readonly scope: "OWNER" | "COMBAT_SIDE";
    }
  | {
      readonly type: "CARD_DEFINITION_IS";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | {
      readonly type: "CURSE_MATCHES";
      readonly severities?: readonly CurseSeverity[];
      readonly anyTag?: readonly CurseTag[];
    };

type ConditionalModifierDefinition =
  | {
      readonly type: "COMBAT_POWER";
      readonly amount: number;
      readonly maxAmount?: number;
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "EQUIPMENT_TAG_BONUS";
      readonly amountPerCard: number;
      readonly maxCards: number;
      readonly tags: readonly EquipmentTag[];
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "RUN_AWAY_ROLL";
      readonly amount: number;
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "AUTOMATIC_PROTECTION";
      readonly protection: "CANCEL" | "PROTECT_ONE_ITEM" | "IGNORE_BAD_STUFF";
      readonly conditions: readonly ConditionDefinition[];
    };
```

No recursive boolean groups, code strings, callbacks, effect registry names, or
card-name switches are allowed. Catalog validation caps a role/companion at one
modifier and validates tag/type compatibility.

### Monster, Curse, role, companion, and attachment metadata

```ts
interface MonsterDefinition {
  readonly strength: number; // replaces the overloaded `level` name
  readonly levelRewards: 1 | 2;
  readonly treasureRewards: number;
  readonly badStuffTarget?: "FAILED_COMBATANT" | "ALL_COMBATANTS";
  readonly badStuff: readonly BadStuffEffect[];
  readonly modifiers?: readonly ConditionalModifierDefinition[];
}

interface CurseDefinition {
  readonly severity: CurseSeverity;
}

interface RoleDefinition {
  readonly role: "CLASS" | "RACE";
  readonly modifier?: ConditionalModifierDefinition;
}

interface CompanionDefinition {
  readonly kind: "HIRELING" | "MOUNT";
  readonly combatBonus: number;
  readonly modifier?: ConditionalModifierDefinition;
}

interface RolePermissionDefinition {
  readonly role: "CLASS" | "RACE";
  readonly additionalSlots: 1;
}

interface AttachmentDefinition {
  readonly allowedTags: readonly EquipmentTag[];
  readonly allowedDefinitionIds?: readonly CardDefinitionId[];
  readonly combatBonus: number;
}
```

Use `strength` in new engine and contract types. During the milestone that lands
this rename, update all fixtures and delete the Monster `level` compatibility
path rather than supporting both forever.

### Temporary effects

Replace the scalar temporary combat field with a reusable typed list:

```ts
type ActiveEffect =
  | {
      readonly type: "COMBAT_POWER";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly amount: number;
      readonly expires: "END_OF_COMBAT" | "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber?: number;
    }
  | {
      readonly type: "RUN_AWAY_ROLL";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly amount: number;
      readonly expires: "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber: number;
    }
  | {
      readonly type: "SLOT_LOCK";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly slot: EquipmentSlot;
      readonly expires: "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber: number;
    };
```

Do not store computed Makeshift Tools, total power, role capacity, conditional
bonuses, or eligibility flags.

### Player state

```ts
interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly sex: PlayerSex;
  readonly level: number;
  readonly hand: readonly CardInstance[];
  readonly equipment: readonly CardInstance[];
  readonly equipmentAttachments: readonly {
    readonly card: CardInstance;
    readonly attachedToCardId: CardInstanceId;
  }[];
  readonly classCards: readonly CardInstance[];
  readonly raceCards: readonly CardInstance[];
  readonly rolePermissionCards: readonly CardInstance[];
  readonly hirelingCard: CardInstance | null;
  readonly mountCard: CardInstance | null;
  readonly activeEffects: readonly ActiveEffect[];
  readonly isDead: boolean;
}
```

Role capacities are derived from permission cards and capped at two. Equipment
and attachment cleanup is centralized and reused by role loss, Curse, sale,
trade, death, and replacement.

### Combat state

Retain current ordered encounter snapshots, stable ids, physical-card cleanup,
revisioning, and per-encounter modifiers. Add tier/tags to each snapshot so a
later disabled catalog lookup or definition mutation cannot change the encounter.

```ts
interface HelpOfferState {
  readonly offerId: HelpOfferId;
  readonly helperId: PlayerId;
  readonly proposedBy: "ACTIVE" | "HELPER";
  readonly treasureCount: number;
}

interface HelpAgreement {
  readonly helperId: PlayerId;
  readonly promisedTreasures: number;
  readonly acceptedOfferId: HelpOfferId;
  readonly agreedAtCombatRevision: number;
}

interface RunAwayCursor {
  readonly encounterIndex: number;
  readonly combatantIndex: number;
}

interface RunAwayAttemptState {
  readonly encounterId: EncounterId;
  readonly combatantId: PlayerId;
  readonly roll: number | null;
  readonly outcome: "ESCAPED" | "FAILED" | "SKIPPED_DEAD";
  readonly badStuffApplied: boolean;
}

interface CombatState {
  // retain playerId, revision, monsters, sequences, history
  readonly nextHelpOfferSequence: number;
  readonly helpOffer: HelpOfferState | null;
  readonly helpAgreement: HelpAgreement | null;
  readonly reactionWindow: CombatReactionWindow | null;
  readonly runAway: {
    readonly combatantIds: readonly PlayerId[];
    readonly cursor: RunAwayCursor;
    readonly attempts: readonly RunAwayAttemptState[];
    readonly sharedBadStuffResolvedEncounterIds: readonly EncounterId[];
  } | null;
}

interface CombatReactionWindow {
  // retain id, revision, claimant, confirmations
  readonly eligiblePlayerIds: readonly PlayerId[];
  readonly expiresAtEpochMs: number;
}
```

Delete `requestedHelperId` and `helperId`. Helper identity comes only from the
offer/agreement. Combat-side calculation includes an alive accepted helper and
the active player's computed recovery line when eligible.

### Pending decisions

Generalize `pendingDecision` to one union. Each member has stable id, addressed
player, creation/deadline, exact eligible data, and a typed continuation.

```ts
type PendingDecision =
  | PendingCardDiscardDecision
  | PendingCurseResponseDecision
  | PendingRoleRetentionDecision;

interface PendingDecisionBase {
  readonly decisionId: PendingDecisionId;
  readonly playerId: PlayerId;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}
```

Required continuations:

- Curse resolution stores source card, remaining effects, target, protection
  already applied, and phase after resolution;
- run away stores combatant id, encounter id, remaining effects, and the next
  cursor;
- role retention stores role kind, exact active role ids, permission source that
  disappeared, and revalidation continuation.

No continuation contains functions. `advanceExpiredState` selects documented
defaults through the injected clock/random context and uses the same normal
completion functions as an explicit response.

### Game state and schema version

```ts
interface GameState {
  readonly schemaVersion: 5;
  readonly config: GameConfig;
  // existing status/phase/player/catalog/deck/combat/log/winner fields
  readonly nextPendingDecisionSequence: number;
  readonly pendingDecision: PendingDecision | null;
}
```

Prompt 02 lands the complete V2 state shape with empty/default fields and bumps
the version once from 4 to 5. Existing V1 behavior is immediately adapted to the
new role arrays, active-effect list, help containers, run-away cursor, and pending
union; no legacy serialized field remains beside its V2 replacement. Prompts
03–05 fill behavior without changing the serialized shape. Prompt 06 changes
projections only; Prompt 07 changes Angular only. If implementation discovers
that a required serialized field was omitted, the prompt that adds it must bump
to 6 and document why; silently changing a versioned shape is forbidden.

## Migration strategy

There is no persisted game database. A process restart already destroys games
and sessions, so V2 does not need or retain a runtime v4-to-v5 migration.

Implementation rules:

- `createGame` creates only schema 5;
- engine entry points assert schema 5 in development/test builds;
- all fixtures use shared complete state/card builders and are updated in Prompt
  02;
- remove v4 compatibility fallbacks rather than branching on version;
- an in-process V2 game remains reconnect-safe because every V2 interrupted flow
  is serialized;
- deployment of the schema change requires a server restart and intentionally
  ends old in-memory sessions;
- if durable persistence is added later, it must add explicit migration code and
  a new ADR; this plan does not prebuild it.

## Command and event delta

### Gameplay commands

Add or change these public player intentions:

```ts
type V2CommandDelta =
  | { readonly type: "SCAVENGE"; readonly actorId: PlayerId }
  | {
      readonly type: "PLAY_ROLE";
      readonly actorId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly replaceRoleCardId?: CardInstanceId;
    }
  | {
      readonly type: "PLAY_ROLE_PERMISSION";
      readonly actorId: PlayerId;
      readonly cardId: CardInstanceId;
    }
  | {
      readonly type: "PLAY_COMPANION";
      readonly actorId: PlayerId;
      readonly cardId: CardInstanceId;
    }
  | {
      readonly type: "ATTACH_ENHANCER";
      readonly actorId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly equipmentCardId: CardInstanceId;
    }
  | {
      readonly type: "SELL_CARDS";
      readonly actorId: PlayerId;
      readonly cardIds: readonly CardInstanceId[];
    }
  | {
      readonly type: "RESOLVE_CARD_DISCARD";
      readonly actorId: PlayerId;
      readonly decisionId: PendingDecisionId;
      readonly cardIds: readonly CardInstanceId[];
    }
  | {
      readonly type: "RESOLVE_CURSE_RESPONSE";
      readonly actorId: PlayerId;
      readonly decisionId: PendingDecisionId;
      readonly protectionCardId: CardInstanceId | null;
      readonly protectedEquipmentCardId?: CardInstanceId;
    }
  | {
      readonly type: "RESOLVE_ROLE_RETENTION";
      readonly actorId: PlayerId;
      readonly decisionId: PendingDecisionId;
      readonly keepRoleCardId: CardInstanceId;
    };
```

The help commands are specified in their dedicated section. Retain versioned
`DECLARE_COMBAT_VICTORY`, `PASS_COMBAT_REACTION`, and encounter-addressed combat
targets. Every pending-decision response now carries `decisionId`; stale choices
must not accidentally answer a newer decision.

Remove `SELL_ITEMS` after `SELL_CARDS` lands. Keep `ADVANCE_EXPIRED_STATE`
internal to the server/engine boundary; it is never a socket command.

### Domain events

Add these authoritative facts and map every one exhaustively into log/projection:

```text
SCAVENGED                         public player/count; private identity uses CARD_DRAWN
RECOVERY_BONUS_APPLIED            public player/amount/encounter when combat starts
CURSE_RESPONSE_REQUIRED           public target/source/count-free waiting fact
CURSE_PREVENTED                   public target/source/protection mode
CURSE_MITIGATED                   public target/source/protected public item when any
ROLE_PERMISSION_PLAYED            public player/card/role capacity
ROLE_RETENTION_REQUIRED           public player/role/count
ROLE_RETENTION_RESOLVED           public player/kept/discarded public roles
COMPANION_PLAYED                  public player/card/slot
ATTACHMENT_PLAYED                 public player/card/host Equipment
CARDS_SOLD                        public player/card ids/value/actual levels
HELP_OFFERED / HELP_COUNTERED / HELP_OFFER_REJECTED
HELP_OFFER_CANCELLED / HELP_AGREEMENT_CREATED / HELP_REWARD_ALLOCATED
DECISION_EXPIRED                  public decision type/player/default summary
COMBAT_REACTION_EXPIRED           public window id and auto-confirmed player ids
```

Update `RUN_AWAY_ATTEMPTED` with `combatantId`, nullable roll, and the three-state
outcome. Emit `TREASURE_GAINED` once per reward recipient and recipient-private
`CARD_DRAWN` entries for only that partition. Replace `ITEMS_SOLD` with
`CARDS_SOLD`. Makeshift recalculation after a later combat change is represented
by the authoritative `COMBAT_UPDATED` breakdown; it does not emit repeated
recovery events.

## Draw and setup implementation

Create one deck operation module instead of extending the current monolithic
`engine.ts`:

```text
deck.ts
  preflightDraw
  drawClassic
  drawWeighted
  drawMatchingFromCurrentPile
  recycleIfEmpty
  reserveStarterCards
```

`drawWeighted` receives deck, count, an immutable tier profile snapshot, and
`RandomSource`. It never loops until a desired tier appears. It returns the new
state, cards, and identity-free recycle events. Door and Treasure call the same
operation.

Starting setup preflights player count, both full deals, and starter candidates
before it mutates any deck or player. Revival uses ordinary mode-dependent draws
without starter reservation; if the entire required revival cannot complete,
End Turn remains atomic.

Classic uses existing top-of-pile semantics after one full shuffle. Balanced
removes randomly selected tier candidates from one physical pile.

## Level, sale, and victory implementation

Centralize level changes:

```ts
type LevelGainSource =
  | { readonly type: "MONSTER_COMBAT" }
  | { readonly type: "SALE" }
  | { readonly type: "CARD"; readonly victoryEligible: boolean };

applyLevelGain(state, playerId, amount, source);
```

This function caps at 10, caps non-victory sources at 9, emits the actual amount,
and creates the finished state only when the source may win. Remove the global
“any crossing of level 10 wins” scan from `executeCommand`.

Replace `sellItems`/`SELL_ITEMS` with `sellCards`/`SELL_CARDS` and one
`isSellableDefinition` predicate that
implements the documented default and exclusions. Projection uses the same
engine predicate. A sale selection whose calculated levels exceed
`9 - currentLevel` is rejected; cards never move on failure.

Keep transfer scope small through one `isTradeableDefinition` predicate:
`definition.tradeable ?? (definition.type === EQUIPMENT)`. Explicit true is
valid only for a card with no owner-bound pending state; Scavenge definitions
are explicitly false.

## Recovery implementation

Add pure selectors:

```text
calculatePermanentCombatPower
calculateMakeshiftToolsBonus
canScavenge
findLastScavengeTurn
```

Power breakdown is a typed list of label/reason codes plus amounts. The total is
derived from the list so projection and resolution cannot disagree.

`SCAVENGE` is a normal player command with no card id and no calculated input.
The engine rechecks every condition, selects one candidate from the current
Treasure pile that is legal in the player's current free slots through
`RandomSource`, emits a public count/summary and one private identity event, then
moves to `END_TURN`.

## Curse/protection and role implementation

Split effect resolution into focused modules while preserving the existing typed
continuation pattern:

```text
conditions.ts       evaluate flat conditions and resolved modifiers
effects.ts          apply typed effects and create pending continuations
roles.ts            capacities, replacement, duplicate validation, revalidation
protection.ts       automatic protection and one target response
equipment.ts        slots, attachments, restrictions, derived bonuses
```

On Curse play/reveal:

1. validate source/target/timing;
2. remove the public/revealed Curse from its source zone;
3. evaluate automatic target protection;
4. if one-shot/item choices exist, create `CURSE_RESPONSE` without applying the
   remaining effects;
5. otherwise apply and complete immediately;
6. after response/expiry, continue exact remaining effects once and discard the
   Curse once.

Protection cards cannot trigger another response. Tests must prove no double
discard and no repeated effect after duplicate commands.

Role replacement and permission loss call one equipment/attachment revalidation
operation. A capacity overflow creates one retention decision; it never silently
chooses during a live connected decision.

## Help negotiation commands and events

### Commands

Replace the legacy pair with:

```ts
type GameCommand =
  | {
      readonly type: "PROPOSE_HELP";
      readonly actorId: PlayerId;
      readonly helperId: PlayerId;
      readonly treasureCount: number;
    }
  | {
      readonly type: "COUNTER_HELP";
      readonly actorId: PlayerId;
      readonly offerId: HelpOfferId;
      readonly treasureCount: number;
    }
  | {
      readonly type: "ACCEPT_HELP_OFFER";
      readonly actorId: PlayerId;
      readonly offerId: HelpOfferId;
    }
  | {
      readonly type: "REJECT_HELP_OFFER";
      readonly actorId: PlayerId;
      readonly offerId: HelpOfferId;
    }
  | {
      readonly type: "CANCEL_HELP_OFFER";
      readonly actorId: PlayerId;
      readonly offerId: HelpOfferId;
    };
// plus existing and other V2 commands
```

Valid response actor is derived from `proposedBy`: helper responds to Active
offers; active player responds to Helper counters. Counter count must differ,
remain an integer, and be between zero and current expected Treasure. Accept uses
the stored count, never a client-resubmitted count.

### Events

Add public events:

```text
HELP_OFFERED
HELP_COUNTERED
HELP_OFFER_REJECTED
HELP_OFFER_CANCELLED
HELP_AGREEMENT_CREATED
HELP_REWARD_ALLOCATED
```

Events include offer/agreement ids, player ids, and counts, never future Treasure
identities. Combat history may reference the same authoritative facts but must
not become a second command/event source.

Delete `REQUEST_HELP`, `ACCEPT_HELP`, `HELP_REQUESTED`, and `HELP_ACCEPTED` after
all engine, contracts, server, localization, UI, and tests move to the V2 names.

## Combat reward and run-away implementation

At victory resolution:

1. re-evaluate side powers from typed breakdowns;
2. snapshot every encounter's final Strength and reward count;
3. derive one tier profile per reward slot;
4. preflight the combined Treasure count;
5. draw all slots atomically;
6. shuffle the complete private result once;
7. partition using the immutable agreement and clamp rule;
8. grant only active-player levels through `MONSTER_COMBAT`;
9. emit public counts and recipient-private card events;
10. clean every unique physical combat card and temporary effect once.

Run away builds `combatantIds` as `[active]` or `[active, helper]`, then advances
the encounter-major cursor. A failed pair applies effects to `combatantId`. The
existing discard continuation is generalized to carry that id and cursor.
`DEATH` causes later pairs for that combatant to append `SKIPPED_DEAD` without
random calls. `ALL_COMBATANTS` Bad Stuff is deferred until both pair results for
that encounter are known, is applied once to each living combatant, and records
the encounter id before a possible pending choice.

Do not store a computed final reward or power in `GameState`. Encounter snapshots,
modifiers, agreement, and the current cursor are sufficient.

## Clock and expired-state advancement

Extend command context with an injected clock:

```ts
interface Clock {
  nowEpochMs(): number;
}

interface CommandContext {
  readonly random: RandomSource;
  readonly clock: Clock;
}
```

Provide a fixed clock in unit tests. Do not call `Date.now()` inside game rules.

Expose an engine operation such as:

```ts
advanceExpiredState(state, context): CommandResult
```

It is internal server authority, not a public client command. It checks exact
ids/deadlines and is idempotent. NestJS keeps a small timer per game for the next
deadline, cancels/reschedules it after every successful transition, and also
calls advancement before executing a client command or projecting a resumed
session. Timer callbacks broadcast resulting full views.

Auto-resolution events:

```text
DECISION_EXPIRED
COMBAT_REACTION_EXPIRED
```

They are followed by the same ordinary events explicit resolution would emit.

## Lobby and transport changes

### Lobby state

Add public player `sex: PlayerSex | null` and room settings:

```ts
interface LobbySettingsView {
  readonly mode: GameMode;
  readonly enabledSetIds: readonly CardSetId[];
}
```

Add socket operations:

```text
lobby:set-sex        player may change only own value before start
lobby:update-settings host may change only before start
```

The server validates known unique sets and always restores `CORE`. `game:start`
rechecks all Sex choices and catalog/setup capacity. Resume sends the same public
selection state. Started rooms reject further settings changes.

### Gameplay transport

Continue to use the single `game:command` event. Extend the discriminated
`GameClientCommand` union and validate ids, safe integers, target shapes, and
offer/decision/window revisions before parsing branded ids. The server still
derives `actorId` from the session, never from payload.

System expiry is not added to `ClientToServerEvents`.

## GameView and projection contract

### Player projection

Every player publicly exposes:

- Sex, level, death/connection-relevant status;
- Class and Race arrays;
- role-permission, Hireling, Mount, equipment, and attachment public cards;
- authoritative total permanent/combat power and typed public breakdown;
- hand count only.

Only `self` exposes hand identities. Raw tier remains engine-private. `setId`,
tags, authored public conditions, resolved card facts, and Curse severity are
projected for a card already visible to that viewer.

### Combat projection

Add:

```text
difference
playerPowerBreakdown[]
monsterPowerBreakdown[] per encounter
totalLevelRewards
totalTreasureRewards
helpOffer / helpAgreement
reactionWindow.expiresAtEpochMs / viewerMustReact
runAway current pair and completed matrix
```

The helper agreement amount is public. Private reward identities are not stored
inside the public agreement or combat view.

### Pending decision projection

Project a common public shell: decision id/type, addressed player, deadline,
source public card, and waiting summary. Project eligible private card ids or
protection choices only to the addressed viewer. Other viewers receive an empty
choice list.

### Replace fragmented availability arrays

Introduce one viewer-specific union:

```ts
type AvailableIntentView =
  | {
      readonly type:
        | "KICK_DOOR"
        | "LOOT_ROOM"
        | "SCAVENGE"
        | "END_TURN"
        | "GIVE_RANDOM_CHARITY";
      readonly presentation: ActionPresentation;
    }
  | {
      readonly type:
        | "LOOK_FOR_TROUBLE"
        | "PLAY_CARD"
        | "EQUIP_ITEM"
        | "UNEQUIP_ITEM"
        | "PLAY_ROLE"
        | "TRADE_ITEM"
        | "ATTACH_ENHANCER"
        | "PLAY_COMPANION";
      readonly cardId: string;
      readonly targets: readonly ActionTargetView[];
      readonly presentation: ActionPresentation;
    }
  | {
      readonly type: "SELL_CARDS";
      readonly eligibleCardIds: readonly string[];
      readonly valueByCardId: Readonly<Record<string, number>>;
      readonly minimumTotal: 1000;
      readonly maximumLevelGain: number;
      readonly presentation: ActionPresentation;
    }
  | {
      readonly type: "GIVE_CHARITY";
      readonly eligibleCardIds: readonly string[];
      readonly requiredCardCount: number;
      readonly recipientIds: readonly string[];
      readonly presentation: ActionPresentation;
    }
  | {
      readonly type:
        | "PROPOSE_HELP"
        | "COUNTER_HELP"
        | "ACCEPT_HELP_OFFER"
        | "REJECT_HELP_OFFER"
        | "CANCEL_HELP_OFFER";
      readonly offerId?: string;
      readonly constraints: HelpActionConstraints;
      readonly presentation: ActionPresentation;
    }
  | {
      readonly type:
        | "RESOLVE_DECISION"
        | "DECLARE_COMBAT_VICTORY"
        | "PASS_COMBAT_REACTION"
        | "RUN_AWAY";
      readonly revisionId: string | number;
      readonly presentation: ActionPresentation;
    };

interface ActionPresentation {
  readonly placement: "PRIMARY" | "SECONDARY" | "CARD" | "MORE";
  readonly dangerous: boolean;
  readonly reasonCode: string;
}
```

Exact target ids and numeric input bounds come from the server. `dangerous` is
presentation metadata attached to a legal action, not permission to skip engine
validation.

Delete after migration:

- `lookForTroubleCardIds`;
- `availableEquipmentActions`;
- `requestableHelperIds`;
- `playableCombatCards`;
- `expandedRuleActions`;
- per-card availability assembled independently from those arrays.

An unavailable card may have one projected reason code, but availability itself
comes from the unified intent list.

### Unified event presentation projection

Add one server-side pure mapper from each audience-filtered log entry and current
state to:

```ts
interface PresentedGameEventView extends GameLogEntryView {
  readonly priority: "BLOCKING" | "IMPORTANT" | "ROUTINE";
  readonly summaryCode: string;
  readonly requiresViewerAction: boolean;
}
```

`BLOCKING` is assigned only when the event corresponds to the current matching
decision/window/offer and the viewer is addressed. Old log entries never become
blocking again after reconnect.

`GameView.presentation` contains:

```text
blocking: current viewer-addressed item or null
important: latest three visible Important entries
routine: latest three visible Routine entries
```

Full `gameLog` remains available for History. Delete Angular's independent
`publicCardEvents`, `feedbackEvents`, seen-sequence `localStorage`, and seven-
second semantic timeout after this projection is in use.

## Event privacy matrix

| Fact                                                     | Public                      | Private                                             |
| -------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| Mode, enabled sets, player Sex                           | exact values                | none                                                |
| Door reveal/publicly played card                         | definition and instance     | none                                                |
| Weighted tier choice/future order                        | nothing                     | nothing                                             |
| Starting guarantee                                       | dealt count only            | recipient card identities                           |
| Scavenge                                                 | player and count            | recipient card identity                             |
| Help offer/counter/agreement                             | players and Treasure counts | none                                                |
| Combat reward                                            | recipient counts            | each recipient's own identities                     |
| Other hand, protection in hand, eligible private discard | waiting/count only          | addressed viewer choices                            |
| Charity                                                  | sender/recipient/count      | existing sender/recipient identities only           |
| Auto decision                                            | expiry/default summary      | selected private identities only to entitled viewer |

Projection tests must inspect serialized JSON, not just TypeScript types.

## Prompt 02 — V2 schema, catalog, and lobby configuration

Goal: land the complete V2 serializable shape and configuration foundation while
keeping existing gameplay green where behavior has not yet changed.

Implement in this order:

1. add enums, ids, injected `Clock`, complete card metadata,
   conditions/modifier definitions, and explicit catalog entries/copies;
2. migrate every current development definition and fixture to complete metadata;
3. introduce schema 5 `GameConfig`, new `PlayerState`, final combat/pending
   containers, and shared test builders; adapt current max-one role, temporary
   combat bonus, zero-reward helper, and active-only escape behavior to those
   containers without yet adding V2 gameplay; stamp final ids/deadlines but do
   not auto-advance them before Prompt 05;
4. add lobby Sex selection, mode/settings selection, validation, reconnect view,
   and immutable start snapshot;
5. assemble enabled sets with Core always present;
6. project new public config/Sex/card metadata through contracts/server;
7. remove deprecated definition fallbacks and implicit copies.

Prompt 02 does not yet enable weighted draw, Scavenge, new role behavior, or new
help commands. Empty arrays/nulls preserve current behavior temporarily.

Required tests:

- JSON round trip of the complete schema 5 state;
- catalog id/art/set/copy/tag/tier invariants and no disabled instances;
- explicit Core physical counts and enough starter candidates for six players;
- invalid/duplicate set ids, missing Core normalization, and settings immutability;
- only a player can set their own Sex; only host can change settings;
- start blocked by missing Sex or impossible starter configuration;
- reconnect preserves public settings and Sex without exposing tokens/socket ids;
- all old engine/server/Angular tests updated through builders and green.

Completion gate: tests, server e2e, lint, production build, format check, Status
and ADR updates.

## Prompt 03 — Draws, balance loop, recovery, economy, and Core content

Goal: implement the complete mode-dependent deck/economy loop and replace the
small development catalog with the Core structure from the design contract.

Implement in this order:

1. extract atomic deck operations and add weighted selection/renormalization;
2. add bounded Balanced setup/revival guarantee and Classic top-draw behavior;
3. implement encounter-effective Treasure profiles and multi-encounter reward
   slot drawing without helper partition yet;
4. centralize power breakdown and level-gain sources;
5. implement Makeshift Tools and `SCAVENGE`;
6. generalize sellability and enforce non-combat final-level restrictions;
7. author/migrate the 80-definition Core catalog, explicit copies, localization,
   tier curve, Curse severity metadata, and presentation facts;
8. delete the old global winner scan, `SELL_ITEMS`/`ITEMS_SOLD`, equipment-only
   sale restriction, and development `copiesByDefinition` rule.

Required tests:

- exact deterministic weighted choices at every band and Classic top draws;
- unavailable-tier renormalization and the all-zero-present fallback;
- draw across recycle, independent decks, full-count atomic shortage, and no
  retry loop (bounded RandomSource call assertions);
- six-player starter guarantee, no duplicate physical cards, Classic no
  guarantee, and atomic impossible setup plus ordinary atomic revival;
- effective Treasure tier from modified final strength and multi-Monster slots;
- Makeshift applies/vanishes for every eligibility boundary and appears once in
  the total;
- Scavenge valid action, every invalid boundary, current-pile shortage, cooldown,
  private identity, no sale/trade, phase transition, and charity interaction;
- sale of Equipment/one-shot/utility, explicit false, invalid Door types,
  remainder, level-8 boundary, level-9 rejection, and atomic selection failure;
- Monster combat can win at 10; sale and ordinary gain cannot; explicit
  victory-eligible fixture can;
- catalog distribution/ranges and deterministic balance simulation assertions
  for early unwinnable-draw rate and target power bands.

Completion gate: tests, server e2e, lint, production build, format check, Status
and ADR updates.

## Prompt 04 — Conditions, identities, protection, and optional sets

Goal: activate the small reusable conditional rules and every expansion-set
foundation without a scripting language.

Implement in this order:

1. pure condition evaluation and resolved modifier breakdown;
2. Class/Race arrays, duplicate checks, capacity and replacement targeting;
3. role permission cards and reconnect-safe retention decisions;
4. Sex/Class/Race/Monster/Equipment conditions and equipment revalidation;
5. activate the additional temporary effect types and expiry cleanup;
6. Curse severity, automatic protection, single target response, and defaults;
7. Hireling/Mount slots and one modifier each;
8. weapon attachments and host-card cleanup rules;
9. author the proposed Companions, Arsenal, and Dual Identity catalogs using only
   these primitives;
10. delete the remaining deprecated role-restriction paths and any temporary
    adapters used only while activating conditions.

Required tests:

- every condition atom true/false, flat AND/OR semantics, modifier caps, and no
  client-calculated contribution;
- max one/two roles, duplicate definitions, replacement target validation,
  permission loss choice/default/reconnect, death, and one-time revalidation;
- Equipment returned to hand with attachment on role incompatibility; attachment
  discarded with destroyed/sold host; no orphan ids;
- symmetrical Sex-sensitive definitions and no intrinsic Sex bonus;
- Early/Mid/Late effect boundaries and temporary expiry at exact turn/combat;
- Curse decline/cancel/protect-item/automatic situational protection, duplicate
  response, stale decision, no counter chain, and exact single discard;
- disabled set definitions/instances/actions absent from state and view;
- companion slot replacement, bonus/modifier, death cleanup, and no inventory;
- JSON/reconnect round trips in every new pending state.

Completion gate: tests, server e2e, lint, production build, format check, Status
and ADR updates.

## Prompt 05 — Help negotiation, reward split, helper risk, and deadlines

Goal: replace simplified help with the immutable agreement and make losing
combat safe across every combatant/encounter and disconnect.

Implement in this order:

1. offer/counter/accept/reject/cancel state machine and revision/id validation;
2. immutable agreement and combat-side helper calculation;
3. final reward preflight/draw/shuffle/partition plus private events;
4. per-combatant encounter-major run-away cursor and Bad Stuff targeting;
5. helper death/skip behavior and generalized pending continuations;
6. activate reaction/decision deadline validation and expired-state advancement
   using the already injected clock;
7. NestJS timer scheduling/rescheduling and resume-before-projection;
8. delete simplified help commands/events and the active-only behavior adapter.

Required tests:

- valid offer, free offer, reject, counter with different count, active accept,
  cancellation, redirect after rejection, invalid actor/helper/dead helper/count,
  stale/duplicate offer id, and no state mutation on failure;
- accepted agreement survives every allowed combat intervention, clone/add,
  reconnect JSON round trip, and reaction reset;
- lower/equal/higher/zero final reward clamp, helper-first count, active-only
  extra, active-only levels, per-recipient private identities, and full atomic
  shortage;
- two combatants times one/many Monsters, independent rolls, Class modifier,
  all-combatants exception, helper choice interruption/resume, helper/active
  death, skipped-dead entries, unique cleanup, and no reroll;
- outstanding offer never globally gates play and is canceled by declaration or
  run away;
- 20-second reaction expiry, 60-second decision defaults, exact-boundary clock,
  idempotent duplicate timer, stale timer, reschedule after intervention, and
  durable expiry events;
- one-player immediate declaration remains unchanged and schedules no reaction
  timer;
- six-player reaction expires all missing confirmations in one transition.

Completion gate: tests, server e2e, lint, production build, format check, Status
and ADR updates.

## Prompt 06 — Projection, unified actions/events, and privacy hardening

Goal: make `GameView` the complete V2 presentation contract before Angular is
rebuilt.

Implement in this order:

1. new player/combat/pending/config projections and resolved breakdowns;
2. unified `AvailableIntentView` with exact targets, bounds, placement, danger,
   and reason codes;
3. authoritative event priority/summary mapper and presentation slices;
4. new commands through transport validation and generic `game:command` routing;
5. lobby/game e2e coverage for settings, decisions, agreement, rewards, expiry,
   reconnect, and private identities;
6. migrate temporary Angular adapters if needed, then delete every fragmented
   availability array and duplicate projection helper.

Required tests:

- each viewer sees only own hand, protection choices, discard candidates, and
  reward identities;
- raw tier and future deck identities never serialize;
- public Sex/roles/companions/agreement/counts are identical for all viewers;
- every legal command has one matching intent and every exact target set is
  server-derived;
- sole target auto-target metadata, multiple target picker metadata, dangerous
  policy, and stale intent rejection;
- Blocking only for current addressed viewer; resolved historical events never
  block after reconnect;
- Important/ Routine mapping for every event union member with exhaustive
  compile-time checking;
- timeout remains in history and no Important outcome exists only as a toast;
- two-recipient combat reward and charity privacy tested as serialized JSON;
- Socket.IO two-player and six-player reconnect-mid-decision/reaction flows.

Completion gate: tests, server e2e, lint, production build, format check, Status
and ADR updates.

## Prompt 07 — Fixed-viewport mobile UI and legacy UI deletion

Goal: replace the current scrolling game page with the V2 state-driven mobile
screen and direct interactions. Do not change authoritative rules in this prompt.

Implement in this order:

1. split the monolithic `App` game markup/state into focused standalone
   components for Top HUD, Event Strip, Stage, Hand Dock, Action Dock, sheets,
   combat, and blocking decisions;
2. implement fixed `100dvh` safe-area root with zero document overflow;
3. render six non-scrolling player cells and viewer-action indicator;
4. implement Stage state selection from GameView and focused multi-Monster view;
5. implement compact playable-first Hand Dock and scrollable Full Hand sheet;
6. dispatch direct card actions with sole-target automation, compact picker, and
   confirmation only when projected dangerous;
7. implement score difference, one-tap breakdown, visible Monster reward/Bad
   Stuff/modifiers, offer/counter/agreement, reactions, and run-away matrix;
8. render unified Blocking/Important/Routine presentation without local semantic
   event duplication;
9. preserve accessible focus, Escape, reduced motion, localization, long text,
   reconnect, and finished-game controls;
10. delete legacy page-growing hand/character layout, action-array adapters,
    details-before-action flow, local seen-event storage, and semantic toast
    timers.

Required tests:

- component tests for every Stage state and viewer-required/not-required branch;
- direct zero-target, automatic sole-target, multiple-target picker, multiple-use
  menu, dangerous confirmation, and stale-view error recovery;
- offer/counter/agreement and helper reward/risk UI after refresh;
- Blocking decision opens from a fresh GameView and expiry closes it with durable
  Important event;
- compact facts for every card category and Details never required to play;
- combat score/difference, breakdown, every Monster's one-tap Bad Stuff access,
  multi-Monster focus, helper agreement, and reaction deadline;
- exact viewport browser checks at 360×640, 360×800, 390×844, and 412×915:
  `documentElement.scrollWidth === clientWidth` and
  `documentElement.scrollHeight === clientHeight` while the game root is active;
- six players, long names/localizations, safe areas, keyboard viewport, large
  hand, four Monsters, long picker, History, and Details sheet;
- only allowed sheets/pickers have internal scroll; root, HUD, Stage, Hand Dock,
  and Action Dock do not;
- keyboard focus trap/return, 44 px targets, screen-reader labels, reduced motion,
  and no hover-only control.

Completion gate: Angular tests, browser viewport UI tests, full tests, server e2e,
lint, production build, format check, Status and ADR updates.

## Legacy rules and UI to delete, not preserve

The following are migration scaffolding only if temporarily needed inside one
prompt. They must not remain after Prompt 07:

- schema 4 fixtures or runtime branches;
- implicit `copiesByDefinition` and incomplete test-card fallbacks;
- Monster `level` as Strength;
- singular `classCard` / `raceCard`;
- scalar `temporaryCombatBonus`;
- `requestedHelperId`, `helperId`, `REQUEST_HELP`, `ACCEPT_HELP`, and their old
  events/localization;
- helper-free run away and `nextMonsterIndex` without combatant cursor;
- Equipment-only sale and `CARD_NOT_EQUIPMENT` as the general sale error;
- global victory on any level gain;
- indefinite all-player reaction waiting;
- fragmented availability arrays and Angular recombination of their meaning;
- local authoritative-looking `publicCardEvents` / `feedbackEvents` and seen
  sequence storage;
- full hand grid in document flow, fixed action bar over a scrolling page, and
  the separate in-game brand header;
- mandatory Details before action and confirmation for every target;
- duplicate semantic combat history if its facts already exist in authoritative
  event log/state. A short combat-local list may remain only as a projection of
  those same facts.

## Cross-milestone verification discipline

At every prompt:

1. inspect `git status` before editing and preserve unrelated user changes;
2. add valid, invalid, and edge-case game-rule tests;
3. add serialized privacy tests for every new private fact;
4. use seeded RandomSource and fixed Clock; no probabilistic test assertions;
5. run focused tests while developing;
6. run root tests, server e2e, lint, production builds, and formatting before
   completion;
7. update `docs/STATUS.md` with exact commands/results;
8. update old requirements/ADRs in the same prompt that changes their behavior;
9. do not leave parallel old/new rule paths for a later cleanup milestone.

## Final acceptance checklist

V2 is complete only when:

- both modes play end-to-end with selected sets immutable;
- Balanced setup always provides the promised legal starter item;
- tier-aware draws/rewards recycle atomically without three physical decks;
- recovery helps a truly weak level-1 player and cannot be profitably farmed;
- sale accepts all eligible Treasure types and cannot award ordinary victory;
- help agreements survive reconnect and reward changes without leaking cards;
- helper and active player separately escape every Monster with resumable choices;
- Class/Race/Sex, permissions, tags, protection, companions, and attachments use
  only the small typed primitive set;
- every blocking flow expires safely and leaves durable history;
- one-player and six-player games cannot deadlock on help/reaction/decision flows;
- the 360 px+ main game document never scrolls on either axis;
- every screen immediately communicates actor, recent outcome, current context,
  score/difference, and viewer action;
- the legacy rules and UI listed above are absent;
- tests, e2e, lint, builds, formatting, documentation, and focused device checks
  are green.
