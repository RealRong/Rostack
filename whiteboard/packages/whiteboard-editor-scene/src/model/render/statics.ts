import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeStaticId, EdgeStaticView } from '../../contracts/render'
import type { WorkingState } from '../../contracts/working'
import type { RenderContext } from './context'

const STATIC_CHUNK_SIZE = 256

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

const isStaticStyleEqual = (
  left: EdgeStaticView['style'],
  right: EdgeStaticView['style']
): boolean => (
  left.color === right.color
  && left.width === right.width
  && left.opacity === right.opacity
  && left.dash === right.dash
  && left.start === right.start
  && left.end === right.end
)

const isStaticViewEqual = (
  left: EdgeStaticView,
  right: EdgeStaticView
): boolean => (
  left.id === right.id
  && left.styleKey === right.styleKey
  && isStaticStyleEqual(left.style, right.style)
  && equal.sameOrder(
    left.paths,
    right.paths,
    (currentLeft, currentRight) => (
      currentLeft.id === currentRight.id
      && currentLeft.svgPath === currentRight.svgPath
    )
  )
)

const readRenderableEdge = (
  working: WorkingState,
  edgeId: EdgeId
) => {
  const edge = working.graph.edges.get(edgeId)
  if (!edge?.route.svgPath) {
    return undefined
  }

  return edge
}

const readEdgeStaticStyleKey = (
  working: WorkingState,
  edgeId: EdgeId
): string | undefined => {
  const edge = readRenderableEdge(working, edgeId)
  return edge
    ? edgeApi.render.styleKey(edge.base.edge.style)
    : undefined
}

const readStaticStyleOrder = (
  working: WorkingState
): readonly string[] => {
  const order: string[] = []
  const seen = new Set<string>()

  forEachSceneItem(working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const styleKey = readEdgeStaticStyleKey(working, item.id)
    if (!styleKey || seen.has(styleKey)) {
      return
    }

    seen.add(styleKey)
    order.push(styleKey)
  })

  return order
}

const buildStaticBucket = (input: {
  working: WorkingState
  styleKey: string
}) => {
  let style: EdgeStaticView['style'] | undefined
  const paths: EdgeStaticView['paths'][number][] = []

  forEachSceneItem(input.working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edge = readRenderableEdge(input.working, item.id)
    if (!edge) {
      return
    }

    const styleKey = edgeApi.render.styleKey(edge.base.edge.style)
    if (styleKey !== input.styleKey) {
      return
    }

    style ??= edgeApi.render.staticStyle(edge.base.edge.style)
    paths.push({
      id: item.id,
      svgPath: edge.route.svgPath!
    })
  })

  if (!style || paths.length === 0) {
    return undefined
  }

  const edgeIds = paths.map((path) => path.id)
  const staticIds: EdgeStaticId[] = []
  const staticIdByEdge = new Map<EdgeId, EdgeStaticId>()
  const byId = new Map<EdgeStaticId, EdgeStaticView>()

  for (let index = 0; index < paths.length; index += STATIC_CHUNK_SIZE) {
    const chunkPaths = paths.slice(index, index + STATIC_CHUNK_SIZE)
    const chunkIndex = Math.floor(index / STATIC_CHUNK_SIZE)
    const staticId = `${input.styleKey}:${chunkIndex}`

    staticIds.push(staticId)
    byId.set(staticId, {
      id: staticId,
      styleKey: input.styleKey,
      style,
      paths: chunkPaths
    })

    chunkPaths.forEach((path) => {
      staticIdByEdge.set(path.id, staticId)
    })
  }

  return {
    edgeIds,
    staticIds,
    staticIdByEdge,
    byId
  }
}

const buildStaticState = (
  working: WorkingState
) => {
  const styleKeyByEdge = new Map<EdgeId, string>()
  const edgeIdsByStyleKey = new Map<string, readonly EdgeId[]>()
  const staticIdByEdge = new Map<EdgeId, EdgeStaticId>()
  const staticIdsByStyleKey = new Map<string, readonly EdgeStaticId[]>()
  const byId = new Map<EdgeStaticId, EdgeStaticView>()
  const styleOrder = readStaticStyleOrder(working)
  const ids: EdgeStaticId[] = []

  styleOrder.forEach((styleKey) => {
    const bucket = buildStaticBucket({
      working,
      styleKey
    })
    if (!bucket) {
      return
    }

    bucket.edgeIds.forEach((edgeId) => {
      styleKeyByEdge.set(edgeId, styleKey)
    })
    edgeIdsByStyleKey.set(styleKey, bucket.edgeIds)
    staticIdsByStyleKey.set(styleKey, bucket.staticIds)
    bucket.staticIdByEdge.forEach((staticId, edgeId) => {
      staticIdByEdge.set(edgeId, staticId)
    })
    bucket.byId.forEach((view, staticId) => {
      byId.set(staticId, view)
    })
    ids.push(...bucket.staticIds)
  })

  return {
    ids,
    byId,
    styleKeyByEdge,
    edgeIdsByStyleKey,
    staticIdByEdge,
    staticIdsByStyleKey
  }
}

