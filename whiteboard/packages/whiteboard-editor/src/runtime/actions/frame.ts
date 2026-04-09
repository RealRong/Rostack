import {
  createFrameNodeInput
} from '@whiteboard/core/node'
import type { NodeInput } from '@whiteboard/core/types'
import type { CommandResult } from '@engine-types/result'
import type { FrameActions } from '../../internal/types'

const DEFAULT_FRAME_PADDING = 32

type FrameActionHost = {
  commands: {
    node: {
      create: (input: NodeInput) => CommandResult<{ nodeId: string }>
    }
    selection: {
      replace: (input: {
        nodeIds?: readonly string[]
        edgeIds?: readonly string[]
      }) => void
    }
  }
}

export const createFramesActions = ({
  commands
}: FrameActionHost): FrameActions => ({
  createFromBounds: (bounds, options) => {
    const padding = options?.padding ?? DEFAULT_FRAME_PADDING
    const frame = createFrameNodeInput()
    const result = commands.node.create({
      ...frame,
      position: {
        x: bounds.x - padding,
        y: bounds.y - padding
      },
      size: {
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2
      }
    })
    if (!result.ok) {
      return false
    }

    commands.selection.replace({
      nodeIds: [result.data.nodeId]
    })
    return true
  }
})
