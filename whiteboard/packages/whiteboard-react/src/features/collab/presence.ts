import type { Tool } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type {
  WhiteboardPresenceActivity,
  WhiteboardPresenceState,
  WhiteboardPresenceTool
} from '@whiteboard/react/types/common/presence'

export const getSelectionSnapshot = (
  editor: WhiteboardRuntime
) => ({
  nodeIds: [...editor.store.selection.get().nodeIds],
  edgeIds: [...editor.store.selection.get().edgeIds]
})

export const serializePresenceTool = (
  tool: Tool
): WhiteboardPresenceTool => {
  switch (tool.type) {
    case 'edge':
    case 'insert':
      return {
        type: tool.type,
        value: tool.preset
      }
    case 'draw':
      return {
        type: tool.type,
        value: tool.mode
      }
    default:
      return {
        type: tool.type
      }
  }
}

export const resolvePresenceActivity = (
  editor: WhiteboardRuntime,
  fallback: WhiteboardPresenceActivity = 'idle'
): WhiteboardPresenceActivity => (
  editor.store.edit.get()
    ? 'editing'
    : fallback
)

export const formatPresenceToolLabel = (
  tool: WhiteboardPresenceState['tool']
) => {
  if (!tool) {
    return 'select'
  }

  switch (tool.type) {
    case 'edge':
    case 'insert':
    case 'draw':
      return `${tool.type}:${tool.value ?? ''}`
    default:
      return tool.type
  }
}
