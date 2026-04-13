import { readTextWrapWidth } from '@whiteboard/core/node'
import type { EditorQueryRead } from '#whiteboard-editor/query'
import type { SessionActions } from '#whiteboard-editor/types/commands'
import type { NodeRegistry } from '#whiteboard-editor/types/node'
import {
  type EditCapability,
  type EditField
} from '#whiteboard-editor/local/session/edit'
import type { EditorLocalState } from '#whiteboard-editor/local/runtime'

export type LocalEditActions = SessionActions['edit']

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

export const createLocalEditActions = ({
  state,
  registry,
  getRead
}: {
  state: Pick<EditorLocalState, 'edit'>
  registry: Pick<NodeRegistry, 'get'>
  getRead: () => Pick<EditorQueryRead, 'node' | 'edge'> | null
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
    input: state.edit.mutate.input,
    caret: state.edit.mutate.caret,
    measure: state.edit.mutate.measure,
    clear: state.edit.mutate.clear
  }
}
