import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type PointerDownInput = Parameters<WhiteboardRuntime['input']['pointerDown']>[0]

export const dismissBackgroundEditSelection = ({
  editor,
  input
}: {
  editor: Pick<WhiteboardRuntime, 'store' | 'actions'>
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

  if (!editor.store.edit.get()) {
    return
  }

  editor.actions.edit.commit()

  const selection = editor.store.selection.get()
  if (
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
  ) {
    return
  }

  editor.actions.selection.clear()
}
