import { CardType } from "./cards.js";
import type { GameState, PlayerState } from "./game-state.js";

export type RoleKind = "CLASS" | "RACE";

export function roleCapacity(
  state: GameState,
  player: PlayerState,
  role: RoleKind,
): 1 | 2 {
  const hasPermission = player.rolePermissionCards.some((card) => {
    const definition = state.cardDefinitions.find(
      (candidate) => candidate.id === card.definitionId,
    );
    return (
      definition?.type === CardType.ROLE_PERMISSION &&
      definition.rolePermission?.role === role &&
      definition.rolePermission.additionalSlots === 1
    );
  });
  return hasPermission ? 2 : 1;
}
