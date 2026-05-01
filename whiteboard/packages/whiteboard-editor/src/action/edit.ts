import type { EdgeLabel } from '@whiteboard/core/types'
import type {
  EditorEditActions,
  MindmapInsertBehavior
} from '@whiteboard/editor/action/types'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { EditField, EditSession } from '@whiteboard/editor/session/edit'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write'

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

export const createEditController = (input: {
  editor: {
    edit: {
      get: () => EditSession
    }
    dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  }
  document: Pick<DocumentFrame, 'node' | 'edge'>
  nodeType: Pick<NodeTypeSupport, 'edit'>
  write: Pick<EditorWrite, 'node' | 'edge'>
}): EditController => {
  const clearEdit = () => {
    input.editor.dispatch({
      type: 'edit.set',
      edit: null
    } satisfies EditorCommand)
  }

  const replaceSelection = (
    selection: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }
  ) => {
    input.editor.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
        edgeIds: selection.edgeIds ? [...selection.edgeIds] : []
      }
    } satisfies EditorCommand)
  }

  const updateEdit = (
    patch: (current: NonNullable<ReturnType<typeof input.editor.edit.get>>) => NonNullable<ReturnType<typeof input.editor.edit.get>>
  ) => {
    const current = input.editor.edit.get()
    if (!current) {
      return
    }

    input.editor.dispatch({
      type: 'edit.set',
      edit: patch(current)
    } satisfies EditorCommand)
  }

  const startNode = ({
    nodeId,
    field,
    caret
  }: StartNodeEditInput) => {
    const committed = input.document.node(nodeId)
    if (!committed) {
      return
    }

    const capability = input.nodeType.edit(committed.type, field)
    if (!capability) {
      return
    }

    const value = committed.data?.[field]
    input.editor.dispatch({
      type: 'edit.set',
      edit: {
        kind: 'node',
        nodeId,
        field,
        text: typeof value === 'string' ? value : '',
        composing: false,
        caret: caret ?? {
          kind: 'end'
        }
      }
    } satisfies EditorCommand)
  }

  const startEdgeLabel = ({
    edgeId,
    labelId,
    caret
  }: StartEdgeLabelEditInput) => {
    const edge = input.document.edge(edgeId)
    const label = edge?.labels?.find((entry: EdgeLabel) => entry.id === labelId)
    if (!edge || !label) {
      return
    }

    input.editor.dispatch({
      type: 'edit.set',
      edit: {
        kind: 'edge-label',
        edgeId,
        labelId,
        text: typeof label.text === 'string' ? label.text : '',
        composing: false,
        caret: caret ?? {
          kind: 'end'
        }
      }
    } satisfies EditorCommand)
  }

  const clearEditingEdgeLabel = ({
    edgeId,
    labelId
  }: {
    edgeId: string
    labelId: string
  }) => {
    const currentEdit = input.editor.edit.get()
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

    replaceSelection({
      nodeIds: [nodeId]
    })

    if (focus === 'edit-new') {
      startNode({
        nodeId,
        field: 'text'
      })
    }
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

    replaceSelection({
      nodeIds: [nodeId]
    })

    if (focus === 'edit-root') {
      startNode({
        nodeId,
        field: 'text'
      })
    }
  }

  const cancel = () => {
    const currentEdit = input.editor.edit.get()
    if (!currentEdit) {
      return
    }

    clearEdit()

    if (currentEdit.kind !== 'edge-label') {
      return
    }

    const committedLabel = input.document.edge(currentEdit.edgeId)?.labels?.find(
      (label: EdgeLabel) => label.id === currentEdit.labelId
    )
    if (!committedLabel || committedLabel.text?.trim()) {
      return
    }

    input.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
  }

  const commit = () => {
    const currentEdit = input.editor.edit.get()
    if (!currentEdit) {
      return
    }

    if (currentEdit.kind === 'node') {
      const committed = input.document.node(currentEdit.nodeId)
      if (!committed) {
        clearEdit()
        return
      }

      const capability = input.nodeType.edit(
        committed.type,
        currentEdit.field
      )
      if (!capability) {
        clearEdit()
        return
      }

      clearEdit()
      input.write.node.text.commit({
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
      input.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
      return
    }

    input.write.edge.label.update(
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
        startNode({
          nodeId,
          field,
          caret: options?.caret
        })
      },
      startEdgeLabel: (edgeId, labelId, options) => {
        startEdgeLabel({
          edgeId,
          labelId,
          caret: options?.caret
        })
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
