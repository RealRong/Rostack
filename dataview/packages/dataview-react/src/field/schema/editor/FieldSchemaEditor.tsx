import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  CustomFieldId,
  CustomField
} from '@dataview/core/contracts'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import { Input } from '@shared/ui/input'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta } from '@dataview/meta'
import { FIELD_DROPDOWN_MENU_PROPS } from '@dataview/react/field/dropdown'
import { buildFieldKindMenuItems } from '@dataview/react/field/schema/FieldKindPicker'
import { buildFieldFormatMenuItems } from '@dataview/react/field/schema/editor/FieldFormatSection'
import { FieldOptionsSection } from '@dataview/react/field/schema/editor/FieldOptionsSection'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'
import { useTranslation } from '@shared/i18n/react'

export interface FieldSchemaEditorProps {
  fieldId: CustomFieldId
}

export const FieldSchemaEditor = (props: FieldSchemaEditorProps) => {
  const { t } = useTranslation()
  const editor = useDataView().engine
  const router = useViewSettings()
  const field = useDataViewKeyedValue(
    dataView => dataView.engine.select.fields.byId,
    props.fieldId
  )
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    setNameDraft(field?.name ?? '')
  }, [field?.id, field?.name])

  if (!field) {
    return null
  }

  const kind = meta.field.kind.get(field.kind)
  const KindIcon = kind.Icon

  const rename = (name: string) => {
    editor.fields.rename(field.id, name)
  }

  const update = (patch: Partial<Omit<CustomField, 'id'>>) => {
    editor.fields.update(field.id, patch)
  }
  const typeItems: readonly MenuItem[] = [{
    kind: 'submenu',
    key: 'type',
    label: t(meta.ui.field.editor.type),
    suffix: t(kind.token),
    size: 'lg',
    ...FIELD_DROPDOWN_MENU_PROPS,
    items: buildFieldKindMenuItems({
      t,
      kind: field.kind,
      isTitleProperty: false,
      onSelect: nextKind => {
        editor.fields.changeType(field.id, { kind: nextKind })
      }
    })
  }]
  const formatItems: readonly MenuItem[] = [
    ...buildFieldFormatMenuItems({
      field,
      update,
      t
    }),
    {
      kind: 'divider',
      key: 'field-remove-divider'
    },
    {
      kind: 'action',
      key: 'field-remove',
      label: t(meta.ui.field.editor.remove),
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      onSelect: () => {
        editor.fields.remove(field.id)
        router.back()
      }
    }
  ]

  const commitName = () => {
    const nextName = nameDraft.trim()
    if (!nextName) {
      setNameDraft(field.name)
      return
    }

    if (nextName !== field.name) {
      rename(nextName)
    }
  }

  return (
    <>
      <div className="px-2 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
            <KindIcon className="size-4" size={16} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              className="h-8"
              value={nameDraft}
              onChange={event => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={event => {
                if (event.key !== 'Enter') {
                  return
                }

                event.preventDefault()
                commitName()
              }}
              placeholder={t(meta.ui.field.editor.fieldNamePlaceholder)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          <Menu
            items={typeItems}
            autoFocus={false}
            submenuOpenPolicy="click"
          />

          {kind.supports.options ? (
            <FieldOptionsSection field={field} />
          ) : null}

          {formatItems.length ? (
            <Menu
              items={formatItems}
              autoFocus={false}
              submenuOpenPolicy="click"
            />
          ) : null}
        </div>
      </div>
    </>
  )
}
