import { Menu, type MenuItem } from '@shared/ui'
import { useStoreValue } from '@shared/react'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { useEditorRuntime, useWhiteboardServices } from '@whiteboard/react/runtime/hooks'
import { readSelectionCan } from '@whiteboard/react/features/selection/capability'
import { ORDER_MENU_ITEMS } from '@whiteboard/react/features/selection/chrome/panels/order'

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
  const target = useStoreValue(editor.scene.ui.state.selection)
  const nodeStats = useStoreValue(editor.scene.ui.selection.node.stats)
  const summary = useStoreValue(editor.scene.ui.selection.view).summary
  const nodeIds = target.nodeIds
  const edgeIds = target.edgeIds
  const count = nodeIds.length + edgeIds.length
  const selectionCan = readSelectionCan({
    editor,
    target
  })
  const exactGroupIds = editor.scene.groups.exact(target)
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
      disabled: !selectionCan.cut,
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
        void clipboard.paste(summary.box
          ? {
            origin: geometryApi.rect.center(summary.box)
          }
          : undefined)
      }
    },
    {
      kind: 'action' as const,
      key: 'edit.duplicate',
      label: 'Duplicate',
      disabled: !selectionCan.duplicate,
      onSelect: () => {
        editor.actions.selection.duplicate(target)
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
      disabled: !selectionCan.order,
      items: ORDER_MENU_ITEMS.map((item) => ({
        kind: 'action' as const,
        key: item.key,
        label: item.label,
        onSelect: () => {
          editor.actions.selection.order(target, item.mode)
        }
      }))
    },
    ...(selectionCan.makeGroup
      ? [
          {
            kind: 'action' as const,
            key: 'structure.group',
            label: 'Group',
            disabled: !selectionCan.makeGroup,
            onSelect: () => {
              editor.actions.selection.group(target)
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
            disabled: !selectionCan.ungroup,
            onSelect: () => {
              editor.actions.selection.ungroup(target)
            }
          }
        ]
      : []),
    ...(pureNodeSelection
      ? [
          {
            kind: 'action' as const,
            key: 'state.lock',
            label: readLockLabel(nodeStats.lock),
            onSelect: () => {
              editor.actions.node.lock.set(
                [...nodeIds],
                nodeStats.lock !== 'all'
              )
            }
          }
        ]
      : []),
    ...(pureNodeSelection && summary.box
      ? [
          {
            kind: 'action' as const,
            key: 'structure.frame',
            label: 'Create frame',
            onSelect: () => {
              editor.actions.selection.frame(summary.box!)
            }
          }
        ]
      : []),
    {
      kind: 'divider' as const,
      key: 'divider:secondary'
    },
    ...(summary.box
      ? [
          {
            kind: 'action' as const,
            key: 'viewport.zoom-in',
            label: 'Zoom in',
            onSelect: () => {
              editor.actions.viewport.fit(summary.box!)
            }
          }
        ]
      : []),
    {
      kind: 'action' as const,
      key: 'danger.delete',
      label: 'Delete',
      tone: 'destructive' as const,
      disabled: !selectionCan.delete,
      onSelect: () => {
        editor.actions.selection.delete(target)
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
