import { ChevronDown, Filter, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FilterRule } from '@dataview/core/contracts'
import { parseDateInputDraft, readDatePrimaryString } from '@dataview/core/field'
import type { FilterRuleProjection } from '@dataview/engine'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Menu } from '@shared/ui/menu'
import { Popover } from '@shared/ui/popover'
import { cn } from '@shared/ui/utils'
import { meta, renderMessage } from '@dataview/meta'
import { QueryChip } from '@dataview/react/page/features/query'
import { FilterOptionSetEditor } from '@dataview/react/page/features/filter/FilterOptionSetEditor'
import {
  getFilterPresetLabel,
  getFilterValuePlaceholder
} from '@dataview/react/page/features/filter/filterText'

export interface FilterRulePopoverProps {
  entry: FilterRuleProjection
  open: boolean
  onOpenChange: (open: boolean) => void
  onPresetChange: (presetId: string) => void
  onValueChange: (value: FilterRule['value'] | undefined) => void
  onRemove?: () => void
}

const readFilterDraft = (
  entry: Pick<FilterRuleProjection, 'editorKind' | 'rule' | 'field'>,
  value: unknown
) => {
  switch (entry.editorKind) {
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
  entry: Pick<FilterRuleProjection, 'editorKind' | 'rule'>,
  draft: string
): FilterRule['value'] | null => {
  switch (entry.editorKind) {
    case 'number': {
      const trimmed = draft.trim()
      if (!trimmed) {
        return undefined
      }

      const numeric = Number(trimmed)
      return Number.isFinite(numeric)
        ? numeric
        : null
    }
    case 'date': {
      const trimmed = draft.trim()
      if (!trimmed) {
        return undefined
      }

      return parseDateInputDraft(trimmed) ?? null
    }
    default:
      return draft
  }
}

export const FilterRulePopover = (props: FilterRulePopoverProps) => {
  const [conditionOpen, setConditionOpen] = useState(false)
  const committedDraft = readFilterDraft(props.entry, props.entry.rule.value)
  const [draft, setDraft] = useState(() => committedDraft)

  const field = props.entry.field
  const active = props.entry.effective
  const bodyLayout = props.entry.bodyLayout
  const fieldLabel = props.entry.fieldLabel || renderMessage(meta.ui.filter.deletedField)
  const fieldKind = field
    ? meta.field.kind.get(field.kind)
    : undefined
  const FieldIcon = fieldKind?.Icon ?? Filter
  const editorKind = props.entry.editorKind

  useEffect(() => {
    if (!props.open) {
      setConditionOpen(false)
    }
  }, [props.open])

  useEffect(() => {
    setDraft(committedDraft)
  }, [committedDraft, field?.id, props.entry.rule.presetId])

  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      closeOnInteractOutside={!conditionOpen}
      mode="blocking"
      backdrop="transparent"
    >
      <Popover.Trigger>
        <QueryChip
          state={active ? 'active' : props.open ? 'open' : 'idle'}
          leading={<FieldIcon className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px]" size={14} strokeWidth={1.8} />}
        >
          {fieldLabel}
        </QueryChip>
      </Popover.Trigger>
      <Popover.Content
        initialFocus={-1}
        padding="none"
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

                {field ? (
                  <Menu.Dropdown
                    open={conditionOpen}
                    onOpenChange={setConditionOpen}
                    initialFocus={-1}
                    placement="bottom-start"
                    offset={6}
                    size="md"
                    items={props.entry.conditions.map(item => ({
                      kind: 'toggle' as const,
                      key: item.id,
                      label: getFilterPresetLabel(field, item.id),
                      checked: item.id === props.entry.activePresetId,
                      onSelect: () => {
                        props.onPresetChange(item.id)
                        setConditionOpen(false)
                      }
                    }))}
                    trigger={(
                      <div className="flex h-5 text-sm cursor-pointer items-center gap-1 rounded-md px-1 font-semibold text-muted-foreground transition-[background-color,color] hover:bg-hover hover:text-foreground">
                        {getFilterPresetLabel(field, props.entry.activePresetId)}
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
              {editorKind === 'option-set' ? (
                <FilterOptionSetEditor
                  field={field}
                  value={props.entry.rule.value}
                  onChange={props.onValueChange}
                />
              ) : (
                <Input
                  value={draft}
                  onChange={event => {
                    const nextDraft = event.target.value
                    setDraft(nextDraft)

                    const nextValue = applyFilterDraft(props.entry, nextDraft)
                    if (nextValue !== null) {
                      props.onValueChange(nextValue)
                    }
                  }}
                  onBlur={() => {
                    setDraft(committedDraft)
                  }}
                  type={editorKind === 'date' ? 'date' : 'text'}
                  inputMode={editorKind === 'number' ? 'decimal' : undefined}
                  placeholder={getFilterValuePlaceholder(field)}
                />
              )}
            </div>
          ) : null}
        </div>
      </Popover.Content>
    </Popover>
  )
}
