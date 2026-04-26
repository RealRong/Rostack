import type {
  SliceRoots
} from '@whiteboard/core/document'
import type { Point } from '@whiteboard/core/types'
import type { EditorSessionState } from '@whiteboard/editor/types/editor'
import type { EditorDocumentSource } from '@whiteboard/editor/types/editor'
import type {
  ClipboardActions,
  ClipboardTarget,
  SelectionSessionDeps
} from '@whiteboard/editor/action/types'
import {
  createClipboardPacket,
  type ClipboardPacket
} from '@whiteboard/editor/clipboard/packet'
import type { SelectionActionHelpers } from '@whiteboard/editor/action/selection'
import type { DocumentWrite } from '@whiteboard/editor/write/types'

type ClipboardActionHelpersHost = {
  documentSource: Pick<EditorDocumentSource, 'slice'>
  document: Pick<DocumentWrite, 'insert'>
  session: SelectionSessionDeps
  selection: Pick<SelectionActionHelpers, 'delete'>
  state: Pick<EditorSessionState, 'viewport' | 'selection'>
}

const applyInsertedRoots = (input: {
  editor: ClipboardActionHelpersHost
  inserted: {
    roots: SliceRoots
    allNodeIds: readonly string[]
    allEdgeIds: readonly string[]
  }
}) => {
  const nodeIds = input.inserted.roots.nodeIds.length > 0
    ? input.inserted.roots.nodeIds
    : input.inserted.allNodeIds
  const edgeIds = input.inserted.roots.edgeIds.length > 0
    ? input.inserted.roots.edgeIds
    : input.inserted.allEdgeIds

  if (nodeIds.length > 0 || edgeIds.length > 0) {
    input.editor.session.replaceSelection({
      nodeIds,
      edgeIds
    })
    return
  }

  input.editor.session.clearSelection()
}

const readSelectionTarget = (
  editor: ClipboardActionHelpersHost
): Exclude<ClipboardTarget, 'selection'> | undefined => {
  const target = editor.state.selection.get()

  if (target.nodeIds.length > 0 || target.edgeIds.length > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  editor: ClipboardActionHelpersHost
  target: ClipboardTarget
}): Exclude<ClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardActionHelpersHost
  target: ClipboardTarget
}): ClipboardPacket | undefined => {
  const resolved = resolveClipboardTarget(input)
  if (!resolved) {
    return undefined
  }

  const exported = input.editor.documentSource.slice(resolved)
  return exported
    ? createClipboardPacket(exported)
    : undefined
}

export const createClipboardActions = ({
  editor
}: {
  editor: ClipboardActionHelpersHost
}): ClipboardActions => ({
  copy: (target: ClipboardTarget = 'selection') =>
    readClipboardPacket({
      editor,
      target
    }),
  cut: (target: ClipboardTarget = 'selection') => {
    const resolved = resolveClipboardTarget({
      editor,
      target
    })
    if (!resolved) {
      return undefined
    }

    const packet = readClipboardPacket({
      editor,
      target: resolved
    })
    if (!packet) {
      return undefined
    }

    if (resolved.nodeIds?.length || resolved.edgeIds?.length) {
      const removed = editor.selection.delete(resolved, {
        clearSelection: true
      })
      if (!removed) {
        return undefined
      }
    }

    return packet
  },
  paste: (
    packet: ClipboardPacket,
    options?: {
      origin?: Point
    }
  ) => {
    const origin = options?.origin ?? { ...editor.state.viewport.get().center }
    const inserted = editor.document.insert(packet.slice, {
      origin,
      roots: packet.roots
    })
    if (!inserted.ok) {
      return false
    }

    applyInsertedRoots({
      editor,
      inserted: inserted.data
    })
    return true
  }
})
