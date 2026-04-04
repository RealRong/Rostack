import {
  Check,
  CircleCheck,
  CircleDashed,
  CirclePlay,
  GripVertical,
  Plus,
  Settings2
} from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type {
  GroupProperty,
  GroupPropertyOption,
  GroupStatusCategory
} from '@dataview/core/contracts'
import { getPropertyOptions, getStatusSections } from '@dataview/core/property'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Popover } from '@ui/popover'
import {
  resolveOptionColorToken,
  resolveOptionDotStyle
} from '@ui/color'
import {
  VerticalReorderList,
  type VerticalReorderItemState
} from '@ui/vertical-reorder-list'
import { cn } from '@ui/utils'
import {
  PropertyOptionTag
} from '@dataview/react/properties/options'

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
  category: GroupStatusCategory,
  reordered: readonly GroupPropertyOption[]
) => sections.flatMap(section => (
  section.category === category
    ? reordered.map(option => option.id)
    : section.options.map(option => option.id)
))

const buildIdsAfterCategoryMove = (
  sections: ReturnType<typeof getStatusSections>,
  optionId: string,
  from: GroupStatusCategory,
  to: GroupStatusCategory
) => sections.flatMap(section => {
  const ids = section.options
    .map(option => option.id)
    .filter(id => id !== optionId)

  if (section.category === to) {
    return [...ids, optionId]
  }

  if (section.category === from) {
    return ids
  }

  return ids
})

const StatusOptionEditorPopover = (props: {
  option: GroupPropertyOption
  open: boolean
  currentCategory: GroupStatusCategory
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onMoveCategory: (category: GroupStatusCategory) => void
  onDelete: () => void
  trigger: ReactElement
}) => {
  const [draftName, setDraftName] = useState(props.option.name)

  useEffect(() => {
    setDraftName(props.option.name)
  }, [props.option.id, props.option.name, props.open])

  const commitName = () => {
    const nextName = draftName.trim()
    if (!nextName) {
      setDraftName(props.option.name)
      return
    }

    if (nextName === props.option.name) {
      setDraftName(nextName)
      return
    }

    const result = props.onRename(nextName)
    if (result === false) {
      setDraftName(props.option.name)
      return
    }

    setDraftName(nextName)
  }

  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      trigger={props.trigger}
      placement="bottom-start"
      offset={10}
      initialFocus={-1}
      surface="scoped"
      contentClassName="w-[220px] p-1.5"
    >
      <div className="flex flex-col gap-2">
        <Input
          value={draftName}
          onChange={event => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={event => {
            event.stopPropagation()

            if (event.key !== 'Enter') {
              return
            }

            event.preventDefault()
            commitName()
          }}
          placeholder={renderMessage(meta.ui.property.options.namePlaceholder)}
        />

        <div>
          <div className="flex flex-col gap-0.5">
            {meta.option.color.list.map(color => {
              const active = (props.option.color ?? '') === color.id
              return (
                <Button
                  key={color.id || 'default'}
                  onClick={() => props.onColorChange(color.id)}
                  layout="row"
                  leading={(
                    <span
                      className="inline-flex h-3 w-3 shrink-0 rounded-full border"
                      style={{
                        ...resolveOptionDotStyle(color.id),
                        borderColor: resolveOptionColorToken(color.id, 'badge-border')
                      }}
                    />
                  )}
                  trailing={active
                    ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
                    : undefined}
                  pressed={active}
                >
                  {renderMessage(color.message)}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-divider pt-1.5">
          <div className="px-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
            {renderMessage(meta.ui.property.status.moveTo)}
          </div>

          <div className="flex flex-col gap-0.5">
            {(['todo', 'in_progress', 'complete'] as const).map(category => {
              const categoryInfo = categoryMeta(category)
              const active = props.currentCategory === category
              const CategoryIcon = categoryInfo.Icon

              return (
                <Button
                  key={category}
                  layout="row"
                  leading={(
                    <CategoryIcon
                      className={cn('size-4 shrink-0', categoryInfo.className)}
                      size={16}
                      strokeWidth={1.8}
                    />
                  )}
                  trailing={active
                    ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
                    : undefined}
                  pressed={active}
                  onClick={() => props.onMoveCategory(category)}
                >
                  {categoryInfo.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-divider pt-1.5">
          <Button
            variant="ghostDestructive"
            layout="row"
            onClick={() => {
              props.onDelete()
              props.onOpenChange(false)
            }}
          >
            {renderMessage(meta.ui.property.options.remove)}
          </Button>
        </div>
      </div>
    </Popover>
  )
}

const StatusOptionRow = (props: {
  option: GroupPropertyOption
  open: boolean
  currentCategory: GroupStatusCategory
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onColorChange: (color: string) => void
  onMoveCategory: (category: GroupStatusCategory) => void
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
      <StatusOptionEditorPopover
        option={props.option}
        open={props.open}
        currentCategory={props.currentCategory}
        onOpenChange={props.onOpenChange}
        onRename={name => {
          props.onRename(name)
          return true
        }}
        onColorChange={props.onColorChange}
        onMoveCategory={props.onMoveCategory}
        onDelete={props.onDelete}
        trigger={(
          <Button
            layout="row"
            pressed={props.open}
            leading={<Settings2 className="size-4 shrink-0 text-muted-foreground" size={16} strokeWidth={1.8} />}
            onClick={() => undefined}
          >
            <div className="min-w-0">
              <PropertyOptionTag
                label={props.option.name.trim() || renderMessage(meta.ui.property.options.untitled)}
                color={props.option.color}
              />
            </div>
          </Button>
        )}
      />
    </div>
  </div>
)

const categoryMeta = (category: GroupStatusCategory) => {
  switch (category) {
    case 'todo':
      return {
        label: renderMessage(meta.ui.property.status.todo),
        Icon: CircleDashed,
        className: 'text-muted-foreground'
      }
    case 'in_progress':
      return {
        label: renderMessage(meta.ui.property.status.inProgress),
        Icon: CirclePlay,
        className: 'text-blue-500'
      }
    case 'complete':
    default:
      return {
        label: renderMessage(meta.ui.property.status.complete),
        Icon: CircleCheck,
        className: 'text-green-500'
      }
  }
}

export const PropertyStatusOptionsSection = (props: {
  property: GroupProperty
}) => {
  const editor = useDataView().engine
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const options = getPropertyOptions(props.property)
  const sections = getStatusSections(props.property)

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  const updateOption = (
    option: GroupPropertyOption,
    patch: Partial<GroupPropertyOption>
  ) => editor.properties.options.update(props.property.id, option.id, patch)

  const appendOption = (category: GroupStatusCategory) => {
    const option = editor.properties.options.append(props.property.id)
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
        {renderMessage(meta.ui.property.options.title)}
      </div>

      {sections.map(section => {
        const visual = categoryMeta(section.category)
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
                  editor.properties.options.reorder(
                    props.property.id,
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

                        editor.properties.options.reorder(
                          props.property.id,
                          buildIdsAfterCategoryMove(
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
                        editor.properties.options.remove(props.property.id, option.id)
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
                {renderMessage(meta.ui.property.options.add)}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
