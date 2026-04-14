import type {
  CommandOutput,
  GroupCommand
} from '@whiteboard/engine/types/command'
import type { TranslateResult } from '@whiteboard/engine/types/internal/translate'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import * as plan from '@whiteboard/engine/write/translate/plan/group'
import { cancelled, fromOps } from '@whiteboard/engine/write/translate/result'

export const translateGroup = <C extends GroupCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'group.merge':
      return fromOps(
        plan.merge({
          target: command.target,
          doc: ctx.doc,
          createGroupId: ctx.ids.group
        }),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'group.order':
      return fromOps(
        plan.order({
          ids: command.ids,
          mode: command.mode,
          doc: ctx.doc
        })
      ) as TranslateResult<CommandOutput<C>>
    case 'group.ungroup':
      return fromOps(
        plan.ungroupMany([command.id], ctx.doc),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'group.ungroupMany':
      return fromOps(
        plan.ungroupMany(command.ids, ctx.doc),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    default:
      return cancelled('Unsupported group action.') as TranslateResult<CommandOutput<C>>
  }
}
