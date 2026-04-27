import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type PointerDownInput = Parameters<WhiteboardRuntime['input']['pointerDown']>[0]
type BackgroundDismissEditor = {
  state: {
    edit: Pick<WhiteboardRuntime['state']['edit'], 'get'>
    selection: Pick<WhiteboardRuntime['state']['selection'], 'get'>
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

  if (!editor.state.edit.get()) {
    return
  }

  editor.write.edit.commit()

  const selection = editor.state.selection.get()
  if (
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
  ) {
    return
  }

  editor.write.selection.clear()
}
