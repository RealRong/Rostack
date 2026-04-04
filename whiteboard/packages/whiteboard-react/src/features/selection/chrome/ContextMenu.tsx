import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Point } from '@whiteboard/core/types'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import { useNodeRegistry } from '../../../runtime/hooks/useEnvironment'
import { useHostRuntime } from '../../../runtime/hooks/useHost'
import { useElementSize } from '../../../runtime/hooks/useElementSize'
import { useOverlayDismiss } from '../../../runtime/overlay/useOverlayDismiss'
import { isContextMenuIgnoredTarget } from '../../../runtime/host/domTargets'
import {
  resolveHostPoint,
  type HostResolvedPoint
} from '../../../runtime/host/input'
import { useClipboardActions } from '../../../runtime/host/useClipboardActions'
import {
  duplicateNodesAndSelect,
  groupNodesAndSelect,
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
import {
  isDuplicateMenuOpen,
  readContextMenuPlacement
} from './layout'
import { bindMenuDismiss } from './menuAction'

type ContextMenuSide = 'left' | 'right'
type ContextMenuRenderState = {
  submenuKey: string | null
  submenuSide: ContextMenuSide
  openSubmenu: (key: string) => void
  clearSubmenu: () => void
}

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

const COLOR_OPTIONS = [
  { label: 'Ink', value: 'var(--ui-text-primary)' },
  { label: 'White', value: 'var(--ui-surface)' },
  { label: 'Gray', value: 'var(--ui-surface-muted)' },
  { label: 'Yellow', value: 'var(--ui-yellow-bg-strong)' },
  { label: 'Red', value: 'var(--ui-red-bg-strong)' },
  { label: 'Blue', value: 'var(--ui-blue-bg-strong)' },
  { label: 'Green', value: 'var(--ui-green-bg-strong)' },
  { label: 'Purple', value: 'var(--ui-purple-bg-strong)' },
  { label: 'Pink', value: 'var(--ui-pink-bg-strong)' },
  { label: 'Slate', value: 'var(--ui-text-secondary)' },
  { label: 'Danger', value: 'var(--ui-danger)' },
  { label: 'Orange', value: 'var(--ui-orange-text)' },
  { label: 'Forest', value: 'var(--ui-green-text)' },
  { label: 'Accent', value: 'var(--ui-accent)' },
  { label: 'Violet', value: 'var(--ui-purple-text)' }
] as const

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

const MenuIgnoreAttrs = {
  'data-context-menu-ignore': '',
  'data-selection-ignore': '',
  'data-input-ignore': ''
} as const

const withCurrentLabel = (
  label: string,
  active: boolean
) => active ? `${label} (Current)` : label

const readSelectionContextView = (
  editor: ReturnType<typeof useEditorRuntime>,
  registry: ReturnType<typeof useNodeRegistry>,
  screen: Point
): Extract<ContextMenuView, { kind: 'selection' }> | undefined => {
  const selection = editor.read.selection.summary.get()
  if (
    selection.items.nodeCount === 0
    || selection.items.edgeCount > 0
  ) {
    return undefined
  }

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
      style: readNodeSelectionStyle({
        summary: selection,
        registry
      }) ?? undefined
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
  point: HostResolvedPoint
}): ContextMenuView | null => {
  switch (point.pick.kind) {
    case 'selection-box': {
      const selection = editor.read.selection.summary.get()
      if (
        selection.target.nodeIds.length > 0
        && selection.target.edgeIds.length === 0
      ) {
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
      const reuseCurrentSelection =
        selection.target.nodeSet.has(point.pick.id)
        && selection.target.edgeIds.length === 0
      const nodeIds = reuseCurrentSelection
        ? selection.target.nodeIds
        : [point.pick.id]

      syncNodeSelection(editor, nodeIds)
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
        children: COLOR_OPTIONS.map((option) => ({
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
  host,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  host: ReturnType<typeof useHostRuntime>
  clipboard: ReturnType<typeof useClipboardActions>
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
      onSelect: bindMenuDismiss(() => host.insert.get()?.preset(preset.key, {
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
  clipboard: ReturnType<typeof useClipboardActions>
  view: Extract<ContextMenuView, { kind: 'edge' }>
  dismiss: () => void
}): readonly MenuGroup[] => [
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
  clipboard: ReturnType<typeof useClipboardActions>
  view: Extract<ContextMenuView, { kind: 'selection' }>
  dismiss: () => void
}): readonly MenuGroup[] => {
  const { summary, can, style } = view.selection
  const nodeIds = summary.ids
  const groups: MenuGroup[] = []

  const styleGroup = readSelectionStyleGroup({
    editor,
    style,
    nodeIds,
    dismiss
  })
  if (styleGroup) {
    groups.push(styleGroup)
  }

  groups.push({
    key: 'edit',
    title: 'Edit',
    items: [
      ...(can.copy
        ? [
            {
              key: 'edit.copy',
              label: 'Copy',
              onSelect: bindMenuDismiss(() => clipboard.copy({
                nodeIds
              }), dismiss)
            }
          ]
        : []),
      ...(can.cut
        ? [
            {
              key: 'edit.cut',
              label: 'Cut',
              onSelect: bindMenuDismiss(() => clipboard.cut({
                nodeIds
              }), dismiss)
            }
          ]
        : []),
      ...(can.duplicate
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
      ...(can.delete
        ? [
            {
              key: 'edit.delete',
              label: 'Delete',
              tone: 'danger' as const,
              onSelect: bindMenuDismiss(() => editor.commands.node.deleteCascade([...nodeIds]), dismiss)
            }
          ]
        : [])
    ]
  })

  if (can.order) {
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
                editor.commands.node.order.bringToFront([...nodeIds])
                return
              }
              if (item.mode === 'forward') {
                editor.commands.node.order.bringForward([...nodeIds])
                return
              }
              if (item.mode === 'backward') {
                editor.commands.node.order.sendBackward([...nodeIds])
                return
              }

              editor.commands.node.order.sendToBack([...nodeIds])
            }, dismiss)
          }))
        },
        ...(can.makeGroup
          ? [
              {
                key: 'arrange.group',
                label: 'Group',
                onSelect: bindMenuDismiss(() => {
                  groupNodesAndSelect(editor, nodeIds)
                }, dismiss)
              }
            ]
          : []),
        ...(can.ungroup
          ? [
              {
                key: 'arrange.ungroup',
                label: 'Ungroup',
                onSelect: bindMenuDismiss(() => {
                  const groupIds = editor.read.selection.summary.get().items.nodes
                    .filter((node) => node.type === 'group')
                    .map((node) => node.id)
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
  }

  if (can.align || can.distribute) {
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

const ContextMenuItemView = ({
  item,
  state
}: {
  item: MenuItem
  state: ContextMenuRenderState
}) => {
  const open = state.submenuKey === item.key
  const children = item.children?.length

  if (!children) {
    return (
      <button
        key={item.key}
        type="button"
        className="wb-context-menu-item"
        data-tone={item.tone === 'danger' ? 'danger' : undefined}
        disabled={item.disabled}
        data-context-menu-item={item.key}
        onClick={item.onSelect}
        onPointerEnter={state.clearSubmenu}
        onFocus={state.clearSubmenu}
        {...MenuIgnoreAttrs}
      >
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <div
      key={item.key}
      className="wb-context-menu-item-shell"
      data-open={open ? 'true' : undefined}
      onPointerEnter={() => {
        state.openSubmenu(item.key)
      }}
      onFocus={() => {
        state.openSubmenu(item.key)
      }}
      data-context-menu-ignore
    >
      <button
        type="button"
        className="wb-context-menu-item"
        aria-haspopup="menu"
        aria-expanded={open}
        data-context-menu-item={item.key}
        {...MenuIgnoreAttrs}
      >
        <span>{item.label}</span>
        <span className="wb-context-menu-item-caret" aria-hidden="true">›</span>
      </button>
      {open ? (
        <div
          className="wb-context-submenu"
          data-side={state.submenuSide}
          {...MenuIgnoreAttrs}
        >
          {item.children?.map((child) => (
            <ContextMenuItemView
              key={child.key}
              item={child}
              state={state}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

const ContextMenuGroupView = ({
  group,
  state
}: {
  group: MenuGroup
  state: ContextMenuRenderState
}) => (
  <div className="wb-context-menu-section">
    {group.title ? (
      <div className="wb-context-menu-section-title">{group.title}</div>
    ) : null}
    {group.items.map((item) => (
      <ContextMenuItemView
        key={item.key}
        item={item}
        state={state}
      />
    ))}
  </div>
)

const readMenuGroups = ({
  editor,
  host,
  clipboard,
  view,
  dismiss
}: {
  editor: ReturnType<typeof useEditorRuntime>
  host: ReturnType<typeof useHostRuntime>
  clipboard: ReturnType<typeof useClipboardActions>
  view: ContextMenuView
  dismiss: () => void
}): readonly MenuGroup[] => {
  switch (view.kind) {
    case 'canvas':
      return readCanvasGroups({
        editor,
        host,
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
  const host = useHostRuntime()
  const clipboard = useClipboardActions()
  const surface = useElementSize(containerRef)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const lastOpenRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const [view, setView] = useState<ContextMenuView | null>(null)
  const [submenuKey, setSubmenuKey] = useState<string | null>(null)

  const dismiss = useCallback(() => {
    setView(null)
    setSubmenuKey(null)
  }, [])

  useEffect(() => {
    setSubmenuKey(null)
  }, [view])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const openFromEvent = (
      event: Pick<MouseEvent | PointerEvent, 'target' | 'clientX' | 'clientY'>
    ) => {
      const point = resolveHostPoint({
        editor,
        pick: host.pick,
        container,
        event
      })
      host.pointer.set(point.world)
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
      setSubmenuKey(null)
      lastOpenRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now()
      }
      return true
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return
      if (editor.state.interaction.get().busy) return
      if (isContextMenuIgnoredTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      openFromEvent(event)
    }

    const onContextMenu = (event: MouseEvent) => {
      if (editor.state.interaction.get().busy) return
      if (isContextMenuIgnoredTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()

      if (isDuplicateMenuOpen(lastOpenRef.current, {
        x: event.clientX,
        y: event.clientY,
        time: Date.now()
      })) {
        return
      }

      openFromEvent(event)
    }

    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('contextmenu', onContextMenu)
    }
  }, [clipboard, containerRef, dismiss, editor, host, registry])

  useOverlayDismiss({
    enabled: view !== null,
    rootRef,
    onDismiss: dismiss
  })

  if (!view) return null

  const placement = readContextMenuPlacement({
    screen: view.screen,
    containerWidth: surface.width,
    containerHeight: surface.height
  })
  const menuStyle = {
    left: placement.left,
    top: placement.top,
    transform: placement.transform
  }
  const renderState: ContextMenuRenderState = {
    submenuKey,
    submenuSide: placement.submenuSide,
    openSubmenu: (key) => {
      setSubmenuKey(key)
    },
    clearSubmenu: () => {
      setSubmenuKey(null)
    }
  }
  const groups = readMenuGroups({
    editor,
    host,
    clipboard,
    view,
    dismiss
  })
  const filterTypes = readFilterTypes(view)

  return (
    <div className="wb-context-menu-layer" ref={rootRef} data-context-menu-ignore>
      <div
        className="wb-context-menu"
        style={menuStyle}
        {...MenuIgnoreAttrs}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onPointerLeave={() => {
          renderState.clearSubmenu()
        }}
      >
        {view.kind === 'selection' ? (
          <>
            <SelectionSummaryHeader summary={view.selection.summary} />
            {filterTypes?.length ? (
              <div className="wb-context-menu-section">
                <div className="wb-context-menu-section-title">Filter</div>
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
        {groups.map((group) => (
          <ContextMenuGroupView
            key={group.key}
            group={group}
            state={renderState}
          />
        ))}
      </div>
    </div>
  )
}
