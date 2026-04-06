import { useEffect, useState } from 'react'
import type {
  CustomFieldId,
  CustomField
} from '@dataview/core/contracts'
import {
  useDataView,
  useFieldById
} from '@dataview/react/dataview'
import { Input } from '@ui/input'
import { meta, renderMessage } from '@dataview/meta'
import { FieldKindPicker } from '../FieldKindPicker'
import { FieldFormatSection } from './FieldFormatSection'
import { FieldOptionsSection } from './FieldOptionsSection'
import { FieldPopoverRow } from './FieldSchemaRows'

export interface FieldSchemaEditorProps {
  fieldId: CustomFieldId
}

export const FieldSchemaEditor = (props: FieldSchemaEditorProps) => {
  const editor = useDataView().engine
  const property = useFieldById(props.fieldId)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    setNameDraft(property?.name ?? '')
  }, [property?.id, property?.name])

  if (!property) {
    return null
  }

  const kind = meta.field.kind.get(property.kind)
  const KindIcon = kind.Icon

  const rename = (name: string) => {
    editor.fields.rename(property.id, name)
  }

  const update = (patch: Partial<Omit<CustomField, 'id'>>) => {
    editor.fields.update(property.id, patch)
  }

  const commitName = () => {
    const nextName = nameDraft.trim()
    if (!nextName) {
      setNameDraft(property.name)
      return
    }

    if (nextName !== property.name) {
      rename(nextName)
    }
  }

  return (
    <>
      <div className="px-2 pb-3 pt-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
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
              placeholder={renderMessage(meta.ui.field.editor.fieldNamePlaceholder)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <FieldPopoverRow
            label={renderMessage(meta.ui.field.editor.type)}
            suffix={renderMessage(kind.message)}
            widthClassName="w-[240px]"
          >
            {close => (
              <FieldKindPicker
                kind={property.kind}
                isTitleProperty={false}
                onSelect={kind => {
                  editor.fields.convert(property.id, { kind })
                  close()
                }}
              />
            )}
          </FieldPopoverRow>

          {kind.supports.options ? (
            <FieldOptionsSection property={property} />
          ) : null}

          <FieldFormatSection
            property={property}
            update={update}
          />
        </div>
      </div>
    </>
  )
}
