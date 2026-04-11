import type { EdgeWriteOutput, WriteCommandMap } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/edge'
import { fromOps, invalid } from './result'

type EdgeCommand = WriteCommandMap['edge']

export const translateEdge = <C extends EdgeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<EdgeWriteOutput<C>> => {
  switch (command.type) {
    case 'create':
      return fromOps(
        plan.create(command, ctx),
        ({ output }) => output
      ) as TranslateResult<EdgeWriteOutput<C>>
    case 'move':
      return fromOps(plan.move(command, ctx)) as TranslateResult<EdgeWriteOutput<C>>
    case 'updateMany':
      return fromOps(plan.updateMany(command)) as TranslateResult<EdgeWriteOutput<C>>
    case 'delete':
      return fromOps(plan.remove(command)) as TranslateResult<EdgeWriteOutput<C>>
    case 'route':
      if (command.mode === 'insert') {
        return fromOps(
          plan.route(command, ctx),
          ({ output }) => output
        ) as TranslateResult<EdgeWriteOutput<C>>
      }

      return fromOps(plan.route(command, ctx)) as TranslateResult<EdgeWriteOutput<C>>
    default:
      return invalid('Unsupported edge action.') as TranslateResult<EdgeWriteOutput<C>>
  }
}
