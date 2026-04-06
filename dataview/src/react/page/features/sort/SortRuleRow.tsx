import { useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  GripVertical,
  X
} from 'lucide-react'
import type { Field, Sorter } from '@dataview/core/contracts'
import { Button } from '@ui/button'
import { DropdownMenu } from '@ui/dropdown-menu'
import { Popover } from '@ui/popover'
import type { VerticalReorderItemState } from '@ui/vertical-reorder-list'
import { cn } from '@ui/utils'
import { meta, renderMessage } from '@dataview/meta'
import { FieldPicker } from '@dataview/react/page/features/viewQuery/FieldPicker'
import {
  SORT_DIRECTIONS,
  findSorterProperty,
  getAvailableSorterPropertiesForIndex
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
  const property = findSorterProperty(props.fields, props.sorter)
  const availableFields = getAvailableSorterPropertiesForIndex(props.fields, props.sorters, props.index)
  const fieldLabel = property?.name ?? renderMessage(meta.ui.sort.deletedField)
  const propertyKind = property
    ? meta.field.kind.get(property.kind)
    : undefined
  const FieldIcon = propertyKind?.Icon

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
        initialFocus={-1}
        placement="bottom-start"
        trigger={(
          <Button
            layout="row"
            leading={property && FieldIcon
              ? <FieldIcon className="size-4 shrink-0" size={16} strokeWidth={1.8} />
              : <ArrowUpDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
            trailing={<ChevronDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
          >
            {fieldLabel}
          </Button>
        )}
        contentClassName="w-[280px] p-0"
      >
        <div className="flex max-h-[72vh] flex-col">
          <FieldPicker
            fields={availableFields}
            selectedFieldId={property?.id}
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
      </Popover>

      <DropdownMenu
        open={directionOpen}
        onOpenChange={setDirectionOpen}
        initialFocus={-1}
        placement="bottom-start"
        items={SORT_DIRECTIONS.map(direction => ({
          kind: 'toggle' as const,
          key: direction,
          label: renderMessage(meta.sort.direction.get(direction).message),
          checked: props.sorter.direction === direction,
          onSelect: () => {
            props.onChange({
              ...props.sorter,
              direction
            })
          }
        }))}
        trigger={(
          <Button
            layout="row"
            pressed={directionOpen}
            trailing={<ChevronDown className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
          >
            {renderMessage(meta.sort.direction.get(props.sorter.direction).message)}
          </Button>
        )}
        contentClassName="min-w-0 w-[180px] p-1.5"
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
