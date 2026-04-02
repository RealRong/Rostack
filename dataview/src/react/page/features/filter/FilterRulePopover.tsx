import { Check, ChevronDown, Filter, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GroupProperty, GroupFilterRule } from '@/core/contracts'
import {
  applyPropertyFilterPreset,
  findPropertyOption,
  getPropertyOptions,
  isFilterRuleEffective,
  parseDateInputDraft,
  readDatePrimaryString
} from '@/core/property'
import { meta, renderMessage } from '@/meta'
import { PropertyOptionTag } from '@/react/properties/options'
import { Button, Input, Menu, Popover, QueryChip, cn } from '@/react/ui'
import { StatusFilterPicker } from './StatusFilterPicker'

export interface FilterRulePopoverProps {
  property?: GroupProperty
  rule: GroupFilterRule
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (rule: GroupFilterRule) => void
  onRemove?: () => void
}

const readFilterDraft = (
  property: Pick<GroupProperty, 'kind'> | undefined,
  value: unknown
) => {
  switch (property?.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : ''
    case 'date':
      return readDatePrimaryString(value) ?? ''
    default:
      return typeof value === 'string' ? value : ''
  }
}

const applyFilterDraft = (
  rule: GroupFilterRule,
  property: Pick<GroupProperty, 'kind'> | undefined,
  draft: string
): GroupFilterRule | null => {
  switch (property?.kind) {
    case 'number': {
      const trimmed = draft.trim()
      if (!trimmed) {
        return {
          ...rule,
          value: undefined
        }
      }

      const numeric = Number(trimmed)
      return Number.isFinite(numeric)
        ? {
            ...rule,
            value: numeric
          }
        : null
    }
    case 'date': {
      const trimmed = draft.trim()
      if (!trimmed) {
        return {
          ...rule,
          value: undefined
        }
      }

      const parsed = parseDateInputDraft(trimmed)
      return parsed
        ? {
            ...rule,
            value: parsed
          }
        : null
    }
    default:
      return {
        ...rule,
        value: draft
      }
  }
}

export const FilterRulePopover = (props: FilterRulePopoverProps) => {
  const [conditionOpen, setConditionOpen] = useState(false)
  const committedDraft = readFilterDraft(props.property, props.rule.value)
  const [draft, setDraft] = useState(() => committedDraft)

  const presentation = meta.filter.present(props.property, props.rule)
  const active = isFilterRuleEffective(props.property, props.rule.op, props.rule.value)
  const bodyLayout = presentation.bodyLayout
  const propertyLabel = props.property?.name ?? renderMessage(meta.ui.filter.deletedProperty)
  const propertyKind = props.property
    ? meta.property.kind.get(props.property.kind)
    : undefined
  const PropertyIcon = propertyKind?.Icon ?? Filter
  const conditionItems = meta.filter.conditions(props.property)
  const editorKind = presentation.value.editor
  const propertyOptions = getPropertyOptions(props.property)
  const selectedOption = props.property?.kind === 'status'
    ? undefined
    : findPropertyOption(props.property, props.rule.value)

  useEffect(() => {
    if (!props.open) {
      setConditionOpen(false)
    }
  }, [props.open])

  useEffect(() => {
    setDraft(committedDraft)
  }, [committedDraft, props.property?.id, props.rule.op])

  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      initialFocus={-1}
      closeOnInteractOutside={!conditionOpen}
      surface="blocking"
      backdrop="transparent"
      trigger={(
        <QueryChip
          state={active ? 'active' : props.open ? 'open' : 'idle'}
          leading={<PropertyIcon className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px]" size={14} strokeWidth={1.8} />}
        >
          {propertyLabel}
        </QueryChip>
      )}
      contentClassName="w-[320px] p-0"
    >
      <div className="flex max-h-[72vh] flex-col">
        <div className={cn(
          'px-2 pt-2',
          bodyLayout === 'none' ? 'pb-2' : 'pb-1'
        )}>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 gap-1 flex items-center truncate text-sm font-medium text-foreground">
              {propertyLabel}

              {props.property && presentation.condition ? (
                <Popover
                  open={conditionOpen}
                  onOpenChange={setConditionOpen}
                  initialFocus={-1}
                  placement="bottom-start"
                  offset={6}
                  surface="scoped"
                  trigger={(
                    <div className="flex h-5 cursor-pointer items-center gap-1 rounded-md px-1 font-semibold text-muted-foreground transition ui-control">
                      {renderMessage(presentation.condition.message)}
                      <ChevronDown className="opacity-70" size={12} strokeWidth={2} />
                    </div>
                  )}
                  contentClassName="w-[220px] p-1.5"
                >
                  <Menu
                    items={conditionItems.map(item => ({
                      kind: 'toggle' as const,
                      key: item.id,
                      label: renderMessage(item.message),
                      checked: item.id === presentation.condition?.id,
                      onSelect: () => {
                        props.onChange(applyPropertyFilterPreset(props.rule, props.property, item))
                        setConditionOpen(false)
                      }
                    }))}
                  />
                </Popover>
              ) : null}
            </div>

            {props.onRemove ? (
              <Button
                size="icon"
                aria-label={renderMessage(meta.ui.filter.remove)}
                onClick={() => {
                  props.onRemove?.()
                  props.onOpenChange(false)
                }}
              >
                <Trash size={14} strokeWidth={1.8} />
              </Button>
            ) : null}
          </div>
        </div>

        {bodyLayout !== 'none' ? (
          <div className={cn(
            bodyLayout === 'inset' ? 'px-2 pb-3 pt-2' : 'px-1.5 pb-2 pt-1'
          )}>
            {editorKind === 'status' ? (
              <StatusFilterPicker
                property={props.property}
                rule={props.rule}
                onChange={props.onChange}
              />
            ) : editorKind === 'singleOption' ? (
              <div className="flex flex-col gap-0.5">
                {propertyOptions.length ? (
                  propertyOptions.map(option => {
                    const selected = selectedOption?.id === option.id

                    return (
                      <Button
                        key={option.id}
                        onClick={() => {
                          props.onChange({
                            ...props.rule,
                            value: option.id
                          })
                        }}
                        layout="row"
                        trailing={selected
                          ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
                          : undefined}
                        pressed={selected}
                      >
                        <PropertyOptionTag
                          label={option.name}
                          color={option.color}
                        />
                      </Button>
                    )
                  })
                ) : (
                  <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
                    {renderMessage(meta.ui.filter.noOptions)}
                  </div>
                )}
              </div>
            ) : (
              <Input
                value={draft}
                onChange={event => {
                  const nextDraft = event.target.value
                  setDraft(nextDraft)

                  const nextRule = applyFilterDraft(props.rule, props.property, nextDraft)
                  if (nextRule) {
                    props.onChange(nextRule)
                  }
                }}
                onBlur={() => {
                  setDraft(committedDraft)
                }}
                type={editorKind === 'date' ? 'date' : 'text'}
                inputMode={editorKind === 'number' ? 'decimal' : undefined}
                placeholder={presentation.value.placeholder
                  ? renderMessage(presentation.value.placeholder)
                  : undefined}
              />
            )}
          </div>
        ) : null}
      </div>
    </Popover>
  )
}
