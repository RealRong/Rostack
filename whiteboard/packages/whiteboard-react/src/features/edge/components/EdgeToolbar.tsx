import {
  useCallback,
  type RefObject
} from 'react'
import { ArrowLeftRight, Type } from 'lucide-react'
import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection,
  ToolbarButton,
  ToolbarDivider,
  ToolbarIconButton
} from '@shared/ui'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  Point
} from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#whiteboard-react/runtime/hooks'
import { FloatingToolbarShell } from '#whiteboard-react/features/selection/chrome/FloatingToolbarShell'
import { STROKE_COLOR_OPTIONS } from '#whiteboard-react/features/selection/chrome/menus/options'

type PanelKey = 'start' | 'end' | 'line' | 'color' | 'text-mode'

const EDGE_TYPES: readonly EdgeType[] = ['straight', 'elbow', 'curve']
const EDGE_DASHES: readonly EdgeDash[] = ['solid', 'dashed', 'dotted']
const EDGE_MARKERS: readonly EdgeMarker[] = ['none', 'arrow']
const EDGE_TEXT_MODES: readonly EdgeTextMode[] = ['horizontal', 'tangent']

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
    <SliderSection
      title="Line width"
      min={1}
      max={16}
      step={1}
      value={width ?? 2}
      onChange={onWidthChange}
    />
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
      <ColorSwatchGrid
        options={STROKE_COLOR_OPTIONS}
        value={value}
        onChange={onChange}
      />
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
  const panel = useStoreValue(editor.read.panel)
  const toolbar = panel.edgeToolbar
  const worldToScreen = useCallback(
    (point: Point) => editor.read.viewport.worldToScreen(point),
    [editor]
  )

  if (!toolbar) {
    return null
  }

  const single = toolbar.edgeIds.length === 1
  const itemCount = single ? 10 : 7

  return (
    <FloatingToolbarShell<PanelKey>
      containerRef={containerRef}
      toolbarKey={toolbar.selectionKey}
      box={toolbar.box}
      itemCount={itemCount}
      worldToScreen={worldToScreen}
      renderToolbar={({
        activePanelKey,
        togglePanel,
        registerPanelButton
      }) => (
        <>
          <ToolbarIconButton
            ref={(element) => {
              registerPanelButton('start', element)
            }}
            active={activePanelKey === 'start'}
            onClick={() => {
              togglePanel('start')
            }}
            title="Line start"
            aria-label="Line start"
          >
            <EdgeMarkerIcon marker={toolbar.start} side="start" />
          </ToolbarIconButton>
          {single ? (
            <ToolbarIconButton
              active={false}
              title="Swap markers"
              onClick={() => {
                if (!toolbar.primaryEdgeId) {
                  return
                }

                editor.actions.edge.style.start(
                  [toolbar.primaryEdgeId],
                  toolbar.end ?? 'none'
                )
                editor.actions.edge.style.end(
                  [toolbar.primaryEdgeId],
                  toolbar.start ?? 'none'
                )
              }}
              >
                <ArrowLeftRight size={18} strokeWidth={1.9} />
              </ToolbarIconButton>
          ) : null}
          <ToolbarIconButton
            ref={(element) => {
              registerPanelButton('end', element)
            }}
            active={activePanelKey === 'end'}
            onClick={() => {
              togglePanel('end')
            }}
            title="Line end"
            aria-label="Line end"
          >
            <EdgeMarkerIcon marker={toolbar.end} side="end" />
          </ToolbarIconButton>
          <ToolbarDivider />
          <ToolbarIconButton
            ref={(element) => {
              registerPanelButton('line', element)
            }}
            active={activePanelKey === 'line'}
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
          </ToolbarIconButton>
          <ToolbarIconButton
            ref={(element) => {
              registerPanelButton('color', element)
            }}
            active={activePanelKey === 'color'}
            onClick={() => {
              togglePanel('color')
            }}
            title="Color"
            aria-label="Color"
          >
            <EdgeColorIcon color={toolbar.color} />
          </ToolbarIconButton>
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
                  editor.actions.edge.label.add(toolbar.primaryEdgeId)
                }}
              >
                <Type size={18} strokeWidth={1.9} />
              </ToolbarIconButton>
              <ToolbarButton
                ref={(element) => {
                  registerPanelButton('text-mode', element)
                }}
                active={activePanelKey === 'text-mode'}
                className="min-w-[76px]"
                onClick={() => {
                  togglePanel('text-mode')
                }}
                title="Text position"
                aria-label="Text position"
              >
                {toolbar.textMode ?? 'horizontal'}
              </ToolbarButton>
            </>
          ) : null}
        </>
      )}
      renderPanel={({ activePanelKey }) => (
        activePanelKey === 'start' ? (
          <MarkerPanel
            value={toolbar.start}
            onChange={(value) => {
              editor.actions.edge.style.start(toolbar.edgeIds, value)
            }}
          />
        ) : activePanelKey === 'end' ? (
          <MarkerPanel
            value={toolbar.end}
            onChange={(value) => {
              editor.actions.edge.style.end(toolbar.edgeIds, value)
            }}
          />
        ) : activePanelKey === 'line' ? (
          <LinePanel
            type={toolbar.type}
            dash={toolbar.dash}
            width={toolbar.width}
            onTypeChange={(value) => {
              editor.actions.edge.type.set(toolbar.edgeIds, value)
            }}
            onDashChange={(value) => {
              editor.actions.edge.style.dash(toolbar.edgeIds, value)
            }}
            onWidthChange={(value) => {
              editor.actions.edge.style.width(toolbar.edgeIds, value)
            }}
          />
        ) : activePanelKey === 'color' ? (
          <ColorPanel
            value={toolbar.color}
            onChange={(value) => {
              editor.actions.edge.style.color(toolbar.edgeIds, value)
            }}
          />
        ) : single ? (
          <TextModePanel
            value={toolbar.textMode}
            onChange={(value) => {
              editor.actions.edge.textMode.set(toolbar.edgeIds, value)
            }}
          />
        ) : null
      )}
    />
  )
}
