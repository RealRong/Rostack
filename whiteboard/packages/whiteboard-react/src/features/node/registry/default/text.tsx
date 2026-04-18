import {
  useCallback,
  useRef,
  type CSSProperties
} from 'react'
import {
  estimateTextAutoFont,
  resolveTextContentBox,
  resolveTextFrameMetrics
} from '@whiteboard/core/node'
import { WHITEBOARD_TEXT_DEFAULT_COLOR } from '@whiteboard/product/palette'
import {
  readNodeTextSourceId
} from '@whiteboard/editor'
import type { NodeDefinition, NodeRenderProps } from '@whiteboard/react/types/node'
import {
  usePickRef,
  useWhiteboardServices
} from '@whiteboard/react/runtime/hooks'
import { TextSlot } from '@whiteboard/react/features/edit/TextSlot'
import {
  type TextWidthMode,
  readTextWidthMode,
  readTextWrapWidth,
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_TEXT_COLOR,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_PLACEHOLDER
} from '@whiteboard/react/features/node/text'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import {
  createSchema,
  createTextField,
  dataField,
  getStyleNumber,
  getStyleString,
  styleField
} from '@whiteboard/react/features/node/registry/default/shared'

const textSchema = createSchema('text', 'Text', [
  createTextField('text'),
  styleField('fill', 'Background', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
  styleField('fontWeight', 'Font weight', 'number', { min: 100, max: 900, step: 100 }),
  styleField('fontStyle', 'Font style', 'string')
])

const stickySchema = createSchema('sticky', 'Sticky', [
  createTextField('text'),
  dataField('fontMode', 'Font mode', 'enum', {
    options: [
      {
        label: 'Auto',
        value: 'auto'
      },
      {
        label: 'Fixed',
        value: 'fixed'
      }
    ]
  }),
  styleField('fill', 'Fill', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
  styleField('fontWeight', 'Font weight', 'number', { min: 100, max: 900, step: 100 }),
  styleField('fontStyle', 'Font style', 'string'),
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 0, step: 1 })
])

const readStickyFill = (
  node: NodeRenderProps['node']
) => resolvePaletteColorOr(
  getStyleString(node, 'fill'),
  STICKY_DEFAULT_FILL
) ?? STICKY_DEFAULT_FILL

const useElementBinding = <
  TElement extends HTMLDivElement
>() => {
  const ref = useRef<TElement | null>(null)

  const bind = useCallback((next: TElement | null) => {
    if (ref.current === next) {
      return
    }

    ref.current = next
  }, [])

  return {
    ref,
    bind
  }
}

const useNodeTextSourceBinding = (
  nodeId: NodeRenderProps['node']['id']
) => {
  const { textSources } = useWhiteboardServices()
  const {
    ref: sourceRef,
    bind
  } = useElementBinding<HTMLDivElement>()
  const sourceId = readNodeTextSourceId(nodeId, 'text')

  const bindRef = useCallback((element: HTMLDivElement | null) => {
    if (sourceRef.current === element) {
      return
    }

    if (sourceRef.current) {
      textSources.set(sourceId, null)
    }

    textSources.set(sourceId, element)
    bind(element)
  }, [bind, sourceId, sourceRef, textSources])

  return {
    bindRef
  }
}

export const resolveTextLayoutStyle = ({
  node,
  widthMode,
  wrapWidth
}: {
  node: NodeRenderProps['node']
  widthMode: TextWidthMode
  wrapWidth?: number
}): CSSProperties => {
  if (widthMode !== 'wrap' || typeof wrapWidth !== 'number') {
    return {}
  }

  const contentWidth = resolveTextContentBox(
    resolveTextFrameMetrics({
      node,
      width: wrapWidth,
      height: 1
    })
  ).width

  return {
    width: contentWidth,
    minWidth: contentWidth,
    maxWidth: contentWidth
  }
}

const TextNodeRenderer = ({
  node,
  edit
}: NodeRenderProps) => {
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const {
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const placeholder = TEXT_PLACEHOLDER
  const fontSize = getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = resolvePaletteColorOr(
    getStyleString(node, 'color'),
    WHITEBOARD_TEXT_DEFAULT_COLOR
  ) ?? 'var(--ui-text-primary)'
  const pickTextRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'field',
    field: 'text'
  })
  const editing = edit?.field === 'text'
  const widthMode = readTextWidthMode(node)
  const wrapWidth = readTextWrapWidth(node)
  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    fontStyle,
    color,
    padding: 0,
    ...resolveTextLayoutStyle({
      node,
      widthMode,
      wrapWidth
    })
  }
  const bindFieldRef = useCallback((element: HTMLDivElement | null) => {
    bindRef(element)
    pickTextRef(element)
  }, [bindRef, pickTextRef])

  return (
    <TextSlot
      bindRef={bindFieldRef}
      value={text}
      displayValue={text || placeholder}
      caret={edit?.caret}
      editable={editing}
      multiline
      nodeId={node.id}
      field="text"
      className="wb-default-text-host"
      style={textStyle}
    />
  )
}

