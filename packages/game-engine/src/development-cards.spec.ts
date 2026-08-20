import { describe, expect, it } from "vitest";
import { CardType, DeckType, EquipmentSlot } from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";

describe("development card catalog", () => {
  const cardSet = createDevelopmentCardSet();
  const definitions = cardSet.definitions;

  it("contains a varied catalog sized for three to six players", () => {
    const doorDefinitions = definitions.filter(
      (definition) => definition.deck === DeckType.DOOR,
    );
    const treasureDefinitions = definitions.filter(
      (definition) => definition.deck === DeckType.TREASURE,
    );

    expect(doorDefinitions.length).toBeGreaterThanOrEqual(18);
    expect(treasureDefinitions.length).toBeGreaterThanOrEqual(20);
    expect(cardSet.doorDeck.length).toBeGreaterThanOrEqual(48);
    expect(cardSet.treasureDeck.length).toBeGreaterThanOrEqual(60);
  });

  it("has no placeholder cards and only permits empty effects for typed cards", () => {
    expect(
      definitions.some((definition) => definition.type === CardType.OTHER),
    ).toBe(false);

    const typedWithoutEffects = new Set<CardType>([
      CardType.MONSTER,
      CardType.EQUIPMENT,
      CardType.CLASS,
      CardType.RACE,
    ]);
    for (const definition of definitions) {
      if (definition.effects.length === 0) {
        expect(typedWithoutEffects.has(definition.type)).toBe(true);
      }
    }
  });

  it("uses unique stable definition ids and illustration keys", () => {
    const ids = definitions.map((definition) => definition.id);
    const artKeys = definitions.map((definition) => definition.artKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      artKeys.every(
        (artKey) => typeof artKey === "string" && artKey.length > 0,
      ),
    ).toBe(true);
    expect(new Set(artKeys).size).toBe(artKeys.length);
  });

  it("gives every Treasure an explicit value and every actionable card a policy", () => {
    for (const definition of definitions) {
      if (definition.deck === DeckType.TREASURE) {
        expect(definition.goldValue).toEqual(expect.any(Number));
        expect(definition.goldValue).toBeGreaterThanOrEqual(0);
      }
      if (definition.effects.length > 0) {
        expect(definition.play?.timings.length).toBeGreaterThan(0);
        expect(definition.play?.target).toEqual(expect.any(String));
      }
    }
  });

  it("fully describes equipment, including hands, bonus, and restrictions", () => {
    const equipment = definitions.filter(
      (definition) => definition.type === CardType.EQUIPMENT,
    );
    expect(equipment.length).toBeGreaterThanOrEqual(8);

    for (const definition of equipment) {
      expect(definition.equipment).toBeDefined();
      expect(definition.equipment?.combatBonus).toEqual(expect.any(Number));
      expect(definition.equipment?.hands).toEqual(expect.any(Number));
      expect(definition.equipment?.restrictions).toBeInstanceOf(Array);
      expect(
        definition.equipment?.slot === EquipmentSlot.HANDS
          ? [1, 2].includes(definition.equipment.hands ?? -1)
          : definition.equipment?.hands === 0,
      ).toBe(true);
    }
  });
});
