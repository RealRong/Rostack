import type { EdgeLabel } from '@whiteboard/core/types'
import type { EditorActionContext } from '@whiteboard/editor/actions'
import type {
  EditorEditActions,
  MindmapInsertBehavior
} from '@whiteboard/editor/actions/types'
import type { EditField, EditSession } from '@whiteboard/editor/schema/edit'

const resolveNodeCommitValue = (input: {
  text: string
  empty: 'default' | 'keep' | 'remove'
  defaultText?: string
}) => (
  input.empty === 'default' && !input.text.trim()
    ? (input.defaultText ?? '')
    : input.text
)

type StartNodeEditInput = {
  nodeId: string
  field: EditField
  caret?: Parameters<EditorEditActions['startNode']>[2] extends infer TOptions
    ? TOptions extends { caret?: infer TCaret }
      ? TCaret
      : never
    : never
}

type StartEdgeLabelEditInput = {
  edgeId: string
  labelId: string
  caret?: Parameters<EditorEditActions['startEdgeLabel']>[2] extends infer TOptions
    ? TOptions extends { caret?: infer TCaret }
      ? TCaret
      : never
    : never
}

export interface EditController {
  actions: EditorEditActions
  startNode: (input: StartNodeEditInput) => void
  startEdgeLabel: (input: StartEdgeLabelEditInput) => void
  focusMindmapNode: (input: {
    nodeId: string
    behavior: MindmapInsertBehavior | undefined
  }) => void
  focusMindmapRoot: (input: {
    nodeId: string
    focus: 'edit-root' | 'select-root' | 'none' | undefined
  }) => void
  clearEditingEdgeLabel: (input: {
    edgeId: string
    labelId: string
  }) => void
}

