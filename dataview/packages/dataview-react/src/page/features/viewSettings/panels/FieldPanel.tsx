import type { FieldId } from '@dataview/core/types'
import { meta } from '@dataview/meta'
import {
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import { FieldSchemaEditor } from '@dataview/react/field/schema'
import { Input } from '@shared/ui/input'
import { useTranslation } from '@shared/i18n/react'

export interface FieldPanelProps {
  fieldId: FieldId
}

const TitleFieldPanel = () => {
  const { t } = useTranslation()
  const kind = meta.field.kind.get('title')

  return (
    <>
      <div className="px-2 pb-3 pt-3">
        <Input
          className="h-8"
          value={t(kind.token)}
          readOnly
        />
      </div>

      <div className="px-3 pb-3 text-sm text-muted-foreground">
        {t(meta.ui.field.editor.titleDescription)}
      </div>
    </>
  )
}

export const FieldPanel = (props: FieldPanelProps) => {
  const field = useDataViewKeyedValue(
    dataView => dataView.source.document.fields,
    props.fieldId
  )

  if (!field) {
    return null
  }

  if (field.kind === 'title') {
    return <TitleFieldPanel />
  }

  return <FieldSchemaEditor fieldId={field.id} />
}
