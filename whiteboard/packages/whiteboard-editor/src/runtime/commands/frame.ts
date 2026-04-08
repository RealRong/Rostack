import {
  createFrameNodeInput
} from '@whiteboard/core/node'
import type { Editor, EditorFrameCommands } from '../../types/editor'

const DEFAULT_FRAME_PADDING = 32

type FrameCommandHost = {
  commands: {
    node: Pick<Editor['commands']['node'], 'create'>
    selection: Editor['commands']['selection']
  }
}

export const createFrameCommands = ({
  commands
}: FrameCommandHost): EditorFrameCommands => ({
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
