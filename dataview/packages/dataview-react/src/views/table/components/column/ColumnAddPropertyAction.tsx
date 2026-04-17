import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { buildFieldKindMenuItems } from '@dataview/react/field/schema'
import { useDataView } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import { Menu } from '@shared/ui/menu'
import { Button } from '@shared/ui/button'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'

const openNextFrame = (callback: () => void) => {
  if (typeof window === 'undefined') {
    callback()
    return
  }

  window.requestAnimationFrame(() => {
    callback()
  })
}

export const ColumnAddPropertyAction = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const editor = dataView.engine
  const page = dataView.page
  const items = useMemo(() => buildFieldKindMenuItems({
    t,
    kind: undefined,
    isTitleProperty: false,
    onSelect: kind => {
      const fieldId = editor.fields.create({
        kind,
        name: t(meta.field.kind.get(kind).defaultName)
      })
      if (!fieldId) {
        return
      }

      editor.active.display.show(fieldId)
      openNextFrame(() => {
        page.settings.open({
          kind: 'fieldSchema',
          fieldId
        })
      })
    }
  }), [editor, page.settings, t])

  return (
    <div
      className="h-full shrink-0"
      style={{
        width: TABLE_TRAILING_ACTION_WIDTH
      }}
    >
      <Menu.Dropdown
        items={items}
        initialFocus={0}
        mode="blocking"
        backdrop="transparent"
        size="lg"
        trigger={(
          <Button
            variant="ghost"
            size="lg"
            leading={<Plus className="size-4" size={16} strokeWidth={1.8} />}
            className="h-full w-full justify-start rounded-none px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/80"
          >
            {t(meta.ui.viewSettings.fieldsPanel.add)}
          </Button>
        )}
      />
    </div>
  )
}
