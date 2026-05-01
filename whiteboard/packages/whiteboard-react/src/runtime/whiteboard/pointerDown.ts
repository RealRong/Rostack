import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type PointerDownInput = Parameters<WhiteboardRuntime['input']['pointerDown']>[0]
type BackgroundDismissEditor = {
  projection: {
    runtime: {
      editor: {
        edit: WhiteboardRuntime['projection']['runtime']['editor']['edit']
        selection: WhiteboardRuntime['projection']['runtime']['editor']['selection']
      }
    }
  }
  write: {
    edit: Pick<WhiteboardRuntime['write']['edit'], 'commit'>
    selection: Pick<WhiteboardRuntime['write']['selection'], 'clear'>
  }
}

export const dismissBackgroundEditSelection = ({
  editor,
  input
}: {
  editor: BackgroundDismissEditor
  input: PointerDownInput
}) => {
  if (
    input.button !== 0
    || input.pick.kind !== 'background'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return
  }

  if (!editor.projection.runtime.editor.edit()) {
    return
  }

  editor.write.edit.commit()

  const selection = editor.projection.runtime.editor.selection()
  if (
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
  ) {
    return
  }

  editor.write.selection.clear()
}
