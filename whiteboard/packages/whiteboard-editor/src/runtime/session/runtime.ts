import type { Engine } from '@whiteboard/engine'
import {
  applySelectionTarget,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { EditorRead } from '../../types/editor'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import { isSameTool } from '../../tool/model'
import type { RuntimeStateController } from '../state'
import {
  readEdgeLabelEditStyle,
  readNodeEditStyle,
  type EditCapability,
  type EditField
} from '../state/edit'
import type { SessionRuntime } from './types'

const DEFAULT_EDGE_LABEL_CAPABILITY: EditCapability = {
  tools: ['size', 'weight', 'italic', 'color', 'background'],
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

export const createSessionRuntime = ({
  engine,
  runtime,
  read,
  registry
}: {
  engine: Engine
  runtime: Pick<RuntimeStateController, 'state'>
  read: EditorRead
  registry: Pick<NodeRegistry, 'get'>
}): SessionRuntime => {
  const writeSelection = (input: {
    next: SelectionTarget
    apply: () => void
  }) => {
    if (isSelectionTargetEqual(runtime.state.selection.source.get(), input.next)) {
      return
    }

    runtime.state.edit.mutate.clear()
    input.apply()
  }

  const startNode: SessionRuntime['edit']['startNode'] = (
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
    const style = readNodeEditStyle(item.node)

    runtime.state.edit.mutate.set({
      kind: 'node',
      nodeId,
      field,
      initial: {
        text,
        style
      },
      draft: {
        text,
        style
      },
      layout: {
        baseRect: item.rect,
        liveSize: {
          width: item.rect.width,
          height: item.rect.height
        },
        wrapWidth: item.rect.width,
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities
    })
  }

  const startEdgeLabel: SessionRuntime['edit']['startEdgeLabel'] = (
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
    const style = readEdgeLabelEditStyle(label)

    runtime.state.edit.mutate.set({
      kind: 'edge-label',
      edgeId,
      labelId,
      initial: {
        text,
        style
      },
      draft: {
        text,
        style
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
        writeSelection({
          next: normalizeSelectionTarget(input),
          apply: () => {
            runtime.state.selection.mutate.replace(input)
          }
        })
      },
      add: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'add'),
          apply: () => {
            runtime.state.selection.mutate.add(input)
          }
        })
      },
      remove: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'subtract'),
          apply: () => {
            runtime.state.selection.mutate.remove(input)
          }
        })
      },
      toggle: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'toggle'),
          apply: () => {
            runtime.state.selection.mutate.toggle(input)
          }
        })
      },
      selectAll: () => {
        const next = normalizeSelectionTarget({
          nodeIds: [...engine.read.node.list.get()],
          edgeIds: [...engine.read.edge.list.get()]
        })
        writeSelection({
          next,
          apply: () => {
            runtime.state.selection.mutate.replace(next)
          }
        })
      },
      clear: () => {
        writeSelection({
          next: normalizeSelectionTarget({}),
          apply: () => {
            runtime.state.selection.mutate.clear()
          }
        })
      }
    },
    edit: {
      startNode,
      startEdgeLabel,
      input: runtime.state.edit.mutate.input,
      caret: runtime.state.edit.mutate.caret,
      style: runtime.state.edit.mutate.style,
      measure: runtime.state.edit.mutate.measure,
      clear: runtime.state.edit.mutate.clear
    }
  }
}
