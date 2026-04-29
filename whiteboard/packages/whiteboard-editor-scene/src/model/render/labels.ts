import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeLabelKey, EdgeLabelView } from '../../contracts/render'
import type { WorkingState } from '../../contracts/working'
import type { RenderContext } from './context'

const forEachSceneItem = (
  working: WorkingState,
  visit: (item: WorkingState['items']['byId'] extends ReadonlyMap<any, infer TValue> ? TValue : never) => void
) => {
  working.items.ids.forEach((key) => {
    const item = working.items.byId.get(key)
    if (item) {
      visit(item)
    }
  })
}

const readEdgeLabelKey = (
  edgeId: EdgeId,
  labelId: string
): EdgeLabelKey => `${edgeId}:${labelId}`

const isEditCaretEqual = (
  left: EdgeLabelView['caret'],
  right: EdgeLabelView['caret']
): boolean => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && geometryApi.equal.point(left.client, right.client)
  )
)

const isLabelViewEqual = (
  left: EdgeLabelView,
  right: EdgeLabelView
): boolean => (
  left.key === right.key
  && left.edgeId === right.edgeId
  && left.labelId === right.labelId
  && geometryApi.equal.point(left.point, right.point)
  && left.angle === right.angle
  && left.text === right.text
  && left.displayText === right.displayText
  && left.style === right.style
  && left.editing === right.editing
  && left.selected === right.selected
  && isEditCaretEqual(left.caret, right.caret)
)

const buildEdgeLabels = (input: {
  working: WorkingState
  edgeId: EdgeId
}) => {
  const labels = new Map<EdgeLabelKey, EdgeLabelView>()
  const edge = input.working.graph.edges.get(input.edgeId)
  if (!edge || edge.route.labels.length === 0) {
    return {
      ids: [] as EdgeLabelKey[],
      byId: labels
    }
  }

  const edgeUi = input.working.ui.edges.get(input.edgeId)
  const ids: EdgeLabelKey[] = []

  edge.route.labels.forEach((label) => {
    const labelUi = edgeUi?.labels.get(label.labelId)
    const key = readEdgeLabelKey(input.edgeId, label.labelId)
    ids.push(key)
    labels.set(key, {
      key,
      edgeId: input.edgeId,
      labelId: label.labelId,
      point: label.point,
      angle: label.angle,
      text: label.text,
      displayText: label.displayText,
      style: label.style,
      editing: labelUi?.editing ?? false,
      selected: edgeUi?.selected ?? false,
      caret: labelUi?.caret
    })
  })

  return {
    ids,
    byId: labels
  }
}

const buildLabelsState = (
  working: WorkingState
) => {
  const labels = new Map<EdgeLabelKey, EdgeLabelView>()
  const ids: EdgeLabelKey[] = []
  const keysByEdge = new Map<EdgeId, readonly EdgeLabelKey[]>()

  forEachSceneItem(working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edgeLabels = buildEdgeLabels({
      working,
      edgeId: item.id
    })
    if (edgeLabels.ids.length === 0) {
      return
    }

    keysByEdge.set(item.id, edgeLabels.ids)
    ids.push(...edgeLabels.ids)
    edgeLabels.byId.forEach((view, key) => {
      labels.set(key, view)
    })
  })

  return {
    ids,
    byId: labels,
    keysByEdge
  }
}

const replaceIdSegment = <TId extends string>(
  ids: readonly TId[],
  previousIds: readonly TId[],
  nextIds: readonly TId[]
): readonly TId[] => {
  if (previousIds.length === 0) {
    return nextIds.length === 0
      ? ids
      : [...ids, ...nextIds]
  }

  const previousIdSet = new Set(previousIds)
  const startIndex = ids.findIndex((id) => id === previousIds[0])
  if (startIndex === -1) {
    return [
      ...ids.filter((id) => !previousIdSet.has(id)),
      ...nextIds
    ]
  }

  return [
    ...ids.slice(0, startIndex),
    ...nextIds,
    ...ids.slice(startIndex).filter((id) => !previousIdSet.has(id))
  ]
}

