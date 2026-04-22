import {
  memo,
  useCallback,
  useRef
} from 'react'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import { fieldAnchor } from '@dataview/react/dom/field'
import { useDataView } from '@dataview/react/dataview'
import { useTranslation } from '@shared/i18n/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { Button } from '@shared/ui/button'
import { PlusIcon } from 'lucide-react'
import type { CreateRecordOpenResult } from '@dataview/runtime/createRecord'

const MAX_OPEN_ATTEMPTS = 8

export interface CreateRecordBlockProps {
  sectionKey: string
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
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const openCreatedRecord = useCallback((
    recordId: string,
    _attempt: number
  ): CreateRecordOpenResult => {
    const grid = dataView.table.grid.get()
    if (!grid) {
      return 'failed'
    }

    const itemId = findItemIdByRecordId(
      grid.items.ids,
      grid.items.read.recordId,
      recordId
    )
    if (itemId === undefined) {
      return 'retry'
    }

    const selectionFieldId = grid.fields.has(TITLE_FIELD_ID)
      ? TITLE_FIELD_ID
      : grid.fields.ids[0] ?? TITLE_FIELD_ID
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
  }, [dataView.table.grid, table])

  const onCreate = useCallback(() => {
    const ownerViewId = dataView.table.view.get()?.id

    dataView.intent.createRecord.create({
      ownerViewId,
      create: () => dataView.engine.active.records.create({
        sectionKey: props.sectionKey
      }),
      open: (recordId, attempt) => openCreatedRecord(recordId, attempt),
      retryFrames: MAX_OPEN_ATTEMPTS,
      onFailure: table.focus
    })
  }, [dataView.engine.active.records, dataView.intent.createRecord, dataView.table.view, openCreatedRecord, props.sectionKey, table])

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
)

export const CreateRecordBlock = memo(View, same)
