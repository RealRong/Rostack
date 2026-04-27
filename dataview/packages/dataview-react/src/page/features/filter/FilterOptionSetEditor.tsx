import type {
  Field,
  FieldOption,
  FilterRule
} from '@dataview/core/types'
import {
  filter as filterApi
} from '@dataview/core/view'
import {
  field as fieldApi
} from '@dataview/core/field'
import { buildOptionTagLabel } from '@dataview/react/menu-builders'
import { Checkbox } from '@shared/ui/checkbox'
import { cn } from '@shared/ui/utils'
import { meta } from '@dataview/meta'
import type { TokenTranslator } from '@shared/i18n'
import { useTranslation } from '@shared/i18n/react'

export interface FilterOptionSetEditorProps {
  field?: Field
  value: FilterRule['value']
  onChange: (value: FilterRule['value']) => void
}

interface OptionGroup {
  key: string
  label?: string
  optionIds: string[]
  options: FieldOption[]
}

const optionRowClassName = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover'

const toggleOptionId = (
  selectedIds: readonly string[],
  optionId: string
) => filterApi.value.optionSet.create(
  selectedIds.includes(optionId)
    ? selectedIds.filter(candidate => candidate !== optionId)
    : [...selectedIds, optionId]
)

const toggleOptionGroup = (
  selectedIds: readonly string[],
  optionIds: readonly string[]
) => {
  const selectedSet = new Set(selectedIds)
  const allSelected = optionIds.length > 0 && optionIds.every(optionId => selectedSet.has(optionId))

  if (allSelected) {
    return filterApi.value.optionSet.create(
      selectedIds.filter(optionId => !optionIds.includes(optionId))
    )
  }

  return filterApi.value.optionSet.create([
    ...selectedIds,
    ...optionIds.filter(optionId => !selectedSet.has(optionId))
  ])
}

const getOptionGroups = (
  field: Field
): OptionGroup[] => {
  if (!fieldApi.kind.isCustom(field)) {
    return []
  }

  if (field.kind !== 'status') {
    return [{
      key: 'options',
      optionIds: fieldApi.option.read.list(field).map(option => option.id),
      options: fieldApi.option.read.list(field)
    }]
  }

  return (['todo', 'in_progress', 'complete'] as const)
    .map(category => {
      const options = field.options.filter(option => option.category === category)
      return {
        key: category,
        label: fieldApi.status.category.label(category),
        optionIds: options.map(option => option.id),
        options
      }
    })
    .filter(group => group.options.length > 0)
}

const OptionRow = (props: {
  option: FieldOption
  t: TokenTranslator
  selected: boolean
  onClick: () => void
  inset?: boolean
}) => (
  <button
    type="button"
    onClick={props.onClick}
    className={cn(optionRowClassName, props.inset && 'pl-7')}
  >
    <Checkbox
      checked={props.selected}
      interactive={false}
    />
    <span className="min-w-0 flex-1">
      {buildOptionTagLabel(props.option, props.t, {
        variant: 'category' in props.option ? 'status' : undefined
      })}
    </span>
  </button>
)

export const FilterOptionSetEditor = (
  props: FilterOptionSetEditorProps
) => {
  const { t } = useTranslation()
  if (!props.field || !fieldApi.kind.isCustom(props.field)) {
    return (
      <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
        {t(meta.ui.filter.noOptions)}
      </div>
    )
  }

  const groups = getOptionGroups(props.field)
  if (!groups.length) {
    return (
      <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
        {t(meta.ui.filter.noOptions)}
      </div>
    )
  }

  const selectedIds = filterApi.value.optionSet.read(props.value).optionIds
  const selectedSet = new Set(selectedIds)

  return <div>
    {groups.map((group, groupIndex) => {
      const selectedCount = group.optionIds.filter(optionId => selectedSet.has(optionId)).length
      const checked = group.optionIds.length > 0 && selectedCount === group.optionIds.length
      const indeterminate = selectedCount > 0 && !checked
      const showGroupToggle = Boolean(group.label)

      return (
        <div
          key={group.key}
          className={cn(groupIndex > 0 && 'mt-1 border-t border-divider pt-1')}
        >
          {showGroupToggle ? (
            <button
              type="button"
              onClick={() => {
                props.onChange(toggleOptionGroup(selectedIds, group.optionIds))
              }}
              className={optionRowClassName}
            >
              <Checkbox
                checked={checked}
                indeterminate={indeterminate}
                interactive={false}
              />
              <span className="font-medium text-foreground">{group.label}</span>
            </button>
          ) : null}

          {group.options.map(option => (
            <OptionRow
              key={option.id}
              option={option}
              t={t}
              selected={selectedSet.has(option.id)}
              inset={showGroupToggle}
              onClick={() => {
                props.onChange(toggleOptionId(selectedIds, option.id))
              }}
            />
          ))}
        </div>
      )
    })}
  </div>
}
