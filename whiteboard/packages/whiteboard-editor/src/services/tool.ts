import { json } from '@shared/core'
import type {
  EdgeTemplate
} from '@whiteboard/core/types'
import type {
  DrawMode
} from '@whiteboard/editor/session/draw/model'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  InsertTemplate,
  Tool
} from '@whiteboard/editor/types/tool'

export interface ToolService {
  set(tool: Tool): void
  select(): void
  draw(mode: DrawMode): void
  edge(template: EdgeTemplate): void
  insert(template: InsertTemplate): void
  hand(): void
}

const stringifyToolPayload = (
  tool: Tool
) => {
  switch (tool.type) {
    case 'edge':
    case 'insert':
      return json.stableStringify(tool.template)
    case 'draw':
      return tool.mode
    default:
      return tool.type
  }
}

const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge'
        && stringifyToolPayload(left) === stringifyToolPayload(right)
    case 'insert':
      return right.type === 'insert'
        && stringifyToolPayload(left) === stringifyToolPayload(right)
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

export const createToolService = ({
  session
}: {
  session: Pick<EditorSession, 'state' | 'mutate'>
}): ToolService => {
  const set = (
    nextTool: Tool
  ) => {
    const currentTool = session.state.tool.get()
    const toolChanged = !isSameTool(currentTool, nextTool)

    if (toolChanged || nextTool.type === 'draw') {
      session.mutate.edit.clear()
      session.mutate.selection.clear()
    }

    if (!toolChanged) {
      return
    }

    session.mutate.tool.set(nextTool)
  }

  return {
    set,
    select: () => {
      set({
        type: 'select'
      })
    },
    draw: (mode) => {
      set({
        type: 'draw',
        mode
      })
    },
    edge: (template) => {
      set({
        type: 'edge',
        template
      })
    },
    insert: (template) => {
      set({
        type: 'insert',
        template
      })
    },
    hand: () => {
      set({
        type: 'hand'
      })
    }
  }
}
