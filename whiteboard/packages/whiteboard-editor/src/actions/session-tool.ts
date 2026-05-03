import { json } from '@shared/core'
import type { ToolActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import type { Tool } from '@whiteboard/editor/schema/tool'

const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
    case 'insert':
      return json.stableStringify(left.template) === json.stableStringify(
        right.type === left.type
          ? right.template
          : undefined
      )
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

const setTool = (
  context: EditorActionContext,
  nextTool: Tool
) => {
  const currentTool = context.stores.tool.get()
  const toolChanged = !isSameTool(currentTool, nextTool)

  context.state.write(({
    writer
  }) => {
    if (toolChanged || nextTool.type === 'draw') {
      writer.edit.clear()
      writer.selection.clear()
    }

    if (toolChanged) {
      writer.tool.set(nextTool)
    }
  })
}

export const createSessionToolActions = (
  context: EditorActionContext
): ToolActions => ({
  set: (tool) => {
    setTool(context, tool)
  },
  select: () => {
    setTool(context, {
      type: 'select'
    })
  },
  draw: (mode) => {
    setTool(context, {
      type: 'draw',
      mode
    })
  },
  edge: (template) => {
    setTool(context, {
      type: 'edge',
      template
    })
  },
  insert: (template) => {
    setTool(context, {
      type: 'insert',
      template
    })
  },
  hand: () => {
    setTool(context, {
      type: 'hand'
    })
  }
})
