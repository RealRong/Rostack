import type { CommandOutput, EdgeCommand } from '#whiteboard-engine/command'
import type { TranslateResult } from '#whiteboard-engine/internal/translate'
import type { WriteTranslateContext } from '#whiteboard-engine/write/translate'
import * as plan from '#whiteboard-engine/write/translate/plan/edge'
import { fromOps, invalid } from '#whiteboard-engine/write/translate/result'

export const translateEdge = <C extends EdgeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'edge.create':
      return fromOps(
        plan.create(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'edge.move':
      return fromOps(plan.move(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'edge.reconnect':
    case 'edge.patch':
      return fromOps(plan.updateMany(command)) as TranslateResult<CommandOutput<C>>
    case 'edge.delete':
      return fromOps(plan.remove(command)) as TranslateResult<CommandOutput<C>>
    case 'edge.route.insert':
      return fromOps(
        plan.route(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'edge.route.move':
    case 'edge.route.remove':
    case 'edge.route.clear':
      return fromOps(plan.route(command, ctx)) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported edge action.') as TranslateResult<CommandOutput<C>>
  }
}
