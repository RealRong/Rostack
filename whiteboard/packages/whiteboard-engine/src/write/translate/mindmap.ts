import type {
  MindmapWriteOutput,
  WriteCommandMap
} from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/mindmap'
import { fromOps, invalid } from './result'

type MindmapCommand = WriteCommandMap['mindmap']

export const translateMindmap = <C extends MindmapCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<MindmapWriteOutput<C>> => {
  switch (command.type) {
    case 'create':
      return fromOps(
        plan.create(command.payload, ctx),
        ({ output }) => output
      ) as TranslateResult<MindmapWriteOutput<C>>
    case 'delete':
      return fromOps(plan.removeMany(command.ids, ctx.doc)) as TranslateResult<MindmapWriteOutput<C>>
    case 'insert':
      return fromOps(
        plan.insert(command.id, command.input, ctx),
        ({ output }) => output
      ) as TranslateResult<MindmapWriteOutput<C>>
    case 'move.subtree':
      return fromOps(plan.moveSubtree(command.id, command.input, ctx)) as TranslateResult<MindmapWriteOutput<C>>
    case 'remove':
      return fromOps(plan.removeSubtree(command.id, command.input, ctx)) as TranslateResult<MindmapWriteOutput<C>>
    case 'clone.subtree':
      return fromOps(
        plan.cloneSubtree(command.id, command.input, ctx),
        ({ output }) => output
      ) as TranslateResult<MindmapWriteOutput<C>>
    case 'update.node':
      return fromOps(plan.updateNode(command.id, command.input, ctx)) as TranslateResult<MindmapWriteOutput<C>>
    default:
      return invalid('Unsupported mindmap command type.') as TranslateResult<MindmapWriteOutput<C>>
  }
}
