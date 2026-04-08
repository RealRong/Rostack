import type { MenuItem } from '@ui'
import { Menu } from '@ui'
import { useEditorRuntime, useWhiteboardServices } from '#react/runtime/hooks'
import { useSelection } from '#react/features/node'
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
  const selection = useSelection()
  const summary = selection.summary
  const target = summary.target
  const nodeIds = target.nodeIds
  const edgeIds = target.edgeIds
  const box = selection.boxState.box
  const selectionCan = readSelectionCan({
    editor,
    summary
  })
  const exactGroupIds = editor.read.group.exactIds({
    nodeIds,
    edgeIds
  })
  const pureNodeSelection =
    summary.items.nodeCount > 0
    && summary.items.edgeCount === 0

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
        editor.commands.nodes.duplicate({
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
          editor.commands.nodes.order({
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
              editor.commands.group.merge({
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
              editor.commands.group.ungroup({
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
            label: readLockLabel(selection.nodeSummary.lock),
            onSelect: () => {
              editor.commands.node.lock.set([...nodeIds], selection.nodeSummary.lock !== 'all')
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
              editor.commands.frame.createFromBounds(box)
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
              editor.commands.viewport.fit(box)
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
        editor.commands.nodes.delete({
          nodeIds,
          edgeIds
        })
      }
    }
  ])

  if (!summary.items.count || !items.length) {
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
