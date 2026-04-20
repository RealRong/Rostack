import {
  ChevronRight,
  Plus
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  CustomField,
  FieldOption,
  StatusCategory
} from '@dataview/core/contracts'
import { field as fieldApi } from '@dataview/core/field'
import { useDataView } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { Button } from '@shared/ui/button'
import {
  Menu,
  type MenuReorderItem
} from '@shared/ui/menu'
import { cn } from '@shared/ui/utils'
import { useTranslation } from '@shared/i18n/react'
import {
  OptionEditorPanel,
} from '@dataview/react/field/options'
import {
  buildOptionPanelReorderItem,
  readOptionLabel
} from '@dataview/react/menu-builders'
import { FIELD_DROPDOWN_MENU_PROPS } from '@dataview/react/field/dropdown'

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
  sections: ReturnType<typeof fieldApi.status.sections>,
  category: StatusCategory,
  reordered: readonly FieldOption[]
) => sections.flatMap(section => (
  section.category === category
    ? reordered.map(option => option.id)
    : section.options.map(option => option.id)
))

type StatusSectionItem = MenuReorderItem

export const FieldStatusOptionsSection = (props: {
  field: CustomField
}) => {
  const { t } = useTranslation()
  const editor = useDataView().engine
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const options = fieldApi.option.read.list(props.field)
  const sections = fieldApi.status.sections(props.field)

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  const appendOption = (category: StatusCategory) => {
    const option = editor.fields.options.append(props.field.id)
    if (!option) {
      return
    }

    if (category !== 'todo') {
      editor.fields.options.update(props.field.id, option.id, { category })
    }
    setEditingOptionId(option.id)
  }

  return (
    <div className="space-y-2 pt-1">
      {sections.map(section => {
        return (
          <div
            key={section.category}
          >
            <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 pb-1.5">
              <div className="min-w-0 text-sm font-medium text-muted-foreground">
                {fieldApi.status.category.label(section.category)}
              </div>
              <Button
                variant="plain"
                size="iconBare"
                aria-label={t(meta.ui.field.options.add)}
                onClick={() => appendOption(section.category)}
              >
                <Plus className="size-4 text-muted-foreground" size={14} strokeWidth={1.8} />
              </Button>
            </div>

            {section.options.length ? (
              <Menu.Reorder
                items={section.options.map<StatusSectionItem>(option => buildOptionPanelReorderItem({
                  option,
                  t,
                  className: editingOptionId === option.id
                    ? 'bg-hover text-fg'
                    : undefined,
                  ...FIELD_DROPDOWN_MENU_PROPS,
                  offset: 8,
                  handleAriaLabel: t(meta.ui.field.options.reorder(
                    readOptionLabel(option, t)
                  )),
                  variant: 'status',
                  content: () => (
                    <OptionEditorPanel
                      fieldId={props.field.id}
                      option={{
                        ...option,
                        color: option.color ?? undefined
                      }}
                      onDeleted={() => setEditingOptionId(undefined)}
                      onRequestClose={() => setEditingOptionId(undefined)}
                    />
                  ),
                  trailing: (
                    <ChevronRight
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        editingOptionId === option.id && 'rotate-90'
                      )}
                      size={16}
                      strokeWidth={1.8}
                    />
                  )
                }))}
                className="gap-0.5"
                openItemKey={editingOptionId ?? null}
                onOpenItemChange={key => {
                  setEditingOptionId(key ?? undefined)
                }}
                onMove={(from, to) => {
                  const reordered = moveItem(section.options, from, to)
                  editor.fields.options.reorder(
                    props.field.id,
                    buildOrderedIds(sections, section.category, reordered)
                  )
                }}
              />
            ) : null}

            {!section.options.length ? (
              <div className="mt-1">
                <Button
                  className="w-full"
                  leading={<Plus className="size-4" size={14} strokeWidth={1.8} />}
                  onClick={() => appendOption(section.category)}
                >
                  {t(meta.ui.field.options.add)}
                </Button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
