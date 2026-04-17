import {
  type CSSProperties
} from 'react'
import {
  resolveNeutralCardStyle,
  resolveOptionCardStyle
} from '@shared/ui/color'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  RecordCard
} from '@dataview/react/views/shared'
import type { ItemId } from '@dataview/engine'
import { useKanbanContext } from '@dataview/react/views/kanban/context'

export const Card = (props: {
  itemId: ItemId
  className?: string
  style?: CSSProperties
}) => {
  const {
    active,
    extra,
    runtime
  } = useKanbanContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const sectionColorId = extra.groupUsesOptionColors
    ? engine.active.read.section(
        engine.active.read.item(props.itemId)?.sectionKey ?? ''
      )?.color
    : undefined

  return (
    <RecordCard
      viewId={active.view.id}
      itemId={props.itemId}
      fields={active.fields.custom}
      size={extra.card.size}
      layout={extra.card.layout}
      wrap={extra.card.wrap}
      canDrag={extra.canReorder}
      drag={runtime.drag}
      selection={runtime.selection}
      visualTargets={runtime.visualTargets}
      marqueeActive={runtime.marqueeActive}
      titlePlaceholder={record => record.id}
      showEditAction
      className={props.className}
      style={props.style}
      selectedStyle={{
        boxShadow: 'var(--ui-shadow-sm), 0 0 0 2px var(--ui-accent-frame-border)'
      }}
      resolveSurfaceStyle={({ hovered, editing }) => {
        const surfaceState = hovered && !editing ? 'hover' : 'default'
        return extra.fillColumnColor
          ? resolveOptionCardStyle(sectionColorId, surfaceState)
          : resolveNeutralCardStyle(surfaceState, 'preview')
      }}
    />
  )
}
