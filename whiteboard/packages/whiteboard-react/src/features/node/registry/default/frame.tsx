import { useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Node } from '@whiteboard/core/types'
import {
  FRAME_DEFAULT_FILL,
  FRAME_DEFAULT_STROKE,
  FRAME_DEFAULT_STROKE_WIDTH,
  FRAME_DEFAULT_TEXT_COLOR,
  FRAME_DEFAULT_TITLE
} from '@whiteboard/core/node'
import type { NodeDefinition } from '#react/types/node'
import { useEditor, usePickRef } from '#react/runtime/hooks'
import { bindNodeTextSource } from '../../text'
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
}

export const FrameNodeChrome = ({
  node
}: FrameNodeChromeProps) => {
  const editor = useEditor()
  const titleRef = useRef<HTMLDivElement | null>(null)
  const bindTitleRef = useCallback((element: HTMLDivElement | null) => {
    bindNodeTextSource({
      editor,
      nodeId: node.id,
      field: 'title',
      current: titleRef.current,
      next: element
    })
    titleRef.current = element
  }, [editor, node.id])
  const pickTitleRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'field',
    field: 'title'
  })
  const title = getDataString(node, 'title') || FRAME_DEFAULT_TITLE
  const color = getStyleString(node, 'color') ?? FRAME_DEFAULT_TEXT_COLOR

  return (
    <div className="wb-frame-header">
      <div
        ref={(element) => {
          bindTitleRef(element)
          pickTitleRef(element)
        }}
        data-edit-node-id={node.id}
        data-edit-field="title"
        className="wb-frame-title"
        style={{ color }}
      >
        {title}
      </div>
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
    family: 'frame',
    icon: 'frame',
    controls: ['fill', 'stroke', 'text']
  },
  role: 'frame',
  geometry: 'rect',
  hit: 'none',
  schema: frameSchema,
  defaultData: {
    title: FRAME_DEFAULT_TITLE
  },
  enter: true,
  edit: {
    fields: {
      title: {
        tools: ['color'],
        multiline: false,
        empty: 'default',
        defaultText: FRAME_DEFAULT_TITLE,
        measure: 'none'
      }
    }
  },
  render: ({ node }) => (
    <FrameNodeChrome
      node={node}
    />
  ),
  style: (props) => frameStyle(props.node),
  canRotate: false
}
