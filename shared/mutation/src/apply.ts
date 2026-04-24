import {
  historyFootprint,
  operationBuffer,
  type HistoryFootprintCollector,
  type InverseBuilder
} from '@shared/core'
import {
  cowDraft,
  type Draft,
  type DraftFactory
} from './draft'

export interface ApplyCtx<Doc, Op, Key, State = void> {
  readonly base: Doc
  doc(): Doc
  write(): Doc
  replace(doc: Doc): void
  readonly state: State
  readonly inverse: InverseBuilder<Op>
  readonly footprint: HistoryFootprintCollector<Key>
}

export interface Model<Doc, Op, Key, State = void, Extra = void> {
  init(doc: Doc): State
  step(ctx: ApplyCtx<Doc, Op, Key, State>, op: Op): void
  settle?(ctx: ApplyCtx<Doc, Op, Key, State>): void
  done?(ctx: ApplyCtx<Doc, Op, Key, State>): Extra
}

export interface ApplyResult<Doc, Op, Key, Extra = void> {
  doc: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export const apply = <
  Doc extends object,
  Op,
  Key,
  State = void,
  Extra = void
>(input: {
  doc: Doc
  ops: readonly Op[]
  model: Model<Doc, Op, Key, State, Extra>
  draft?: DraftFactory<Doc>
  serializeKey(key: Key): string
}): ApplyResult<Doc, Op, Key, Extra> => {
  const createDraft = input.draft ?? cowDraft.create<Doc>()
  let draft: Draft<Doc> = createDraft(input.doc)
  const inverse = operationBuffer.createInverseBuilder<Op>()
  const footprint = historyFootprint.createHistoryFootprintCollector<Key>(
    input.serializeKey
  )
  const state = input.model.init(input.doc)

  const ctx: ApplyCtx<Doc, Op, Key, State> = {
    base: input.doc,
    doc: () => draft.doc(),
    write: () => draft.write(),
    replace: (doc) => {
      draft = createDraft(doc)
    },
    state,
    inverse,
    footprint
  }

  input.ops.forEach((op) => {
    input.model.step(ctx, op)
  })

  input.model.settle?.(ctx)
  const extra = input.model.done?.(ctx) as Extra

  return {
    doc: draft.done(),
    forward: [...input.ops],
    inverse: inverse.finish(),
    footprint: footprint.finish(),
    extra
  }
}
