import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent
} from 'react'
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useStoreValue } from '@shared/react'
import {
  projectPointToEdgeLabelPlacement,
  resolveEdgeLabelPlacement
} from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import {
  useEdit,
  useEditorRuntime,
  usePickRef,
  useResolvedConfig
} from '#react/runtime/hooks'
import { useEdgeView } from '../hooks/useEdgeView'
import { EDGE_ARROW_END_ID, EDGE_ARROW_START_ID, resolveEdgeDash } from '../constants'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '#react/features/node/dom/editableText'
import { readEditableText } from '#react/features/node/text'
import type { EdgeView } from '#react/types/edge'

const EDGE_LABEL_DRAG_DISTANCE = 3
const EDGE_LABEL_MAX_OFFSET = 24

type EdgeItemProps = {
  edgeId: EdgeId
  selected?: boolean
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
  color: color ?? 'var(--ui-text-primary)',
  background: bg ?? 'transparent',
  fontSize: size ?? 14,
  fontWeight: weight ?? 400,
  fontStyle: italic ? 'italic' : 'normal'
})

const EdgeLabelItem = ({
  edgeId,
  labelId,
  selected,
  pad,
  origin,
  path,
  textMode,
  label
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
}) => {
  const editor = useEditorRuntime()
  const selection = useStoreValue(editor.state.selection)
  const edit = useEdit()
  const ref = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'label',
    labelId
  })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draft, setDraft] = useState('')
  const contentRef = useRef<HTMLDivElement | null>(null)

  const text = readLabelText(label.text)
  const editing =
    edit?.kind === 'edge-label'
    && edit.edgeId === edgeId
    && edit.labelId === labelId
  const singleSelected =
    selection.nodeIds.length === 0
    && selection.edgeIds.length === 1
    && selection.edgeIds[0] === edgeId

  useEffect(() => {
    setDraft(text)
  }, [text])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = contentRef.current
    if (!element) {
      return
    }

    syncEditableDraft(element, draft)
  }, [draft, editing])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = contentRef.current
    if (!element) {
      return
    }

    return focusEditableDraft(element, edit.caret)
  }, [edit, editing])

  const placement = useMemo(() => resolveEdgeLabelPlacement({
    path,
    t: drag?.draft?.t ?? label.t ?? 0.5,
    offset: drag?.draft?.offset ?? label.offset ?? 0
  }), [drag?.draft?.offset, drag?.draft?.t, label.offset, label.t, path])

  if (!placement) {
    return null
  }

  if (!editing && !text.trim()) {
    return null
  }

  const commit = (value = draft) => {
    const nextText = value.trim()
    if (!nextText) {
      editor.document.edges.labels.remove(edgeId, labelId)
      editor.session.edit.clear()
      return
    }

    editor.document.edges.labels.patch(edgeId, labelId, {
      text: nextText
    })
    editor.session.edit.clear()
  }

  const cancel = () => {
    setDraft(text)
    if (!text.trim()) {
      editor.document.edges.labels.remove(edgeId, labelId)
      return
    }
    editor.session.edit.clear()
  }

  const onPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || editing) {
      return
    }

    event.stopPropagation()

    if (!singleSelected) {
      editor.session.selection.replace({
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
      maxOffset: EDGE_LABEL_MAX_OFFSET
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
      editor.document.edges.labels.patch(edgeId, labelId, drag.draft)
      setDrag(null)
      return
    }

    setDrag(null)
    editor.session.selection.replace({
      edgeIds: [edgeId]
    })
    editor.session.edit.startEdgeLabel(edgeId, labelId, {
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
    setDrag(null)
  }

  const onKeyDown = (
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (isEscapeEditingKey(event)) {
      event.preventDefault()
      cancel()
      return
    }

    if (isSubmitEditingKey(event)) {
      event.preventDefault()
      commit(readEditableText(event.currentTarget))
    }
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
      ref={ref}
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
        <div
          ref={contentRef}
          data-input-ignore
          contentEditable
          suppressContentEditableWarning
          className="wb-edge-label-content wb-edge-label-content-editing"
          style={style}
          onPointerDown={stopEditingPointerDown}
          onInput={(event) => {
            setDraft(readEditableText(event.currentTarget))
          }}
          onBlur={(event) => {
            commit(readEditableText(event.currentTarget))
          }}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div
          className="wb-edge-label-content"
          style={style}
        >
          {text}
        </div>
      )}
    </div>
  )
}

const EdgeItemBase = ({
  edgeId,
  selected = false
}: EdgeItemProps) => {
  const editor = useEditorRuntime()
  const config = useResolvedConfig()
  const entry = useEdgeView(edgeId)
  const hitTestThresholdScreen = config.edge.hitTestThresholdScreen
  const box = editor.read.edge.box(edgeId)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

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
    selectionStrokeWidth,
    hoverStrokeWidth
  } = useMemo(() => {
    const edge = entry?.edge
    const baseStroke = edge?.style?.color ?? 'var(--ui-text-primary)'
    const stroke = baseStroke
    const baseWidth = edge?.style?.width ?? 2
    const strokeWidth = baseWidth
    const dash = resolveEdgeDash(edge?.style?.dash)
    const markerStart = resolveMarker(edge?.style?.start, EDGE_ARROW_START_ID)
    const markerEnd = resolveMarker(edge?.style?.end, EDGE_ARROW_END_ID)
    const hitWidth = Math.max(6, strokeWidth + hitTestThresholdScreen)
    const selectionStrokeWidth = Math.max(strokeWidth + 4, 8)
    const hoverStrokeWidth = Math.max(strokeWidth + 1, 3)

    return {
      stroke,
      strokeWidth,
      dash,
      markerStart,
      markerEnd,
      hitWidth,
      selectionStrokeWidth,
      hoverStrokeWidth
    }
  }, [entry?.edge, hitTestThresholdScreen])

  if (!entry || !box) {
    return null
  }

  const edge = entry.edge
  const showAccent = selected || hovered || focused
  const accentStroke = selected ? 'var(--ui-accent)' : stroke
  const accentStrokeWidth = selected
    ? selectionStrokeWidth
    : hoverStrokeWidth
  const accentOpacity = selected ? 0.22 : 1
  const width = box.rect.width + box.pad * 2
  const height = box.rect.height + box.pad * 2
  const offsetX = box.pad - box.rect.x
  const offsetY = box.pad - box.rect.y
  const labels = edge.labels ?? []

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
        overflow="visible"
        className="wb-edge-svg"
      >
        <g transform={`translate(${offsetX} ${offsetY})`}>
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
        </g>
      </svg>
      {labels.map((label) => (
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
        />
      ))}
    </div>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
