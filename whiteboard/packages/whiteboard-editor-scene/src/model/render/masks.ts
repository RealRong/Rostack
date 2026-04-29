import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeMaskView } from '../../contracts/render'
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

const isMaskRectEqual = (
  left: EdgeMaskView['rects'][number],
  right: EdgeMaskView['rects'][number]
): boolean => (
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
  && left.radius === right.radius
  && left.angle === right.angle
  && geometryApi.equal.point(left.center, right.center)
)

const isMaskViewEqual = (
  left: EdgeMaskView,
  right: EdgeMaskView
): boolean => (
  left.edgeId === right.edgeId
  && equal.sameOrder(left.rects, right.rects, isMaskRectEqual)
)

const buildEdgeMask = (input: {
  working: WorkingState
  edgeId: EdgeId
}): EdgeMaskView | undefined => {
  const edge = input.working.graph.edges.get(input.edgeId)
  if (!edge || edge.route.labels.length === 0) {
    return undefined
  }

  return {
    edgeId: input.edgeId,
    rects: edge.route.labels.map((label) => label.maskRect)
  }
}

const buildMaskState = (
  working: WorkingState
) => {
  const ids: EdgeId[] = []
  const byId = new Map<EdgeId, EdgeMaskView>()

  forEachSceneItem(working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const mask = buildEdgeMask({
      working,
      edgeId: item.id
    })
    if (!mask) {
      return
    }

    ids.push(item.id)
    byId.set(item.id, mask)
  })

  return {
    ids,
    byId
  }
}

const writeMaskDelta = (input: {
  context: RenderContext
  edgeId: EdgeId
  previous: EdgeMaskView | undefined
  next: EdgeMaskView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.delta.render.edge.masks, input.edgeId)
    input.context.working.delta.render.edge.masksIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.delta.render.edge.masks, input.edgeId)
    input.context.working.delta.render.edge.masksIds = true
    return
  }

  idDelta.update(input.context.working.delta.render.edge.masks, input.edgeId)
}

export const patchRenderMasks = (
  context: RenderContext
): number => {
  if (!context.reset && context.touched.edge.masks.size === 0) {
    return 0
  }

  const previous = context.working.render.masks
  if (context.reset) {
    const built = buildMaskState(context.working)
    const nextById = new Map<EdgeId, EdgeMaskView>()
    let count = 0

    built.byId.forEach((view, edgeId) => {
      const previousView = previous.byId.get(edgeId)
      nextById.set(
        edgeId,
        previousView && isMaskViewEqual(previousView, view)
          ? previousView
          : view
      )
    })

    new Set<EdgeId>([
      ...previous.ids,
      ...built.ids
    ]).forEach((edgeId) => {
      const previousView = previous.byId.get(edgeId)
      const nextView = nextById.get(edgeId)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isMaskViewEqual(previousView, nextView)
        )
      ) {
        writeMaskDelta({
          context,
          edgeId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    if (!equal.sameOrder(previous.ids, built.ids, (left, right) => left === right)) {
      context.working.delta.render.edge.masksIds = true
    }

    context.working.render.masks = {
      ids: built.ids,
      byId: nextById
    }
    return count
  }

  const masksById = new Map(previous.byId)
  let maskIds = previous.ids
  let changed = false
  let count = 0

  context.touched.edge.masks.forEach((edgeId) => {
    const previousView = previous.byId.get(edgeId)
    const nextCandidate = buildEdgeMask({
      working: context.working,
      edgeId
    })
    const nextView = previousView && nextCandidate && isMaskViewEqual(previousView, nextCandidate)
      ? previousView
      : nextCandidate

    if (
      !(
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isMaskViewEqual(previousView, nextView)
        )
      )
    ) {
      return
    }

    changed = true

    if (nextView === undefined) {
      masksById.delete(edgeId)
      maskIds = maskIds.filter((id) => id !== edgeId)
      context.working.delta.render.edge.masksIds = true
    } else {
      masksById.set(edgeId, nextView)
      if (previousView === undefined) {
        maskIds = [...maskIds, edgeId]
        context.working.delta.render.edge.masksIds = true
      }
    }

    writeMaskDelta({
      context,
      edgeId,
      previous: previousView,
      next: nextView
    })
    count += 1
  })

  if (!changed) {
    return 0
  }

  context.working.render.masks = {
    ids: maskIds,
    byId: masksById
  }
  return count
}
