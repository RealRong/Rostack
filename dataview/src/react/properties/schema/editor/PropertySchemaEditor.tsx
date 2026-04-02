import { useEffect, useState } from 'react'
import type {
  PropertyId,
  GroupProperty
} from '@/core/contracts'
import {
  useEngine,
  usePropertyById,
  useTitlePropertyId
} from '@/react/editor'
import { meta, renderMessage } from '@/meta'
import { Input } from '@/react/ui'
import { PropertyKindPicker } from '../PropertyKindPicker'
import { PropertyFormatSection } from './PropertyFormatSection'
import { PropertyOptionsSection } from './PropertyOptionsSection'
import { PropertyPopoverRow } from './PropertySchemaRows'

export interface PropertySchemaEditorProps {
  propertyId: PropertyId
}

export const PropertySchemaEditor = (props: PropertySchemaEditorProps) => {
  const editor = useEngine()
  const property = usePropertyById(props.propertyId)
  const titlePropertyId = useTitlePropertyId()
  const isTitleProperty = property?.id === titlePropertyId
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    setNameDraft(property?.name ?? '')
  }, [property?.id, property?.name])

  if (!property) {
    return null
  }

  const kind = meta.property.kind.get(property.kind)
  const KindIcon = kind.Icon

  const rename = (name: string) => {
    editor.properties.rename(property.id, name)
  }

  const update = (patch: Partial<Omit<GroupProperty, 'id'>>) => {
    editor.properties.update(property.id, patch)
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
              placeholder={renderMessage(meta.ui.property.editor.propertyNamePlaceholder)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <PropertyPopoverRow
            label={renderMessage(meta.ui.property.editor.type)}
            suffix={renderMessage(kind.message)}
            widthClassName="w-[240px]"
          >
            {close => (
              <PropertyKindPicker
                kind={property.kind}
                isTitleProperty={isTitleProperty}
                onSelect={kind => {
                  editor.properties.convert(property.id, { kind })
                  close()
                }}
              />
            )}
          </PropertyPopoverRow>

          {kind.supports.options ? (
            <PropertyOptionsSection property={property} />
          ) : null}

          <PropertyFormatSection
            property={property}
            update={update}
          />
        </div>
      </div>
    </>
  )
}
