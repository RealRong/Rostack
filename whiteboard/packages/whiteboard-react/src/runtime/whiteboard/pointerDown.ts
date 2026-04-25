import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type PointerDownInput = Parameters<WhiteboardRuntime['input']['pointerDown']>[0]

export const dismissBackgroundEditSelection = ({
  editor,
  input
}: {
  editor: Pick<WhiteboardRuntime, 'session' | 'write'>
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

  if (!editor.session.edit.get()) {
    return
  }

  editor.write.edit.commit()

  const selection = editor.session.selection.get()
  if (
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
  ) {
    return
  }

  editor.write.selection.clear()
}
