import { isSizeEqual } from '@whiteboard/core/geometry'
import type { CommandResult } from '@engine-types/result'
import type { Engine } from '@whiteboard/engine'
import type {
  EditorEdgeActions,
  EditorStore
} from '../../types/editor'
import type { DocumentRuntime } from '../document/types'
import type { SessionRuntime } from '../session/types'
import type { RuntimeStateController } from '../state'

type EditorEditActionsHost = {
  engine: Engine
  edit: EditorStore['edit']
  runtime: Pick<RuntimeStateController, 'state'>
  session: Pick<SessionRuntime, 'edit'>
  document: Pick<DocumentRuntime, 'node'>
  edgeLabel: Pick<EditorEdgeActions['label'], 'remove' | 'setText'>
}

const resolveNodeCommitValue = (input: {
  text: string
  empty: 'default' | 'keep' | 'remove'
  defaultText?: string
}) => (
  input.empty === 'default' && !input.text.trim()
    ? (input.defaultText ?? '')
    : input.text
)

export const createEditorEditActions = ({
  engine,
  edit,
  runtime,
  session,
  document,
  edgeLabel
}: EditorEditActionsHost): {
  cancel: () => CommandResult | undefined
  commit: () => CommandResult | undefined
} => ({
  cancel: () => {
    const currentEdit = edit.get()
    if (!currentEdit) {
      return undefined
    }

    if (
      currentEdit.kind === 'edge-label'
      && currentEdit.capabilities.empty === 'remove'
      && !currentEdit.initial.text.trim()
    ) {
      const edge = engine.read.edge.item.get(currentEdit.edgeId)?.edge
      if (!edge?.labels?.some((label) => label.id === currentEdit.labelId)) {
        session.edit.clear()
        return undefined
      }

      session.edit.clear()
      return edgeLabel.remove(currentEdit.edgeId, currentEdit.labelId)
    }

    session.edit.clear()
    return undefined
  },
  commit: () => {
    const currentEdit = edit.get()
    if (!currentEdit) {
      return undefined
    }

    runtime.state.edit.mutate.status('committing')

    if (currentEdit.kind === 'node') {
      const committed = engine.read.node.item.get(currentEdit.nodeId)
      if (!committed) {
        session.edit.clear()
        return undefined
      }

      const size = (
        committed.node.type === 'text'
        && currentEdit.field === 'text'
        && currentEdit.layout.liveSize
        && !isSizeEqual(currentEdit.layout.liveSize, committed.rect)
      )
        ? currentEdit.layout.liveSize
        : undefined

      return document.node.text.commit({
        nodeId: currentEdit.nodeId,
        field: currentEdit.field,
        value: resolveNodeCommitValue({
          text: currentEdit.draft.text,
          empty: currentEdit.capabilities.empty,
          defaultText: currentEdit.capabilities.defaultText
        }),
        size
      })
    }

    if (
      currentEdit.capabilities.empty === 'remove'
      && !currentEdit.draft.text.trim()
    ) {
      session.edit.clear()
      return edgeLabel.remove(currentEdit.edgeId, currentEdit.labelId)
    }

    session.edit.clear()
    return edgeLabel.setText(
      currentEdit.edgeId,
      currentEdit.labelId,
      currentEdit.draft.text
    )
  }
})
