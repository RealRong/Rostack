import { isSizeEqual } from '@whiteboard/core/geometry'
import type { CommandResult } from '@engine-types/result'
import type {
  EditorRead,
  EditorStore
} from '../../types/editor'
import type { NodeCommands } from '../node/types'
import type { EdgeCommands } from './edge'
import type { SessionCommands } from './session'
import type { EditorStateController } from '../state'

type EditCommandsHost = {
  read: Pick<EditorRead, 'node' | 'edge'>
  edit: EditorStore['edit']
  runtime: Pick<EditorStateController, 'state'>
  session: Pick<SessionCommands, 'edit'>
  node: Pick<NodeCommands, 'text'>
  edge: Pick<EdgeCommands, 'label'>
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

export const createEditCommands = ({
  read,
  edit,
  runtime,
  session,
  node,
  edge
}: EditCommandsHost): {
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
      const committedEdge = read.edge.committed.get(currentEdit.edgeId)?.edge
      if (!committedEdge?.labels?.some((label) => label.id === currentEdit.labelId)) {
        session.edit.clear()
        return undefined
      }

      session.edit.clear()
      return edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
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
      const committed = read.node.committed.get(currentEdit.nodeId)
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

      return node.text.commit({
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
      return edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
    }

    session.edit.clear()
    return edge.label.patch(
      currentEdit.edgeId,
      currentEdit.labelId,
      {
        text: currentEdit.draft.text
      }
    )
  }
})
