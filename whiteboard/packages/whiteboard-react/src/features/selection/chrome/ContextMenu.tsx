import {
  Menu,
  type MenuItem as UiMenuItem
} from '@ui'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Point } from '@whiteboard/core/types'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import {
  useNodeRegistry,
  useWhiteboardServices,
  type WhiteboardServicesContextValue
} from '../../../runtime/hooks/useWhiteboard'
import { WhiteboardPopover } from '../../../runtime/overlay/chrome'
import { isContextMenuIgnoredTarget } from '../../../dom/host/targets'
import {
  type ResolvedPoint
} from '../../../dom/host/input'
import type { ClipboardBridge } from '../../../runtime/bridge/clipboard'
import {
  duplicateNodesAndSelect,
  groupSelectionAndSelect,
  syncNodeSelection,
  syncSingleEdgeSelection,
  ungroupNodesAndSelect
} from '../../../runtime/commands'
import { selectNodesByTypeKey } from '../../node/actions'
import {
  SelectionSummaryHeader,
  SelectionTypeFilterStrip
} from '../../node/components/SelectionSummaryHeader'
import { CREATE_PRESETS } from '../../toolbox/presets'
import { STROKE_COLOR_OPTIONS } from './menus/options'
import type {
  NodeSelectionCan,
  NodeSelectionStyle,
  NodeSummary,
  NodeTypeSummary
} from '../../node/summary'
import {
  readNodeLockLabel,
  readNodeSelectionCan,
  readNodeSelectionStyle,
  readNodeSummary
} from '../../node/summary'
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

type ContextSelectionFilter = {
  types: readonly NodeTypeSummary[]
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
      selection: {
        summary: NodeSummary
        can: NodeSelectionCan
        filter?: ContextSelectionFilter
        style?: NodeSelectionStyle
      }
    }
  | {
      kind: 'edge'
      screen: Point
      edge: {
        id: string
      }
    }

const MENU_SECTION_TITLE_CLASSNAME = 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted'

const STROKE_WIDTHS = [1, 2, 4, 6, 8, 12] as const
const DRAW_STROKE_WIDTHS = [2, 4, 8, 12] as const
const OPACITY_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '70%', value: 0.7 },
  { label: '50%', value: 0.5 },
  { label: '35%', value: 0.35 }
] as const
const ORDER_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' },
  { key: 'order.back', label: 'Send to back', mode: 'back' }
] as const
const ALIGN_ITEMS = [
  { key: 'layout.align.top', label: 'Align top', mode: 'top' },
  { key: 'layout.align.left', label: 'Align left', mode: 'left' },
  { key: 'layout.align.right', label: 'Align right', mode: 'right' },
  { key: 'layout.align.bottom', label: 'Align bottom', mode: 'bottom' },
  { key: 'layout.align.horizontal', label: 'Align horizontal center', mode: 'horizontal' },
  { key: 'layout.align.vertical', label: 'Align vertical center', mode: 'vertical' }
] as const
const DISTRIBUTE_ITEMS = [
  { key: 'layout.distribute.horizontal', label: 'Distribute horizontally', mode: 'horizontal' },
  { key: 'layout.distribute.vertical', label: 'Distribute vertically', mode: 'vertical' }
] as const

const withCurrentLabel = (
  label: string,
  active: boolean
) => active ? `${label} (Current)` : label

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
        kind: 'custom',
        key: `title:${group.key}`,
        render: () => (
          <div className={MENU_SECTION_TITLE_CLASSNAME}>
            {group.title}
          </div>
        )
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
  registry: ReturnType<typeof useNodeRegistry>,
  screen: Point
): Extract<ContextMenuView, { kind: 'selection' }> | undefined => {
  const selection = editor.read.selection.summary.get()
  if (selection.items.count === 0) {
    return undefined
  }

  const pureNodeSelection =
    selection.items.nodeCount > 0
    && selection.items.edgeCount === 0
  const summary = readNodeSummary({
    summary: selection,
    registry
  })
  const can = readNodeSelectionCan({
    summary: selection,
    registry
  })

  return {
    kind: 'selection',
    screen,
    selection: {
      summary,
      can,
      filter: can.filter
        ? {
            types: summary.types
          }
        : undefined,
      style: pureNodeSelection
        ? readNodeSelectionStyle({
            summary: selection,
            registry
          }) ?? undefined
        : undefined
    }
  }
}

