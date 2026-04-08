import {
  Menu,
  type MenuItem as UiMenuItem
} from '@ui'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Point } from '@whiteboard/core/types'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import {
  useWhiteboardServices
} from '../../../runtime/hooks/useWhiteboard'
import { WhiteboardPopover } from '../../../runtime/overlay/chrome'
import { isContextMenuIgnoredTarget } from '../../../dom/host/targets'
import {
  type ResolvedPoint
} from '../../../dom/host/input'
import type { ClipboardBridge } from '../../../runtime/bridge/clipboard'
import {
  deleteSelectionAndClear,
  duplicateSelectionAndSelect,
  syncNodeSelection,
  syncSingleEdgeSelection
} from '../../../runtime/commands'
import { bindMenuDismiss } from './menuAction'

type MenuItem = {
  key: string
  label: string
  tone?: 'danger'
  disabled?: boolean
  onSelect?: () => unknown
  children?: readonly MenuItem[]
}

type MenuGroup = {
  key: string
  title?: string
  items: readonly MenuItem[]
}

type ContextMenuView =
  | {
      kind: 'canvas'
      screen: Point
      canvas: {
        world: Point
      }
    }
  | {
      kind: 'selection'
      screen: Point
    }
  | {
      kind: 'edge'
      screen: Point
      edge: {
        id: string
      }
    }

const ORDER_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' },
  { key: 'order.back', label: 'Send to back', mode: 'back' }
] as const

const toCanvasRefs = ({
  nodeIds,
  edgeIds
}: {
  nodeIds?: readonly string[]
  edgeIds?: readonly string[]
}) => [
  ...(nodeIds ?? []).map((id) => ({
    kind: 'node' as const,
    id
  })),
  ...(edgeIds ?? []).map((id) => ({
    kind: 'edge' as const,
    id
  }))
]

const buildContextMenuItems = (
  groups: readonly MenuGroup[]
): readonly UiMenuItem[] => {
  const items: UiMenuItem[] = []

  const toUiMenuItem = (item: MenuItem): UiMenuItem => {
    if (item.children?.length) {
      return {
        kind: 'submenu',
        key: item.key,
        label: item.label,
        disabled: item.disabled,
        items: item.children.map(toUiMenuItem)
      }
    }

    return {
      kind: 'action',
      key: item.key,
      label: item.label,
      disabled: item.disabled,
      tone: item.tone === 'danger'
        ? 'destructive'
        : 'default',
      closeOnSelect: false,
      onSelect: () => {
        item.onSelect?.()
      }
    }
  }

  groups.forEach((group, index) => {
    if (index > 0) {
      items.push({
        kind: 'divider',
        key: `divider:${group.key}`
      })
    }

    if (group.title) {
      items.push({
        kind: 'label',
        key: `title:${group.key}`,
        label: group.title
      })
    }

    group.items.forEach((item) => {
      items.push(toUiMenuItem(item))
    })
  })

  return items
}

const readSelectionContextView = (
  editor: ReturnType<typeof useEditorRuntime>,
  screen: Point
): Extract<ContextMenuView, { kind: 'selection' }> | undefined => {
  const selection = editor.read.selection.summary.get()

  return selection.items.count > 0
    ? {
        kind: 'selection',
        screen
      }
    : undefined
}

