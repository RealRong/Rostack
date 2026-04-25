import type {
  CSSProperties
} from 'react'
import {
  useCallback,
  useId,
  memo,
  useMemo,
  useState
} from 'react'
import { useStoreValue } from '@shared/react'
import { product } from '@whiteboard/product'
import type { EdgeId } from '@whiteboard/core/types'
import { edge as edgeApi, type EdgeLabelMaskRect } from '@whiteboard/core/edge'
import {
  useEditorRuntime,
  usePickRef,
  useResolvedConfig
} from '@whiteboard/react/runtime/hooks'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { useEdgeView } from '@whiteboard/react/features/edge/hooks/useEdgeView'
import {
  resolveEdgeDash
} from '@whiteboard/react/features/edge/constants'
import {
  resolvePaletteColor,
  resolvePaletteColorOr
} from '@whiteboard/react/features/palette'
import {
  resolveEdgeMarkerUrl
} from '@whiteboard/react/features/edge/ui/marker'
import type { EdgeView } from '@whiteboard/react/types/edge'

type EdgeItemProps = {
  edgeId: EdgeId
}

const resolveActiveLabelOutlineStyle = (
  zoom: number
): CSSProperties => ({
  boxShadow: `0 0 0 ${1 / Math.max(zoom, 0.0001)}px var(--ui-accent)`
})

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

const EdgeLabelItem = ({
  edgeId,
  label,
  selected,
  pad,
  origin
}: {
  edgeId: EdgeId
  label: EdgeView['labels'][number]
  selected: boolean
  pad: number
  origin: {
    x: number
    y: number
  }
}) => {
  const pickRef = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'label',
    labelId: label.id
  })
  const bindLabelRef = useCallback((element: HTMLDivElement | null) => {
    pickRef(element)
  }, [pickRef])

  const style = resolveTextStyle({
    color: label.style?.color,
    bg: label.style?.bg,
    size: label.style?.size,
    weight: label.style?.weight,
    italic: label.style?.italic
  })
  const x = label.point.x - origin.x + pad
  const y = label.point.y - origin.y + pad

  return (
    <div
      data-selection-ignore
      className="wb-edge-label"
      data-selected={selected ? 'true' : undefined}
      data-editing={label.editing ? 'true' : undefined}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${label.angle}deg)`
      }}
    >
      <EdgeLabelContent
        edgeId={edgeId}
        label={label}
        selected={selected}
        bindLabelRef={bindLabelRef}
        style={style}
      />
    </div>
  )
}

const EdgeLabelContent = ({
  edgeId,
  label,
  selected,
  bindLabelRef,
  style
}: {
  edgeId: EdgeId
  label: EdgeView['labels'][number]
  selected: boolean
  bindLabelRef: (element: HTMLDivElement | null) => void
  style: CSSProperties
}) => {
  if (label.editing || selected) {
    return (
      <ActiveEdgeLabelContent
        edgeId={edgeId}
        label={label}
        bindLabelRef={bindLabelRef}
        style={style}
      />
    )
  }

  return (
    <div
      ref={bindLabelRef}
      data-edit-edge-id={edgeId}
      data-edit-label-id={label.id}
      className="wb-edge-label-content"
      style={{
        ...style,
        opacity: label.text ? 1 : 0.48
      }}
    >
      {label.displayText}
    </div>
  )
}

const ActiveEdgeLabelContent = ({
  edgeId,
  label,
  bindLabelRef,
  style
}: {
  edgeId: EdgeId
  label: EdgeView['labels'][number]
  bindLabelRef: (element: HTMLDivElement | null) => void
  style: CSSProperties
}) => {
  const editor = useEditorRuntime()
  const zoom = useStoreValue(editor.session.viewport.zoom)
  const outlineStyle = resolveActiveLabelOutlineStyle(zoom)

  if (label.editing) {
    return (
      <EditableSlot
        bindRef={bindLabelRef}
        value={label.text}
        caret={label.caret ?? { kind: 'end' }}
        multiline
        className="wb-edge-label-content wb-edge-label-content-editing wb-default-text-editor"
        style={{
          ...style,
          ...outlineStyle
        }}
      />
    )
  }

  return (
    <div
      ref={bindLabelRef}
      data-edit-edge-id={edgeId}
      data-edit-label-id={label.id}
      className="wb-edge-label-content"
      style={{
        ...style,
        ...outlineStyle,
        opacity: label.text ? 1 : 0.48
      }}
    >
      {label.displayText}
    </div>
  )
}

const EdgeLabelMaskHole = ({
  label
}: {
  label: EdgeView['labels'][number]
}) => (
  <rect
    x={label.maskRect.x}
    y={label.maskRect.y}
    width={label.maskRect.width}
    height={label.maskRect.height}
    rx={label.maskRect.radius}
    ry={label.maskRect.radius}
    fill="black"
    transform={edgeApi.label.maskTransform(label.maskRect as Pick<EdgeLabelMaskRect, 'angle' | 'center'>)}
  />
)

const EdgeItemBase = ({
  edgeId
}: EdgeItemProps) => {
  const config = useResolvedConfig()
  const entry = useEdgeView(edgeId)
  const hitTestThresholdScreen = config.edge.hitTestThresholdScreen
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
    strokeOpacity,
    hitWidth,
    hoverStrokeWidth
  } = useMemo(() => {
    const edge = entry?.edge
    const baseStroke = resolvePaletteColorOr(
      edge?.style?.color,
      product.palette.defaults.lineColor
    ) ?? 'currentColor'
    const stroke = baseStroke
    const baseWidth = edge?.style?.width ?? 2
    const strokeWidth = baseWidth
    const dash = resolveEdgeDash(edge?.style?.dash)
    const markerStart = resolveEdgeMarkerUrl(edge?.style?.start, 'start')
    const markerEnd = resolveEdgeMarkerUrl(edge?.style?.end, 'end')
    const strokeOpacity = edge?.style?.opacity ?? 1
    const hitWidth = Math.max(6, strokeWidth + hitTestThresholdScreen)
    const hoverStrokeWidth = Math.max(strokeWidth + 1, 3)

    return {
      stroke,
      strokeWidth,
      dash,
      markerStart,
      markerEnd,
      strokeOpacity,
      hitWidth,
      hoverStrokeWidth
    }
  }, [entry?.edge, hitTestThresholdScreen])

  if (!entry) {
    return null
  }

  const edge = entry.edge
  const box = entry.box!
  const showAccent = !entry.selected && (hovered || focused)
  const accentStroke = stroke
  const accentStrokeWidth = hoverStrokeWidth
  const accentOpacity = 1
  const width = box.rect.width + box.pad * 2
  const height = box.rect.height + box.pad * 2
  const labels = entry.labels
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
      data-selected={entry.selected ? 'true' : 'false'}
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
              {labels.map((label) => (
                <EdgeLabelMaskHole
                  key={`mask:${edge.id}:${label.id}`}
                  label={label}
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
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          markerStart={markerStart}
          markerEnd={markerEnd}
          opacity={strokeOpacity}
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
      {labels.map((label) => (
        <EdgeLabelItem
          key={`${edge.id}:${label.id}`}
          edgeId={edge.id}
          label={label}
          selected={entry.selected}
          pad={box.pad}
          origin={{
            x: box.rect.x,
            y: box.rect.y
          }}
        />
      ))}
    </div>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
