import { nodeLayout, nodeSpec } from '@whiteboard/react/features/node'
import { toolbarSpec } from '@whiteboard/react/features/selection/chrome/toolbar/spec'

export const whiteboardSpec = {
  nodes: nodeSpec,
  layout: nodeLayout,
  toolbar: toolbarSpec
} as const
