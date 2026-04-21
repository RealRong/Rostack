import { useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  WHITEBOARD_FRAME_DEFAULT_FILL as FRAME_DEFAULT_FILL,
  WHITEBOARD_FRAME_DEFAULT_STROKE as FRAME_DEFAULT_STROKE,
  WHITEBOARD_FRAME_DEFAULT_STROKE_WIDTH as FRAME_DEFAULT_STROKE_WIDTH,
  WHITEBOARD_FRAME_DEFAULT_TEXT_COLOR as FRAME_DEFAULT_TEXT_COLOR,
  WHITEBOARD_FRAME_DEFAULT_TITLE as FRAME_DEFAULT_TITLE
} from '@whiteboard/product/node/templates'
import type { NodeDefinition, NodeRenderProps } from '@whiteboard/react/types/node'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { usePickRef, useWhiteboardServices } from '@whiteboard/react/runtime/hooks'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import {
  createSchema,
  createTextField,
  getDataString,
  getStyleNumber,
  getStyleString,
  styleField
} from '@whiteboard/react/features/node/registry/default/shared'

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
  node: NodeRenderProps['node']
  edit?: NodeRenderProps['edit']
}

export const FrameNodeChrome = ({
  node,
  edit
}: FrameNodeChromeProps) => {
  const { textSources } = useWhiteboardServices()
  const titleRef = useRef<HTMLDivElement | null>(null)
  const source = {
    kind: 'node' as const,
    nodeId: node.id,
    field: 'title' as const
  }
  const bindTitleRef = useCallback((element: HTMLDivElement | null) => {
    if (titleRef.current === element) {
      return
    }

    if (titleRef.current) {
      textSources.set(source, null)
    }

    textSources.set(source, element)
    titleRef.current = element
  }, [source, textSources])
  const pickTitleRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'field',
    field: 'title'
  })
  const rawTitle = getDataString(node, 'title') ?? ''
  const title = rawTitle || FRAME_DEFAULT_TITLE
  const color = resolvePaletteColorOr(
    getStyleString(node, 'color'),
    FRAME_DEFAULT_TEXT_COLOR
  ) ?? FRAME_DEFAULT_TEXT_COLOR
  const editing = edit?.field === 'title'
  const bindFieldRef = useCallback((element: HTMLDivElement | null) => {
    bindTitleRef(element)
    pickTitleRef(element)
  }, [bindTitleRef, pickTitleRef])

  return (
    <div className="wb-frame-header">
      {editing ? (
        <EditableSlot
          bindRef={bindFieldRef}
          value={rawTitle}
          caret={edit.caret}
          multiline={false}
          className="wb-frame-title wb-default-text-editor"
          style={{
            color,
            minWidth: 0,
            maxWidth: '100%',
            height: '100%',
            whiteSpace: 'pre',
            overflow: 'hidden',
            textOverflow: 'clip',
            userSelect: 'text',
            WebkitUserSelect: 'text'
          }}
        />
      ) : (
          <div
            ref={bindFieldRef}
            data-edit-node-id={node.id}
            data-edit-field="title"
            className="wb-frame-title"
            style={{ color }}
          >
            {title}
          </div>
        )}
    </div>
  )
}

const frameStyle = (node: NodeRenderProps['node']): CSSProperties => {
  const stroke = resolvePaletteColorOr(
    getStyleString(node, 'stroke'),
    FRAME_DEFAULT_STROKE
  ) ?? FRAME_DEFAULT_STROKE
  const strokeWidth = getStyleNumber(node, 'strokeWidth') ?? FRAME_DEFAULT_STROKE_WIDTH
  const fill = resolvePaletteColorOr(
    getStyleString(node, 'fill'),
    FRAME_DEFAULT_FILL
  ) ?? FRAME_DEFAULT_FILL

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
  layout: {
    kind: 'none'
  },
  defaultData: {
    title: FRAME_DEFAULT_TITLE
  },
  enter: true,
  edit: {
    fields: {
      title: {
        multiline: false,
        empty: 'default',
        defaultText: FRAME_DEFAULT_TITLE
      }
    }
  },
  render: ({ node, edit }) => (
    <FrameNodeChrome
      node={node}
      edit={edit}
    />
  ),
  style: (props) => frameStyle(props.node),
  rotate: false
}
