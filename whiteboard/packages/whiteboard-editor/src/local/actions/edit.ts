import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { SessionActions } from '@whiteboard/editor/types/commands'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import {
  type EditCapability,
  type EditField
} from '@whiteboard/editor/local/session/edit'
import type { EditorLocalState } from '@whiteboard/editor/local/runtime'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'

export type LocalEditActions = SessionActions['edit']

const DEFAULT_EDGE_LABEL_CAPABILITY: EditCapability = {
  placeholder: 'Label',
  multiline: true,
  empty: 'remove'
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

export const createLocalEditActions = ({
  state,
  registry,
  getRead,
  getLayout
}: {
  state: Pick<EditorLocalState, 'edit'>
  registry: Pick<NodeRegistry, 'get'>
  getRead: () => Pick<EditorQueryRead, 'node' | 'edge'> | null
  getLayout: () => LayoutRuntime | null
}): LocalEditActions => {
  const startNode: LocalEditActions['startNode'] = (
    nodeId,
    field,
    options
  ) => {
    const read = getRead()
    if (!read) {
      return
    }

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
    const layout = getLayout()
    const nextLayout = layout?.editNode({
      nodeId,
      field,
      text
    })

    state.edit.mutate.set({
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
        size: nextLayout?.size ?? {
          width: item.rect.width,
          height: item.rect.height
        },
        fontSize: nextLayout?.fontSize ?? (
          typeof item.node.style?.fontSize === 'number'
            ? item.node.style.fontSize
            : undefined
        ),
        wrapWidth: nextLayout?.wrapWidth,
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities
    })
  }

  const startEdgeLabel: LocalEditActions['startEdgeLabel'] = (
    edgeId,
    labelId,
    options
  ) => {
    const read = getRead()
    if (!read) {
      return
    }

    const edge = read.edge.item.get(edgeId)?.edge
    const label = edge?.labels?.find((entry) => entry.id === labelId)
    if (!edge || !label) {
      return
    }

    const text = typeof label.text === 'string' ? label.text : ''

    state.edit.mutate.set({
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
    startNode,
    startEdgeLabel,
    input: (text) => {
      state.edit.mutate.input(text)

      const current = state.edit.source.get()
      if (!current || current.kind !== 'node') {
        return
      }

      const layout = getLayout()
      const nextLayout = layout?.editNode({
        nodeId: current.nodeId,
        field: current.field,
        text
      })
      state.edit.mutate.layout(nextLayout ?? {})
    },
    caret: state.edit.mutate.caret,
    layout: state.edit.mutate.layout,
    clear: state.edit.mutate.clear
  }
}
