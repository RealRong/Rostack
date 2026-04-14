import type {
  Edge,
  EdgeLabel,
  EdgePatch
} from '@whiteboard/core/types'
import { sameEdgeEnd } from '@whiteboard/core/edge/equality'

const cloneEdgeLabels = (
  labels: readonly EdgeLabel[]
): EdgeLabel[] => labels.map((label) => ({
  id: label.id,
  text: label.text,
  t: label.t,
  offset: label.offset,
  style: label.style ? { ...label.style } : undefined
}))

export const isEdgePatchEqual = (
  left?: EdgePatch,
  right?: EdgePatch
) => (
  left?.type === right?.type
  && sameEdgeEnd(left?.source, right?.source)
  && sameEdgeEnd(left?.target, right?.target)
  && left?.route === right?.route
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

  if (patch.route && patch.route !== next.route) {
    next = {
      ...next,
      route:
        patch.route.kind === 'manual'
          ? {
              kind: 'manual',
              points: [...patch.route.points]
            }
          : {
              kind: 'auto'
            }
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

  if (patch.labels && patch.labels !== next.labels) {
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

  return next
}
