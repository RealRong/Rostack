import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BucketSort, Field } from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import {
  getFieldGroupMeta
} from '@dataview/core/field'
import {
  resolveViewGroupState
} from '@dataview/core/query'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { Button } from '@ui/button'
import { DropdownMenu } from '@ui/dropdown-menu'
import { Input } from '@ui/input'
import { meta, renderMessage } from '@dataview/meta'

const readGroupModeLabel = (
  field: Field | undefined,
  mode: string
) => {
  if (!field) {
    return undefined
  }

  switch (field.kind) {
    case 'text':
    case 'title':
    case 'url':
    case 'email':
    case 'phone':
      return renderMessage(meta.ui.viewSettings.groupByValue)
    case 'status':
      return mode === 'category'
        ? renderMessage(meta.ui.viewSettings.groupByCategory)
        : renderMessage(meta.ui.viewSettings.groupByStatus)
    case 'select':
    case 'multiSelect':
      return renderMessage(meta.ui.viewSettings.groupByOption)
    case 'number':
      return renderMessage(meta.ui.viewSettings.groupByRange)
    case 'date':
      switch (mode) {
        case 'day':
          return renderMessage(meta.ui.viewSettings.groupByDay)
        case 'week':
          return renderMessage(meta.ui.viewSettings.groupByWeek)
        case 'month':
          return renderMessage(meta.ui.viewSettings.groupByMonth)
        case 'quarter':
          return renderMessage(meta.ui.viewSettings.groupByQuarter)
        case 'year':
          return renderMessage(meta.ui.viewSettings.groupByYear)
        default:
          return undefined
      }
    default:
      return undefined
  }
}

const readBucketSortLabel = (bucketSort: BucketSort | undefined) => {
  switch (bucketSort) {
    case 'manual':
      return renderMessage(meta.ui.viewSettings.bucketSortManual)
    case 'labelAsc':
      return renderMessage(meta.ui.viewSettings.bucketSortLabelAsc)
    case 'labelDesc':
      return renderMessage(meta.ui.viewSettings.bucketSortLabelDesc)
    case 'valueAsc':
      return renderMessage(meta.ui.viewSettings.bucketSortValueAsc)
    case 'valueDesc':
      return renderMessage(meta.ui.viewSettings.bucketSortValueDesc)
    default:
      return undefined
  }
}

export const GroupingPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDocument()
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const fields = getDocumentFields(document)
  const group = resolveViewGroupState(fields, currentView?.query.group)
  const groupField = group.field
  const [fieldOpen, setFieldOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [intervalDraft, setIntervalDraft] = useState(
    group.bucketInterval !== undefined
      ? String(group.bucketInterval)
      : ''
  )
  const groupMeta = getFieldGroupMeta(groupField, {
    ...(group.mode ? { mode: group.mode } : {}),
    ...(group.bucketSort ? { bucketSort: group.bucketSort } : {}),
    ...(group.bucketInterval !== undefined ? { bucketInterval: group.bucketInterval } : {})
  })
  const availableModes = groupMeta.modes
  const availableBucketSorts = groupMeta.sorts
  const showBucketInterval = groupMeta.supportsInterval

  useEffect(() => {
    setIntervalDraft(
      group.bucketInterval !== undefined
        ? String(group.bucketInterval)
        : ''
    )
  }, [group.bucketInterval, group.fieldId, group.mode])

  const commitInterval = () => {
    if (!groupField) {
      return
    }

    const rawValue = intervalDraft.trim()
    const nextValue = rawValue ? Number(rawValue) : undefined
    if (rawValue && (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || nextValue <= 0)) {
      setIntervalDraft(
        group.bucketInterval !== undefined
          ? String(group.bucketInterval)
          : ''
      )
      return
    }

    currentViewDomain?.grouping.setBucketInterval(nextValue)
  }

  const fieldItems = [
    {
      kind: 'toggle' as const,
      key: 'none',
      label: renderMessage(meta.ui.viewSettings.none),
      checked: !group.fieldId,
      onSelect: () => {
        currentViewDomain?.grouping.clear()
        setFieldOpen(false)
      }
    },
    ...fields.map(field => ({
      kind: 'toggle' as const,
      key: field.id,
      label: field.name,
      suffix: renderMessage(meta.field.kind.get(field.kind).message),
      checked: group.fieldId === field.id,
      onSelect: () => {
        currentViewDomain?.grouping.setField(field.id)
        setFieldOpen(false)
      }
    }))
  ]

  const modeItems = availableModes.map(mode => ({
    kind: 'toggle' as const,
    key: mode,
    label: readGroupModeLabel(groupField, mode) ?? mode,
    checked: group.mode === mode,
    onSelect: () => {
      if (!groupField) {
        return
      }

      currentViewDomain?.grouping.setMode(mode)
      setModeOpen(false)
    }
  }))

  const bucketSortItems = availableBucketSorts.map(bucketSort => ({
    kind: 'toggle' as const,
    key: bucketSort,
    label: readBucketSortLabel(bucketSort) ?? bucketSort,
    checked: group.bucketSort === bucketSort,
    onSelect: () => {
      if (!groupField) {
        return
      }

      currentViewDomain?.grouping.setBucketSort(bucketSort)
      setSortOpen(false)
    }
  }))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
      <div className="flex flex-col gap-0.5">
        <DropdownMenu
          open={fieldOpen}
          onOpenChange={setFieldOpen}
          placement="right-start"
          offset={10}
          initialFocus={-1}
          items={fieldItems}
          size="lg"
          trigger={(
            <Button
              layout="row"
              suffix={groupField?.name ?? renderMessage(meta.ui.viewSettings.none)}
              pressed={fieldOpen}
              trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
            >
              {renderMessage(meta.ui.viewSettings.groupField)}
            </Button>
          )}
        />

        {groupField && availableModes.length > 1 ? (
          <DropdownMenu
            open={modeOpen}
            onOpenChange={setModeOpen}
            placement="right-start"
            offset={10}
            initialFocus={-1}
            items={modeItems}
            size="md"
            trigger={(
              <Button
                layout="row"
                suffix={readGroupModeLabel(groupField, group.mode)}
                pressed={modeOpen}
                trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
              >
                {renderMessage(meta.ui.viewSettings.groupMode)}
              </Button>
            )}
          />
        ) : null}

        {groupField && bucketSortItems.length > 0 ? (
          <DropdownMenu
            open={sortOpen}
            onOpenChange={setSortOpen}
            placement="right-start"
            offset={10}
            initialFocus={-1}
            items={bucketSortItems}
            size="md"
            trigger={(
              <Button
                layout="row"
                suffix={readBucketSortLabel(group.bucketSort)}
                pressed={sortOpen}
                trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
              >
                {renderMessage(meta.ui.viewSettings.bucketSort)}
              </Button>
            )}
          />
        ) : null}
      </div>

      {groupField && showBucketInterval ? (
        <div className="mt-3 border-t border-divider px-2 pb-1 pt-3">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
            {renderMessage(meta.ui.viewSettings.bucketInterval)}
          </div>
          <Input
            value={intervalDraft}
            inputMode="decimal"
            onChange={event => setIntervalDraft(event.target.value)}
            onBlur={commitInterval}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitInterval()
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
