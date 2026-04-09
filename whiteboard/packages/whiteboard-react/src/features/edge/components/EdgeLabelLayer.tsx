import {
  projectPointToEdgeLabelPlacement,
  resolveEdgeLabelPlacement
} from '@whiteboard/core/edge'
import { useStoreValue } from '@shared/react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import {
  useEdit,
  useEditorRuntime,
  usePickRef
} from '#react/runtime/hooks'
import { useEdgeView } from '../hooks/useEdgeView'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '#react/features/node/dom/editableText'
import { readEditableText } from '#react/features/node/text'

const EDGE_LABEL_DRAG_DISTANCE = 3
const EDGE_LABEL_MAX_OFFSET = 24

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
  labelId
}: {
  edgeId: string
  labelId: string
}) => {
  const editor = useEditorRuntime()
  const selection = useStoreValue(editor.state.selection)
  const edit = useEdit()
  const entry = useEdgeView(edgeId)
  const ref = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'label',
    labelId
  })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draft, setDraft] = useState('')
  const contentRef = useRef<HTMLDivElement | null>(null)

  const label = entry?.edge.labels?.find((item) => item.id === labelId)
  const text = readLabelText(label?.text)
  const editing =
    edit?.kind === 'edge-label'
    && edit.edgeId === edgeId
    && edit.labelId === labelId
  const selected =
    selection.nodeIds.length === 0
    && selection.edgeIds.includes(edgeId)
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

  const placement = useMemo(() => {
    if (!entry || !label) {
      return undefined
    }

    return resolveEdgeLabelPlacement({
      path: entry.path,
      t: drag?.draft?.t ?? label.t ?? 0.5,
      offset: drag?.draft?.offset ?? label.offset ?? 0
    })
  }, [drag?.draft?.offset, drag?.draft?.t, entry, label])

  if (!entry || !label || !placement) {
    return null
  }

  if (!editing && !text.trim()) {
    return null
  }

  const commit = (value = draft) => {
    const nextText = value.trim()
    if (!nextText) {
      editor.actions.document.edges.labels.remove(edgeId, labelId)
      editor.actions.session.edit.clear()
      return
    }

    editor.actions.document.edges.labels.update(edgeId, labelId, {
      text: nextText
    })
    editor.actions.session.edit.clear()
  }

  const cancel = () => {
    setDraft(text)
    if (!text.trim()) {
      editor.actions.document.edges.labels.remove(edgeId, labelId)
      return
    }
    editor.actions.session.edit.clear()
  }

  const onPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || editing) {
      return
    }

    event.stopPropagation()

    if (!singleSelected) {
      editor.actions.session.selection.replace({
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
      path: entry.path,
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
      editor.actions.document.edges.labels.update(edgeId, labelId, drag.draft)
      setDrag(null)
      return
    }

    setDrag(null)
    editor.actions.session.selection.replace({
      edgeIds: [edgeId]
    })
    editor.actions.session.edit.startEdgeLabel(edgeId, labelId, {
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

  const angle = entry.edge.textMode === 'tangent'
    ? placement.angle
    : 0
  const style = resolveTextStyle({
    color: label.style?.color,
    bg: label.style?.bg,
    size: label.style?.size,
    weight: label.style?.weight,
    italic: label.style?.italic
  })

  return (
    <div
      ref={ref}
      data-selection-ignore
      className="wb-edge-label"
      data-selected={selected ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      style={{
        transform: `translate(${placement.point.x}px, ${placement.point.y}px) translate(-50%, -50%) rotate(${angle}deg)`
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

export const EdgeLabelLayer = () => {
  const editor = useEditorRuntime()
  const edgeIds = useStoreValue(editor.read.edge.list)

  return (
    <div className="wb-edge-label-layer">
      {edgeIds.map((edgeId) => (
        <EdgeLabelsByEdge
          key={edgeId}
          edgeId={edgeId}
        />
      ))}
    </div>
  )
}

const EdgeLabelsByEdge = ({
  edgeId
}: {
  edgeId: string
}) => {
  const entry = useEdgeView(edgeId)
  const labels = entry?.edge.labels ?? []

  return (
    <>
      {labels.map((label) => (
        <EdgeLabelItem
          key={`${edgeId}:${label.id}`}
          edgeId={edgeId}
          labelId={label.id}
        />
      ))}
    </>
  )
}
