import type {
  MutationOrderedEffect
} from '@shared/mutation'
import {
  readStructuralEffectResult
} from '@shared/mutation/engine'
import type {
  Edge,
  EdgeId
} from '@whiteboard/core/types'
import {
  same
} from './common'
import {
  toStructuralOrderedAnchor,
  whiteboardStructures
} from './structures'
import type {
  WhiteboardCustomOperation,
  WhiteboardCustomPlanContext
} from './types'

export type OrderedEdgeCollectionConfig<
  TItem,
  TInsert extends WhiteboardCustomOperation,
  TDelete extends WhiteboardCustomOperation,
  TMove extends WhiteboardCustomOperation,
  TPatch extends WhiteboardCustomOperation
> = {
  structure(edgeId: EdgeId): string
  readItems(edge: Edge): readonly TItem[]
  itemId(item: TItem): string
  readInsert(op: TInsert): {
    edgeId: EdgeId
    item: TItem
    to: Parameters<typeof toStructuralOrderedAnchor>[0]
  }
  readDelete(op: TDelete): {
    edgeId: EdgeId
    itemId: string
  }
  readMove(op: TMove): {
    edgeId: EdgeId
    itemId: string
    to: Parameters<typeof toStructuralOrderedAnchor>[0]
  }
  readPatch(op: TPatch): {
    edgeId: EdgeId
    itemId: string
  }
  patchItem(item: TItem, op: TPatch): TItem
  writePatch(items: readonly TItem[]): Readonly<Record<string, unknown>>
  missingItemMessage(itemId: string): string
}

const readEdge = (
  input: WhiteboardCustomPlanContext,
  edgeId: EdgeId
): Edge | undefined => input.reader.edges.get(edgeId)

const hasCollectionItem = <TItem,>(
  items: readonly TItem[],
  readId: (item: TItem) => string,
  itemId: string
): boolean => items.some((item) => readId(item) === itemId)

const findCollectionItemIndex = <TItem,>(
  items: readonly TItem[],
  readId: (item: TItem) => string,
  itemId: string
): number => items.findIndex((item) => readId(item) === itemId)

const previewOrderedMove = (
  input: WhiteboardCustomPlanContext,
  effect: MutationOrderedEffect
): boolean => {
  const result = readStructuralEffectResult({
    document: input.document,
    effect,
    structures: whiteboardStructures
  })
  if (!result.ok) {
    return input.fail({
      code: 'invalid',
      message: result.error.message
    })
  }

  return result.data.historyMode !== 'neutral'
}

export const planOrderedInsert = <
  TItem,
  TInsert extends WhiteboardCustomOperation,
  TDelete extends WhiteboardCustomOperation,
  TMove extends WhiteboardCustomOperation,
  TPatch extends WhiteboardCustomOperation
>(
  input: WhiteboardCustomPlanContext<TInsert>,
  config: OrderedEdgeCollectionConfig<TItem, TInsert, TDelete, TMove, TPatch>,
  cloneItem: (item: TItem) => TItem
): void => {
  const {
    edgeId,
    item,
    to
  } = config.readInsert(input.op)
  if (!readEdge(input, edgeId)) {
    return input.fail({
      code: 'invalid',
      message: `Edge ${edgeId} not found.`
    })
  }

  input.effects.structure.ordered.insert(
    config.structure(edgeId),
    config.itemId(item),
    cloneItem(item),
    toStructuralOrderedAnchor(to)
  )
}

export const planOrderedDelete = <
  TItem,
  TInsert extends WhiteboardCustomOperation,
  TDelete extends WhiteboardCustomOperation,
  TMove extends WhiteboardCustomOperation,
  TPatch extends WhiteboardCustomOperation
>(
  input: WhiteboardCustomPlanContext<TDelete>,
  config: OrderedEdgeCollectionConfig<TItem, TInsert, TDelete, TMove, TPatch>
): void => {
  const {
    edgeId,
    itemId
  } = config.readDelete(input.op)
  const edge = readEdge(input, edgeId)
  const items = edge
    ? config.readItems(edge)
    : []
  if (!edge || !hasCollectionItem(items, config.itemId, itemId)) {
    return
  }

  input.effects.structure.ordered.delete(
    config.structure(edgeId),
    itemId
  )
}

export const planOrderedMove = <
  TItem,
  TInsert extends WhiteboardCustomOperation,
  TDelete extends WhiteboardCustomOperation,
  TMove extends WhiteboardCustomOperation,
  TPatch extends WhiteboardCustomOperation
>(
  input: WhiteboardCustomPlanContext<TMove>,
  config: OrderedEdgeCollectionConfig<TItem, TInsert, TDelete, TMove, TPatch>
): void => {
  const {
    edgeId,
    itemId,
    to
  } = config.readMove(input.op)
  const edge = readEdge(input, edgeId)
  const items = edge
    ? config.readItems(edge)
    : []
  if (!edge || !hasCollectionItem(items, config.itemId, itemId)) {
    return
  }

  const effect: MutationOrderedEffect = {
    type: 'ordered.move',
    structure: config.structure(edgeId),
    itemId,
    to: toStructuralOrderedAnchor(to)
  }
  if (!previewOrderedMove(input, effect)) {
    return
  }

  input.effects.structure.ordered.move(
    effect.structure,
    effect.itemId,
    effect.to
  )
}

export const planOrderedPatch = <
  TItem,
  TInsert extends WhiteboardCustomOperation,
  TDelete extends WhiteboardCustomOperation,
  TMove extends WhiteboardCustomOperation,
  TPatch extends WhiteboardCustomOperation
>(
  input: WhiteboardCustomPlanContext<TPatch>,
  config: OrderedEdgeCollectionConfig<TItem, TInsert, TDelete, TMove, TPatch>
): void => {
  const {
    edgeId,
    itemId
  } = config.readPatch(input.op)
  const edge = readEdge(input, edgeId)
  const items = edge
    ? [...config.readItems(edge)]
    : []
  const index = findCollectionItemIndex(items, config.itemId, itemId)
  if (!edge || index < 0) {
    return input.fail({
      code: 'invalid',
      message: config.missingItemMessage(itemId)
    })
  }

  const current = items[index]!
  const next = config.patchItem(current, input.op)
  if (same(next, current)) {
    return
  }

  items[index] = next
  input.effects.entity.patch({
    table: 'edge',
    id: edgeId
  }, config.writePatch(items))
}