const readContextMenuView = ({
  editor,
  registry,
  point
}: {
  editor: ReturnType<typeof useEditorRuntime>
  registry: ReturnType<typeof useNodeRegistry>
  point: ResolvedPoint
}): ContextMenuView | null => {
  switch (point.pick.kind) {
    case 'selection-box': {
      const selection = editor.read.selection.summary.get()
      if (selection.items.count > 0) {
        return readSelectionContextView(editor, registry, point.screen) ?? null
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
        return readSelectionContextView(editor, registry, point.screen) ?? null
      }

      syncNodeSelection(editor, [point.pick.id])
      return readSelectionContextView(editor, registry, point.screen) ?? null
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
      return readSelectionContextView(editor, registry, point.screen) ?? null
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

const readSelectionStyleGroup = ({
  editor,
  style,
  nodeIds,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  style: NodeSelectionStyle | undefined
  nodeIds: readonly string[]
  dismiss: () => void
}): MenuGroup | undefined => {
  if (!style || !nodeIds.length) {
    return undefined
  }

  const strokeWidths = style.strokeWidthPreset === 'draw'
    ? DRAW_STROKE_WIDTHS
    : STROKE_WIDTHS

  return {
    key: 'style',
    title: 'Style',
    items: [
      {
        key: 'style.stroke',
        label: 'Stroke',
        children: STROKE_COLOR_OPTIONS.map((option) => ({
          key: `style.stroke.${option.label.toLowerCase()}`,
          label: withCurrentLabel(option.label, style.stroke === option.value),
          onSelect: bindMenuDismiss(() => {
            editor.commands.node.appearance.setStroke(nodeIds, option.value)
          }, dismiss)
        }))
      },
      {
        key: 'style.width',
        label: 'Width',
        children: strokeWidths.map((value) => ({
          key: `style.width.${value}`,
          label: withCurrentLabel(`${value}`, style.strokeWidth === value),
          onSelect: bindMenuDismiss(() => {
            editor.commands.node.appearance.setStrokeWidth(nodeIds, value)
          }, dismiss)
        }))
      },
      ...(style.opacity !== undefined
        ? [
            {
              key: 'style.opacity',
              label: 'Opacity',
              children: OPACITY_OPTIONS.map((option) => ({
                key: `style.opacity.${option.label}`,
                label: withCurrentLabel(option.label, style.opacity === option.value),
                onSelect: bindMenuDismiss(() => {
                  editor.commands.node.appearance.setOpacity(nodeIds, option.value)
                }, dismiss)
              }))
            }
          ]
        : [])
    ]
  }
}

const readCanvasGroups = ({
  editor,
  whiteboard,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  whiteboard: WhiteboardServicesContextValue
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
    key: 'create',
    title: 'Create',
    items: CREATE_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.label,
      onSelect: bindMenuDismiss(() => whiteboard.insert.preset(preset.key, {
        at: view.canvas.world
      }), dismiss)
    }))
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
        key: 'edge.delete',
        label: 'Delete',
        tone: 'danger' as const,
        onSelect: bindMenuDismiss(() => editor.commands.edge.delete([view.edge.id]), dismiss)
      }
    ]
  }
]