const writeLabelDelta = (input: {
  context: RenderContext
  key: EdgeLabelKey
  previous: EdgeLabelView | undefined
  next: EdgeLabelView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.phase.render.edge.labels, input.key)
    input.context.working.phase.render.edge.labelsIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.phase.render.edge.labels, input.key)
    input.context.working.phase.render.edge.labelsIds = true
    return
  }

  idDelta.update(input.context.working.phase.render.edge.labels, input.key)
}

export const patchRenderLabels = (
  context: RenderContext
): number => {
  if (!context.reset && context.touched.edge.labels.size === 0) {
    return 0
  }

  const previous = context.working.render.labels
  if (context.reset) {
    const built = buildLabelsState(context.working)
    const nextById = new Map<EdgeLabelKey, EdgeLabelView>()
    let count = 0

    built.byId.forEach((view, key) => {
      const previousView = previous.byId.get(key)
      nextById.set(
        key,
        previousView && isLabelViewEqual(previousView, view)
          ? previousView
          : view
      )
    })

    new Set<EdgeLabelKey>([
      ...previous.ids,
      ...built.ids
    ]).forEach((key) => {
      const previousView = previous.byId.get(key)
      const nextView = nextById.get(key)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isLabelViewEqual(previousView, nextView)
        )
      ) {
        writeLabelDelta({
          context,
          key,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    if (!equal.sameOrder(previous.ids, built.ids, (left, right) => left === right)) {
      context.working.phase.render.edge.labelsIds = true
    }

    context.working.render.labels = {
      ids: built.ids,
      byId: nextById,
      keysByEdge: built.keysByEdge
    }
    return count
  }

  const labelsById = new Map(previous.byId)
  const keysByEdge = new Map(previous.keysByEdge)
  let labelIds = previous.ids
  let changed = false
  let count = 0

  context.touched.edge.labels.forEach((edgeId) => {
    const previousKeys = previous.keysByEdge.get(edgeId) ?? []
    const nextLabels = buildEdgeLabels({
      working: context.working,
      edgeId
    })
    const previousKeySet = new Set(previousKeys)
    const nextKeySet = new Set(nextLabels.ids)
    const changedKeys: Array<{
      key: EdgeLabelKey
      previous: EdgeLabelView | undefined
      next: EdgeLabelView | undefined
    }> = []

    new Set<EdgeLabelKey>([
      ...previousKeys,
      ...nextLabels.ids
    ]).forEach((key) => {
      const previousView = previous.byId.get(key)
      const nextCandidate = nextLabels.byId.get(key)
      const nextView = previousView && nextCandidate && isLabelViewEqual(previousView, nextCandidate)
        ? previousView
        : nextCandidate

      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isLabelViewEqual(previousView, nextView)
        )
      ) {
        changedKeys.push({
          key,
          previous: previousView,
          next: nextView
        })
      }
    })

    if (changedKeys.length === 0) {
      return
    }

    changed = true

    previousKeys.forEach((key) => {
      if (!nextLabels.byId.has(key)) {
        labelsById.delete(key)
      }
    })
    nextLabels.byId.forEach((view, key) => {
      const previousView = previous.byId.get(key)
      labelsById.set(
        key,
        previousView && isLabelViewEqual(previousView, view)
          ? previousView
          : view
      )
    })

    if (nextLabels.ids.length === 0) {
      keysByEdge.delete(edgeId)
    } else {
      keysByEdge.set(edgeId, nextLabels.ids)
    }

    const membershipChanged =
      previousKeys.length !== nextLabels.ids.length
      || previousKeys.some((key) => !nextKeySet.has(key))
      || nextLabels.ids.some((key) => !previousKeySet.has(key))
    if (membershipChanged) {
      labelIds = replaceIdSegment(labelIds, previousKeys, nextLabels.ids)
      context.working.phase.render.edge.labelsIds = true
    }

    changedKeys.forEach(({ key, previous: previousView, next }) => {
      writeLabelDelta({
        context,
        key,
        previous: previousView,
        next
      })
      count += 1
    })
  })

  if (!changed) {
    return 0
  }

  context.working.render.labels = {
    ids: labelIds,
    byId: labelsById,
    keysByEdge
  }
  return count
}
