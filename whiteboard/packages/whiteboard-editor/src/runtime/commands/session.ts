import { readTextWrapWidth } from '@whiteboard/core/node'
import type { EditorRead } from '../../types/editor'
import type { SessionActions } from '../../types/commands'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { EditorStateController } from '../state'
import {
  type EditCapability,
  type EditField
} from '../state/edit'

export type SessionCommands = SessionActions

const DEFAULT_EDGE_LABEL_CAPABILITY: EditCapability = {
  placeholder: 'Label',
  multiline: true,
  empty: 'remove',
  measure: 'none'
}

const resolveNodeCapability = ({
  registry,
  nodeType,
  field
}: {
  registry: Pick<NodeRegistry, 'get'>
  nodeType: Parameters<Pick<NodeRegistry, 'get'>['get']>[0]
  field: EditField
}) => registry.get(nodeType)?.edit?.fields?.[field]

const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge' && left.preset === right.preset
    case 'insert':
      return right.type === 'insert' && left.preset === right.preset
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

export const createSessionCommands = ({
  runtime,
  read,
  registry
}: {
  runtime: Pick<EditorStateController, 'state'>
  read: EditorRead
  registry: Pick<NodeRegistry, 'get'>
}): SessionCommands => {
  const writeSelection = (
    apply: () => boolean
  ) => {
    if (!apply()) {
      return
    }

    runtime.state.edit.mutate.clear()
  }

  const startNode: SessionCommands['edit']['startNode'] = (
    nodeId,
    field,
    options
  ) => {
    const item = read.node.item.get(nodeId)
    if (!item) {
      return
    }

    const capabilities = resolveNodeCapability({
      registry,
      nodeType: item.node.type,
      field
    })
    if (!capabilities) {
      return
    }

    const text = typeof item.node.data?.[field] === 'string'
      ? item.node.data[field] as string
      : ''

    runtime.state.edit.mutate.set({
      kind: 'node',
      nodeId,
      field,
      initial: {
        text
      },
      draft: {
        text
      },
      layout: {
        baseRect: item.rect,
        liveSize: {
          width: item.rect.width,
          height: item.rect.height
        },
        wrapWidth: readTextWrapWidth(item.node),
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities
    })
  }

  const startEdgeLabel: SessionCommands['edit']['startEdgeLabel'] = (
    edgeId,
    labelId,
    options
  ) => {
    const edge = read.edge.item.get(edgeId)?.edge
    const label = edge?.labels?.find((entry) => entry.id === labelId)
    if (!edge || !label) {
      return
    }

    const text = typeof label.text === 'string' ? label.text : ''

    runtime.state.edit.mutate.set({
      kind: 'edge-label',
      edgeId,
      labelId,
      initial: {
        text
      },
      draft: {
        text
      },
      layout: {
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities: DEFAULT_EDGE_LABEL_CAPABILITY
    })
  }

  return {
    tool: {
      set: (nextTool: Tool) => {
        if (nextTool.type === 'draw') {
          runtime.state.edit.mutate.clear()
          runtime.state.selection.mutate.clear()
        }
        if (isSameTool(runtime.state.tool.get(), nextTool)) {
          return
        }
        runtime.state.tool.set(nextTool)
      }
    },
    selection: {
      replace: (input) => {
        writeSelection(() => runtime.state.selection.mutate.replace(input))
      },
      add: (input) => {
        writeSelection(() => runtime.state.selection.mutate.apply('add', input))
      },
      remove: (input) => {
        writeSelection(() => runtime.state.selection.mutate.apply('subtract', input))
      },
      toggle: (input) => {
        writeSelection(() => runtime.state.selection.mutate.apply('toggle', input))
      },
      selectAll: () => {
        writeSelection(() => runtime.state.selection.mutate.selectAll(read))
      },
      clear: () => {
        writeSelection(() => runtime.state.selection.mutate.clear())
      }
    },
    edit: {
      startNode,
      startEdgeLabel,
      input: runtime.state.edit.mutate.input,
      caret: runtime.state.edit.mutate.caret,
      measure: runtime.state.edit.mutate.measure,
      clear: runtime.state.edit.mutate.clear
    }
  }
}
