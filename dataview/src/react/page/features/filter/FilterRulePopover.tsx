import { Check, ChevronDown, Filter, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Field, FilterRule } from '@dataview/core/contracts'
import {
  applyFieldFilterPreset,
  isFieldFilterEffective,
} from '@dataview/core/field'
import {
  findFieldOption,
  getFieldOptions,
  parseDateInputDraft,
  readDatePrimaryString
} from '@dataview/core/field'
import { isCustomField } from '@dataview/core/field'
import { Button } from '@ui/button'
import { DropdownMenu } from '@ui/dropdown-menu'
import { Input } from '@ui/input'
import { Popover } from '@ui/popover'
import { cn } from '@ui/utils'
import { meta, renderMessage } from '@dataview/meta'
import { FieldOptionTag } from '@dataview/react/field/options'
import { QueryChip } from '../query'
import { StatusFilterPicker } from './StatusFilterPicker'

export interface FilterRulePopoverProps {
  field?: Field
  rule: FilterRule
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (rule: FilterRule) => void
  onRemove?: () => void
}

const readFilterDraft = (
  field: Pick<Field, 'kind'> | undefined,
  value: unknown
) => {
  switch (field?.kind) {
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
  rule: FilterRule,
  field: Pick<Field, 'kind'> | undefined,
  draft: string
): FilterRule | null => {
  switch (field?.kind) {
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
  const committedDraft = readFilterDraft(props.field, props.rule.value)
  const [draft, setDraft] = useState(() => committedDraft)

  const presentation = meta.filter.present(props.field, props.rule)
  const active = isFieldFilterEffective(props.field, props.rule.op, props.rule.value)
  const bodyLayout = presentation.bodyLayout
  const fieldLabel = props.field?.name ?? renderMessage(meta.ui.filter.deletedField)
  const fieldKind = props.field
    ? meta.field.kind.get(props.field.kind)
    : undefined
  const FieldIcon = fieldKind?.Icon ?? Filter
  const conditionItems = meta.filter.conditions(props.field)
  const editorKind = presentation.value.editor
  const fieldOptions = isCustomField(props.field)
    ? getFieldOptions(props.field)
    : []
  const selectedOption = !isCustomField(props.field) || props.field.kind === 'status'
    ? undefined
    : findFieldOption(props.field, props.rule.value)

  useEffect(() => {
    if (!props.open) {
      setConditionOpen(false)
    }
  }, [props.open])

  useEffect(() => {
    setDraft(committedDraft)
  }, [committedDraft, props.field?.id, props.rule.op])

  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      initialFocus={-1}
      closeOnInteractOutside={!conditionOpen}
      mode="blocking"
      backdrop="transparent"
      padding="none"
      trigger={(
        <QueryChip
          state={active ? 'active' : props.open ? 'open' : 'idle'}
          leading={<FieldIcon className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px]" size={14} strokeWidth={1.8} />}
        >
          {fieldLabel}
        </QueryChip>
      )}
      contentClassName="w-[320px]"
    >
      <div className="flex max-h-[72vh] flex-col">
        <div className={cn(
          'px-2.5 pt-2',
          bodyLayout === 'none' ? 'pb-2' : 'pb-1'
        )}>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 text-sm gap-1 flex items-end truncate font-medium text-foreground">
              {fieldLabel}

              {props.field && presentation.condition ? (
                <DropdownMenu
                  open={conditionOpen}
                  onOpenChange={setConditionOpen}
                  initialFocus={-1}
                  placement="bottom-start"
                  offset={6}
                  size="md"
                  items={conditionItems.map(item => ({
                    kind: 'toggle' as const,
                    key: item.id,
                    label: renderMessage(item.message),
                    checked: item.id === presentation.condition?.id,
                    onSelect: () => {
                      props.onChange(applyFieldFilterPreset(props.rule, props.field, item))
                      setConditionOpen(false)
                    }
                  }))}
                  trigger={(
                    <div className="flex h-5 text-sm cursor-pointer items-center gap-1 rounded-md px-1 font-semibold text-muted-foreground transition-[background-color,color] hover:bg-hover hover:text-foreground">
                      {renderMessage(presentation.condition.message)}
                      <ChevronDown className="opacity-70" size={12} strokeWidth={2} />
                    </div>
                  )}
                />
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
            bodyLayout === 'inset' ? 'px-2.5 pb-2.5 pt-1' : 'px-1.5 pb-2 pt-1'
          )}>
            {editorKind === 'status' ? (
              <StatusFilterPicker
                field={props.field}
                rule={props.rule}
                onChange={props.onChange}
              />
            ) : editorKind === 'singleOption' ? (
              <div className="flex flex-col gap-0.5">
                {fieldOptions.length ? (
                  fieldOptions.map(option => {
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
                        <FieldOptionTag
                          label={option.name}
                          color={option.color ?? undefined}
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

                  const nextRule = applyFilterDraft(props.rule, props.field, nextDraft)
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