const writeStaticDelta = (input: {
  context: RenderContext
  staticId: EdgeStaticId
  previous: EdgeStaticView | undefined
  next: EdgeStaticView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.delta.render.edge.statics, input.staticId)
    input.context.working.delta.render.edge.staticsIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.delta.render.edge.statics, input.staticId)
    input.context.working.delta.render.edge.staticsIds = true
    return
  }

  idDelta.update(input.context.working.delta.render.edge.statics, input.staticId)
}

export const patchRenderStatics = (
  context: RenderContext
): number => {
  if (!context.reset && context.touched.edge.statics.size === 0) {
    return 0
  }

  const previous = context.working.render.statics
  if (context.reset) {
    const built = buildStaticState(context.working)
    const nextById = new Map<EdgeStaticId, EdgeStaticView>()
    let count = 0

    built.byId.forEach((view, staticId) => {
      const previousView = previous.byId.get(staticId)
      nextById.set(
        staticId,
        previousView && isStaticViewEqual(previousView, view)
          ? previousView
          : view
      )
    })

    new Set<EdgeStaticId>([
      ...previous.ids,
      ...built.ids
    ]).forEach((staticId) => {
      const previousView = previous.byId.get(staticId)
      const nextView = nextById.get(staticId)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isStaticViewEqual(previousView, nextView)
        )
      ) {
        writeStaticDelta({
          context,
          staticId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    if (!equal.sameOrder(previous.ids, built.ids, (left, right) => left === right)) {
      context.working.delta.render.edge.staticsIds = true
    }

    context.working.render.statics = {
      ids: built.ids,
      byId: nextById,
      styleKeyByEdge: built.styleKeyByEdge,
      edgeIdsByStyleKey: built.edgeIdsByStyleKey,
      staticIdByEdge: built.staticIdByEdge,
      staticIdsByStyleKey: built.staticIdsByStyleKey
    }
    return count
  }

  const touchedStyleKeys = new Set<string>()
  context.touched.edge.statics.forEach((edgeId) => {
    const previousStyleKey = previous.styleKeyByEdge.get(edgeId)
    if (previousStyleKey) {
      touchedStyleKeys.add(previousStyleKey)
    }

    const nextStyleKey = readEdgeStaticStyleKey(context.working, edgeId)
    if (nextStyleKey) {
      touchedStyleKeys.add(nextStyleKey)
    }
  })

  if (touchedStyleKeys.size === 0) {
    return 0
  }

  const nextById = new Map(previous.byId)
  const nextStyleKeyByEdge = new Map(previous.styleKeyByEdge)
  const nextEdgeIdsByStyleKey = new Map(previous.edgeIdsByStyleKey)
  const nextStaticIdByEdge = new Map(previous.staticIdByEdge)
  const nextStaticIdsByStyleKey = new Map(previous.staticIdsByStyleKey)
  let count = 0

  touchedStyleKeys.forEach((styleKey) => {
    const previousStaticIds = previous.staticIdsByStyleKey.get(styleKey) ?? []
    const previousEdgeIds = previous.edgeIdsByStyleKey.get(styleKey) ?? []
    const nextBucket = buildStaticBucket({
      working: context.working,
      styleKey
    })

    previousEdgeIds.forEach((edgeId) => {
      nextStyleKeyByEdge.delete(edgeId)
      nextStaticIdByEdge.delete(edgeId)
    })

    if (!nextBucket) {
      nextEdgeIdsByStyleKey.delete(styleKey)
      nextStaticIdsByStyleKey.delete(styleKey)
    } else {
      nextEdgeIdsByStyleKey.set(styleKey, nextBucket.edgeIds)
      nextStaticIdsByStyleKey.set(styleKey, nextBucket.staticIds)
      nextBucket.edgeIds.forEach((edgeId) => {
        nextStyleKeyByEdge.set(edgeId, styleKey)
      })
      nextBucket.staticIdByEdge.forEach((staticId, edgeId) => {
        nextStaticIdByEdge.set(edgeId, staticId)
      })
    }

    new Set<EdgeStaticId>([
      ...previousStaticIds,
      ...(nextBucket?.staticIds ?? [])
    ]).forEach((staticId) => {
      const previousView = previous.byId.get(staticId)
      const nextCandidate = nextBucket?.byId.get(staticId)
      const nextView = previousView && nextCandidate && isStaticViewEqual(previousView, nextCandidate)
        ? previousView
        : nextCandidate

      if (nextView === undefined) {
        nextById.delete(staticId)
      } else {
        nextById.set(staticId, nextView)
      }

      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isStaticViewEqual(previousView, nextView)
        )
      ) {
        writeStaticDelta({
          context,
          staticId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })
  })

  const nextIds = readStaticStyleOrder(context.working).flatMap((styleKey) => (
    nextStaticIdsByStyleKey.get(styleKey) ?? []
  ))
  if (!equal.sameOrder(previous.ids, nextIds, (left, right) => left === right)) {
    context.working.delta.render.edge.staticsIds = true
  }

  context.working.render.statics = {
    ids: nextIds,
    byId: nextById,
    styleKeyByEdge: nextStyleKeyByEdge,
    edgeIdsByStyleKey: nextEdgeIdsByStyleKey,
    staticIdByEdge: nextStaticIdByEdge,
    staticIdsByStyleKey: nextStaticIdsByStyleKey
  }

  return count
}
