import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import { Button, Slider, cn } from '@ui'
import { ArrowLeftRight, Type } from 'lucide-react'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  Point
} from '@whiteboard/core/types'
import { useElementSize, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'
import { WhiteboardPopover } from '#react/runtime/overlay'
import {
  buildToolbarStyle,
  resolveToolbarPlacement
} from '#react/features/selection/chrome/layout'
import {
  Panel,
  PanelSection,
  SegmentedButton,
  SwatchButton
} from '#react/features/selection/chrome/panels/ShapeToolbarPrimitives'
import { STROKE_COLOR_OPTIONS } from '#react/features/selection/chrome/menus/options'
import {
  ToolbarDivider,
  ToolbarIconButton
} from '#react/features/selection/chrome/toolbar/primitives'

type PanelKey = 'start' | 'end' | 'line' | 'color' | 'text-mode'

type ToolbarPositionSession = {
  key: string
  placement: 'top' | 'bottom'
  anchorWorld: Point
}

const EDGE_TYPES: readonly EdgeType[] = ['straight', 'elbow', 'curve']
const EDGE_DASHES: readonly EdgeDash[] = ['solid', 'dashed', 'dotted']
const EDGE_MARKERS: readonly EdgeMarker[] = ['none', 'arrow']
const EDGE_TEXT_MODES: readonly EdgeTextMode[] = ['horizontal', 'tangent']

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

const EdgeMarkerIcon = ({
  marker,
  side
}: {
  marker?: EdgeMarker
  side: 'start' | 'end'
}) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none">
    <path
      d="M4 12 H20"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
    {marker === 'arrow' ? (
      side === 'start' ? (
        <path
          d="M9 8 L4 12 L9 16"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M15 8 L20 12 L15 16"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    ) : null}
  </svg>
)

const EdgeLineIcon = ({
  type,
  dash,
  color
}: {
  type?: EdgeType
  dash?: EdgeDash
  color?: string
}) => {
  const dashArray =
    dash === 'dashed'
      ? '6 4'
      : dash === 'dotted'
        ? '1 4'
        : undefined

  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      {type === 'curve' ? (
        <path
          d="M3 17 C8 4, 16 20, 21 7"
          stroke={color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      ) : type === 'elbow' ? (
        <path
          d="M4 17 H11 V7 H20"
          stroke={color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4 17 L20 7"
          stroke={color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

const EdgeColorIcon = ({
  color
}: {
  color?: string
}) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none">
    <path
      d="M4 16 H20"
      stroke={color ?? 'currentColor'}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </svg>
)

const MarkerPanel = ({
  value,
  onChange
}: {
  value?: EdgeMarker
  onChange: (value: EdgeMarker) => void
}) => (
  <Panel className="min-w-[160px]">
    <PanelSection title="Marker">
      <div className="flex items-center gap-2">
        {EDGE_MARKERS.map((option) => (
          <SegmentedButton
            key={option}
            active={(value ?? 'none') === option}
            onClick={() => onChange(option)}
          >
            <EdgeMarkerIcon marker={option} side="end" />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
  </Panel>
)

const LinePanel = ({
  type,
  dash,
  width,
  onTypeChange,
  onDashChange,
  onWidthChange
}: {
  type?: EdgeType
  dash?: EdgeDash
  width?: number
  onTypeChange: (value: EdgeType) => void
  onDashChange: (value: EdgeDash) => void
  onWidthChange: (value: number) => void
}) => (
  <Panel className="min-w-[280px]">
    <PanelSection title="Line type">
      <div className="flex items-center gap-2">
        {EDGE_TYPES.map((option) => (
          <SegmentedButton
            key={option}
            active={(type ?? 'straight') === option}
            onClick={() => onTypeChange(option)}
          >
            <EdgeLineIcon type={option} />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <PanelSection title="Line style">
      <div className="flex items-center gap-2">
        {EDGE_DASHES.map((option) => (
          <SegmentedButton
            key={option}
            active={(dash ?? 'solid') === option}
            onClick={() => onDashChange(option)}
          >
            <EdgeLineIcon dash={option} />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <PanelSection title="Line width">
      <Slider
        min={1}
        max={16}
        step={1}
        value={width ?? 2}
        onValueChange={onWidthChange}
        onValueCommit={onWidthChange}
      />
    </PanelSection>
  </Panel>
)

const ColorPanel = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <Panel className="min-w-[240px]">
    <PanelSection title="Color">
      <div className="grid grid-cols-5 gap-2">
        {STROKE_COLOR_OPTIONS.map((option) => (
          <SwatchButton
            key={option.value}
            color={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </PanelSection>
  </Panel>
)

const TextModePanel = ({
  value,
  onChange
}: {
  value?: EdgeTextMode
  onChange: (value: EdgeTextMode) => void
}) => (
  <Panel className="min-w-[180px]">
    <PanelSection title="Text position">
      <div className="flex items-center gap-2">
        {EDGE_TEXT_MODES.map((option) => (
          <SegmentedButton
            key={option}
            active={(value ?? 'horizontal') === option}
            onClick={() => onChange(option)}
          >
            {option === 'horizontal' ? 'Horizontal' : 'Tangent'}
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
  </Panel>
)

export const EdgeToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const surface = useElementSize(containerRef)
  const toolbar = useStoreValue(editor.read.edge.toolbar)
  const buttonRefByKey = useRef<Partial<Record<PanelKey, HTMLElement | null>>>({})
  const [activePanelKey, setActivePanelKey] = useState<PanelKey | null>(null)
  const [positionSession, setPositionSession] = useState<ToolbarPositionSession | null>(null)
  const worldToScreen = useCallback(
    (point: Point) => editor.read.viewport.worldToScreen(point),
    [editor]
  )

  const closePanel = useCallback(() => {
    setActivePanelKey(null)
  }, [])

  const togglePanel = useCallback((key: PanelKey) => {
    setActivePanelKey((current) => current === key ? null : key)
  }, [])

  const key = toolbar?.selectionKey ?? null
  const livePlacement = toolbar
    ? resolveToolbarPlacement({
        worldToScreen,
        rect: toolbar.box
      })
    : undefined
  const livePosition = toolbar && key && livePlacement
    ? {
        key,
        placement: livePlacement.placement,
        anchorWorld: resolveToolbarAnchorWorld({
          placement: livePlacement.placement,
          x: toolbar.box.x,
          y: toolbar.box.y,
          width: toolbar.box.width,
          height: toolbar.box.height
        })
      } satisfies ToolbarPositionSession
    : null

  useEffect(() => {
    closePanel()
  }, [closePanel, key])

  useEffect(() => {
    if (!toolbar || !livePosition || !key) {
      setPositionSession(null)
      return
    }

    setPositionSession((current) => current?.key === key ? current : livePosition)
  }, [key, livePosition, toolbar])

  if (!toolbar) {
    return null
  }

  const single = toolbar.edgeIds.length === 1
  const resolvedPosition = positionSession?.key === key
    ? positionSession
    : livePosition
  const toolbarAnchor = resolvedPosition
    ? worldToScreen(resolvedPosition.anchorWorld)
    : livePlacement?.anchor
  if (!toolbarAnchor) {
    return null
  }

  const itemCount = single ? 10 : 7
  const toolbarStyle = buildToolbarStyle({
    placement: resolvedPosition?.placement ?? livePlacement?.placement ?? 'top',
    x: toolbarAnchor.x,
    y: (resolvedPosition?.placement ?? livePlacement?.placement ?? 'top') === 'top'
      ? toolbarAnchor.y - 12
      : toolbarAnchor.y + 12,
    containerWidth: surface.width,
    itemCount
  })
  const activePanelButton = activePanelKey
    ? buttonRefByKey.current[activePanelKey]
    : null

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
        <Button
          ref={(element) => {
            buttonRefByKey.current.start = element
          }}
          variant="ghost"
          pressed={activePanelKey === 'start'}
          className="h-9 w-9 rounded-xl p-0"
          onClick={() => {
            togglePanel('start')
          }}
          title="Line start"
          aria-label="Line start"
        >
          <EdgeMarkerIcon marker={toolbar.start} side="start" />
        </Button>
        {single ? (
          <ToolbarIconButton
            active={false}
            title="Swap markers"
            onClick={() => {
              if (!toolbar.primaryEdgeId) {
                return
              }
              editor.commands.edge.swapMarkers(toolbar.primaryEdgeId)
            }}
          >
            <ArrowLeftRight size={18} strokeWidth={1.9} />
          </ToolbarIconButton>
        ) : null}
        <Button
          ref={(element) => {
            buttonRefByKey.current.end = element
          }}
          variant="ghost"
          pressed={activePanelKey === 'end'}
          className="h-9 w-9 rounded-xl p-0"
          onClick={() => {
            togglePanel('end')
          }}
          title="Line end"
          aria-label="Line end"
        >
          <EdgeMarkerIcon marker={toolbar.end} side="end" />
        </Button>
        <ToolbarDivider />
        <Button
          ref={(element) => {
            buttonRefByKey.current.line = element
          }}
          variant="ghost"
          pressed={activePanelKey === 'line'}
          className="h-9 w-9 rounded-xl p-0"
          onClick={() => {
            togglePanel('line')
          }}
          title="Line type"
          aria-label="Line type"
        >
          <EdgeLineIcon
            type={toolbar.type}
            dash={toolbar.dash}
            color={toolbar.color}
          />
        </Button>
        <Button
          ref={(element) => {
            buttonRefByKey.current.color = element
          }}
          variant="ghost"
          pressed={activePanelKey === 'color'}
          className="h-9 w-9 rounded-xl p-0"
          onClick={() => {
            togglePanel('color')
          }}
          title="Color"
          aria-label="Color"
        >
          <EdgeColorIcon color={toolbar.color} />
        </Button>
        {single ? (
          <>
            <ToolbarDivider />
            <ToolbarIconButton
              active={toolbar.labelCount > 0}
              title="Add label"
              onClick={() => {
                if (!toolbar.primaryEdgeId) {
                  return
                }
                editor.commands.edge.labels.add(toolbar.primaryEdgeId)
              }}
            >
              <Type size={18} strokeWidth={1.9} />
            </ToolbarIconButton>
            <Button
              ref={(element) => {
                buttonRefByKey.current['text-mode'] = element
              }}
              variant="ghost"
              pressed={activePanelKey === 'text-mode'}
              className="h-9 min-w-[76px] rounded-xl px-3 text-sm font-medium text-fg"
              onClick={() => {
                togglePanel('text-mode')
              }}
              title="Text position"
              aria-label="Text position"
            >
              {toolbar.textMode ?? 'horizontal'}
            </Button>
          </>
        ) : null}
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
          contentClassName={cn('min-w-0 overflow-hidden p-0')}
        >
          {activePanelKey === 'start' ? (
            <MarkerPanel
              value={toolbar.start}
              onChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  style: {
                    start: value
                  }
                })
              }}
            />
          ) : activePanelKey === 'end' ? (
            <MarkerPanel
              value={toolbar.end}
              onChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  style: {
                    end: value
                  }
                })
              }}
            />
          ) : activePanelKey === 'line' ? (
            <LinePanel
              type={toolbar.type}
              dash={toolbar.dash}
              width={toolbar.width}
              onTypeChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  type: value
                })
              }}
              onDashChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  style: {
                    dash: value
                  }
                })
              }}
              onWidthChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  style: {
                    width: value
                  }
                })
              }}
            />
          ) : activePanelKey === 'color' ? (
            <ColorPanel
              value={toolbar.color}
              onChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  style: {
                    color: value
                  }
                })
              }}
            />
          ) : single ? (
            <TextModePanel
              value={toolbar.textMode}
              onChange={(value) => {
                editor.commands.edge.patch(toolbar.edgeIds, {
                  textMode: value
                })
              }}
            />
          ) : null}
        </WhiteboardPopover>
      ) : null}
    </div>
  )
}
