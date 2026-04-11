import type {
  GroupWriteOutput,
  WriteCommandMap
} from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/group'
import { cancelled, fromOps } from './result'

type GroupCommand = WriteCommandMap['group']

export const translateGroup = <C extends GroupCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<GroupWriteOutput<C>> => {
  switch (command.type) {
    case 'merge':
      return fromOps(
        plan.merge({
          target: command.target,
          doc: ctx.doc,
          createGroupId: ctx.ids.group
        }),
        ({ output }) => output
      ) as TranslateResult<GroupWriteOutput<C>>
    case 'order':
      return fromOps(
        plan.order({
          ids: command.ids,
          mode: command.mode,
          doc: ctx.doc
        })
      ) as TranslateResult<GroupWriteOutput<C>>
    case 'ungroup':
      return fromOps(
        plan.ungroupMany([command.id], ctx.doc),
        ({ output }) => output
      ) as TranslateResult<GroupWriteOutput<C>>
    case 'ungroupMany':
      return fromOps(
        plan.ungroupMany(command.ids, ctx.doc),
        ({ output }) => output
      ) as TranslateResult<GroupWriteOutput<C>>
    default:
      return cancelled('Unsupported group action.') as TranslateResult<GroupWriteOutput<C>>
  }
}
