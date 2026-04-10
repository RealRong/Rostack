import type {
  NodeAppearanceMutations,
  NodePatchWriter
} from './types'
import { styleUpdate } from './patch'

export const createNodeAppearanceMutations = ({
  document
}: {
  document: NodePatchWriter
}): NodeAppearanceMutations => ({
  setFill: (nodeIds, fill) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: styleUpdate('fill', fill)
    }))
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
