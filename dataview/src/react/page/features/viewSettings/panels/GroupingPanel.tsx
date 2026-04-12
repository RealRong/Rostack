import { useEffect, useState } from 'react'
import type { BucketSort, Field, ViewGroup } from '@dataview/core/contracts'
import type { ViewGroupProjection } from '@dataview/engine/project'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { Input } from '@ui/input'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import {
  buildChoiceSubmenuItem,
  buildNavigationItem
} from '@dataview/react/menu-builders'
import { useViewSettings } from '../context'

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

const EMPTY_GROUP: ViewGroupProjection = {
  viewId: '',
  active: false,
  fieldId: '',
  group: undefined as ViewGroup | undefined,
  field: undefined,
  fieldLabel: '',
  mode: '',
  bucketSort: undefined,
  bucketInterval: undefined,
  showEmpty: true,
  availableModes: [],
  availableBucketSorts: [],
  supportsInterval: false
}

export const GroupingPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const router = useViewSettings()
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.view
  )
  const group = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.group
  ) ?? EMPTY_GROUP
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const groupField = group.field
  const [intervalDraft, setIntervalDraft] = useState(
    group.bucketInterval !== undefined
      ? String(group.bucketInterval)
      : ''
  )
  const availableModes = group.availableModes
  const availableBucketSorts = group.availableBucketSorts
  const showBucketInterval = group.supportsInterval

  useEffect(() => {
    if (!group.active || !groupField) {
      router.push({ kind: 'groupField' })
      return
    }

    setIntervalDraft(
      group.bucketInterval !== undefined
        ? String(group.bucketInterval)
        : ''
    )
  }, [group.active, group.bucketInterval, group.fieldId, group.mode, groupField, router])

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

    currentViewDomain?.group.setInterval(nextValue)
  }

  const settingItems: MenuItem[] = [
    buildNavigationItem({
      key: 'field',
      label: renderMessage(meta.ui.viewSettings.groupField),
      suffix: groupField?.name ?? renderMessage(meta.ui.viewSettings.none),
      onSelect: () => {
        router.push({ kind: 'groupField' })
      }
    }),
    ...(groupField && availableModes.length > 1
      ? [buildChoiceSubmenuItem({
          key: 'mode',
          label: renderMessage(meta.ui.viewSettings.groupMode),
          suffix: readGroupModeLabel(groupField, group.mode),
          value: group.mode,
          options: availableModes.map(mode => ({
            id: mode,
            label: readGroupModeLabel(groupField, mode) ?? mode
          })),
          onSelect: mode => {
            if (!groupField) {
              return
            }

            currentViewDomain?.group.setMode(mode)
          },
          presentation: 'dropdown',
          placement: 'bottom-end'
        })]
      : []),
    ...(groupField && availableBucketSorts.length > 0
      ? [buildChoiceSubmenuItem({
          key: 'sort',
          label: renderMessage(meta.ui.viewSettings.bucketSort),
          suffix: readBucketSortLabel(group.bucketSort),
          value: group.bucketSort,
          options: availableBucketSorts.map(bucketSort => ({
            id: bucketSort,
            label: readBucketSortLabel(bucketSort) ?? bucketSort
          })),
          onSelect: bucketSort => {
            if (!groupField) {
              return
            }

            currentViewDomain?.group.setSort(bucketSort)
          },
          presentation: 'dropdown',
          placement: 'bottom-end'
        })]
      : [])
  ]

  if (!group.active || !groupField) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
      <div className="flex flex-col gap-0.5">
        <Menu
          items={settingItems}
          autoFocus={false}
          submenuOpenPolicy="click"
        />
      </div>

      {showBucketInterval ? (
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
