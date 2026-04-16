import {
  createMindmapPreviewModel,
  computeMindmapLayout,
  listMindmapPresets,
  resolveMindmapRender,
  type MindmapNodeStyle
} from '@whiteboard/core/mindmap'
import { PickerOptionButton, PickerSection } from '@shared/ui'

const PREVIEW_NODE_SIZE = {
  width: 84,
  height: 28
}

const previewStrokeDasharray = (stroke: 'solid' | 'dashed' | 'dotted') => {
  switch (stroke) {
    case 'dashed':
      return '6 4'
    case 'dotted':
      return '2 4'
    default:
      return undefined
  }
}

const renderNodeShell = ({
  id,
  style,
  x,
  y,
  width,
  height
}: {
  id: string
  style: MindmapNodeStyle
  x: number
  y: number
  width: number
  height: number
}) => {
  if (style.frame.kind === 'ellipse') {
    return (
      <rect
        key={id}
        x={x}
        y={y}
        width={width}
        height={height}
        rx={height / 2}
        fill={style.fill}
        stroke={style.frame.color}
        strokeWidth={style.frame.width}
      />
    )
  }

  if (style.frame.kind === 'underline') {
    return (
      <line
        key={id}
        x1={x}
        y1={y + height}
        x2={x + width}
        y2={y + height}
        stroke={style.frame.color}
        strokeWidth={style.frame.width}
      />
    )
  }

  return (
    <rect
      key={id}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={style.fill}
      stroke={style.frame.color}
      strokeWidth={style.frame.width}
    />
  )
}

const MindmapPresetPreview = ({
  presetKey
}: {
  presetKey: string
}) => {
  const preview = createMindmapPreviewModel({
    preset: presetKey,
    seed: 'project'
  })
  const computed = computeMindmapLayout(
    preview.tree,
    () => PREVIEW_NODE_SIZE
  )
  const render = resolveMindmapRender({
    tree: preview.tree,
    computed
  })

  return (
    <svg
      viewBox={`${render.bbox.x} ${render.bbox.y} ${render.bbox.width} ${render.bbox.height}`}
      aria-hidden="true"
      className="block h-10 w-16"
    >
      {render.connectors.map((connector) => (
        <path
          key={connector.id}
          d={connector.path}
          fill="none"
          stroke={connector.style.color}
          strokeWidth={connector.style.width}
          strokeDasharray={previewStrokeDasharray(connector.style.stroke)}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {Object.entries(computed.node).map(([nodeId, rect]) => {
        const style = preview.nodeStyles[nodeId]
        return style
          ? renderNodeShell({
              id: nodeId,
              style,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            })
          : null
      })}
    </svg>
  )
}

const PRESETS = listMindmapPresets()

export const MindmapMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <PickerSection title="Mindmap">
    <div className="flex flex-col gap-1">
      {PRESETS.map((preset) => (
        <PickerOptionButton
          key={preset.key}
          type="button"
          className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-2"
          pressed={value === preset.key}
          onClick={() => onChange(preset.key)}
        >
          <span className="inline-flex h-12 w-[72px] items-center justify-center rounded-lg bg-surface-subtle text-fg-muted">
            <MindmapPresetPreview presetKey={preset.key} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm leading-5 text-fg">{preset.label}</span>
            <span className="text-xs leading-4 text-fg-muted">{preset.description}</span>
          </span>
        </PickerOptionButton>
      ))}
    </div>
  </PickerSection>
)
