import { useMemo } from 'react'
import { useEditor } from '#react/runtime/hooks'
import { useStoreValue } from '#react/runtime/hooks'
import { useNodeSizeObserver } from '../dom/nodeSizeObserver'
import { useSelection } from '../selection'
import { NodeItem } from './NodeItem'

export const NodeSceneLayer = () => {
  const editor = useEditor()
  const nodeIds = useStoreValue(editor.read.node.list)
  const selection = useSelection()
  const selectedSet = selection.summary.target.nodeSet
  const registerMeasuredElement = useNodeSizeObserver()
  const contentNodeIds = useMemo(
    () => nodeIds.filter((nodeId) => {
      const node = editor.read.node.item.get(nodeId)?.node
      return node
        ? editor.read.node.capability(node).role === 'content'
        : false
    }),
    [editor, nodeIds]
  )

  return (
    <div className="wb-node-layer">
      {contentNodeIds.map((nodeId) => (
        <NodeItem
          key={nodeId}
          nodeId={nodeId}
          registerMeasuredElement={registerMeasuredElement}
          selected={selectedSet.has(nodeId)}
        />
      ))}
    </div>
  )
}
