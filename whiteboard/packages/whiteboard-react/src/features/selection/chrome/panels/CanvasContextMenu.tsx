import type { Point } from '@whiteboard/core/types'
import { Menu, type MenuItem } from '@shared/ui'
import { useEditorRuntime, useWhiteboardServices } from '@whiteboard/react/runtime/hooks'

const toMenuItems = (
  onUndo: () => void,
  onRedo: () => void,
  onPaste: () => void,
  onSelectAll: () => void
): MenuItem[] => [
  {
    kind: 'label' as const,
    key: 'edit:title',
    label: 'Edit'
  },
  {
    kind: 'action' as const,
    key: 'edit.paste',
    label: 'Paste',
    onSelect: onPaste
  },
  {
    kind: 'divider' as const,
    key: 'divider:history'
  },
  {
    kind: 'label' as const,
    key: 'history:title',
    label: 'History'
  },
  {
    kind: 'action' as const,
    key: 'history.undo',
    label: 'Undo',
    onSelect: onUndo
  },
  {
    kind: 'action' as const,
    key: 'history.redo',
    label: 'Redo',
    onSelect: onRedo
  },
  {
    kind: 'divider' as const,
    key: 'divider:selection'
  },
  {
    kind: 'label' as const,
    key: 'selection:title',
    label: 'Selection'
  },
  {
    kind: 'action' as const,
    key: 'selection.select-all',
    label: 'Select all',
    onSelect: onSelectAll
  }
]

export const CanvasContextMenu = ({
  world,
  onClose
}: {
  world: Point
  onClose: () => void
}) => {
  const editor = useEditorRuntime()
  const { clipboard } = useWhiteboardServices()

  return (
    <Menu
      items={toMenuItems(
        () => {
          editor.actions.document.history.undo()
        },
        () => {
          editor.actions.document.history.redo()
        },
        () => {
          void clipboard.paste({
            origin: world
          })
        },
        () => {
          editor.actions.session.selection.selectAll()
        }
      )}
      onClose={onClose}
      autoFocus={false}
    />
  )
}
