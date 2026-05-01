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
  nodeIds: [...editor.projection.runtime.editor.selection().nodeIds],
  edgeIds: [...editor.projection.runtime.editor.selection().edgeIds]
})

export const serializePresenceTool = (
  tool: Tool
): WhiteboardPresenceTool => {
  switch (tool.type) {
    case 'edge':
      return {
        type: tool.type,
        value: tool.template.type
      }
    case 'insert':
      return {
        type: tool.type,
        value: tool.template.kind
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
  editor.projection.runtime.editor.edit()
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
