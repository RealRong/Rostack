import {
  CircleCheck,
  CircleDashed,
  CirclePlay,
  Square,
  SquareCheck
} from 'lucide-react'
import type {
  GroupProperty,
  GroupFilterRule,
  GroupStatusCategory
} from '@dataview/core/contracts'
import {
  createEmptyStatusFilterValue,
  getStatusCategoryLabel,
  getStatusSections,
  isStatusFilterCategorySelected,
  isStatusFilterOptionSelected,
  toggleStatusFilterCategory,
  toggleStatusFilterOption
} from '@dataview/core/property'
import { meta, renderMessage } from '@dataview/meta'
import { PropertyOptionTag } from '@dataview/react/properties/options'
import { Button, cn } from '@dataview/react/ui'

export interface StatusFilterPickerProps {
  property?: GroupProperty
  rule: GroupFilterRule
  onChange: (rule: GroupFilterRule) => void
}

const categoryVisual = (
  category: GroupStatusCategory
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
  if (props.property?.kind !== 'status') {
    return null
  }

  const sections = getStatusSections(props.property)
  const hasOptions = sections.some(section => section.options.length > 0)

  if (!hasOptions) {
    return (
      <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
        {renderMessage(meta.ui.filter.noOptions)}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 px-1.5 pb-2 pt-1">
        {sections.map(section => {
          const categorySelected = isStatusFilterCategorySelected(
            props.property,
            props.rule.value,
            section.category
          )
          const visual = categoryVisual(section.category)
          const CategoryIcon = visual.Icon

          return (
            <div
              key={section.category}
              className="flex flex-col gap-0.5"
            >
              <Button
                layout="row"
                pressed={categorySelected}
                leading={<SelectionIcon selected={categorySelected} />}
                onClick={() => {
                  props.onChange({
                    ...props.rule,
                    value: toggleStatusFilterCategory(
                      props.property,
                      props.rule.value,
                      section.category
                    )
                  })
                }}
              >
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
              </Button>

              {section.options.map(option => {
                const optionSelected = isStatusFilterOptionSelected(
                  props.property,
                  props.rule.value,
                  option.id
                )

                return (
                  <div
                    key={option.id}
                    className="pl-7"
                  >
                    <Button
                      layout="row"
                      pressed={optionSelected}
                      leading={<SelectionIcon selected={optionSelected} />}
                      onClick={() => {
                        props.onChange({
                          ...props.rule,
                          value: toggleStatusFilterOption(
                            props.property,
                            props.rule.value,
                            option.id
                          )
                        })
                      }}
                    >
                      <PropertyOptionTag
                        label={option.name}
                        color={option.color}
                      />
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="border-t border-border px-1.5 py-1.5">
        <Button
          layout="row"
          onClick={() => {
            props.onChange({
              ...props.rule,
              value: createEmptyStatusFilterValue()
            })
          }}
        >
          {renderMessage(meta.ui.filter.clearSelection)}
        </Button>
      </div>
    </div>
  )
}
