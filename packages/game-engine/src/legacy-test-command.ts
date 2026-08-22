import type { GameCommand } from "./commands.js";
import {
  executeCommand as executeDomainCommand,
  type CommandContext,
  type CommandResult,
} from "./engine.js";
import type { GameState } from "./game-state.js";
import { parseCombatId, type CombatId } from "./identifiers.js";

/** Adds the current combat address to pre-V2 test commands. New regression
 * tests call the domain function directly and exercise stale addresses. */
export function executeCommand(
  state: GameState,
  command: GameCommand,
  context: CommandContext,
): CommandResult {
  const combat = state.combat;
  if (combat === null) return executeDomainCommand(state, command, context);
  if (combat.combatId === undefined) {
    (combat as unknown as { combatId: CombatId }).combatId =
      parseCombatId("legacy-test-combat");
  }
  const needsAddress =
    command.type === "PLAY_CARD" ||
    command.type === "DECLARE_COMBAT_VICTORY" ||
    command.type === "PASS_COMBAT_REACTION" ||
    command.type === "RUN_AWAY" ||
    command.type === "PROPOSE_HELP" ||
    command.type === "COUNTER_HELP" ||
    command.type === "ACCEPT_HELP_OFFER" ||
    command.type === "REJECT_HELP_OFFER" ||
    command.type === "CANCEL_HELP_OFFER" ||
    (command.type === "RESOLVE_CARD_DISCARD" &&
      state.pendingDecision?.type === "DISCARD_CARDS" &&
      state.pendingDecision.completion.type === "RUN_AWAY");
  return executeDomainCommand(
    state,
    needsAddress
      ? ({
          ...command,
          combatId: command.combatId ?? combat.combatId,
          combatRevision: command.combatRevision ?? combat.revision,
        } as GameCommand)
      : command,
    context,
  );
}
