import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import { Button, cn } from '@ui'
import { toNodeFieldUpdate, toNodeStylePatch } from '@whiteboard/core/node'
import type { NodeId, Point } from '@whiteboard/core/types'
import { useElementSize, useOptionalKeyedStoreValue, useStoreValue } from '@shared/react'
import { useEdit, useEditorRuntime } from '#react/runtime/hooks'
import { WhiteboardPopover } from '#react/runtime/overlay'
import {
  buildToolbarStyle,
  resolveToolbarPlacement
} from './layout'
import { FillPanel } from './panels/FillPanel'
import { FontSizePanel } from './panels/FontSizePanel'
import { TextColorPanel } from './panels/TextColorPanel'
import {
  ToolbarDivider,
  ToolbarFillIcon,
  ToolbarIconButton,
  ToolbarTextColorIcon
} from './toolbar/primitives'
import { Bold, Italic } from 'lucide-react'

type PanelKey = 'font-size' | 'text-color' | 'background'

type TextToolbarContext =
  | {
      kind: 'node'
      nodeId: NodeId
      nodeType: string
      fontSize?: number
      fontWeight?: number
      italic: boolean
      color?: string
      background?: string
      canSize: boolean
      canWeight: boolean
      canItalic: boolean
      canBackground: boolean
    }
  | {
      kind: 'edge-label'
      edgeId: string
      labelId: string
      fontSize?: number
      fontWeight?: number
      italic: boolean
      color?: string
      background?: string
      canSize: true
      canWeight: true
      canItalic: true
      canBackground: true
    }

type ToolbarPositionSession = {
  key: string
  placement: 'top' | 'bottom'
  anchorWorld: Point
}

const resolveToolbarAnchorWorld = ({
  placement,
  x,
  y,
  width,
  height
}: {
  placement: 'top' | 'bottom'
  x: number
  y: number
  width: number
  height: number
}): Point => ({
  x: x + width / 2,
  y: placement === 'top'
    ? y
    : y + height
})

const resolveContext = (
  edit: ReturnType<typeof useEdit>,
  nodeItem: ReturnType<ReturnType<typeof useEditorRuntime>['read']['node']['item']['get']>,
  edgeItem: ReturnType<ReturnType<typeof useEditorRuntime>['read']['edge']['item']['get']>
): TextToolbarContext | undefined => {
  if (!edit) {
    return undefined
  }

  if (edit.kind === 'node') {
    const node = nodeItem?.node
    if (!node) {
      return undefined
    }

    const type = node.type
    const fontSize = typeof node.style?.fontSize === 'number'
      ? node.style.fontSize
      : undefined
    const fontWeight = typeof node.style?.fontWeight === 'number'
      ? node.style.fontWeight
      : undefined
    const fontStyle = typeof node.style?.fontStyle === 'string'
      ? node.style.fontStyle
      : undefined
    const color = typeof node.style?.color === 'string'
      ? node.style.color
      : undefined

    return {
      kind: 'node',
      nodeId: edit.nodeId,
      nodeType: type,
      fontSize,
      fontWeight,
      italic: fontStyle === 'italic',
      color,
      background: typeof node.style?.fill === 'string' ? node.style.fill : undefined,
      canSize: type === 'text' || type === 'shape',
      canWeight: type === 'text' || type === 'shape',
      canItalic: type === 'text' || type === 'shape',
      canBackground: type === 'text'
    }
  }

  const edge = edgeItem?.edge
  const label = edge?.labels?.find((entry) => entry.id === edit.labelId)
  if (!edge || !label) {
    return undefined
  }

  return {
    kind: 'edge-label',
    edgeId: edit.edgeId,
    labelId: edit.labelId,
    fontSize: label.style?.size,
    fontWeight: label.style?.weight,
    italic: Boolean(label.style?.italic),
    color: label.style?.color,
    background: label.style?.bg,
    canSize: true,
    canWeight: true,
    canItalic: true,
    canBackground: true
  }
}

