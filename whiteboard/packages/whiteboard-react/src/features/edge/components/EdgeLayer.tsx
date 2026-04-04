import type { EdgeId } from '@whiteboard/core/types'
import { memo } from 'react'
import { useEditor } from '../../../runtime/hooks/useEditor'
import { useResolvedConfig } from '../../../runtime/hooks/useWhiteboard'
import { useStoreValue } from '../../../runtime/hooks/useStoreValue'
import { useSelection } from '../../node/selection'
import { useEdgeView } from '../hooks/useEdgeView'
import { EdgeItem } from './EdgeItem'
import { EDGE_ARROW_END_ID, EDGE_ARROW_START_ID } from '../constants'

type EdgeItemByIdProps = {
  edgeId: EdgeId
  hitTestThresholdScreen: number
  selected: boolean
}

const EdgeItemById = memo(
  ({
    edgeId,
    hitTestThresholdScreen,
    selected
  }: EdgeItemByIdProps) => {
    const entry = useEdgeView(edgeId)
    if (!entry) return null

    return (
      <EdgeItem
        entry={entry}
        hitTestThresholdScreen={hitTestThresholdScreen}
        selected={selected}
      />
    )
  }
)

export const EdgeLayer = () => {
  const editor = useEditor()
  const config = useResolvedConfig()
  const edgeIds = useStoreValue(editor.read.edge.list)
  const selectedEdgeIds = useSelection().summary.target.edgeSet
  const hitTestThresholdScreen = config.edge.hitTestThresholdScreen

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-layer"
    >
      <defs>
        <marker
          id={EDGE_ARROW_END_ID}
          markerWidth="10"
          markerHeight="10"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" stroke="currentColor" />
        </marker>
        <marker
          id={EDGE_ARROW_START_ID}
          markerWidth="10"
          markerHeight="10"
          viewBox="0 0 10 10"
          refX="0"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" stroke="currentColor" />
        </marker>
      </defs>
      {edgeIds.map((edgeId) => (
        <EdgeItemById
          key={edgeId}
          edgeId={edgeId}
          hitTestThresholdScreen={hitTestThresholdScreen}
          selected={selectedEdgeIds.has(edgeId)}
        />
      ))}
    </svg>
  )
}
