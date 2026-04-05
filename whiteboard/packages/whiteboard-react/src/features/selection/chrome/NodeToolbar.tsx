import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from 'react'
import type { Point } from '@whiteboard/core/types'
import {
  useEditorRuntime
} from '../../../runtime/hooks/useEditor'
import { useNodeRegistry } from '../../../runtime/hooks/useWhiteboard'
import { useElementSize } from '../../../dom/observe/useElementSize'
import { WhiteboardPopover } from '../../../runtime/overlay/chrome'
import { useSelectionPresentation } from '../../node/selection'
import {
  measureBoundTextNodeSize,
  TEXT_DEFAULT_FONT_SIZE
} from '../../node/text'
import {
  buildToolbarStyle,
} from './layout'
import type { ToolbarItemKey } from '../../../types/selection'
import { FillMenu } from './menus/FillMenu'
import { LayoutMenu } from './menus/LayoutMenu'
import { MoreMenu } from './menus/MoreMenu'
import { DRAW_STROKE_WIDTHS } from './menus/options'
import { StrokeMenu } from './menus/StrokeMenu'
import { TextMenu } from './menus/TextMenu'
import { ToolbarIcon } from './nodeToolbarIcon'
import { resolveNodeToolbarModel } from './nodeToolbarModel'
import { bindMenuDismiss } from './menuAction'

type ToolbarMenuKey = ToolbarItemKey

