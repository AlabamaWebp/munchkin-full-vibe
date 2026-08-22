import {
  DeckType,
  GameMode,
  type CardInstance,
  type CardTier,
} from "./cards.js";
import type { GameEvent } from "./events.js";
import type { GameState } from "./game-state.js";
import type { RandomSource } from "./random-source.js";

export interface TierWeights {
  readonly 1: number;
  readonly 2: number;
  readonly 3: number;
}

export const BALANCED_DOOR_WEIGHTS = {
  EARLY: { 1: 85, 2: 15, 3: 0 },
  MID: { 1: 25, 2: 60, 3: 15 },
  LATE: { 1: 5, 2: 35, 3: 60 },
} as const satisfies Record<string, TierWeights>;

export const BALANCED_TREASURE_WEIGHTS = {
  1: { 1: 80, 2: 20, 3: 0 },
  2: { 1: 20, 2: 65, 3: 15 },
  3: { 1: 5, 2: 30, 3: 65 },
} as const satisfies Record<CardTier, TierWeights>;

export function doorWeightsForLevel(level: number): TierWeights {
  return level <= 3
    ? BALANCED_DOOR_WEIGHTS.EARLY
    : level <= 6
      ? BALANCED_DOOR_WEIGHTS.MID
      : BALANCED_DOOR_WEIGHTS.LATE;
}

export function effectiveTierForStrength(strength: number): CardTier {
  return strength <= 5 ? 1 : strength <= 11 ? 2 : 3;
}

export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const otherIndex = random.nextInt(index + 1);
    const current = result[index];
    const other = result[otherIndex];
    if (current === undefined || other === undefined)
      throw new RangeError("Shuffle index was outside the collection.");
    result[index] = other;
    result[otherIndex] = current;
  }
  return result;
}

export class InsufficientCardsError extends Error {
  constructor(
    readonly deck: DeckType,
    readonly count: number,
  ) {
    super(`The ${deck} deck and discard cannot provide ${count} card(s).`);
  }
}

export interface DeckDrawResult {
  readonly state: GameState;
  readonly cards: readonly CardInstance[];
  readonly events: readonly GameEvent[];
}

function tierOf(state: GameState, card: CardInstance): CardTier {
  const definition = state.cardDefinitions.find(
    (candidate) => candidate.id === card.definitionId,
  );
  if (definition === undefined)
    throw new TypeError(`Missing definition for ${card.instanceId}.`);
  return definition.tier;
}

function weightedIndex(
  state: GameState,
  pile: readonly CardInstance[],
  weights: TierWeights,
  random: RandomSource,
): number {
  const indices = new Map<CardTier, number[]>([
    [1, []],
    [2, []],
    [3, []],
  ]);
  pile.forEach((card, index) => indices.get(tierOf(state, card))!.push(index));
  let available = ([1, 2, 3] as const).filter(
    (tier) => indices.get(tier)!.length > 0 && weights[tier] > 0,
  );
  const selectedWeights: Record<CardTier, number> = { ...weights };
  if (available.length === 0) {
    available = ([1, 2, 3] as const).filter(
      (tier) => indices.get(tier)!.length > 0,
    );
    for (const tier of available) selectedWeights[tier] = 1;
  }
  const total = available.reduce((sum, tier) => sum + selectedWeights[tier], 0);
  let choice = random.nextInt(total);
  let selectedTier = available[0];
  for (const tier of available) {
    if (choice < selectedWeights[tier]) {
      selectedTier = tier;
      break;
    }
    choice -= selectedWeights[tier];
  }
  if (selectedTier === undefined) throw new RangeError("No tier was selected.");
  const candidates = indices.get(selectedTier)!;
  return candidates[random.nextInt(candidates.length)]!;
}

export function drawCards(
  state: GameState,
  deck: DeckType,
  count: number,
  random: RandomSource,
  weights: TierWeights,
): DeckDrawResult {
  const originalPile =
    deck === DeckType.DOOR ? state.doorDeck : state.treasureDeck;
  const originalDiscard =
    deck === DeckType.DOOR ? state.doorDiscard : state.treasureDiscard;
  if (originalPile.length + originalDiscard.length < count)
    throw new InsufficientCardsError(deck, count);

  let pile = [...originalPile];
  let discard = [...originalDiscard];
  const cards: CardInstance[] = [];
  const events: GameEvent[] = [];
  for (let drawIndex = 0; drawIndex < count; drawIndex += 1) {
    if (pile.length === 0) {
      pile = shuffle(discard, random);
      discard = [];
      events.push({ type: "DECK_RESHUFFLED", visibility: "PUBLIC", deck });
    }
    const index =
      state.config.mode === GameMode.CLASSIC_CHAOS
        ? 0
        : weightedIndex(state, pile, weights, random);
    const [card] = pile.splice(index, 1);
    if (card === undefined) throw new RangeError("Draw selected no card.");
    cards.push(card);
  }

  return {
    state:
      deck === DeckType.DOOR
        ? { ...state, doorDeck: pile, doorDiscard: discard }
        : { ...state, treasureDeck: pile, treasureDiscard: discard },
    cards,
    events,
  };
}
