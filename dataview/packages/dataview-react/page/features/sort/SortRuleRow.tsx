import { useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  GripVertical,
  X
} from 'lucide-react'
import type { Field, Sorter } from '@dataview/core/contracts'
import { FieldPicker } from '#react/field/picker'
import { Button } from '@shared/ui/button'
import { Menu } from '@shared/ui/menu'
import { Popover } from '@shared/ui/popover'
import type { VerticalReorderItemState } from '@shared/ui/vertical-reorder-list'
import { cn } from '@shared/ui/utils'
import { meta, renderMessage } from '@dataview/meta'
import { buildChoiceToggleItems } from '#react/menu-builders'
import {
  SORT_DIRECTIONS,
  findSorterField,
  getAvailableSorterFieldsForIndex
} from './sortUi'

export interface SortRuleRowProps {
  fields: readonly Field[]
  sorters: readonly Sorter[]
  index: number
  sorter: Sorter
  onChange: (sorter: Sorter) => void
  onRemove: () => void
  drag?: VerticalReorderItemState
}

export const SortRuleRow = (props: SortRuleRowProps) => {
  const [fieldOpen, setFieldOpen] = useState(false)
  const [directionOpen, setDirectionOpen] = useState(false)
  const field = findSorterField(props.fields, props.sorter)
  const availableFields = getAvailableSorterFieldsForIndex(props.fields, props.sorters, props.index)
  const fieldLabel = field?.name ?? renderMessage(meta.ui.sort.deletedField)
  const fieldKind = field
    ? meta.field.kind.get(field.kind)
    : undefined
  const FieldIcon = fieldKind?.Icon

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_128px_auto] items-center gap-1.5 transition-opacity',
        props.drag?.dragging && 'opacity-70'
      )}
    >
      <Button
        ref={props.drag?.handle.setActivatorNodeRef}
        {...props.drag?.handle.attributes}
        {...props.drag?.handle.listeners}
        aria-label={props.drag
          ? renderMessage(meta.ui.sort.reorder(fieldLabel))
          : undefined}
        disabled={!props.drag}
        size="icon"
        style={props.drag
          ? {
            cursor: props.drag.dragging ? 'grabbing' : 'grab',
            touchAction: 'none'
          }
          : undefined}
      >
        <GripVertical className="size-4" size={16} strokeWidth={1.8} />
      </Button>

      <Popover
        open={fieldOpen}
        onOpenChange={setFieldOpen}
        placement="bottom-start"
      >
        <Popover.Trigger>
          <Button
            layout="row"
            leading={field && FieldIcon
              ? <FieldIcon className="size-4 shrink-0" size={16} strokeWidth={1.8} />
              : <ArrowUpDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
            trailing={<ChevronDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
          >
            {fieldLabel}
          </Button>
        </Popover.Trigger>
        <Popover.Content
          initialFocus={-1}
          size="xl"
          padding="none"
        >
          <div className="flex max-h-[72vh] flex-col">
            <FieldPicker
              fields={availableFields}
              selectedFieldId={field?.id}
              emptyMessage={meta.ui.fieldPicker.noAvailable}
              onSelect={fieldId => {
                props.onChange({
                  field: fieldId,
                  direction: props.sorter.direction
                })
                setFieldOpen(false)
              }}
            />
          </div>
        </Popover.Content>
      </Popover>

      <Menu.Dropdown
        open={directionOpen}
        onOpenChange={setDirectionOpen}
        initialFocus={-1}
        placement="bottom-start"
        size="sm"
        items={buildChoiceToggleItems({
          options: SORT_DIRECTIONS.map(direction => ({
            id: direction,
            label: renderMessage(meta.sort.direction.get(direction).message)
          })),
          value: props.sorter.direction,
          onSelect: direction => {
            props.onChange({
              ...props.sorter,
              direction
            })
          }
        })}
        trigger={(
          <Button
            layout="row"
            pressed={directionOpen}
            trailing={<ChevronDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
          >
            {renderMessage(meta.sort.direction.get(props.sorter.direction).message)}
          </Button>
        )}
      />

      <Button
        size="icon"
        aria-label={renderMessage(meta.ui.sort.remove)}
        onClick={props.onRemove}
      >
        <X className="size-4" size={16} strokeWidth={1.8} />
      </Button>
    </div>
  )
}
