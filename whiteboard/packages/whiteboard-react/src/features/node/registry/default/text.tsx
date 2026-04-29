import {
  useCallback,
  useRef,
  type CSSProperties
} from 'react'
import { node as nodeApi } from '@whiteboard/core/node'
import { product } from '@whiteboard/product'
import type { NodeRenderProps, NodeSpecEntry } from '@whiteboard/react/types/node'
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
  getStyleNumber,
  getStyleString
} from '@whiteboard/react/features/node/registry/default/shared'

const textSchema = {
  fields: {
    'data.text': {
      label: 'Text',
      type: 'text'
    },
    'style.fill': {
      label: 'Background',
      type: 'color'
    },
    'style.color': {
      label: 'Text color',
      type: 'color'
    },
    'style.fontSize': {
      label: 'Font size',
      type: 'number',
      min: 8,
      step: 1
    },
    'style.fontWeight': {
      label: 'Font weight',
      type: 'number',
      min: 100,
      max: 900,
      step: 100
    },
    'style.fontStyle': {
      label: 'Font style',
      type: 'string'
    }
  }
} as const

const stickySchema = {
  fields: {
    'data.text': {
      label: 'Text',
      type: 'text'
    },
    'data.fontMode': {
      label: 'Font mode',
      type: 'enum',
      options: [...product.node.text.WHITEBOARD_STICKY_FONT_MODE_OPTIONS]
    },
    'style.fill': {
      label: 'Fill',
      type: 'color'
    },
    'style.color': {
      label: 'Text color',
      type: 'color'
    },
    'style.fontSize': {
      label: 'Font size',
      type: 'number',
      min: 8,
      step: 1
    },
    'style.fontWeight': {
      label: 'Font weight',
      type: 'number',
      min: 100,
      max: 900,
      step: 100
    },
    'style.fontStyle': {
      label: 'Font style',
      type: 'string'
    },
    'style.stroke': {
      label: 'Stroke',
      type: 'color'
    },
    'style.strokeWidth': {
      label: 'Stroke width',
      type: 'number',
      min: 0,
      step: 1
    }
  }
} as const

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
  const source = {
    kind: 'node' as const,
    nodeId,
    field: 'text' as const
  }

  const bindRef = useCallback((element: HTMLDivElement | null) => {
    if (sourceRef.current === element) {
      return
    }

    if (sourceRef.current) {
      textSources.set(source, null)
    }

    textSources.set(source, element)
    bind(element)
  }, [bind, source, sourceRef, textSources])

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

  const contentWidth = nodeApi.text.contentBox(
    nodeApi.text.frameMetrics({
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
    product.palette.defaults.textColor
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
    ?? nodeApi.text.estimateAutoFont('sticky', rect)
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

export const TextNodeSpec: NodeSpecEntry = {
  meta: {
    type: 'text',
    name: 'Text',
    family: 'text',
    icon: 'text',
    controls: ['text', 'fill']
  },
  schema: textSchema,
  behavior: {
    role: 'content',
    geometry: 'rect',
    defaultData: {
      text: ''
    },
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
}

export const StickyNodeSpec: NodeSpecEntry = {
  meta: {
    type: 'sticky',
    name: 'Sticky',
    family: 'text',
    icon: 'sticky',
    controls: ['fill', 'text']
  },
  schema: stickySchema,
  behavior: {
    role: 'content',
    geometry: 'rect',
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
}
