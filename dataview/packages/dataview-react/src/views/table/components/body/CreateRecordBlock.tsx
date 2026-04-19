import {
  memo,
  useCallback,
  useRef
} from 'react'
import {
  TITLE_FIELD_ID,
  type Field
} from '@dataview/core/contracts'
import type {
  ItemId,
  ViewState
} from '@dataview/engine'
import { fieldAnchor } from '@dataview/react/dom/field'
import { useDataView } from '@dataview/react/dataview'
import { useTranslation } from '@shared/i18n/react'
import { useTableContext } from '@dataview/react/views/table/context'
import {
  TABLE_CELL_BLOCK_PADDING,
  TABLE_CELL_INLINE_PADDING,
  TABLE_TRAILING_ACTION_WIDTH
} from '@dataview/react/views/table/layout'
import { cn } from '@shared/ui/utils'
import { Button } from '@shared/ui/button'
import { PlusIcon } from 'lucide-react'
import type { CreateRecordOpenResult } from '@dataview/runtime/createRecord'

const MAX_OPEN_ATTEMPTS = 8

export interface CreateRecordBlockProps {
  sectionKey: string
  measureRef?: (node: HTMLDivElement | null) => void
  columns: readonly Field[]
  showVerticalLines: boolean
  template: string
}

const findItemIdByRecordId = (
  view: ViewState,
  recordId: string
): ItemId | undefined => {
  for (const itemId of view.items.ids) {
    if (view.items.get(itemId)?.recordId === recordId) {
      return itemId
    }
  }

  return undefined
}

const View = (props: CreateRecordBlockProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const table = useTableContext()
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const openCreatedRecord = useCallback((
    recordId: string
  ): CreateRecordOpenResult => {
    const currentView = table.currentView.get()
    if (!currentView) {
      return 'failed'
    }

    const itemId = findItemIdByRecordId(currentView, recordId)
    if (itemId === undefined) {
      return 'retry'
    }

    const selectionFieldId = currentView.fields.has(TITLE_FIELD_ID)
      ? TITLE_FIELD_ID
      : currentView.fields.ids[0] ?? TITLE_FIELD_ID
    table.openCell({
      cell: {
        itemId,
        fieldId: TITLE_FIELD_ID
      },
      selectionCell: {
        itemId,
        fieldId: selectionFieldId
      },
      element: triggerRef.current,
      fallbackAnchor: element => fieldAnchor(element),
      fallbackStrategy: 'after-retry',
      retryFrames: MAX_OPEN_ATTEMPTS,
      seedDraft: ''
    })
    return 'opened'
  }, [table])

  const onCreate = useCallback(() => {
    const ownerViewId = table.currentView.get()?.view.id

    dataView.intent.createRecord.create({
      ownerViewId,
      create: () => dataView.engine.active.records.create({
        sectionKey: props.sectionKey
      }),
      open: recordId => openCreatedRecord(recordId),
      retryFrames: MAX_OPEN_ATTEMPTS,
      onFailure: table.focus
    })
  }, [dataView.engine.active.records, dataView.intent.createRecord, openCreatedRecord, props.sectionKey, table])

  const cellClassName = cn(
    'min-w-0 box-border flex items-center',
    props.showVerticalLines && 'border-r border-divider'
  )

  return (
    <div
      ref={props.measureRef}
      className="relative self-stretch min-w-full w-max border-b border-divider text-sm text-foreground"
    >
      <div className="flex min-w-full w-max items-stretch">
        <div
          className="min-w-0 flex-1 box-border"
          style={{
            padding: 4
          }}
        >
          <Button
            ref={triggerRef}
            type="button"
            onPointerDown={event => {
              event.stopPropagation()
            }}
            className='text-muted-foreground'
            leading={<PlusIcon size={14} strokeWidth={1.8}/>}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              onCreate()
            }}
          >
            {t('New record')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const same = (
  left: CreateRecordBlockProps,
  right: CreateRecordBlockProps
) => (
  left.sectionKey === right.sectionKey
  && left.measureRef === right.measureRef
  && left.columns === right.columns
  && left.showVerticalLines === right.showVerticalLines
  && left.template === right.template
)

export const CreateRecordBlock = memo(View, same)
