import type { InteractionMode } from '@whiteboard/editor/input/core/types'

export const isEdgeInteractionMode = (
  mode: InteractionMode
): boolean => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)
