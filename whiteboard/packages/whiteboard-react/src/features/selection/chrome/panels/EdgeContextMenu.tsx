import { Menu, type MenuItem } from '@shared/ui'
import { useEditorRuntime, useWhiteboardServices } from '#react/runtime/hooks'

const ORDER_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' as const },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' as const },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' as const },
  { key: 'order.back', label: 'Send to back', mode: 'back' as const }
] as const

const toMenuItems = (
  edgeId: string,
  onCopy: () => void,
  onCut: () => void,
  onDuplicate: () => void,
  onDelete: () => void,
  onOrder: (mode: (typeof ORDER_ITEMS)[number]['mode']) => void
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
    items: ORDER_ITEMS.map((item) => ({
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
    onSelect: onCut
  },
  {
    kind: 'action' as const,
    key: 'edge.duplicate',
    label: 'Duplicate',
    onSelect: onDuplicate
  },
  {
    kind: 'action' as const,
    key: 'edge.delete',
    label: 'Delete',
    tone: 'destructive' as const,
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

  return (
    <Menu
      items={toMenuItems(
        edgeId,
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
          editor.actions.selection.replace({
            edgeIds: [edgeId]
          })
          editor.actions.selection.duplicate({
            edgeIds: [edgeId]
          })
        },
        () => {
          editor.actions.selection.replace({
            edgeIds: [edgeId]
          })
          editor.actions.selection.delete({
            edgeIds: [edgeId]
          })
        },
        (mode) => {
          editor.actions.selection.order({
            edgeIds: [edgeId]
          }, mode)
        }
      )}
      onClose={onClose}
      autoFocus={false}
    />
  )
}
