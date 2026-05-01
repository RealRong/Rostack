import type { CSSProperties } from 'react'
import { memo, useCallback, useRef } from 'react'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import type { EdgeLabelKey } from '@whiteboard/editor-scene'
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

const EdgeLabelItem = memo(({
  labelKey,
  zoom
}: {
  labelKey: EdgeLabelKey
  zoom: number
}) => {
  const editor = useEditorRuntime()
  const label = useKeyedStoreValue(
    editor.scene.stores.render.edge.labels.byId,
    labelKey
  )
  const bindLabelRef = usePickRef(label
    ? {
        kind: 'edge',
        id: label.edgeId,
        part: 'label',
        labelId: label.labelId
      }
    : {
        kind: 'background'
      }
  )

  if (!label) {
    return null
  }

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
})

EdgeLabelItem.displayName = 'EdgeLabelItem'

export const EdgeLabelLayer = memo(() => {
  const editor = useEditorRuntime()
  const zoom = useStoreValue(editor.scene.editor.viewport).zoom
  const labelKeys = useStoreValue(editor.scene.stores.render.edge.labels.ids)

  return (
    <div className="wb-edge-label-layer">
      {labelKeys.map((labelKey) => (
        <EdgeLabelItem
          key={labelKey}
          labelKey={labelKey}
          zoom={zoom}
        />
      ))}
    </div>
  )
})

EdgeLabelLayer.displayName = 'EdgeLabelLayer'