const createContextWriter = (
  editor: ReturnType<typeof useEditorRuntime>,
  context: TextToolbarContext
) => ({
  setFontSize: (value?: number) => {
    if (!context.canSize) {
      return
    }

    if (context.kind === 'node') {
      const node = editor.read.node.item.get(context.nodeId)?.node
      if (!node) {
        return
      }

      editor.document.nodes.patch([context.nodeId], toNodeFieldUpdate({
        scope: 'style',
        path: 'fontSize'
      }, value))
      return
    }

    editor.document.edges.labels.patch(context.edgeId, context.labelId, {
      style: {
        size: value
      }
    })
  },
  setWeight: (weight?: number) => {
    if (!context.canWeight) {
      return
    }

    if (context.kind === 'node') {
      const node = editor.read.node.item.get(context.nodeId)?.node
      if (!node) {
        return
      }

      editor.document.nodes.patch([context.nodeId], toNodeFieldUpdate({
        scope: 'style',
        path: 'fontWeight'
      }, weight))
      return
    }

    editor.document.edges.labels.patch(context.edgeId, context.labelId, {
      style: {
        weight
      }
    })
  },
  setItalic: (italic: boolean) => {
    if (!context.canItalic) {
      return
    }

    if (context.kind === 'node') {
      const node = editor.read.node.item.get(context.nodeId)?.node
      if (!node) {
        return
      }

      editor.document.nodes.patch([context.nodeId], toNodeStylePatch(node, {
        fontStyle: italic ? 'italic' : 'normal'
      }))
      return
    }

    editor.document.edges.labels.patch(context.edgeId, context.labelId, {
      style: {
        italic
      }
    })
  },
  setColor: (value: string) => {
    if (context.kind === 'node') {
      const node = editor.read.node.item.get(context.nodeId)?.node
      if (!node) {
        return
      }

      editor.document.nodes.patch([context.nodeId], toNodeStylePatch(node, {
        color: value
      }))
      return
    }

    editor.document.edges.labels.patch(context.edgeId, context.labelId, {
      style: {
        color: value
      }
    })
  },
  setBackground: (value: string) => {
    if (!context.canBackground) {
      return
    }

    if (context.kind === 'node') {
      const node = editor.read.node.item.get(context.nodeId)?.node
      if (!node) {
        return
      }

      editor.document.nodes.patch([context.nodeId], toNodeStylePatch(node, {
        fill: value
      }))
      return
    }

    editor.document.edges.labels.patch(context.edgeId, context.labelId, {
      style: {
        bg: value
      }
    })
  }
})

