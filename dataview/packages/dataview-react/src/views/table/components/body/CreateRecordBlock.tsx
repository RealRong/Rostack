import {
  memo,
  useCallback,
  useRef
} from 'react'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type {
  ItemId
} from '@dataview/engine'
import { fieldAnchor } from '@dataview/react/dom/field'
import { useDataView } from '@dataview/react/dataview'
import { useTranslation } from '@shared/i18n/react'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { Button } from '@shared/ui/button'
import { PlusIcon } from 'lucide-react'
import type { CreateRecordOpenResult } from '@dataview/runtime'
import { store } from '@shared/core'

const MAX_OPEN_ATTEMPTS = 8

export interface CreateRecordBlockProps {
  sectionId: string
  measureRef?: (node: HTMLDivElement | null) => void
}

const findItemIdByRecordId = (
  itemIds: readonly ItemId[],
  recordIdOf: (itemId: ItemId) => string | undefined,
  recordId: string
): ItemId | undefined => {
  for (const itemId of itemIds) {
    if (recordIdOf(itemId) === recordId) {
      return itemId
    }
  }

  return undefined
}

const View = (props: CreateRecordBlockProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const table = useTableContext()
  const body = useStoreValue(dataView.model.table.body)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  if (!body) {
    throw new Error('Table create-record block requires an active table body.')
  }

  const openCreatedRecord = useCallback((
    recordId: string,
    _attempt: number
  ): CreateRecordOpenResult => {
    const items = store.peek(dataView.source.active.items.list)

    const itemId = findItemIdByRecordId(
      items.ids,
      item => dataView.model.table.row.get(item)?.recordId,
      recordId
    )
    if (itemId === undefined) {
      return 'retry'
    }

    const selectionFieldId = body.columns.some(column => column.field.id === TITLE_FIELD_ID)
      ? TITLE_FIELD_ID
      : body.columns[0]?.field.id ?? TITLE_FIELD_ID
    return table.openCell({
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
      ? 'opened'
      : 'retry'
  }, [body.columns, dataView.model.table.row, dataView.source.active.items.list, table])

  const onCreate = useCallback(() => {
    dataView.workflow.createRecord.create({
      ownerViewId: body.viewId,
      create: () => dataView.engine.active.records.create({
        section: props.sectionId
      }),
      open: (recordId, attempt) => openCreatedRecord(recordId, attempt),
      retryFrames: MAX_OPEN_ATTEMPTS,
      onFailure: table.focus
    })
  }, [body.viewId, dataView.engine.active.records, dataView.workflow.createRecord, openCreatedRecord, props.sectionId, table])

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
  left.sectionId === right.sectionId
  && left.measureRef === right.measureRef
)

export const CreateRecordBlock = memo(View, same)