export const createEditController = (context: EditorActionContext): EditController => {
  const clearEdit = () => {
    context.state.write(({
      writer
    }) => {
      writer.edit.clear()
    })
  }

  const replaceSelection = (
    selection: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }
  ) => {
    context.state.write(({
      writer
    }) => {
      writer.selection.set({
        nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
        edgeIds: selection.edgeIds ? [...selection.edgeIds] : []
      })
    })
  }

  const updateEdit = (
    patch: (current: NonNullable<ReturnType<typeof context.stores.edit.get>>) => NonNullable<ReturnType<typeof context.stores.edit.get>>
  ) => {
    context.state.write(({
      writer,
      snapshot
    }) => {
      const current = snapshot.state.edit
      if (!current) {
        return
      }

      writer.edit.set(patch(current))
    })
  }

  const startNode = ({
    nodeId,
    field,
    caret
  }: StartNodeEditInput): EditSession => {
    const committed = context.document.node(nodeId)
    if (!committed) {
      return null
    }

    const capability = context.nodeType.edit(committed.type, field)
    if (!capability) {
      return null
    }

    const value = committed.data?.[field]
    return {
      kind: 'node',
      nodeId,
      field,
      text: typeof value === 'string' ? value : '',
      composing: false,
      caret: caret ?? {
        kind: 'end'
      }
    }
  }

  const startEdgeLabel = ({
    edgeId,
    labelId,
    caret
  }: StartEdgeLabelEditInput): EditSession => {
    const edge = context.document.edge(edgeId)
    const label = edge?.labels?.find((entry: EdgeLabel) => entry.id === labelId)
    if (!edge || !label) {
      return null
    }

    return {
      kind: 'edge-label',
      edgeId,
      labelId,
      text: typeof label.text === 'string' ? label.text : '',
      composing: false,
      caret: caret ?? {
        kind: 'end'
      }
    }
  }

  const clearEditingEdgeLabel = ({
    edgeId,
    labelId
  }: {
    edgeId: string
    labelId: string
  }) => {
    const currentEdit = context.stores.edit.get()
    if (
      currentEdit
      && currentEdit.kind === 'edge-label'
      && currentEdit.edgeId === edgeId
      && currentEdit.labelId === labelId
    ) {
      clearEdit()
    }
  }

  const focusMindmapNode = ({
    nodeId,
    behavior
  }: {
    nodeId: string
    behavior: MindmapInsertBehavior | undefined
  }) => {
    const focus = behavior?.focus ?? 'select-new'
    if (focus === 'keep-current') {
      return
    }

    if (focus === 'edit-new') {
      const startEdit = startNode({
        nodeId,
        field: 'text'
      })
      if (startEdit) {
        context.state.write(({
          writer
        }) => {
          writer.selection.set({
            nodeIds: [nodeId],
            edgeIds: []
          })
          writer.edit.set(startEdit)
        })
      }
      return
    }

    replaceSelection({
      nodeIds: [nodeId]
    })
  }

  const focusMindmapRoot = ({
    nodeId,
    focus
  }: {
    nodeId: string
    focus: 'edit-root' | 'select-root' | 'none' | undefined
  }) => {
    if (!focus || focus === 'none') {
      return
    }

    if (focus === 'edit-root') {
      const startEdit = startNode({
        nodeId,
        field: 'text'
      })
      if (startEdit) {
        context.state.write(({
          writer
        }) => {
          writer.selection.set({
            nodeIds: [nodeId],
            edgeIds: []
          })
          writer.edit.set(startEdit)
        })
      }
      return
    }

    replaceSelection({
      nodeIds: [nodeId]
    })
  }

  const cancel = () => {
    const currentEdit = context.stores.edit.get()
    if (!currentEdit) {
      return
    }

    clearEdit()

    if (currentEdit.kind !== 'edge-label') {
      return
    }

    const committedLabel = context.document.edge(currentEdit.edgeId)?.labels?.find(
      (label: EdgeLabel) => label.id === currentEdit.labelId
    )
    if (!committedLabel || committedLabel.text?.trim()) {
      return
    }

    context.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
  }

  const commit = () => {
    const currentEdit = context.stores.edit.get()
    if (!currentEdit) {
      return
    }

    if (currentEdit.kind === 'node') {
      const committed = context.document.node(currentEdit.nodeId)
      if (!committed) {
        clearEdit()
        return
      }

      const capability = context.nodeType.edit(
        committed.type,
        currentEdit.field
      )
      if (!capability) {
        clearEdit()
        return
      }

      clearEdit()
      context.write.node.text.commit({
        nodeId: currentEdit.nodeId,
        field: currentEdit.field,
        value: resolveNodeCommitValue({
          text: currentEdit.text,
          empty: capability.empty,
          defaultText: capability.defaultText
        })
      })
      return
    }

    clearEdit()

    if (!currentEdit.text.trim()) {
      context.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
      return
    }

    context.write.edge.label.update(
      currentEdit.edgeId,
      currentEdit.labelId,
      {
        fields: {
          text: currentEdit.text
        }
      }
    )
  }

  return {
    actions: {
      startNode: (nodeId, field, options) => {
        const nextEdit = startNode({
          nodeId,
          field,
          caret: options?.caret
        })
        if (nextEdit) {
          context.state.write(({
            writer
          }) => {
            writer.edit.set(nextEdit)
          })
        }
      },
      startEdgeLabel: (edgeId, labelId, options) => {
        const nextEdit = startEdgeLabel({
          edgeId,
          labelId,
          caret: options?.caret
        })
        if (nextEdit) {
          context.state.write(({
            writer
          }) => {
            writer.edit.set(nextEdit)
          })
        }
      },
      input: (text) => updateEdit((current) => ({
        ...current,
        text
      })),
      composing: (composing) => updateEdit((current) => ({
        ...current,
        composing
      })),
      caret: (caret) => updateEdit((current) => ({
        ...current,
        caret
      })),
      cancel,
      commit
    },
    startNode,
    startEdgeLabel,
    focusMindmapNode,
    focusMindmapRoot,
    clearEditingEdgeLabel
  }
}
