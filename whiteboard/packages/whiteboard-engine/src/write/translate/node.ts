import type { NodeWriteOutput, WriteCommandMap } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/node'
import { fromOps, invalid } from './result'

type NodeCommand = WriteCommandMap['node']
export const translateNode = <C extends NodeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<NodeWriteOutput<C>> => {
  switch (command.type) {
    case 'create':
      return fromOps(
        plan.create(command, ctx),
        ({ output }) => output
      ) as TranslateResult<NodeWriteOutput<C>>
    case 'updateMany':
      return fromOps(plan.updateMany(command, ctx.doc)) as TranslateResult<NodeWriteOutput<C>>
    case 'move':
      return fromOps(plan.move(command, ctx)) as TranslateResult<NodeWriteOutput<C>>
    case 'align':
      return fromOps(plan.align(command, ctx)) as TranslateResult<NodeWriteOutput<C>>
    case 'distribute':
      return fromOps(plan.distribute(command, ctx)) as TranslateResult<NodeWriteOutput<C>>
    case 'delete':
      return fromOps(plan.remove(command)) as TranslateResult<NodeWriteOutput<C>>
    case 'deleteCascade':
      return fromOps(plan.removeCascade(command, ctx)) as TranslateResult<NodeWriteOutput<C>>
    case 'duplicate':
      return fromOps(
        plan.duplicate(command, ctx),
        ({ output }) => output
      ) as TranslateResult<NodeWriteOutput<C>>
    default:
      return invalid('Unsupported node action.') as TranslateResult<NodeWriteOutput<C>>
  }
}
