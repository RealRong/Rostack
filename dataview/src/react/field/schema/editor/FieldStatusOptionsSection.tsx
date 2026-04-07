import {
  GripVertical,
  MoreHorizontal,
  Plus,
  Settings2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  CustomField,
  FieldOption,
  StatusCategory
} from '@dataview/core/contracts'
import { getFieldOptions, getStatusSections } from '@dataview/core/field'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { Button } from '@ui/button'
import {
  VerticalReorderList,
  type VerticalReorderItemState
} from '@ui/vertical-reorder-list'
import { cn } from '@ui/utils'
import {
  buildStatusIdsAfterCategoryMove,
  buildStatusMoveMenuItems,
  FieldOptionTag,
  getStatusCategoryMeta,
  OptionEditorPopover
} from '@dataview/react/field/options'
import { PickerOptionRow } from '../../value/editor/shared/PickerOptionRow'

const moveItem = <Item,>(items: readonly Item[], from: number, to: number) => {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) {
    return next
  }

  next.splice(to, 0, moved)
  return next
}

const buildOrderedIds = (
  sections: ReturnType<typeof getStatusSections>,
  category: StatusCategory,
  reordered: readonly FieldOption[]
) => sections.flatMap(section => (
  section.category === category
    ? reordered.map(option => option.id)
    : section.options.map(option => option.id)
))

const StatusOptionRow = (props: {
  option: FieldOption
  open: boolean
  currentCategory: StatusCategory
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onColorChange: (color: string) => void
  onMoveCategory: (category: StatusCategory) => void
  onDelete: () => void
  drag?: VerticalReorderItemState
}) => (
  <div className={cn(
    'flex items-center gap-1.5 transition-opacity',
    props.drag?.dragging && 'opacity-70'
  )}>
    <Button
      aria-label={`Reorder ${props.option.name}`}
      {...props.drag?.handle.attributes}
      {...props.drag?.handle.listeners}
      disabled={!props.drag}
      ref={props.drag?.handle.setActivatorNodeRef}
      size="icon"
      variant="ghost"
      style={props.drag ? { touchAction: 'none' } : undefined}
    >
      <GripVertical className="size-4 text-muted-foreground" size={16} strokeWidth={1.8} />
    </Button>

    <div className="min-w-0 flex-1">
      <PickerOptionRow
        open={props.open}
        dragging={props.drag?.dragging}
        leading={(
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            <Settings2 className="size-4 text-muted-foreground" size={16} strokeWidth={1.8} />
          </span>
        )}
        trailing={(
          <OptionEditorPopover
            option={{
              ...props.option,
              color: props.option.color ?? undefined
            }}
            open={props.open}
            onOpenChange={props.onOpenChange}
            onRename={name => {
              props.onRename(name)
              return true
            }}
            onColorChange={props.onColorChange}
            onDelete={props.onDelete}
            extraItems={buildStatusMoveMenuItems({
              currentCategory: props.currentCategory,
              onMoveCategory: props.onMoveCategory
            })}
            trigger={(
              <Button
                variant="plain"
                size="iconBare"
                aria-label={renderMessage(meta.ui.field.options.edit(props.option.name))}
                onClick={event => {
                  event.stopPropagation()
                }}
              >
                <MoreHorizontal className="size-4" size={16} strokeWidth={1.8} />
              </Button>
            )}
          />
        )}
      >
        <FieldOptionTag
          label={props.option.name.trim() || renderMessage(meta.ui.field.options.untitled)}
          color={props.option.color ?? undefined}
          className="max-w-full"
        />
      </PickerOptionRow>
    </div>
  </div>
)

export const FieldStatusOptionsSection = (props: {
  field: CustomField
}) => {
  const editor = useDataView().engine
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const options = getFieldOptions(props.field)
  const sections = getStatusSections(props.field)

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  const updateOption = (
    option: FieldOption,
    patch: Partial<FieldOption>
  ) => editor.fields.options.update(props.field.id, option.id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.color !== undefined ? { color: patch.color ?? '' } : {}),
    ...('category' in patch && patch.category !== undefined ? { category: patch.category } : {})
  })

  const appendOption = (category: StatusCategory) => {
    const option = editor.fields.options.append(props.field.id)
    if (!option) {
      return
    }

    if (category !== 'todo') {
      updateOption(option, { category })
    }
    setEditingOptionId(option.id)
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="px-1.5 text-[11px] font-medium text-muted-foreground">
        {renderMessage(meta.ui.field.options.title)}
      </div>

      {sections.map(section => {
        const visual = getStatusCategoryMeta(section.category)
        const Icon = visual.Icon

        return (
          <div
            key={section.category}
            className="rounded-xl border border-border/70 bg-muted/20 p-1.5"
          >
            <div className="flex items-center gap-2 px-1.5 pb-1.5">
              <Icon
                className={cn('size-4 shrink-0', visual.className)}
                size={16}
                strokeWidth={1.8}
              />
              <div className="min-w-0 text-[12px] font-medium text-foreground">
                {visual.label}
              </div>
            </div>

            {section.options.length ? (
              <VerticalReorderList
                items={section.options}
                getItemId={option => option.id}
                className="gap-0.5"
                onMove={(from, to) => {
                  const reordered = moveItem(section.options, from, to)
                  editor.fields.options.reorder(
                    props.field.id,
                    buildOrderedIds(sections, section.category, reordered)
                  )
                }}
                renderItem={(option, drag) => {
                  const open = editingOptionId === option.id

                  return (
                    <StatusOptionRow
                      option={option}
                      open={open}
                      currentCategory={section.category}
                      drag={drag}
                      onOpenChange={nextOpen => setEditingOptionId(nextOpen ? option.id : undefined)}
                      onRename={name => {
                        updateOption(option, { name })
                      }}
                      onColorChange={color => {
                        updateOption(option, { color })
                      }}
                      onMoveCategory={category => {
                        if (category === section.category) {
                          setEditingOptionId(undefined)
                          return
                        }

                        editor.fields.options.reorder(
                          props.field.id,
                          buildStatusIdsAfterCategoryMove(
                            sections,
                            option.id,
                            section.category,
                            category
                          )
                        )
                        updateOption(option, { category })
                        setEditingOptionId(undefined)
                      }}
                      onDelete={() => {
                        editor.fields.options.remove(props.field.id, option.id)
                      }}
                    />
                  )
                }}
              />
            ) : null}

            <div className="mt-1">
              <Button
                leading={<Plus className="size-4" size={14} strokeWidth={1.8} />}
                onClick={() => appendOption(section.category)}
              >
                {renderMessage(meta.ui.field.options.add)}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
