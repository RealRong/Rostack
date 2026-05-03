import { entityTable } from '@shared/core'
import type {
  Edge,
  EdgeLabel,
  EdgePatch
} from '@whiteboard/core/types'
import { sameEdgeEnd } from '@whiteboard/core/edge/equality'

const hasOwn = (
  target: object,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const cloneEdgeLabels = (
  labels: readonly EdgeLabel[]
): import('@shared/core').EntityTable<string, EdgeLabel> => entityTable.normalize.list(labels.map((label) => ({
  id: label.id,
  text: label.text,
  t: label.t,
  offset: label.offset,
  style: label.style ? { ...label.style } : undefined,
  data: label.data ? { ...label.data } : undefined
})))

export const isEdgePatchEqual = (
  left?: EdgePatch,
  right?: EdgePatch
) => (
  left?.type === right?.type
  && sameEdgeEnd(left?.source, right?.source)
  && sameEdgeEnd(left?.target, right?.target)
  && left?.points === right?.points
  && left?.style === right?.style
  && left?.textMode === right?.textMode
  && left?.labels === right?.labels
  && left?.data === right?.data
)

export const applyEdgePatch = (
  edge: Edge,
  patch?: EdgePatch
): Edge => {
  if (!patch) {
    return edge
  }

  let next = edge

  if (patch.type && patch.type !== next.type) {
    next = {
      ...next,
      type: patch.type
    }
  }

  if (patch.source && patch.source !== next.source) {
    next = {
      ...next,
      source: patch.source
    }
  }

  if (patch.target && patch.target !== next.target) {
    next = {
      ...next,
      target: patch.target
    }
  }

  if (hasOwn(patch, 'points') && patch.points !== undefined) {
    const currentPoints = next.points
      ? entityTable.read.list(next.points)
      : []
    next = {
      ...next,
      points: entityTable.normalize.list(patch.points.map((point, index) => ({
        id: currentPoints[index]?.id ?? `preview:${index}`,
        x: point.x,
        y: point.y
      })))
    }
  }

  if (hasOwn(patch, 'points') && patch.points === undefined && next.points !== undefined) {
    next = {
      ...next,
      points: undefined
    }
  }

  if (patch.style && patch.style !== next.style) {
    next = {
      ...next,
      style: {
        ...patch.style
      }
    }
  }

  if (patch.textMode !== undefined && patch.textMode !== next.textMode) {
    next = {
      ...next,
      textMode: patch.textMode
    }
  }

  if (patch.labels) {
    next = {
      ...next,
      labels: cloneEdgeLabels(patch.labels)
    }
  }

  if (patch.data && patch.data !== next.data) {
    next = {
      ...next,
      data: {
        ...patch.data
      }
    }
  }

  if (
    hasOwn(patch, 'locked')
    && patch.locked !== next.locked
  ) {
    next = {
      ...next,
      locked: patch.locked
    }
  }

  return next
}
