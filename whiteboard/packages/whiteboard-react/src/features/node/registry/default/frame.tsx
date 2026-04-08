import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Node } from '@whiteboard/core/types'
import {
  FRAME_DEFAULT_FILL,
  FRAME_DEFAULT_STROKE,
  FRAME_DEFAULT_STROKE_WIDTH,
  FRAME_DEFAULT_TEXT_COLOR,
  FRAME_DEFAULT_TITLE
} from '@whiteboard/core/node'
import type { NodeDefinition, NodeWrite } from '#react/types/node'
import { useEdit, useEditor } from '#react/runtime/hooks'
import { usePickRef } from '#react/runtime/hooks'
import {
  isEscapeEditingKey,
  stopEditingPointerDown
} from '../../dom/editableText'
import {
  createSchema,
  createTextField,
  getDataString,
  getStyleNumber,
  getStyleString,
  styleField
} from './shared'

const frameSchema = createSchema('frame', 'Frame', [
  createTextField('title'),
  styleField('fill', 'Fill', 'color', {
    defaultValue: FRAME_DEFAULT_FILL
  }),
  styleField('stroke', 'Stroke', 'color', {
    defaultValue: FRAME_DEFAULT_STROKE
  }),
  styleField('strokeWidth', 'Stroke width', 'number', {
    min: 0,
    step: 1,
    defaultValue: FRAME_DEFAULT_STROKE_WIDTH
  }),
  styleField('color', 'Text color', 'color', {
    defaultValue: FRAME_DEFAULT_TEXT_COLOR
  })
])

type FrameNodeChromeProps = {
  node: Node
  write: Pick<NodeWrite, 'update'>
}

export const FrameNodeChrome = ({
  node,
  write
}: FrameNodeChromeProps) => {
  const editor = useEditor()
  const edit = useEdit()
  const title = getDataString(node, 'title') || FRAME_DEFAULT_TITLE
  const editing = edit?.nodeId === node.id && edit.field === 'title'
  const [draft, setDraft] = useState(title)
  const color = getStyleString(node, 'color') ?? FRAME_DEFAULT_TEXT_COLOR
  const headerRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'shell'
  })
  const titleRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'field',
    field: 'title'
  })

  useEffect(() => {
    setDraft(title)
  }, [title])

  const commit = () => {
    const nextTitle = draft.trim() || FRAME_DEFAULT_TITLE
    editor.commands.node.text.commit({
      nodeId: node.id,
      field: 'title',
      value: nextTitle
    })
  }

  return (
    <div
      ref={headerRef}
      className="wb-frame-header"
    >
      {editing ? (
        <input
          data-selection-ignore
          data-input-ignore
          value={draft}
          autoFocus
          onPointerDown={stopEditingPointerDown}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (isEscapeEditingKey(event)) {
              event.preventDefault()
              setDraft(title)
              editor.commands.node.text.cancel({
                nodeId: node.id
              })
            }
          }}
          className="wb-frame-input"
          style={{ color }}
        />
      ) : (
        <div
          ref={titleRef}
          className="wb-frame-title"
          style={{ color }}
        >
          {title}
        </div>
      )}
    </div>
  )
}

const frameStyle = (node: Node): CSSProperties => {
  const stroke = getStyleString(node, 'stroke') ?? FRAME_DEFAULT_STROKE
  const strokeWidth = getStyleNumber(node, 'strokeWidth') ?? FRAME_DEFAULT_STROKE_WIDTH
  const fill = getStyleString(node, 'fill') ?? FRAME_DEFAULT_FILL

  return {
    background: fill,
    border: `${strokeWidth}px solid ${stroke}`,
    borderRadius: 12,
    boxShadow: 'none',
    display: 'block'
  }
}

export const FrameNodeDefinition: NodeDefinition = {
  type: 'frame',
  meta: {
    name: 'Frame',
    family: 'container',
    icon: 'frame',
    controls: ['fill', 'stroke', 'text']
  },
  role: 'frame',
  geometry: 'rect',
  schema: frameSchema,
  defaultData: {
    title: FRAME_DEFAULT_TITLE
  },
  render: () => null,
  style: (props) => frameStyle(props.node),
  canRotate: false
}
