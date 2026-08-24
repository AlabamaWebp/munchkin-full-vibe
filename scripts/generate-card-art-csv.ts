import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CardType,
  createDevelopmentCardSet,
  type CardDefinition,
} from "../packages/game-engine/dist/index.js";

const baseStyle =
  "Humorous fantasy card game illustration, hand-drawn comic fantasy, expressive outlines, exaggerated shapes and facial expressions, clear silhouette, readable at small card size, one main subject, simple uncluttered background, vertical composition, centered subject, no text, no letters, no numbers, no UI, no card frame, no watermark.";

const typeStyle: Partial<Record<CardDefinition["type"], string>> = {
  [CardType.MONSTER]:
    "Funny but dangerous fantasy creature, absurd and memorable, dynamic pose.",
  [CardType.EQUIPMENT]:
    "Fantasy item as the clear main subject, iconic shape, exaggerated humorous design.",
  [CardType.CURSE]:
    "Comical fantasy misfortune or cursed situation, visually obvious and absurd.",
  [CardType.COMBAT_CURSE]:
    "Comical fantasy misfortune or cursed situation, visually obvious and absurd.",
  [CardType.CLASS]:
    "Humorous fantasy character clearly representing this class through clothing, equipment and pose.",
  [CardType.RACE]:
    "Humorous fantasy character clearly representing this fantasy race, emphasizing its recognizable visual traits.",
};

const mechanical =
  /\d|\b(?:bonus|penalty|strength|level|levels|treasure|treasures|card|cards|draw|discard|combat|equipment slot|gold|bad stuff|death|cancels|matching|active|attach|second|companion|run away|curse)\b/i;

function visualDescription(card: CardDefinition): string {
  const useful = card.description
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !mechanical.test(sentence))
    .join(" ")
    .trim();
  return useful || `A humorous fantasy interpretation of ${card.name}.`;
}

function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function outputType(type: CardDefinition["type"]): string {
  return type === CardType.EQUIPMENT ? "item" : type.toLowerCase();
}

const cards = createDevelopmentCardSet().definitions;
const header = [
  "id",
  "artKey",
  "name",
  "type",
  "deck",
  "setId",
  "tier",
  "description",
  "prompt",
];
const rows = cards.map((card) => {
  const description = visualDescription(card);
  const style =
    typeStyle[card.type] ??
    "Humorous fantasy subject with an iconic, visually obvious action or object.";
  const prompt = `${baseStyle} ${style} Card: ${card.name}. ${description}`;
  return [
    String(card.id),
    card.artKey,
    card.name,
    outputType(card.type),
    card.deck.toLowerCase(),
    card.setId.toLowerCase(),
    String(card.tier),
    description,
    prompt,
  ]
    .map(csv)
    .join(",");
});

const outputDirectory = resolve("generated");
const outputPath = resolve(outputDirectory, "card-art-prompts.csv");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  outputPath,
  `\uFEFF${[header.map(csv).join(","), ...rows].join("\r\n")}\r\n`,
  "utf8",
);
console.log(`Exported ${cards.length} cards to ${outputPath}`);
