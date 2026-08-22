export const GAME_ENGINE_STATUS = "domain-ready" as const;

export type GameEngineStatus = typeof GAME_ENGINE_STATUS;

export function getGameEngineStatus(): GameEngineStatus {
  return GAME_ENGINE_STATUS;
}

export * from "./cards.js";
export * from "./balance.js";
export * from "./conditions.js";
export * from "./commands.js";
export * from "./development-cards.js";
export * from "./deck.js";
export * from "./engine.js";
export * from "./equipment.js";
export * from "./events.js";
export * from "./game.js";
export * from "./game-state.js";
export * from "./identifiers.js";
export * from "./random-source.js";
export * from "./roles.js";
