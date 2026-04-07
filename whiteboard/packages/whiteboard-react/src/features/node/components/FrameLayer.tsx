import {
  memo,
  useCallback,
  useMemo,
  type CSSProperties
} from 'react'
import type {
  NodeId
} from '@whiteboard/core/types'
import { useEditor } from '../../../runtime/hooks/useEditor'
import { usePickRef } from '../../../runtime/hooks/usePickRef'
import { useStoreValue } from '../../../runtime/hooks/useStoreValue'
import { useNodeView } from '../hooks/useNodeView'
import { FrameNodeChrome } from '../registry/default/frame'

const FrameBodyItem = memo(({
  nodeId
}: {
  nodeId: NodeId
}) => {
  const view = useNodeView(nodeId)

  if (!view || view.node.type !== 'frame') {
    return null
  }

  const rootStyle: CSSProperties = {
    width: view.rect.width,
    height: view.rect.height,
    pointerEvents: 'none',
    ...view.transformStyle
  }
  const fillStyle: CSSProperties = {
    background: view.nodeStyle.background,
    borderRadius: view.nodeStyle.borderRadius
  }

  return (
    <div
      className="wb-container-block"
      style={rootStyle}
    >
      <div
        className="wb-container-fill"
        style={fillStyle}
      />
    </div>
  )
})

FrameBodyItem.displayName = 'FrameBodyItem'

const SHELL_HITS = [
  {
    key: 'top',
    style: {
      left: 0,
      top: 'calc(-5px / var(--wb-zoom, 1))',
      width: '100%',
      height: 'calc(10px / var(--wb-zoom, 1))'
    }
  },
  {
    key: 'right',
    style: {
      top: 0,
      right: 'calc(-5px / var(--wb-zoom, 1))',
      width: 'calc(10px / var(--wb-zoom, 1))',
      height: '100%'
    }
  },
  {
    key: 'bottom',
    style: {
      left: 0,
      bottom: 'calc(-5px / var(--wb-zoom, 1))',
      width: '100%',
      height: 'calc(10px / var(--wb-zoom, 1))'
    }
  },
  {
    key: 'left',
    style: {
      top: 0,
      left: 'calc(-5px / var(--wb-zoom, 1))',
      width: 'calc(10px / var(--wb-zoom, 1))',
      height: '100%'
    }
  }
] as const

const ShellHitItem = ({
  nodeId,
  side,
  style,
  active = true
}: {
  nodeId: NodeId
  side: typeof SHELL_HITS[number]['key']
  style: CSSProperties
  active?: boolean
}) => {
  const bindPickRef = usePickRef({
    kind: 'node',
    id: nodeId,
    part: 'shell'
  })
  const ref = useCallback((element: HTMLDivElement | null) => {
    bindPickRef(active ? element : null)
  }, [active, bindPickRef])

  return (
    <div
      ref={ref}
      className="wb-node-shell-hit"
      data-side={side}
      style={{
        ...style,
        pointerEvents: active ? 'auto' : 'none'
      }}
    />
  )
}

const ContainerChromeItem = memo(({
  nodeId
}: {
  nodeId: NodeId
}) => {
  const view = useNodeView(nodeId)

  if (!view) {
    return null
  }

  if (view.node.type !== 'frame') {
    return null
  }

  const rootStyle: CSSProperties = {
    width: view.rect.width,
    height: view.rect.height,
    ...view.transformStyle
  }
  const frameStyle: CSSProperties = {
    border: view.nodeStyle.border,
    borderRadius: view.nodeStyle.borderRadius,
    boxShadow: view.nodeStyle.boxShadow
  }

  return (
    <div
      className="wb-container-shell"
      data-node-id={nodeId}
      style={rootStyle}
    >
      {SHELL_HITS.map((hit) => (
        <ShellHitItem
          key={hit.key}
          nodeId={nodeId}
          side={hit.key}
          style={hit.style}
        />
      ))}
      <div
        className="wb-container-shell-frame"
        style={frameStyle}
      />
      <FrameNodeChrome
        node={view.renderProps.node}
        write={view.renderProps.write}
      />
    </div>
  )
})

ContainerChromeItem.displayName = 'ContainerChromeItem'

export const FrameLayer = () => {
  const editor = useEditor()
  const nodeIds = useStoreValue(editor.read.node.list)
  const frameIds = useMemo(() => editor.read.frame.list(), [editor, nodeIds])

  if (!frameIds.length) {
    return null
  }

  return (
    <div className="wb-container-layer">
      {frameIds.map((nodeId) => (
        <FrameBodyItem
          key={nodeId}
          nodeId={nodeId}
        />
      ))}
    </div>
  )
}

export const ContainerChromeLayer = () => {
  const editor = useEditor()
  const nodeIds = useStoreValue(editor.read.node.list)
  const frameIds = useMemo(() => editor.read.frame.list(), [editor, nodeIds])

  if (!frameIds.length) {
    return null
  }

  return (
    <div className="wb-container-chrome-layer">
      {frameIds.map((nodeId) => (
        <ContainerChromeItem
          key={nodeId}
          nodeId={nodeId}
        />
      ))}
    </div>
  )
}
