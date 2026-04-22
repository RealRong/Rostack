import { useEffect, useState } from 'react'
import {
  useDataView,
  usePageRuntime
} from '@dataview/react/dataview'
import { Input } from '@shared/ui/input'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta } from '@dataview/meta'
import {
  buildChoiceSubmenuItem,
  buildNavigationItem
} from '@dataview/react/menu-builders'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'
import { useTranslation } from '@shared/i18n/react'
import {
  readBucketSortLabel,
  readGroupModeLabel
} from '@dataview/react/page/features/viewSettings/groupUi'
import {
  useStoreValue
} from '@shared/react'

export const GroupingPanel = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const router = useViewSettings()
  const pageRuntime = usePageRuntime()
  const settings = useStoreValue(pageRuntime.settings)
  const currentView = settings.currentView
  const group = settings.group
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const groupField = group?.field
  const [intervalDraft, setIntervalDraft] = useState(
    group?.bucketInterval !== undefined
      ? String(group.bucketInterval)
      : ''
  )
  const availableModes = group?.availableModes ?? []
  const availableBucketSorts = group?.availableBucketSorts ?? []
  const showBucketInterval = group?.supportsInterval ?? false

  useEffect(() => {
    if (!group || !groupField) {
      router.push({ kind: 'groupField' })
      return
    }

    setIntervalDraft(
      group.bucketInterval !== undefined
        ? String(group.bucketInterval)
        : ''
    )
  }, [group, group?.bucketInterval, group?.fieldId, group?.mode, groupField, router])

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
      label: t(meta.ui.viewSettings.groupField),
      suffix: groupField?.name ?? t(meta.ui.viewSettings.none),
      onSelect: () => {
        router.push({ kind: 'groupField' })
      }
    }),
    ...(groupField && availableModes.length > 1
      ? [buildChoiceSubmenuItem({
          key: 'mode',
          label: t(meta.ui.viewSettings.groupMode),
          suffix: readGroupModeLabel(groupField, group.mode, t),
          value: group.mode,
          options: availableModes.map(mode => ({
            id: mode,
            label: readGroupModeLabel(groupField, mode, t) ?? mode
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
          label: t(meta.ui.viewSettings.bucketSort),
          suffix: readBucketSortLabel(group.bucketSort, t),
          value: group.bucketSort,
          options: availableBucketSorts.map(bucketSort => ({
            id: bucketSort,
            label: readBucketSortLabel(bucketSort, t) ?? bucketSort
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

  if (!group || !groupField) {
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
            {t(meta.ui.viewSettings.bucketInterval)}
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