const readSelectionGroups = ({
  editor,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  clipboard: ClipboardBridge
  view: Extract<ContextMenuView, { kind: 'selection' }>
  dismiss: () => void
}): readonly MenuGroup[] => {
  const current = editor.read.selection.summary.get()
  const { summary, can, style } = view.selection
  const nodeIds = current.target.nodeIds
  const edgeIds = current.target.edgeIds
  const pureNodeSelection =
    current.items.nodeCount > 0
    && current.items.edgeCount === 0
  const orderRefs = toCanvasRefs({
    nodeIds,
    edgeIds
  })
  const canOrderSelection =
    orderRefs.length > 0
    && (
      can.order
      || current.items.edgeCount > 0
    )
  const groups: MenuGroup[] = []

  if (pureNodeSelection) {
    const styleGroup = readSelectionStyleGroup({
      editor,
      style,
      nodeIds,
      dismiss
    })
    if (styleGroup) {
      groups.push(styleGroup)
    }
  }

  groups.push({
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
      ...(pureNodeSelection && can.duplicate
        ? [
            {
              key: 'edit.duplicate',
              label: 'Duplicate',
              onSelect: bindMenuDismiss(() => {
                duplicateNodesAndSelect(editor, nodeIds)
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
                if (edgeIds.length > 0) {
                  editor.commands.edge.delete([...edgeIds])
                }
                if (nodeIds.length > 0) {
                  editor.commands.node.deleteCascade([...nodeIds])
                }
              }, dismiss)
            }
          ]
        : [])
    ]
  })

  if (canOrderSelection) {
    groups.push({
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
              if (item.mode === 'front') {
                editor.commands.canvas.order.bringToFront(orderRefs)
                return
              }
              if (item.mode === 'forward') {
                editor.commands.canvas.order.bringForward(orderRefs)
                return
              }
              if (item.mode === 'backward') {
                editor.commands.canvas.order.sendBackward(orderRefs)
                return
              }

              editor.commands.canvas.order.sendToBack(orderRefs)
            }, dismiss)
          }))
        },
        ...((current.items.count >= 2 && can.makeGroup)
          ? [
              {
                key: 'arrange.group',
                label: 'Group',
                onSelect: bindMenuDismiss(() => {
                  groupSelectionAndSelect(editor, {
                    nodeIds
                  })
                }, dismiss)
              }
          ]
          : []),
        ...(current.groups.count > 0
          ? [
              {
                key: 'arrange.ungroup',
                label: 'Ungroup',
                onSelect: bindMenuDismiss(() => {
                  const groupIds = editor.read.selection.summary.get().groups.ids
                  if (!groupIds.length) {
                    return
                  }

                  ungroupNodesAndSelect(editor, groupIds)
                }, dismiss)
              }
            ]
          : []),
        ...(can.lock
          ? [
              {
                key: 'arrange.lock',
                label: readNodeLockLabel(summary),
                onSelect: bindMenuDismiss(() => {
                  editor.commands.node.lock.set([...nodeIds], summary.lock !== 'all')
                }, dismiss)
              }
            ]
          : [])
      ]
    })
  } else if (current.items.count >= 2 || current.groups.count > 0) {
    groups.push({
      key: 'structure',
      title: 'Structure',
      items: [
        ...(current.items.count >= 2
          ? [
              {
                key: 'structure.group',
                label: 'Group',
                onSelect: bindMenuDismiss(() => {
                  groupSelectionAndSelect(editor, {
                    nodeIds,
                    edgeIds
                  })
                }, dismiss)
              }
            ]
          : []),
        ...(current.groups.count > 0
          ? [
              {
                key: 'structure.ungroup',
                label: 'Ungroup',
                onSelect: bindMenuDismiss(() => {
                  const groupIds = editor.read.selection.summary.get().groups.ids
                  if (!groupIds.length) {
                    return
                  }

                  ungroupNodesAndSelect(editor, groupIds)
                }, dismiss)
              }
            ]
          : [])
      ]
    })
  }

  if (pureNodeSelection && (can.align || can.distribute)) {
    groups.push({
      key: 'layout',
      title: 'Layout',
      items: [
        ...(can.align
          ? [
              {
                key: 'layout.align',
                label: 'Align',
                children: ALIGN_ITEMS.map((item) => ({
                  key: item.key,
                  label: item.label,
                  onSelect: bindMenuDismiss(() => {
                    editor.commands.node.align([...nodeIds], item.mode)
                  }, dismiss)
                }))
              }
            ]
          : []),
        ...(can.distribute
          ? [
              {
                key: 'layout.distribute',
                label: 'Distribute',
                children: DISTRIBUTE_ITEMS.map((item) => ({
                  key: item.key,
                  label: item.label,
                  onSelect: bindMenuDismiss(() => {
                    editor.commands.node.distribute([...nodeIds], item.mode)
                  }, dismiss)
                }))
              }
            ]
          : [])
      ]
    })
  }

  return groups
}

const readMenuGroups = ({
  editor,
  whiteboard,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  whiteboard: WhiteboardServicesContextValue
  clipboard: ClipboardBridge
  view: ContextMenuView
  dismiss: () => void
}): readonly MenuGroup[] => {
  switch (view.kind) {
    case 'canvas':
      return readCanvasGroups({
        editor,
        whiteboard,
        clipboard,
        view,
        dismiss
      })
    case 'selection':
      return readSelectionGroups({
        editor,
        clipboard,
        view,
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

const readFilterTypes = (
  view: ContextMenuView
): readonly NodeTypeSummary[] | undefined => (
  view.kind === 'selection'
    ? view.selection.filter?.types
    : undefined
)

export const ContextMenu = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const registry = useNodeRegistry()
  const whiteboard = useWhiteboardServices()
  const { clipboard, pointer } = whiteboard
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
        registry,
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
  }, [containerRef, dismiss, editor, pointer, registry])

  if (!view) return null

  const groups = readMenuGroups({
    editor,
    whiteboard,
    clipboard,
    view,
    dismiss
  })
  const menuItems = buildContextMenuItems(groups)
  const filterTypes = readFilterTypes(view)

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
      contentClassName="min-w-0 w-[240px] p-1.5"
    >
      <div className="flex flex-col gap-2">
        {view.kind === 'selection' ? (
          <>
            <SelectionSummaryHeader summary={view.selection.summary} />
            {filterTypes?.length ? (
              <div className="flex flex-col gap-2 rounded-xl bg-surface-subtle px-2 py-2">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted">
                  Filter
                </div>
                <SelectionTypeFilterStrip
                  types={filterTypes}
                  onSelect={(key) => {
                    const selection = editor.read.selection.summary.get()
                    const selected = selectNodesByTypeKey({
                      editor,
                      registry,
                      nodes: selection.items.nodes,
                      key
                    })
                    if (!selected) {
                      return
                    }
                    dismiss()
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
        {menuItems.length ? (
          <Menu
            items={menuItems}
            autoFocus
          />
        ) : null}
      </div>
    </WhiteboardPopover>
  )
}
