import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection
} from '@shared/ui'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE,
  WHITEBOARD_STROKE_COLOR_OPTIONS,
  resolvePaletteColor
} from '@whiteboard/react/features/palette'

const EDGE_TYPES: readonly EdgeType[] = ['straight', 'elbow', 'curve']
const EDGE_DASHES: readonly EdgeDash[] = ['solid', 'dashed', 'dotted']
const EDGE_MARKERS: readonly EdgeMarker[] = ['none', 'arrow']
const EDGE_TEXT_MODES: readonly EdgeTextMode[] = ['horizontal', 'tangent']

export const EdgeMarkerIcon = ({
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

export const EdgeLineIcon = ({
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
          stroke={resolvePaletteColor(color) ?? color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      ) : type === 'elbow' ? (
        <path
          d="M4 17 H11 V7 H20"
          stroke={resolvePaletteColor(color) ?? color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4 17 L20 7"
          stroke={resolvePaletteColor(color) ?? color ?? 'currentColor'}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export const EdgeLinePanel = ({
  type,
  dash,
  width,
  color,
  onTypeChange,
  onDashChange,
  onWidthChange,
  onColorChange
}: {
  type?: EdgeType
  dash?: EdgeDash
  width?: number
  color?: string
  onTypeChange: (value: EdgeType) => void
  onDashChange: (value: EdgeDash) => void
  onWidthChange: (value: number) => void
  onColorChange: (value: string) => void
}) => (
  <Panel>
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
    <PanelSection title="Color">
      <ColorSwatchGrid
        options={WHITEBOARD_STROKE_COLOR_OPTIONS}
        value={color}
        onChange={onColorChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)

export const EdgeMarkersPanel = ({
  start,
  end,
  onStartChange,
  onEndChange,
  onSwap
}: {
  start?: EdgeMarker
  end?: EdgeMarker
  onStartChange: (value: EdgeMarker) => void
  onEndChange: (value: EdgeMarker) => void
  onSwap?: () => void
}) => (
  <Panel className="min-w-[220px]">
    <PanelSection title="Line start">
      <div className="flex items-center gap-2">
        {EDGE_MARKERS.map((option) => (
          <SegmentedButton
            key={`start:${option}`}
            active={(start ?? 'none') === option}
            onClick={() => onStartChange(option)}
          >
            <EdgeMarkerIcon marker={option} side="start" />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <PanelSection title="Line end">
      <div className="flex items-center gap-2">
        {EDGE_MARKERS.map((option) => (
          <SegmentedButton
            key={`end:${option}`}
            active={(end ?? 'none') === option}
            onClick={() => onEndChange(option)}
          >
            <EdgeMarkerIcon marker={option} side="end" />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    {onSwap ? (
      <PanelSection title="Endpoints">
        <SegmentedButton
          active={false}
          onClick={onSwap}
        >
          Swap markers
        </SegmentedButton>
      </PanelSection>
    ) : null}
  </Panel>
)

export const EdgeTextPanel = ({
  value,
  canAddLabel,
  onChange,
  onAddLabel
}: {
  value?: EdgeTextMode
  canAddLabel: boolean
  onChange: (value: EdgeTextMode) => void
  onAddLabel?: () => void
}) => (
  <Panel className="min-w-[220px]">
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
    {canAddLabel && onAddLabel ? (
      <PanelSection title="Label">
        <SegmentedButton
          active={false}
          onClick={onAddLabel}
        >
          Add label
        </SegmentedButton>
      </PanelSection>
    ) : null}
  </Panel>
)
