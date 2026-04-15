import type {
  CSSProperties
} from 'react'
import {
  useCallback,
  useId,
  memo,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  useKeyedStoreValue
} from '@shared/react'
import {
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize
} from '@whiteboard/core/edge'
import {
  WHITEBOARD_TEXT_DEFAULT_COLOR
} from '@whiteboard/core/node'
import type { EdgeId } from '@whiteboard/core/types'
import {
  readEdgeLabelTextSourceId
} from '@whiteboard/editor'
import {
  useEdit,
  useEditorRuntime,
  usePickRef,
  useResolvedConfig,
  useWhiteboardServices
} from '@whiteboard/react/runtime/hooks'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { matchEdgeLabelEdit } from '@whiteboard/react/features/edit/session'
import { useEdgeView } from '@whiteboard/react/features/edge/hooks/useEdgeView'
import {
  EDGE_ARROW_END_ID,
  EDGE_ARROW_START_ID,
  resolveEdgeDash
} from '@whiteboard/react/features/edge/constants'
import {
  buildEdgeLabelMaskRect,
  readEdgeLabelMaskTransform
} from '@whiteboard/react/features/edge/dom/labelMask'
import type {
  EdgeLabelSizeObserver
} from '@whiteboard/react/features/edge/dom/labelSizeObserver'
import {
  readEdgeLabelMeasureKey
} from '@whiteboard/react/features/edge/dom/labelSizeObserver'
import {
  resolvePaletteColor,
  resolvePaletteColorOr
} from '@whiteboard/react/features/palette'
import type { EdgeView } from '@whiteboard/react/types/edge'

const EDGE_LABEL_PLACEHOLDER = 'Label'

type EdgeItemProps = {
  edgeId: EdgeId
  selected?: boolean
  edgeLabelObserver: EdgeLabelSizeObserver
}

const resolveMarker = (value: string | undefined, fallbackId: string) => {
  if (!value) return undefined
  if (value === 'none') return undefined
  if (value.startsWith('url(')) return value
  if (value === 'arrow') return `url(#${fallbackId})`
  return `url(#${value})`
}

const readLabelText = (
  value: string | undefined
) => typeof value === 'string'
  ? value
  : ''

const readLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? EDGE_LABEL_PLACEHOLDER : '')

const readActiveLabelText = ({
  committed,
  draft
}: {
  committed: string
  draft?: string
}) => draft ?? committed

const resolveTextStyle = ({
  color,
  bg,
  size,
  weight,
  italic
}: {
  color?: string
  bg?: string
  size?: number
  weight?: number
  italic?: boolean
}): CSSProperties => ({
  color: resolvePaletteColorOr(color, 'var(--ui-text-primary)') ?? 'var(--ui-text-primary)',
  background: resolvePaletteColor(bg) ?? bg ?? 'transparent',
  fontSize: size ?? 14,
  fontWeight: weight ?? 400,
  fontStyle: italic ? 'italic' : 'normal'
})

const useStableMeasuredSize = (
  size?: {
    width: number
    height: number
  }
) => {
  const sizeRef = useRef<typeof size>(size)

  if (size) {
    sizeRef.current = size
  }

  return size ?? sizeRef.current
}

const resolveLabelPlacement = ({
  path,
  label,
  textMode,
  labelSize
}: {
  path: EdgeView['path']
  label: NonNullable<EdgeView['edge']['labels']>[number]
  textMode: NonNullable<EdgeView['edge']['textMode']>
  labelSize?: {
    width: number
    height: number
  }
}) => resolveEdgeLabelPlacement({
  path,
  t: label.t ?? 0.5,
  offset: label.offset ?? 0,
  textMode,
  labelSize,
  sideGap: readEdgeLabelSideGap(textMode)
})

