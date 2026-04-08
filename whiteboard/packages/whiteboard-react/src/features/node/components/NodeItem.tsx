import { memo, useCallback, type CSSProperties } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { usePickRef } from '#react/runtime/hooks'
import { useNodeView } from '../hooks/useNodeView'

type NodeItemProps = {
  nodeId: NodeId
  registerMeasuredElement: (
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => void
  selected: boolean
}
export const NodeItem = memo(({
  nodeId,
  registerMeasuredElement,
  selected
}: NodeItemProps) => {
  const view = useNodeView(nodeId, { selected })

  if (!view) return null
  if (view.hidden) return null

  const {
    node: resolvedNode,
    rect,
    resizing,
    nodeStyle,
    transformStyle,
    definition,
    renderProps
  } = view
  const shouldAutoMeasure = Boolean(definition?.autoMeasure) && !resizing
  const hit = definition?.hit ?? 'box'
  const setPickElement = usePickRef({
    kind: 'node',
    id: nodeId,
    part: 'body'
  })
  const setMeasuredElement = useCallback((element: HTMLDivElement | null) => {
    registerMeasuredElement(nodeId, element, shouldAutoMeasure)
  }, [nodeId, registerMeasuredElement, shouldAutoMeasure])
  const setRootElement = useCallback((element: HTMLDivElement | null) => {
    setPickElement(element)
    if (definition?.autoMeasure) {
      setMeasuredElement(element)
    }
  }, [definition?.autoMeasure, setMeasuredElement, setPickElement])

  const rootStyle: CSSProperties = {
    ...nodeStyle,
    pointerEvents: hit === 'path' ? 'none' : 'auto',
    ...transformStyle
  }
  const content = definition ? definition.render(renderProps) : resolvedNode.type

  return (
    <div
      ref={setRootElement}
      className="wb-node-block"
      data-node-id={nodeId}
      data-node-type={resolvedNode.type}
      data-node-hit={hit}
      data-selected={selected ? 'true' : undefined}
      style={{
        width: rect.width,
        height: rect.height,
        ...rootStyle
      }}
    >
      {content}
    </div>
  )
})

NodeItem.displayName = 'NodeItem'
