import type { CommandOutput, MindmapCommand } from '@whiteboard/engine/types/command'
import type { TranslateResult } from '@whiteboard/engine/types/internal/translate'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import * as plan from '@whiteboard/engine/write/translate/plan/mindmap'
import { fromOps, invalid } from '@whiteboard/engine/write/translate/result'

export const translateMindmap = <C extends MindmapCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'mindmap.create':
      return fromOps(
        plan.create(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'mindmap.delete':
      return fromOps(plan.removeMany(command, ctx.doc)) as TranslateResult<CommandOutput<C>>
    case 'mindmap.insert':
      return fromOps(
        plan.insert(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'mindmap.move':
      return fromOps(plan.moveSubtree(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'mindmap.remove':
      return fromOps(plan.removeSubtree(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'mindmap.clone':
      return fromOps(
        plan.cloneSubtree(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'mindmap.patch':
      return fromOps(plan.patch(command, ctx)) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported mindmap command type.') as TranslateResult<CommandOutput<C>>
  }
}