const StickyNodeRenderer = ({
  node,
  rect,
  selected,
  edit
}: NodeRenderProps) => {
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const {
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const editing = edit?.field === 'text'
  const fontSize = getStyleNumber(node, 'fontSize')
    ?? estimateTextAutoFont('sticky', rect)
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = resolvePaletteColorOr(
    getStyleString(node, 'color'),
    STICKY_DEFAULT_TEXT_COLOR
  ) ?? 'var(--ui-text-primary)'
  const pickTextRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'field',
    field: 'text'
  })
  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    fontStyle,
    color,
    opacity: text ? 1 : selected ? 1 : 0.72
  }
  const bindFieldRef = useCallback((element: HTMLDivElement | null) => {
    bindRef(element)
    pickTextRef(element)
  }, [bindRef, pickTextRef])

  return (
    <div className="wb-sticky-node">
      <div className="wb-sticky-node-shell">
        <TextSlot
          bindRef={bindFieldRef}
          value={text}
          caret={edit?.caret}
          editable={editing}
          multiline
          nodeId={node.id}
          field="text"
          className="wb-sticky-node-text wb-default-text-host"
          style={textStyle}
        />
      </div>
    </div>
  )
}

const createTextStyle = (variant: 'text' | 'sticky') => (props: NodeRenderProps): CSSProperties => {
  const isSticky = variant === 'sticky'
  if (!isSticky) {
    const stroke = getStyleString(props.node, 'stroke')
    const strokeWidth = getStyleNumber(props.node, 'strokeWidth') ?? 0
    const paddingX = getStyleNumber(props.node, 'paddingX') ?? 0
    const paddingY = getStyleNumber(props.node, 'paddingY') ?? 0
    const frameKind = getStyleString(props.node, 'frameKind')
    const borderRadius = frameKind === 'ellipse'
      ? 999
      : 0
    const borderStyle = frameKind === 'underline'
      ? {
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: `${strokeWidth}px solid ${stroke ?? 'transparent'}`
        }
      : {
          border: `${strokeWidth}px solid ${stroke ?? 'transparent'}`
        }
    return {
      background: getStyleString(props.node, 'fill') ?? 'transparent',
      ...borderStyle,
      borderRadius,
      boxShadow: 'none',
      boxSizing: 'border-box',
      display: 'block',
      overflow: 'hidden',
      padding: `${paddingY}px ${paddingX}px`,
      textAlign: 'left'
    }
  }

  return {
    '--wb-sticky-fill': readStickyFill(props.node),
    background: 'var(--wb-sticky-fill, var(--wb-palette-sticky-13))',
    border: 'none',
    boxSizing: 'border-box',
    borderRadius: 0,
    boxShadow: 'none',
    display: 'block',
    isolation: 'isolate',
    overflow: 'visible',
    padding: 0,
    textAlign: 'left'
  } as CSSProperties
}

export const TextNodeDefinition: NodeDefinition = {
  type: 'text',
  meta: {
    name: 'Text',
    family: 'text',
    icon: 'text',
    controls: ['text', 'fill']
  },
  role: 'content',
  geometry: 'rect',
  schema: textSchema,
  layout: {
    kind: 'size'
  },
  defaultData: { text: '' },
  enter: true,
  edit: {
    fields: {
      text: {
        placeholder: TEXT_PLACEHOLDER,
        multiline: true,
        empty: 'keep'
      }
    }
  },
  render: (props) => <TextNodeRenderer {...props} />,
  style: createTextStyle('text')
}

export const StickyNodeDefinition: NodeDefinition = {
  type: 'sticky',
  meta: {
    name: 'Sticky',
    family: 'text',
    icon: 'sticky',
    controls: ['fill', 'text']
  },
  role: 'content',
  geometry: 'rect',
  schema: stickySchema,
  layout: {
    kind: 'fit'
  },
  defaultData: {
    text: '',
    fontMode: 'auto'
  },
  enter: true,
  edit: {
    fields: {
      text: {
        placeholder: '',
        multiline: true,
        empty: 'keep'
      }
    }
  },
  render: (props) => <StickyNodeRenderer {...props} />,
  style: createTextStyle('sticky')
}
