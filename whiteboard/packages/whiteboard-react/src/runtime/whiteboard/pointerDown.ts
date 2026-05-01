import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type PointerDownInput = Parameters<WhiteboardRuntime['input']['pointerDown']>[0]
type BackgroundDismissEditor = {
  scene: {
    ui: {
      state: {
        edit: WhiteboardRuntime['scene']['ui']['state']['edit']
        selection: WhiteboardRuntime['scene']['ui']['state']['selection']
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

  if (!editor.scene.ui.state.edit.get()) {
    return
  }

  editor.write.edit.commit()

  const selection = editor.scene.ui.state.selection.get()
  if (
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
  ) {
    return
  }

  editor.write.selection.clear()
}
