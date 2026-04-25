import type { CSSProperties } from 'react'
import { memo, useCallback, useRef } from 'react'
import { useStoreValue } from '@shared/react'
import type { EdgeLabelRenderModel } from '@whiteboard/editor/types/editor'
import {
  useEditorRuntime,
  usePickRef,
  useWhiteboardServices
} from '@whiteboard/react/runtime/hooks'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import {
  resolveActiveLabelOutlineStyle,
  resolveEdgeLabelTextStyle
} from './render'

const useEdgeLabelTextSourceBinding = ({
  edgeId,
  labelId
}: {
  edgeId: string
  labelId: string
}) => {
  const { textSources } = useWhiteboardServices()
  const sourceRef = useRef<HTMLDivElement | null>(null)

  return useCallback((element: HTMLDivElement | null) => {
    if (sourceRef.current === element) {
      return
    }

    if (sourceRef.current) {
      textSources.set({
        kind: 'edge-label',
        edgeId,
        labelId
      }, null)
    }

    textSources.set({
      kind: 'edge-label',
      edgeId,
      labelId
    }, element)
    sourceRef.current = element
  }, [edgeId, labelId, textSources])
}

const EdgeLabelItem = ({
  label,
  zoom
}: {
  label: EdgeLabelRenderModel['labels'][number]
  zoom: number
}) => {
  const bindLabelRef = usePickRef({
    kind: 'edge',
    id: label.edgeId,
    part: 'label',
    labelId: label.labelId
  })
  const bindTextSourceRef = useEdgeLabelTextSourceBinding({
    edgeId: label.edgeId,
    labelId: label.labelId
  })
  const bindRef = useCallback((element: HTMLDivElement | null) => {
    bindTextSourceRef(element)
    bindLabelRef(element)
  }, [bindLabelRef, bindTextSourceRef])
  const textStyle = resolveEdgeLabelTextStyle(label.style)

  if (label.editing) {
    return (
      <div
        data-selection-ignore
        className="wb-edge-label"
        style={{
          transform: `translate(${label.point.x}px, ${label.point.y}px) translate(-50%, -50%) rotate(${label.angle}deg)`
        }}
      >
        <EditableSlot
          bindRef={bindRef}
          value={label.text}
          caret={label.caret ?? { kind: 'end' }}
          multiline
          className="wb-edge-label-content wb-edge-label-content-editing wb-default-text-editor"
          style={{
            ...textStyle,
            ...resolveActiveLabelOutlineStyle(zoom)
          }}
        />
      </div>
    )
  }

  return (
    <div
      data-selection-ignore
      className="wb-edge-label"
      data-selected={label.selected ? 'true' : undefined}
      style={{
        transform: `translate(${label.point.x}px, ${label.point.y}px) translate(-50%, -50%) rotate(${label.angle}deg)`
      }}
    >
      <div
        ref={bindRef}
        data-edit-edge-id={label.edgeId}
        data-edit-label-id={label.labelId}
        className="wb-edge-label-content"
        style={{
          ...textStyle,
          ...(label.selected
            ? resolveActiveLabelOutlineStyle(zoom)
            : null),
          opacity: label.text ? 1 : 0.48
        } as CSSProperties}
      >
        {label.displayText}
      </div>
    </div>
  )
}

export const EdgeLabelLayer = memo(({
  model
}: {
  model: EdgeLabelRenderModel
}) => {
  const editor = useEditorRuntime()
  const zoom = useStoreValue(editor.session.viewport.zoom)

  return (
    <div className="wb-edge-label-layer">
      {model.labels.map((label) => (
        <EdgeLabelItem
          key={`${label.edgeId}:${label.labelId}`}
          label={label}
          zoom={zoom}
        />
      ))}
    </div>
  )
})

EdgeLabelLayer.displayName = 'EdgeLabelLayer'