export const NodeToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const registry = useNodeRegistry()
  const surface = useElementSize(containerRef)
  const presentation = useSelectionPresentation()
  const selection = presentation.selection
  const worldToScreen = useCallback(
    (point: Point) => editor.read.viewport.worldToScreen(point),
    [editor]
  )
  const buttonRefByKey = useRef<Partial<Record<ToolbarMenuKey, HTMLButtonElement | null>>>({})
  const [activeMenuKey, setActiveMenuKey] = useState<ToolbarMenuKey | null>(null)
  const closeMenu = useCallback(() => {
    setActiveMenuKey(null)
  }, [])
  const toolbar = resolveNodeToolbarModel({
    registry,
    selection,
    worldToScreen
  })

  const showsNodeToolbar = presentation.showToolbar

  useEffect(() => {
    closeMenu()
  }, [
    closeMenu,
    toolbar?.placement,
    toolbar?.anchor.x,
    toolbar?.anchor.y,
    toolbar?.nodes
  ])

  useEffect(() => {
    if (!showsNodeToolbar) {
      closeMenu()
    }
  }, [closeMenu, showsNodeToolbar])

  if (!showsNodeToolbar || !toolbar) return null

  const toolbarStyle = buildToolbarStyle({
    placement: toolbar.placement,
    x: toolbar.anchor.x,
    y: toolbar.placement === 'top' ? toolbar.anchor.y - 12 : toolbar.anchor.y + 12,
    containerWidth: surface.width,
    itemCount: toolbar.items.length
  })

  const menu = selection.menu
  const filter = menu?.filter
    ? {
        types: menu.filter.types,
        onSelect: bindMenuDismiss(menu.filter.onSelect, closeMenu)
      }
    : undefined
  const moreSections = menu?.moreSections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      onSelect: bindMenuDismiss(item.onSelect, closeMenu)
    }))
  })) ?? []

  const renderMenu = () => {
    if (!activeMenuKey) return null

    switch (activeMenuKey) {
      case 'fill':
        return (
          <FillMenu
            value={toolbar.fillValue}
            onChange={(value) => {
              editor.commands.node.appearance.setFill(
                toolbar.nodes.map((node) => node.id),
                value
              )
            }}
          />
        )
      case 'stroke':
        return (
          <StrokeMenu
            widths={toolbar.drawOnlyStrokeMenu ? DRAW_STROKE_WIDTHS : undefined}
            stroke={toolbar.strokeValue}
            strokeWidth={toolbar.strokeWidthValue}
            opacity={toolbar.strokeOpacityValue}
            onStrokeChange={(value) => {
              editor.commands.node.appearance.setStroke(
                toolbar.nodes.map((node) => node.id),
                value
              )
            }}
            onStrokeWidthChange={(value) => {
              editor.commands.node.appearance.setStrokeWidth(
                toolbar.nodes.map((node) => node.id),
                value
              )
            }}
            onOpacityChange={toolbar.showStrokeOpacitySection ? (value) => {
              editor.commands.node.appearance.setOpacity(
                toolbar.nodes.map((node) => node.id),
                value
              )
            } : undefined}
          />
        )
      case 'text':
        return (
          <TextMenu
            value={toolbar.textValue}
            color={toolbar.textColor}
            fontSize={toolbar.textFontSize}
            showText={toolbar.showTextSection}
            showColor={toolbar.showTextColorSection}
            showFontSize={toolbar.showTextFontSizeSection}
            onTextCommit={toolbar.showTextSection ? (value) => {
              const size = toolbar.primaryNode.type === 'text' && toolbar.textFieldKey === 'text'
                ? measureBoundTextNodeSize({
                    editor,
                    nodeId: toolbar.primaryNode.id,
                    value
                  })
                : undefined

              editor.commands.node.text.commit({
                nodeId: toolbar.primaryNode.id,
                field: toolbar.textFieldKey,
                value,
                size
              })
            } : undefined}
            onColorChange={toolbar.showTextColorSection ? (value) => {
              editor.commands.node.text.setColor(
                [toolbar.primaryNode.id],
                value
              )
            } : undefined}
            onFontSizeChange={toolbar.showTextFontSizeSection ? (value) => {
              const size = toolbar.primaryNode.type === 'text' && toolbar.textFieldKey === 'text'
                ? measureBoundTextNodeSize({
                    editor,
                    nodeId: toolbar.primaryNode.id,
                    value: toolbar.textValue,
                    fontSize: value ?? TEXT_DEFAULT_FONT_SIZE
                  })
                : undefined

              editor.commands.node.text.setFontSize({
                nodeIds: [toolbar.primaryNode.id],
                value,
                sizeById: size
                  ? {
                      [toolbar.primaryNode.id]: size
                    }
                  : undefined
              })
            } : undefined}
          />
        )
      case 'layout':
        return (
          <LayoutMenu
            canAlign={Boolean(menu?.layout.canAlign)}
            canDistribute={Boolean(menu?.layout.canDistribute)}
            onAlign={(mode) => {
              menu?.layout && bindMenuDismiss(menu.layout.onAlign, closeMenu)(mode)
            }}
            onDistribute={(mode) => {
              menu?.layout && bindMenuDismiss(menu.layout.onDistribute, closeMenu)(mode)
            }}
          />
        )
      case 'more':
        return (
          <MoreMenu
            summary={toolbar.nodes.length > 1
              ? toolbar.summary
              : undefined}
            filter={filter}
            sections={moreSections}
          />
        )
    }
  }

  const activeMenuButton = activeMenuKey
    ? buttonRefByKey.current[activeMenuKey]
    : null
  const menuContentClassName = activeMenuKey === 'more'
    ? 'min-w-0 p-0'
    : activeMenuKey === 'layout'
      ? 'min-w-0 p-2'
      : 'min-w-[220px] p-2'

  return (
    <div className="wb-node-toolbar-layer">
      <div
        className="wb-node-toolbar"
        style={toolbarStyle}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        {toolbar.items.map((item) => {
          const active = item.active || activeMenuKey === item.key
          return (
            <button
              key={item.key}
              type="button"
              className="wb-node-toolbar-button"
              data-active={active ? 'true' : undefined}
              title={item.label}
              ref={(element) => {
                buttonRefByKey.current[item.key] = element
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={() => {
                setActiveMenuKey((current) => current === item.key ? null : item.key)
              }}
            >
              <ToolbarIcon itemKey={item.key} state={toolbar.iconState} />
            </button>
          )
        })}
      </div>
      {activeMenuKey && activeMenuButton ? (
        <WhiteboardPopover
          open
          anchor={activeMenuButton}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeMenu()
            }
          }}
          placement="bottom"
          offset={8}
          contentClassName={menuContentClassName}
        >
          {renderMenu()}
        </WhiteboardPopover>
      ) : null}
    </div>
  )
}
