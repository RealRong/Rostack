import {
  CircleCheck,
  CircleDashed,
  CirclePlay,
  Square,
  SquareCheck
} from 'lucide-react'
import type {
  Field,
  FilterRule,
  StatusCategory
} from '@dataview/core/contracts'
import {
  createEmptyStatusFilterValue,
  getStatusCategoryLabel,
  getStatusSections,
  isStatusFilterCategorySelected,
  isStatusFilterOptionSelected,
  toggleStatusFilterCategory,
  toggleStatusFilterOption
} from '@dataview/core/field'
import { Menu, type MenuItem } from '@ui/menu'
import { cn } from '@ui/utils'
import { meta, renderMessage } from '@dataview/meta'
import { buildOptionTagLabel } from '@dataview/react/menu-builders'

export interface StatusFilterPickerProps {
  field?: Field
  rule: FilterRule
  onChange: (rule: FilterRule) => void
}

const categoryVisual = (
  category: StatusCategory
) => {
  switch (category) {
    case 'todo':
      return {
        Icon: CircleDashed,
        className: 'text-muted-foreground'
      }
    case 'in_progress':
      return {
        Icon: CirclePlay,
        className: 'text-blue-500'
      }
    case 'complete':
    default:
      return {
        Icon: CircleCheck,
        className: 'text-green-500'
      }
  }
}

const SelectionIcon = (props: {
  selected: boolean
}) => props.selected
  ? <SquareCheck className="size-4 text-primary" size={16} strokeWidth={1.9} />
  : <Square className="size-4 text-muted-foreground" size={16} strokeWidth={1.8} />

export const StatusFilterPicker = (
  props: StatusFilterPickerProps
) => {
  if (props.field?.kind !== 'status') {
    return null
  }

  const field = props.field
  const sections = getStatusSections(field)
  const hasOptions = sections.some(section => section.options.length > 0)

  if (!hasOptions) {
    return (
      <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
        {renderMessage(meta.ui.filter.noOptions)}
      </div>
    )
  }

  const items: MenuItem[] = sections.flatMap((section, index) => {
    const categorySelected = isStatusFilterCategorySelected(
      field,
      props.rule.value,
      section.category
    )
    const visual = categoryVisual(section.category)
    const CategoryIcon = visual.Icon

    const sectionItems: MenuItem[] = [
      {
        kind: 'toggle',
        key: `${section.category}:category`,
        checked: categorySelected,
        leading: <SelectionIcon selected={categorySelected} />,
        label: (
          <span className={cn(
            'inline-flex items-center gap-2 font-medium',
            categorySelected ? visual.className : 'text-foreground'
          )}>
            <CategoryIcon
              className={cn('size-4 shrink-0', visual.className)}
              size={16}
              strokeWidth={1.8}
            />
            <span className="truncate">
              {getStatusCategoryLabel(section.category)}
            </span>
          </span>
        ),
        onSelect: () => {
          props.onChange({
            ...props.rule,
            value: toggleStatusFilterCategory(
              field,
              props.rule.value,
              section.category
            )
          })
        }
      },
      ...section.options.map<MenuItem>(option => {
        const optionSelected = isStatusFilterOptionSelected(
          field,
          props.rule.value,
          option.id
        )

        return {
          kind: 'toggle',
          key: option.id,
          checked: optionSelected,
          className: 'pl-7',
          leading: <SelectionIcon selected={optionSelected} />,
          label: buildOptionTagLabel(option, {
            variant: 'status'
          }),
          onSelect: () => {
            props.onChange({
              ...props.rule,
              value: toggleStatusFilterOption(
                field,
                props.rule.value,
                option.id
              )
            })
          }
        }
      })
    ]

    return index === 0
      ? sectionItems
      : [{
          kind: 'divider',
          key: `${section.category}:divider`
        }, ...sectionItems]
  })

  return (
    <div className="flex flex-col">
      <div className="px-1.5 pb-2 pt-1">
        <Menu
          items={items}
          autoFocus={false}
        />
      </div>

      <div className="border-t border-border px-1.5 py-1.5">
        <Menu
          autoFocus={false}
          items={[{
            kind: 'action',
            key: 'clear',
            label: renderMessage(meta.ui.filter.clearSelection),
            onSelect: () => {
              props.onChange({
                ...props.rule,
                value: createEmptyStatusFilterValue()
              })
            }
          }]}
        />
      </div>
    </div>
  )
}