const readContextMenuView = ({
  editor,
  point
}: {
  editor: ReturnType<typeof useEditorRuntime>
  point: ResolvedPoint
}): ContextMenuView | null => {
  switch (point.pick.kind) {
    case 'selection-box': {
      const selection = editor.read.selection.summary.get()
      if (selection.items.count > 0) {
        return readSelectionContextView(editor, point.screen) ?? null
      }

      return {
        kind: 'canvas',
        screen: point.screen,
        canvas: {
          world: point.world
        }
      }
    }
    case 'node': {
      const selection = editor.read.selection.summary.get()
      const reuseCurrentSelection = selection.target.nodeSet.has(point.pick.id)
      if (reuseCurrentSelection) {
        return readSelectionContextView(editor, point.screen) ?? null
      }

      syncNodeSelection(editor, [point.pick.id])
      return readSelectionContextView(editor, point.screen) ?? null
    }
    case 'group': {
      const selection = editor.read.group.selection(point.pick.id)
      if (!selection) {
        return {
          kind: 'canvas',
          screen: point.screen,
          canvas: {
            world: point.world
          }
        }
      }

      editor.commands.selection.replace(selection)
      return readSelectionContextView(editor, point.screen) ?? null
    }
    case 'edge':
      syncSingleEdgeSelection(editor, point.pick.id)
      return {
        kind: 'edge',
        screen: point.screen,
        edge: {
          id: point.pick.id
        }
      }
    case 'background':
    case 'mindmap':
      return {
        kind: 'canvas',
        screen: point.screen,
        canvas: {
          world: point.world
        }
      }
  }
}

const readCanvasGroups = ({
  editor,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  clipboard: ClipboardBridge
  view: Extract<ContextMenuView, { kind: 'canvas' }>
  dismiss: () => void
}): readonly MenuGroup[] => [
  {
    key: 'edit',
    title: 'Edit',
    items: [
      {
        key: 'edit.paste',
        label: 'Paste',
        onSelect: bindMenuDismiss(() => clipboard.paste({
          origin: view.canvas.world
        }), dismiss)
      }
    ]
  },
  {
    key: 'history',
    title: 'History',
    items: [
      {
        key: 'history.undo',
        label: 'Undo',
        onSelect: bindMenuDismiss(() => editor.commands.history.undo(), dismiss)
      },
      {
        key: 'history.redo',
        label: 'Redo',
        onSelect: bindMenuDismiss(() => editor.commands.history.redo(), dismiss)
      }
    ]
  },
  {
    key: 'selection',
    title: 'Selection',
    items: [
      {
        key: 'selection.select-all',
        label: 'Select all',
        onSelect: bindMenuDismiss(() => editor.commands.selection.selectAll(), dismiss)
      }
    ]
  }
]

const readEdgeGroups = ({
  editor,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  clipboard: ClipboardBridge
  view: Extract<ContextMenuView, { kind: 'edge' }>
  dismiss: () => void
}): readonly MenuGroup[] => [
  {
    key: 'arrange',
    title: 'Arrange',
    items: [
      {
        key: 'arrange.order',
        label: 'Layer',
        children: ORDER_ITEMS.map((item) => ({
          key: item.key,
          label: item.label,
          onSelect: bindMenuDismiss(() => {
            const refs = toCanvasRefs({
              edgeIds: [view.edge.id]
            })
            if (item.mode === 'front') {
              editor.commands.canvas.order.bringToFront(refs)
              return
            }
            if (item.mode === 'forward') {
              editor.commands.canvas.order.bringForward(refs)
              return
            }
            if (item.mode === 'backward') {
              editor.commands.canvas.order.sendBackward(refs)
              return
            }

            editor.commands.canvas.order.sendToBack(refs)
          }, dismiss)
        }))
      }
    ]
  },
  {
    key: 'edge.actions',
    items: [
      {
        key: 'edge.copy',
        label: 'Copy',
        onSelect: bindMenuDismiss(() => clipboard.copy({
          edgeIds: [view.edge.id]
        }), dismiss)
      },
      {
        key: 'edge.cut',
        label: 'Cut',
        onSelect: bindMenuDismiss(() => clipboard.cut({
          edgeIds: [view.edge.id]
        }), dismiss)
      },
      {
        key: 'edge.duplicate',
        label: 'Duplicate',
        onSelect: bindMenuDismiss(() => {
          duplicateSelectionAndSelect(editor, {
            edgeIds: [view.edge.id]
          })
        }, dismiss)
      },
      {
        key: 'edge.delete',
        label: 'Delete',
        tone: 'danger' as const,
        onSelect: bindMenuDismiss(() => {
          deleteSelectionAndClear(editor, {
            edgeIds: [view.edge.id]
          })
        }, dismiss)
      }
    ]
  }
]

