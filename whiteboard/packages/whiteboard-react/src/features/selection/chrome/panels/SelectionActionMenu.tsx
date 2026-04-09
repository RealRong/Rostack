import type { MenuItem } from '@ui'
import { Menu } from '@ui'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime, useWhiteboardServices } from '#react/runtime/hooks'
import { readSelectionCan } from '../../capability'

const ORDER_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' as const },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' as const },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' as const },
  { key: 'order.back', label: 'Send to back', mode: 'back' as const }
] as const

const readRectCenter = (
  box: {
    x: number
    y: number
    width: number
    height: number
  }
) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
})

const readLockLabel = (
  lock: 'none' | 'mixed' | 'all'
) => lock === 'all' ? 'Unlock' : 'Lock'

const normalizeMenuItems = (
  items: readonly MenuItem[]
) => {
  const normalized: MenuItem[] = []

  items.forEach((item) => {
    if (item.kind === 'divider') {
      if (!normalized.length || normalized[normalized.length - 1]?.kind === 'divider') {
        return
      }
    }

    normalized.push(item)
  })

  while (normalized[normalized.length - 1]?.kind === 'divider') {
    normalized.pop()
  }

  return normalized
}

export const SelectionActionMenu = ({
  onClose
}: {
  onClose: () => void
}) => {
  const editor = useEditorRuntime()
  const { clipboard } = useWhiteboardServices()
  const target = useStoreValue(editor.state.selection)
  const nodeInfo = useStoreValue(editor.read.selection.node)
  const box = useStoreValue(editor.read.selection.box)
  const nodeIds = target.nodeIds
  const edgeIds = target.edgeIds
  const count = nodeIds.length + edgeIds.length
  const selectionCan = readSelectionCan({
    editor,
    target
  })
  const exactGroupIds = editor.read.group.exactIds(target)
  const pureNodeSelection =
    nodeIds.length > 0
    && edgeIds.length === 0

  const items = normalizeMenuItems([
    {
      kind: 'action' as const,
      key: 'edit.copy',
      label: 'Copy',
      onSelect: () => {
        void clipboard.copy({
          nodeIds,
          edgeIds
        })
      }
    },
    {
      kind: 'action' as const,
      key: 'edit.cut',
      label: 'Cut',
      onSelect: () => {
        void clipboard.cut({
          nodeIds,
          edgeIds
        })
      }
    },
    {
      kind: 'action' as const,
      key: 'edit.paste',
      label: 'Paste',
      onSelect: () => {
        void clipboard.paste(box
          ? {
              origin: readRectCenter(box)
            }
          : undefined)
      }
    },
    {
      kind: 'action' as const,
      key: 'edit.duplicate',
      label: 'Duplicate',
      onSelect: () => {
        editor.document.selection.duplicate({
          nodeIds,
          edgeIds
        })
      }
    },
    {
      kind: 'divider' as const,
      key: 'divider:primary'
    },
    {
      kind: 'submenu' as const,
      key: 'layer',
      label: 'Layer',
      items: ORDER_ITEMS.map((item) => ({
        kind: 'action' as const,
        key: item.key,
        label: item.label,
        onSelect: () => {
          editor.document.selection.order({
            nodeIds,
            edgeIds
          }, item.mode)
        }
      }))
    },
    ...(selectionCan.makeGroup
      ? [
          {
            kind: 'action' as const,
            key: 'structure.group',
            label: 'Group',
            onSelect: () => {
              editor.document.selection.group({
                nodeIds,
                edgeIds
              })
            }
          }
        ]
      : []),
    ...(exactGroupIds.length > 0
      ? [
          {
            kind: 'action' as const,
            key: 'structure.ungroup',
            label: 'Ungroup',
            onSelect: () => {
              editor.document.selection.ungroup({
                nodeIds,
                edgeIds
              })
            }
          }
        ]
      : []),
    ...(pureNodeSelection
      ? [
          {
            kind: 'action' as const,
            key: 'state.lock',
            label: readLockLabel(nodeInfo?.lock ?? 'none'),
            onSelect: () => {
              editor.document.nodes.patch([...nodeIds], {
                fields: {
                  locked: (nodeInfo?.lock ?? 'none') !== 'all'
                }
              })
            }
          }
        ]
      : []),
    ...(pureNodeSelection && box
      ? [
          {
            kind: 'action' as const,
            key: 'structure.frame',
            label: 'Create frame',
            onSelect: () => {
              editor.document.selection.frame(box)
            }
          }
        ]
      : []),
    {
      kind: 'divider' as const,
      key: 'divider:secondary'
    },
    ...(box
      ? [
          {
            kind: 'action' as const,
            key: 'viewport.zoom-in',
            label: 'Zoom in',
            onSelect: () => {
              editor.view.viewport.fit(box)
            }
          }
        ]
      : []),
    {
      kind: 'action' as const,
      key: 'danger.delete',
      label: 'Delete',
      tone: 'destructive' as const,
      onSelect: () => {
        editor.document.selection.delete({
          nodeIds,
          edgeIds
        })
      }
    }
  ])

  if (!count || !items.length) {
    return null
  }

  return (
    <Menu
      items={items}
      onClose={onClose}
      autoFocus={false}
    />
  )
}
