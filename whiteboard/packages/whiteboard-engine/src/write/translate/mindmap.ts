import type { CommandOutput, MindmapCommand } from '#types/command'
import type { TranslateResult } from '#types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/mindmap'
import { fromOps, invalid } from './result'

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
    case 'mindmap.patchNode':
      return fromOps(plan.updateNode(command, ctx)) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported mindmap command type.') as TranslateResult<CommandOutput<C>>
  }
}