const readSelectionGroups = ({
  editor,
  clipboard,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  clipboard: ClipboardBridge
  dismiss: () => void
}): readonly MenuGroup[] => {
  const current = editor.read.selection.summary.get()
  const nodeIds = current.target.nodeIds
  const edgeIds = current.target.edgeIds

  return [
    {
      key: 'edit',
      title: 'Edit',
      items: [
        ...((nodeIds.length > 0 || edgeIds.length > 0)
          ? [
              {
                key: 'edit.copy',
                label: 'Copy',
                onSelect: bindMenuDismiss(() => clipboard.copy({
                  nodeIds,
                  edgeIds
                }), dismiss)
              }
            ]
          : []),
        ...((nodeIds.length > 0 || edgeIds.length > 0)
          ? [
              {
                key: 'edit.cut',
                label: 'Cut',
                onSelect: bindMenuDismiss(() => clipboard.cut({
                  nodeIds,
                  edgeIds
                }), dismiss)
              }
            ]
          : []),
        ...(current.items.count > 0
          ? [
              {
                key: 'edit.duplicate',
                label: 'Duplicate',
                onSelect: bindMenuDismiss(() => {
                  duplicateSelectionAndSelect(editor, {
                    nodeIds,
                    edgeIds
                  })
                }, dismiss)
              }
            ]
          : []),
        ...((nodeIds.length > 0 || edgeIds.length > 0)
          ? [
              {
                key: 'edit.delete',
                label: 'Delete',
                tone: 'danger' as const,
                onSelect: bindMenuDismiss(() => {
                  deleteSelectionAndClear(editor, {
                    nodeIds,
                    edgeIds
                  })
                }, dismiss)
              }
            ]
          : [])
      ]
    }
  ]
}

const readMenuGroups = ({
  editor,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  clipboard: ClipboardBridge
  view: ContextMenuView
  dismiss: () => void
}): readonly MenuGroup[] => {
  switch (view.kind) {
    case 'canvas':
      return readCanvasGroups({
        editor,
        clipboard,
        view,
        dismiss
      })
    case 'selection':
      return readSelectionGroups({
        editor,
        clipboard,
        dismiss
      })
    case 'edge':
      return readEdgeGroups({
        editor,
        clipboard,
        view,
        dismiss
      })
  }
}

export const ContextMenu = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const { clipboard, pointer } = useWhiteboardServices()
  const [view, setView] = useState<ContextMenuView | null>(null)

  const dismiss = useCallback(() => {
    setView(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const openFromEvent = (
      event: Pick<MouseEvent | PointerEvent, 'target' | 'clientX' | 'clientY'>
    ) => {
      const point = pointer.resolvePoint({
        container,
        event
      })
      if (point.ignoreContextMenu) {
        return false
      }

      const nextView = readContextMenuView({
        editor,
        point
      })
      if (!nextView) {
        dismiss()
        return false
      }

      setView(nextView)
      return true
    }

    const onContextMenu = (event: MouseEvent) => {
      if (editor.state.interaction.get().busy) return
      if (isContextMenuIgnoredTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()

      openFromEvent(event)
    }

    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      container.removeEventListener('contextmenu', onContextMenu)
    }
  }, [containerRef, dismiss, editor, pointer])

  if (!view) return null

  const groups = readMenuGroups({
    editor,
    clipboard,
    view,
    dismiss
  })
  const menuItems = buildContextMenuItems(groups)

  return (
    <WhiteboardPopover
      open
      anchor={view.screen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismiss()
        }
      }}
      placement="bottom-start"
      offset={0}
      animated={false}
      mode="blocking"
      backdrop="transparent"
      padding='menu'
      size='md'
    >
      {menuItems.length ? (
        <Menu
          items={menuItems}
          autoFocus
        />
      ) : null}
    </WhiteboardPopover>
  )
}
