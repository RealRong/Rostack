import type { CommandOutput, NodeCommand } from '@whiteboard/engine/types/command'
import type { TranslateResult } from '@whiteboard/engine/types/internal/translate'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import * as plan from '@whiteboard/engine/write/translate/plan/node'
import { fromOps, invalid } from '@whiteboard/engine/write/translate/result'

export const translateNode = <C extends NodeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'node.create':
      return fromOps(
        plan.create(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'node.patch':
      return fromOps(plan.updateMany(command, ctx.doc)) as TranslateResult<CommandOutput<C>>
    case 'node.move':
      return fromOps(plan.move(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'node.align':
      return fromOps(plan.align(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'node.distribute':
      return fromOps(plan.distribute(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'node.delete':
      return fromOps(plan.remove(command)) as TranslateResult<CommandOutput<C>>
    case 'node.deleteCascade':
      return fromOps(plan.removeCascade(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'node.duplicate':
      return fromOps(
        plan.duplicate(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported node action.') as TranslateResult<CommandOutput<C>>
  }
}
