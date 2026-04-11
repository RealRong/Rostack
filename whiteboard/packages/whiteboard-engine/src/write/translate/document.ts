import type {
  WriteCommandMap,
  WriteOutput
} from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import * as plan from './plan/document'
import { fromOps, invalid } from './result'

type DocumentCommand = WriteCommandMap['document']

export const translateDocument = <C extends DocumentCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<WriteOutput<'document', C>> => {
  switch (command.type) {
    case 'insert':
      return fromOps(
        plan.insert(command, ctx),
        ({ output }) => output
      ) as TranslateResult<WriteOutput<'document', C>>
    case 'delete':
      return fromOps(plan.remove(command, ctx)) as TranslateResult<WriteOutput<'document', C>>
    case 'duplicate':
      return fromOps(
        plan.duplicate(command, ctx),
        ({ output }) => output
      ) as TranslateResult<WriteOutput<'document', C>>
    case 'background':
      return fromOps(plan.background(command, ctx)) as TranslateResult<WriteOutput<'document', C>>
    case 'order':
      return fromOps(plan.order(command, ctx)) as TranslateResult<WriteOutput<'document', C>>
    default:
      return invalid('Unsupported document action.') as TranslateResult<WriteOutput<'document', C>>
  }
}