const EdgeLabelItem = ({
  edgeId,
  labelId,
  selected,
  pad,
  origin,
  path,
  textMode,
  label,
  edgeLabelObserver
}: {
  edgeId: EdgeId
  labelId: string
  selected: boolean
  pad: number
  origin: {
    x: number
    y: number
  }
  path: EdgeView['path']
  textMode: NonNullable<EdgeView['edge']['textMode']>
  label: NonNullable<EdgeView['edge']['labels']>[number]
  edgeLabelObserver: EdgeLabelSizeObserver
}) => {
  const { textSources } = useWhiteboardServices()
  const edit = useEdit()
  const pickRef = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'label',
    labelId
  })
  const sourceRef = useRef<HTMLDivElement | null>(null)
  const measureKey = readEdgeLabelMeasureKey(edgeId, labelId)
  const sourceId = readEdgeLabelTextSourceId(edgeId, labelId)
  const labelSize = useKeyedStoreValue(edgeLabelObserver.sizes, measureKey)
  const stableLabelSize = useStableMeasuredSize(labelSize)
  const text = readLabelText(label.text)
  const labelEdit = matchEdgeLabelEdit(edit, edgeId, labelId)
  const editing = labelEdit !== null
  const activeText = readActiveLabelText({
    committed: text,
    draft: labelEdit?.draft.text
  })
  const displayText = readLabelDisplayText(activeText, editing)
  const placementLabelSize = resolveEdgeLabelPlacementSize({
    textMode,
    measuredSize: stableLabelSize,
    text: displayText,
    fontSize: label.style?.size
  })
  const placement = useMemo(() => resolveLabelPlacement({
    path,
    label,
    textMode,
    labelSize: placementLabelSize
  }), [label, path, placementLabelSize, textMode])

  const bindLabelRef = useCallback((element: HTMLDivElement | null) => {
    if (sourceRef.current === element) {
      return
    }

    if (sourceRef.current) {
      textSources.set(sourceId, null)
    }

    textSources.set(sourceId, element)
    pickRef(element)
    edgeLabelObserver.register(measureKey, element)
    sourceRef.current = element
  }, [edgeLabelObserver, measureKey, pickRef, sourceId, textSources])

  if (!placement || !displayText.trim()) {
    return null
  }

  const angle = textMode === 'tangent'
    ? placement.angle
    : 0
  const style = resolveTextStyle({
    color: label.style?.color,
    bg: label.style?.bg,
    size: label.style?.size,
    weight: label.style?.weight,
    italic: label.style?.italic
  })
  const x = placement.point.x - origin.x + pad
  const y = placement.point.y - origin.y + pad

  return (
    <div
      data-selection-ignore
      className="wb-edge-label"
      data-selected={selected ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}deg)`
      }}
    >
      {editing ? (
        <EditableSlot
          bindRef={bindLabelRef}
          value={labelEdit.draft.text}
          caret={labelEdit.caret}
          multiline
          className="wb-edge-label-content wb-edge-label-content-editing wb-default-text-editor"
          style={style}
        />
      ) : (
          <div
            ref={bindLabelRef}
            data-edit-edge-id={edgeId}
            data-edit-label-id={labelId}
            className="wb-edge-label-content"
            style={{
              ...style,
              opacity: text ? 1 : 0.48
            }}
          >
            {displayText}
          </div>
        )}
    </div>
  )
}

const EdgeLabelMaskHole = ({
  edgeId,
  labelId,
  path,
  textMode,
  label,
  edgeLabelObserver
}: {
  edgeId: EdgeId
  labelId: string
  path: EdgeView['path']
  textMode: NonNullable<EdgeView['edge']['textMode']>
  label: NonNullable<EdgeView['edge']['labels']>[number]
  edgeLabelObserver: EdgeLabelSizeObserver
}) => {
  const edit = useEdit()
  const measureKey = readEdgeLabelMeasureKey(edgeId, labelId)
  const size = useKeyedStoreValue(edgeLabelObserver.sizes, measureKey)
  const stableSize = useStableMeasuredSize(size)
  const labelEdit = matchEdgeLabelEdit(edit, edgeId, labelId)
  const editing = labelEdit !== null
  const text = readLabelText(label.text)
  const activeText = readActiveLabelText({
    committed: text,
    draft: labelEdit?.draft.text
  })
  const displayText = readLabelDisplayText(activeText, editing)
  const placementLabelSize = resolveEdgeLabelPlacementSize({
    textMode,
    measuredSize: stableSize,
    text: displayText,
    fontSize: label.style?.size
  })
  const placement = useMemo(() => resolveLabelPlacement({
    path,
    label,
    textMode,
    labelSize: placementLabelSize
  }), [label, path, placementLabelSize, textMode])

  if (!stableSize || !placement || !displayText.trim()) {
    return null
  }

  const angle = textMode === 'tangent'
    ? placement.angle
    : 0
  const maskRect = buildEdgeLabelMaskRect({
    center: placement.point,
    size: stableSize,
    angle
  })

  return (
    <rect
      x={maskRect.x}
      y={maskRect.y}
      width={maskRect.width}
      height={maskRect.height}
      rx={maskRect.radius}
      ry={maskRect.radius}
      fill="black"
      transform={readEdgeLabelMaskTransform(maskRect)}
    />
  )
}

const EdgeItemBase = ({
  edgeId,
  selected = false,
  edgeLabelObserver
}: EdgeItemProps) => {
  const editor = useEditorRuntime()
  const config = useResolvedConfig()
  const entry = useEdgeView(edgeId)
  const hitTestThresholdScreen = config.edge.hitTestThresholdScreen
  const box = editor.read.edge.box(edgeId)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const instanceId = useId()

  const ref = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'body'
  })

  const {
    stroke,
    strokeWidth,
    dash,
    markerStart,
    markerEnd,
    hitWidth,
    hoverStrokeWidth
  } = useMemo(() => {
    const edge = entry?.edge
    const baseStroke = resolvePaletteColorOr(
      edge?.style?.color,
      WHITEBOARD_TEXT_DEFAULT_COLOR
    ) ?? 'var(--ui-text-primary)'
    const stroke = baseStroke
    const baseWidth = edge?.style?.width ?? 2
    const strokeWidth = baseWidth
    const dash = resolveEdgeDash(edge?.style?.dash)
    const markerStart = resolveMarker(edge?.style?.start, EDGE_ARROW_START_ID)
    const markerEnd = resolveMarker(edge?.style?.end, EDGE_ARROW_END_ID)
    const hitWidth = Math.max(6, strokeWidth + hitTestThresholdScreen)
    const hoverStrokeWidth = Math.max(strokeWidth + 1, 3)

    return {
      stroke,
      strokeWidth,
      dash,
      markerStart,
      markerEnd,
      hitWidth,
      hoverStrokeWidth
    }
  }, [entry?.edge, hitTestThresholdScreen])

  if (!entry || !box) {
    return null
  }

  const edge = entry.edge
  const textMode = edge.textMode ?? 'horizontal'
  const showAccent = !selected && (hovered || focused)
  const accentStroke = stroke
  const accentStrokeWidth = hoverStrokeWidth
  const accentOpacity = 1
  const width = box.rect.width + box.pad * 2
  const height = box.rect.height + box.pad * 2
  const labels = edge.labels ?? []
  const maskId = labels.length > 0
    ? `wb_edge_label_mask_${edge.id}_${instanceId.replaceAll(':', '_')}`
    : undefined
  const maskUrl = maskId
    ? `url(#${maskId})`
    : undefined
  const viewBoxOriginX = box.rect.x - box.pad
  const viewBoxOriginY = box.rect.y - box.pad

  return (
    <div
      className="wb-edge-item"
      data-edge-id={edge.id}
      data-selected={selected ? 'true' : 'false'}
      style={{
        width,
        height,
        transform: `translate(${box.rect.x - box.pad}px, ${box.rect.y - box.pad}px)`
      } as CSSProperties}
    >
      <svg
        width={width}
        height={height}
        viewBox={`${viewBoxOriginX} ${viewBoxOriginY} ${width} ${height}`}
        overflow="visible"
        className="wb-edge-svg"
      >
        {maskId ? (
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
              x={viewBoxOriginX}
              y={viewBoxOriginY}
              width={width}
              height={height}
            >
              <rect
                x={viewBoxOriginX}
                y={viewBoxOriginY}
                width={width}
                height={height}
                fill="white"
              />
              {labels.map((label: NonNullable<typeof edge.labels>[number]) => (
                <EdgeLabelMaskHole
                  key={`mask:${edge.id}:${label.id}`}
                  edgeId={edge.id}
                  labelId={label.id}
                  label={label}
                  path={entry.path}
                  textMode={textMode}
                  edgeLabelObserver={edgeLabelObserver}
                />
              ))}
            </mask>
          </defs>
        ) : null}
        {showAccent ? (
          <path
            d={entry.path.svgPath}
            fill="none"
            stroke={accentStroke}
            strokeWidth={accentStrokeWidth}
            strokeDasharray={dash}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            opacity={accentOpacity}
            mask={maskUrl}
            className="wb-edge-accent-path"
          />
        ) : null}
        <path
          d={entry.path.svgPath}
          fill="none"
          stroke={stroke}
          color={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          markerStart={markerStart}
          markerEnd={markerEnd}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          mask={maskUrl}
          className="wb-edge-visible-path"
        />
        <path
          ref={ref}
          d={entry.path.svgPath}
          fill="none"
          stroke="transparent"
          strokeWidth={hitWidth}
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
          tabIndex={0}
          className="wb-edge-hit-path"
          onPointerEnter={() => {
            setHovered(true)
          }}
          onPointerLeave={() => {
            setHovered(false)
          }}
          onFocus={() => {
            setFocused(true)
          }}
          onBlur={() => {
            setFocused(false)
          }}
        />
      </svg>
      {labels.map((label: NonNullable<typeof edge.labels>[number]) => (
        <EdgeLabelItem
          key={`${edge.id}:${label.id}`}
          edgeId={edge.id}
          labelId={label.id}
          label={label}
          selected={selected}
          pad={box.pad}
          origin={{
            x: box.rect.x,
            y: box.rect.y
          }}
          path={entry.path}
          textMode={textMode}
          edgeLabelObserver={edgeLabelObserver}
        />
      ))}
    </div>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
