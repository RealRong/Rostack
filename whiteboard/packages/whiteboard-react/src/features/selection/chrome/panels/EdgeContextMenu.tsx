import { Menu, type MenuItem } from '@shared/ui'
import { useEditorRuntime, useWhiteboardServices } from '@whiteboard/react/runtime/hooks'
import { readSelectionCan } from '@whiteboard/react/features/selection/capability'
import { ORDER_MENU_ITEMS } from '@whiteboard/react/features/selection/chrome/panels/order'

const toMenuItems = (
  edgeId: string,
  can: ReturnType<typeof readSelectionCan>,
  onCopy: () => void,
  onCut: () => void,
  onDuplicate: () => void,
  onDelete: () => void,
  onOrder: (mode: (typeof ORDER_MENU_ITEMS)[number]['mode']) => void
): MenuItem[] => [
  {
    kind: 'label' as const,
    key: 'arrange:title',
    label: 'Arrange'
  },
  {
    kind: 'submenu' as const,
    key: 'arrange.order',
    label: 'Layer',
    disabled: !can.order,
    items: ORDER_MENU_ITEMS.map((item) => ({
      kind: 'action' as const,
      key: `${item.key}:${edgeId}`,
      label: item.label,
      onSelect: () => {
        onOrder(item.mode)
      }
    }))
  },
  {
    kind: 'divider' as const,
    key: 'divider:edge-actions'
  },
  {
    kind: 'label' as const,
    key: 'edge.actions:title',
    label: 'Edit'
  },
  {
    kind: 'action' as const,
    key: 'edge.copy',
    label: 'Copy',
    onSelect: onCopy
  },
  {
    kind: 'action' as const,
    key: 'edge.cut',
    label: 'Cut',
    disabled: !can.cut,
    onSelect: onCut
  },
  {
    kind: 'action' as const,
    key: 'edge.duplicate',
    label: 'Duplicate',
    disabled: !can.duplicate,
    onSelect: onDuplicate
  },
  {
    kind: 'action' as const,
    key: 'edge.delete',
    label: 'Delete',
    tone: 'destructive' as const,
    disabled: !can.delete,
    onSelect: onDelete
  }
]

export const EdgeContextMenu = ({
  edgeId,
  onClose
}: {
  edgeId: string
  onClose: () => void
}) => {
  const editor = useEditorRuntime()
  const { clipboard } = useWhiteboardServices()
  const can = readSelectionCan({
    editor,
    target: {
      nodeIds: [],
      edgeIds: [edgeId]
    }
  })

  return (
    <Menu
      items={toMenuItems(
        edgeId,
        can,
        () => {
          void clipboard.copy({
            edgeIds: [edgeId]
          })
        },
        () => {
          void clipboard.cut({
            edgeIds: [edgeId]
          })
        },
        () => {
          editor.actions.session.selection.replace({
            edgeIds: [edgeId]
          })
          editor.actions.session.selection.duplicate({
            edgeIds: [edgeId]
          })
        },
        () => {
          editor.actions.session.selection.replace({
            edgeIds: [edgeId]
          })
          editor.actions.session.selection.delete({
            edgeIds: [edgeId]
          })
        },
        (mode) => {
          editor.actions.session.selection.order({
            edgeIds: [edgeId]
          }, mode)
        }
      )}
      onClose={onClose}
      autoFocus={false}
    />
  )
}
