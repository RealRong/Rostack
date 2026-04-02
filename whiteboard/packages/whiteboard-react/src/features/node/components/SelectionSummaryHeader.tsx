import {
  Folder,
  PencilLine,
  Square,
  Shapes,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import {
  isShapeKind,
  readShapePreviewFill
} from '@whiteboard/core/node'
import {
  ShapeGlyph
} from '../shape'
import {
  type NodeSummary,
  type NodeTypeSummary,
  readNodeSummaryView
} from '../summary'

const IconByName: Record<string, LucideIcon> = {
  text: Type,
  sticky: StickyNote,
  group: Folder,
  frame: Square,
  draw: PencilLine
}

export const NodeTypeIcon = ({
  icon,
  size = 14,
  strokeWidth = 1.5,
  className
}: {
  icon: string
  size?: number
  strokeWidth?: number
  className?: string
}) => {
  if (isShapeKind(icon)) {
    return (
      <ShapeGlyph
        kind={icon}
        size={size}
        strokeWidth={strokeWidth}
        fill={readShapePreviewFill(icon)}
        className={className}
      />
    )
  }

  const Icon = IconByName[icon] ?? Shapes

  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={className}
      aria-hidden="true"
    />
  )
}

export const SelectionTypeFilterStrip = ({
  types,
  onSelect
}: {
  types: readonly NodeTypeSummary[]
  onSelect: (key: string) => void
}) => (
  <div className="wb-selection-filter-strip">
    {types.map((item) => (
      <button
        key={item.key}
        type="button"
        className="wb-selection-filter-chip"
        onClick={() => {
          onSelect(item.key)
        }}
        title={`Keep only ${item.name}`}
        data-selection-ignore
        data-input-ignore
      >
        <span className="wb-selection-filter-chip-icon">
          <NodeTypeIcon icon={item.icon} />
        </span>
        <span className="wb-selection-filter-chip-label">{item.name}</span>
        {item.count > 1 ? (
          <span className="wb-selection-filter-chip-count">{item.count}</span>
        ) : null}
      </button>
    ))}
  </div>
)

export const SelectionSummaryHeader = ({
  summary
}: {
  summary: NodeSummary
}) => {
  const view = readNodeSummaryView(summary)

  if (!view) {
    return null
  }

  return (
    <div className="wb-selection-summary">
      <div className="wb-selection-summary-icons" data-mixed={view.mixed ? 'true' : undefined}>
        {view.types.map((item) => (
          <span
            key={item.key}
            className="wb-selection-summary-icon"
            title={item.name}
          >
            <NodeTypeIcon icon={item.icon} />
          </span>
        ))}
        {view.overflow > 0 ? (
          <span className="wb-selection-summary-overflow">+{view.overflow}</span>
        ) : null}
      </div>
      <div className="wb-selection-summary-body">
        <div className="wb-selection-summary-title">
          {view.title}
        </div>
        {view.detail ? (
          <div className="wb-selection-summary-detail">{view.detail}</div>
        ) : null}
      </div>
    </div>
  )
}