export const TextStyleToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const edit = useEdit()
  const surface = useElementSize(containerRef)
  const box = useStoreValue(editor.read.selection.box)
  const nodeItem = useOptionalKeyedStoreValue(
    editor.read.node.item,
    edit?.kind === 'node'
      ? edit.nodeId
      : undefined,
    undefined
  )
  const edgeItem = useOptionalKeyedStoreValue(
    editor.read.edge.item,
    edit?.kind === 'edge-label'
      ? edit.edgeId
      : undefined,
    undefined
  )
  const buttonRefByKey = useRef<Partial<Record<PanelKey, HTMLElement | null>>>({})
  const [activePanelKey, setActivePanelKey] = useState<PanelKey | null>(null)
  const [positionSession, setPositionSession] = useState<ToolbarPositionSession | null>(null)
  const context = useMemo(
    () => resolveContext(edit, nodeItem, edgeItem),
    [edit, edgeItem, nodeItem]
  )
  const writer = useMemo(
    () => context ? createContextWriter(editor, context) : undefined,
    [context, editor]
  )
  const key = edit
    ? edit.kind === 'node'
      ? `node:${edit.nodeId}:${edit.field}`
      : `edge-label:${edit.edgeId}:${edit.labelId}`
    : null
  const worldToScreen = useCallback(
    (point: Point) => editor.read.viewport.worldToScreen(point),
    [editor]
  )

  const closePanel = useCallback(() => {
    setActivePanelKey(null)
  }, [])

  const togglePanel = useCallback((next: PanelKey) => {
    setActivePanelKey((current) => current === next ? null : next)
  }, [])

  const livePlacement = box
    ? resolveToolbarPlacement({
        worldToScreen,
        rect: box
      })
    : undefined
  const livePosition = key && box && livePlacement
    ? {
        key,
        placement: livePlacement.placement,
        anchorWorld: resolveToolbarAnchorWorld({
          placement: livePlacement.placement,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        })
      } satisfies ToolbarPositionSession
    : null

  useEffect(() => {
    closePanel()
  }, [closePanel, key])

  useEffect(() => {
    if (!context || !livePosition || !key) {
      setPositionSession(null)
      return
    }

    setPositionSession((current) => {
      if (current?.key === key) {
        return current
      }

      return livePosition
    })
  }, [context, key, livePosition])

  if (!context || !box || !writer) {
    return null
  }

  const resolvedPosition = positionSession?.key === key
    ? positionSession
    : livePosition
  const toolbarAnchor = resolvedPosition
    ? worldToScreen(resolvedPosition.anchorWorld)
    : livePlacement?.anchor
  if (!toolbarAnchor) {
    return null
  }

  const items = [
    context.canSize ? 'font-size' : null,
    'divider',
    context.canWeight ? 'bold' : null,
    context.canItalic ? 'italic' : null,
    'text-color',
    context.canBackground ? 'background' : null
  ].filter(Boolean)
  const itemUnits = items.reduce((total, item) => total + (item === 'font-size' ? 2 : item === 'divider' ? 1 : 1), 0)
  const toolbarStyle = buildToolbarStyle({
    placement: resolvedPosition?.placement ?? livePlacement?.placement ?? 'top',
    x: toolbarAnchor.x,
    y: (resolvedPosition?.placement ?? livePlacement?.placement ?? 'top') === 'top'
      ? toolbarAnchor.y - 12
      : toolbarAnchor.y + 12,
    containerWidth: surface.width,
    itemCount: Math.max(itemUnits, 1)
  })

  const activePanelButton = activePanelKey
    ? buttonRefByKey.current[activePanelKey]
    : null
  const activeWeight = (context.fontWeight ?? 400) >= 600

  return (
    <div className="pointer-events-none absolute inset-0 z-[var(--wb-z-toolbar)]">
      <div
        className="pointer-events-auto absolute inline-flex items-center gap-1 rounded-2xl bg-floating px-2 py-1.5 shadow-popover"
        style={toolbarStyle}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {items.map((item, index) => {
          if (item === 'divider') {
            return <ToolbarDivider key={`divider:${index}`} />
          }

          if (item === 'font-size') {
            return (
              <Button
                key={item}
                ref={(element) => {
                  buttonRefByKey.current['font-size'] = element
                }}
                variant="ghost"
                className="h-9 min-w-[56px] rounded-xl px-3 font-medium text-fg"
                pressed={activePanelKey === 'font-size'}
                onClick={() => {
                  togglePanel('font-size')
                }}
              >
                {context.fontSize ?? 14}
              </Button>
            )
          }

          if (item === 'bold') {
            return (
              <Fragment key={item}>
                <ToolbarIconButton
                  active={activeWeight}
                  title="Bold"
                  onClick={() => {
                    writer.setWeight(activeWeight ? 400 : 700)
                  }}
                >
                  <Bold size={18} strokeWidth={1.9} />
                </ToolbarIconButton>
              </Fragment>
            )
          }

          if (item === 'italic') {
            return (
              <Fragment key={item}>
                <ToolbarIconButton
                  active={context.italic}
                  title="Italic"
                  onClick={() => {
                    writer.setItalic(!context.italic)
                  }}
                >
                  <Italic size={18} strokeWidth={1.9} />
                </ToolbarIconButton>
              </Fragment>
            )
          }

          if (item === 'text-color') {
            return (
              <Button
                key={item}
                ref={(element) => {
                  buttonRefByKey.current['text-color'] = element
                }}
                variant="ghost"
                pressed={activePanelKey === 'text-color'}
                className="h-9 w-9 rounded-xl p-0"
                onClick={() => {
                  togglePanel('text-color')
                }}
                title="Text color"
                aria-label="Text color"
              >
                <ToolbarTextColorIcon color={context.color} />
              </Button>
            )
          }

          return (
            <Button
              key={item}
              ref={(element) => {
                buttonRefByKey.current.background = element
              }}
              variant="ghost"
              pressed={activePanelKey === 'background'}
              className="h-9 w-9 rounded-xl p-0"
              onClick={() => {
                togglePanel('background')
              }}
              title="Background color"
              aria-label="Background color"
            >
              <ToolbarFillIcon fill={context.background} />
            </Button>
          )
        })}
      </div>
      {activePanelKey && activePanelButton ? (
        <WhiteboardPopover
          open
          anchor={activePanelButton}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closePanel()
            }
          }}
          placement="bottom"
          offset={10}
          surface="blocking"
          backdrop="transparent"
          padding="menu"
          size="md"
          contentProps={{
            onPointerDown: (event) => {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          contentClassName={cn(
            'min-w-0 overflow-hidden p-0',
            activePanelKey === 'font-size'
              ? 'w-[80px]'
              : 'w-auto'
          )}
        >
          {activePanelKey === 'font-size' ? (
            <FontSizePanel
              value={context.fontSize}
              onChange={(value) => {
                writer.setFontSize(value)
              }}
            />
          ) : activePanelKey === 'text-color' ? (
            <TextColorPanel
              value={context.color}
              onChange={(value) => {
                writer.setColor(value)
              }}
            />
          ) : context.canBackground ? (
            <FillPanel
              fill={context.background}
              onFillChange={(value) => {
                writer.setBackground(value)
              }}
            />
          ) : null}
        </WhiteboardPopover>
      ) : null}
    </div>
  )
}
