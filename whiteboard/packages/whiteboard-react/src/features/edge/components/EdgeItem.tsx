import type {
  CSSProperties,
  PointerEvent
} from 'react'
import {
  useCallback,
  useEffect,
  useId,
  memo,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'
import {
  projectPointToEdgeLabelPlacement,
  resolveEdgeLabelPlacement
} from '@whiteboard/core/edge'
import {
  WHITEBOARD_TEXT_DEFAULT_COLOR
} from '@whiteboard/core/node'
import type { EdgeId } from '@whiteboard/core/types'
import {
  useEdit,
  useEditorRuntime,
  usePickRef,
  useResolvedConfig
} from '@whiteboard/react/runtime/hooks'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { matchEdgeLabelEdit } from '@whiteboard/react/features/edit/session'
import { useEdgeView } from '@whiteboard/react/features/edge/hooks/useEdgeView'
import { EDGE_ARROW_END_ID, EDGE_ARROW_START_ID, resolveEdgeDash } from '@whiteboard/react/features/edge/constants'
import {
  buildEdgeLabelMaskRect,
  readEdgeLabelMaskTransform
} from '@whiteboard/react/features/edge/dom/labelMask'
import type { EdgeLabelSizeObserver } from '@whiteboard/react/features/edge/dom/labelSizeObserver'
import { readEdgeLabelMeasureKey } from '@whiteboard/react/features/edge/dom/labelSizeObserver'
import { resolvePaletteColor, resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import type { EdgeView } from '@whiteboard/react/types/edge'

const EDGE_LABEL_DRAG_DISTANCE = 3
const EDGE_LABEL_RAIL_OFFSET = 24
const EDGE_LABEL_CENTER_TOLERANCE = 20
const EDGE_LABEL_TANGENT_SIDE_GAP = 4
const EDGE_LABEL_HORIZONTAL_SIDE_GAP = 24
const EDGE_LABEL_PLACEHOLDER = 'Label'
const EDGE_LABEL_LINE_HEIGHT = 1.4
const EDGE_LABEL_DEFAULT_SIZE = 14

type EdgeItemProps = {
  edgeId: EdgeId
  selected?: boolean
  edgeLabelObserver: EdgeLabelSizeObserver
}

type DragDraft = {
  t: number
  offset: number
}

type DragState = {
  pointerId: number
  startClient: {
    x: number
    y: number
  }
  draft?: DragDraft
}

type EdgeLabelDragDrafts = Record<string, DragDraft | undefined>

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

const readEdgeLabelSideGap = (
  textMode: EdgeView['edge']['textMode']
) => textMode === 'horizontal'
  ? EDGE_LABEL_HORIZONTAL_SIDE_GAP
  : EDGE_LABEL_TANGENT_SIDE_GAP

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

const readTangentPlacementSize = ({
  measuredSize,
  text,
  fontSize
}: {
  measuredSize?: {
    width: number
    height: number
  }
  text: string
  fontSize?: number
}) => {
  if (!measuredSize) {
    return undefined
  }

  const lineCount = Math.max(1, text.split('\n').length)
  const resolvedFontSize = fontSize ?? EDGE_LABEL_DEFAULT_SIZE

  return {
    ...measuredSize,
    height: Math.ceil(lineCount * resolvedFontSize * EDGE_LABEL_LINE_HEIGHT)
  }
}

const readPlacementLabelSize = ({
  textMode,
  measuredSize,
  text,
  fontSize
}: {
  textMode: EdgeView['edge']['textMode']
  measuredSize?: {
    width: number
    height: number
  }
  text: string
  fontSize?: number
}) => textMode === 'tangent'
  ? readTangentPlacementSize({
      measuredSize,
      text,
      fontSize
    })
  : measuredSize

const resolveLabelPlacement = ({
  path,
  label,
  draft,
  textMode,
  labelSize
}: {
  path: EdgeView['path']
  label: NonNullable<EdgeView['edge']['labels']>[number]
  draft?: DragDraft
  textMode: EdgeView['edge']['textMode']
  labelSize?: {
    width: number
    height: number
  }
}) => resolveEdgeLabelPlacement({
  path,
  t: draft?.t ?? label.t ?? 0.5,
  offset: draft?.offset ?? label.offset ?? 0,
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
  edgeLabelObserver,
  onDragDraftChange
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
  textMode: EdgeView['edge']['textMode']
  label: NonNullable<EdgeView['edge']['labels']>[number]
  edgeLabelObserver: EdgeLabelSizeObserver
  onDragDraftChange: (
    labelId: string,
    draft: DragDraft | undefined
  ) => void
}) => {
  const editor = useEditorRuntime()
  const selection = useStoreValue(editor.store.selection)
  const edit = useEdit()
  const ref = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'label',
    labelId
  })
  const [drag, setDrag] = useState<DragState | null>(null)
  const measureKey = readEdgeLabelMeasureKey(edgeId, labelId)
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
  const placementLabelSize = readPlacementLabelSize({
    textMode,
    measuredSize: stableLabelSize,
    text: displayText,
    fontSize: label.style?.size
  })
  const singleSelected =
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 1
    && selection.edgeIds[0] === edgeId

  const placement = useMemo(() => resolveLabelPlacement({
    path,
    label,
    draft: drag?.draft,
    textMode,
    labelSize: placementLabelSize
  }), [drag?.draft, label, path, placementLabelSize, textMode])

  useEffect(
    () => () => {
      onDragDraftChange(labelId, undefined)
    },
    [labelId, onDragDraftChange]
  )

  if (!placement) {
    return null
  }

  if (!displayText.trim()) {
    return null
  }

  const onPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || editing) {
      return
    }

    event.stopPropagation()

    if (!singleSelected) {
      editor.actions.selection.replace({
        edgeIds: [edgeId]
      })
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      pointerId: event.pointerId,
      startClient: {
        x: event.clientX,
        y: event.clientY
      }
    })
  }

  const onPointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    event.stopPropagation()

    const dx = event.clientX - drag.startClient.x
    const dy = event.clientY - drag.startClient.y
    if (!drag.draft && Math.hypot(dx, dy) < EDGE_LABEL_DRAG_DISTANCE) {
      return
    }

    const world = editor.read.viewport.pointer({
      clientX: event.clientX,
      clientY: event.clientY
    }).world
    const projected = projectPointToEdgeLabelPlacement({
      path,
      point: world,
      maxOffset: EDGE_LABEL_RAIL_OFFSET,
      centerTolerance: EDGE_LABEL_CENTER_TOLERANCE,
      textMode,
      labelSize: placementLabelSize,
      sideGap: readEdgeLabelSideGap(textMode)
    })
    if (!projected) {
      return
    }

    setDrag({
      ...drag,
      draft: {
        t: projected.t,
        offset: projected.offset
      }
    })
    onDragDraftChange(labelId, {
      t: projected.t,
      offset: projected.offset
    })
  }

  const onPointerUp = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    event.stopPropagation()
    event.currentTarget.releasePointerCapture(event.pointerId)

    if (drag.draft) {
      editor.actions.edge.label.patch(edgeId, labelId, drag.draft)
      onDragDraftChange(labelId, undefined)
      setDrag(null)
      return
    }

    onDragDraftChange(labelId, undefined)
    setDrag(null)
    editor.actions.selection.replace({
      edgeIds: [edgeId]
    })
    editor.actions.edit.startEdgeLabel(edgeId, labelId, {
      caret: {
        kind: 'point',
        client: {
          x: event.clientX,
          y: event.clientY
        }
      }
    })
  }

  const onPointerCancel = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    event.stopPropagation()
    onDragDraftChange(labelId, undefined)
    setDrag(null)
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
  const bindLabelRef = useCallback((element: HTMLDivElement | null) => {
    ref(element)
    edgeLabelObserver.register(measureKey, element)
  }, [edgeLabelObserver, measureKey, ref])

  return (
    <div
      data-selection-ignore
      className="wb-edge-label"
      data-selected={selected ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}deg)`
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
  edgeLabelObserver,
  draft
}: {
  edgeId: EdgeId
  labelId: string
  path: EdgeView['path']
  textMode: EdgeView['edge']['textMode']
  label: NonNullable<EdgeView['edge']['labels']>[number]
  edgeLabelObserver: EdgeLabelSizeObserver
  draft?: DragDraft
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
  const placementLabelSize = readPlacementLabelSize({
    textMode,
    measuredSize: stableSize,
    text: displayText,
    fontSize: label.style?.size
  })
  const placement = useMemo(() => resolveLabelPlacement({
    path,
    label,
    draft,
    textMode,
    labelSize: placementLabelSize
  }), [draft, label, path, placementLabelSize, textMode])

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
  const [labelDragDrafts, setLabelDragDrafts] = useState<EdgeLabelDragDrafts>({})
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
  const setLabelDragDraft = useCallback((
    labelId: string,
    draft: DragDraft | undefined
  ) => {
    setLabelDragDrafts((current) => {
      const previous = current[labelId]
      if (
        (previous === undefined && draft === undefined)
        || (
          previous !== undefined
          && draft !== undefined
          && previous.t === draft.t
          && previous.offset === draft.offset
        )
      ) {
        return current
      }

      if (draft === undefined) {
        if (!(labelId in current)) {
          return current
        }

        const next = {
          ...current
        }
        delete next[labelId]
        return next
      }

      return {
        ...current,
        [labelId]: draft
      }
    })
  }, [])

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
                  textMode={edge.textMode}
                  edgeLabelObserver={edgeLabelObserver}
                  draft={labelDragDrafts[label.id]}
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
          textMode={edge.textMode}
          edgeLabelObserver={edgeLabelObserver}
          onDragDraftChange={setLabelDragDraft}
        />
      ))}
    </div>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
