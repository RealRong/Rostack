import {
  useMemo,
  useState
} from 'react'
import { FileText } from 'lucide-react'
import type {
  GroupRecord,
  RecordId
} from '@dataview/core/contracts'
import {
  isEmptyPropertyValue
} from '@dataview/core/property'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import {
  shouldCapturePointer
} from '@dataview/dom/interactive'
import {
  useDataView
} from '@dataview/react/dataview'
import { useKeyedStoreValue } from '@dataview/react/store'
import {
  CardContent
} from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import { useGalleryContext } from '../context'
import {
  CARD_TITLE_PLACEHOLDER
} from '@dataview/react/views/shared/cardTitleValue'
import {
  useCardTitleEditing
} from '@dataview/react/views/shared/useCardTitleEditing'

export const Card = (props: {
  appearanceId: AppearanceId
}) => {
  const controller = useGalleryContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const recordId = controller.currentView.appearances.get(props.appearanceId)?.recordId ?? '' as RecordId
  const record = useKeyedStoreValue(engine.read.record, recordId)
  if (!record) {
    return null
  }

  return (
    <GalleryCardContent
      appearanceId={props.appearanceId}
      record={record}
    />
  )
}

const GalleryCardContent = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
}) => {
  const controller = useGalleryContext()
  const viewId = controller.currentView.view.id
  const titleProperty = controller.titleProperty
  const properties = controller.properties
  const selected = controller.selectedIdSet.has(props.appearanceId)
  const marqueeSelected = controller.marqueeIdSet.has(props.appearanceId)
  const active = controller.drag.activeId === props.appearanceId
  const draggingSelected = controller.drag.activeId !== undefined
    && controller.drag.dragIdSet.has(props.appearanceId)
  const canDrag = controller.canReorder
  const [hovered, setHovered] = useState(false)
  const editing = useCardTitleEditing({
    viewId,
    appearanceId: props.appearanceId,
    record: props.record,
    titleProperty
  })
  const visibleProperties = useMemo(() => {
    return editing.mode === 'edit'
      ? properties
      : properties.filter(property => !isEmptyPropertyValue(props.record.values[property.id]))
  }, [editing.mode, properties, props.record])

  return (
    <div
      {...{
        [DATAVIEW_APPEARANCE_ID_ATTR]: props.appearanceId
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
      onPointerDown={event => {
        if (editing.editing) {
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        controller.drag.onPointerDown(props.appearanceId, event)
      }}
      onClick={event => {
        if (editing.editing) {
          return
        }

        if (controller.drag.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        controller.select(
          props.appearanceId,
          event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
        )
      }}
      className={cn(
        'touch-none',
        !editing.editing && 'select-none',
        !editing.editing && canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        active && 'opacity-35',
        draggingSelected && !active && 'opacity-60'
      )}
    >
      <CardContent
        slots={{
          root: cn(
            'relative h-full rounded-lg p-3 transition-colors ui-shadow-sm ui-card-bg',
            selected && 'border-primary bg-primary/[0.05]',
            !selected && marqueeSelected && 'border-primary/40 bg-primary/[0.04]'
          ),
          title: {
            row: 'flex min-w-0 items-start gap-2.5 pb-2',
            content: 'min-w-0 flex-1',
            text: 'text-base font-semibold leading-6',
            input: 'text-base font-semibold leading-6 text-foreground'
          },
          property: {
            list: 'flex flex-col pb-2 pt-0 leading-6',
            item: 'min-w-0 pb-2 last:pb-0',
            value: 'text-[13px] leading-6 text-foreground'
          }
        }}
        viewId={viewId}
        appearanceId={props.appearanceId}
        record={props.record}
        titleProperty={titleProperty}
        properties={visibleProperties}
        mode={editing.mode}
        committedTitle={editing.committedTitle}
        titleDraft={editing.titleDraft}
        titlePlaceholder={CARD_TITLE_PLACEHOLDER}
        onTitleDraftChange={editing.setTitleDraft}
        onCommitTitle={editing.commitTitle}
        onSubmitTitle={editing.submitTitle}
        onSelect={() => controller.select(props.appearanceId, 'replace')}
        showEditAction={hovered && !editing.editing && !active}
        onEnterEdit={editing.enterEdit}
        titleLeading={(
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" size={18} strokeWidth={1.8} />
        )}
      />
    </div>
  )
}
