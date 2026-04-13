import type {
  CommandOutput,
  DocumentCommand
} from '#types/command'
import type { TranslateResult } from '#types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/document'
import { fromOps, invalid } from './result'

export const translateDocument = <C extends DocumentCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'document.insert':
      return fromOps(
        plan.insert(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'document.delete':
      return fromOps(plan.remove(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'document.duplicate':
      return fromOps(
        plan.duplicate(command, ctx),
        ({ output }) => output
      ) as TranslateResult<CommandOutput<C>>
    case 'document.background.set':
      return fromOps(plan.background(command, ctx)) as TranslateResult<CommandOutput<C>>
    case 'document.order':
      return fromOps(plan.order(command, ctx)) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported document action.') as TranslateResult<CommandOutput<C>>
  }
}
