import { compileNodeFieldUpdates } from '@whiteboard/core/schema'
import type { EngineInstance } from '@engine-types/instance'
import type {
  NodeAppearanceMutations,
  NodePatchWriter
} from '../../../internal/types'
import { styleUpdate } from './document'

export const createNodeAppearanceMutations = ({
  engine,
  document
}: {
  engine: EngineInstance
  document: NodePatchWriter
}): NodeAppearanceMutations => ({
  setFill: (nodeIds, fill) => document.updateMany(
    nodeIds.map((id) => {
      const node = engine.read.node.item.get(id)?.node

      return {
        id,
        update:
          node?.type === 'sticky'
            ? compileNodeFieldUpdates([
                {
                  field: {
                    scope: 'style',
                    path: 'fill'
                  },
                  value: fill
                },
                {
                  field: {
                    scope: 'data',
                    path: 'background'
                  },
                  value: fill
                }
              ])
            : styleUpdate('fill', fill)
      }
    })
  ),
  setFillOpacity: (nodeIds, opacity) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('fillOpacity', opacity)
    }))
  ),
  setStroke: (nodeIds, stroke) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('stroke', stroke)
    }))
  ),
  setStrokeWidth: (nodeIds, width) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('strokeWidth', width)
    }))
  ),
  setStrokeOpacity: (nodeIds, opacity) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('strokeOpacity', opacity)
    }))
  ),
  setStrokeDash: (nodeIds, dash) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('strokeDash', dash)
    }))
  ),
  setOpacity: (nodeIds, opacity) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('opacity', opacity)
    }))
  ),
  setTextColor: (nodeIds, color) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('color', color)
    }))
  )
})
