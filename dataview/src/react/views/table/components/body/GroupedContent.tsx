import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent
} from 'react'
import type {
  GroupProperty,
  PropertyId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  Section as ViewSection
} from '@dataview/react/runtime/currentView'
import { useVirtualSections } from '../../hooks/useVirtualSections'
import { Section } from './Section'

export interface GroupedContentProps {
  sections: readonly ViewSection[]
  columns: readonly GroupProperty[]
  template: string
  marqueeActive: boolean
  dragActive: boolean
  dragIdSet: ReadonlySet<AppearanceId>
  onDragStart: (input: {
    rowId: AppearanceId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
  resizingPropertyId?: PropertyId
  onResizeStart: (
    propertyId: PropertyId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}

export const GroupedContent = (props: GroupedContentProps) => {
  const virtualSections = useVirtualSections({
    sections: props.sections
  })

  return (
    <div
      style={{
        position: 'relative',
        height: virtualSections.totalHeight
      }}
    >
      {virtualSections.items.map(item => {
        const style: CSSProperties = {
          position: 'absolute',
          top: item.top,
          left: 0,
          right: 0
        }

        return (
          <div
            key={item.section.key}
            style={style}
          >
            <Section
              section={item.section}
              columns={props.columns}
              template={props.template}
              marqueeActive={props.marqueeActive}
              dragActive={props.dragActive}
              dragIdSet={props.dragIdSet}
              onDragStart={props.onDragStart}
              resizingPropertyId={props.resizingPropertyId}
              onResizeStart={props.onResizeStart}
            />
          </div>
        )
      })}
    </div>
  )
}
