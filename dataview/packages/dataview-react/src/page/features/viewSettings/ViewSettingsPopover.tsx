import { Settings2 } from 'lucide-react'
import { Button } from '@shared/ui/button'
import { PanelHeader } from '@shared/ui/panel-header'
import { Popover } from '@shared/ui/popover'
import {
  useDataView,
  usePageModel
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import {
  ViewSettingsContext,
} from '@dataview/react/page/features/viewSettings/context'
import { FieldPanel } from '@dataview/react/page/features/viewSettings/panels/FieldPanel'
import { GroupingPanel } from '@dataview/react/page/features/viewSettings/panels/GroupingPanel'
import { GroupFieldPickerPanel } from '@dataview/react/page/features/viewSettings/panels/GroupFieldPickerPanel'
import { LayoutPanel } from '@dataview/react/page/features/viewSettings/panels/LayoutPanel'
import { FieldCreatePanel } from '@dataview/react/page/features/viewSettings/panels/FieldCreatePanel'
import { FieldListPanel } from '@dataview/react/page/features/viewSettings/panels/FieldListPanel'
import { QueryFieldPickerPanel } from '@dataview/react/page/features/viewSettings/panels/QueryFieldPickerPanel'
import { RootPanel } from '@dataview/react/page/features/viewSettings/panels/RootPanel'
import { ViewFieldsPanel } from '@dataview/react/page/features/viewSettings/panels/ViewFieldsPanel'
import {
  useStoreValue
} from '@shared/react'

export const ViewSettingsPopover = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const page = dataView.session.page
  const pageModel = usePageModel()
  const viewSettings = useStoreValue(pageModel.settings)
  const currentView = viewSettings.view
  const open = viewSettings.visible
  const resolvedRoute = viewSettings.route

  const router = {
    route: resolvedRoute,
    close: page.settings.close,
    back: page.settings.back,
    push: page.settings.push
  }

  const content = (() => {
    switch (resolvedRoute.kind) {
      case 'root':
        return <RootPanel />
      case 'layout':
        return <LayoutPanel />
      case 'group':
        return <GroupingPanel />
      case 'groupField':
        return <GroupFieldPickerPanel />
      case 'viewProperties':
        return <ViewFieldsPanel />
      case 'fieldList':
        return <FieldListPanel />
      case 'fieldCreate':
        return <FieldCreatePanel />
      case 'field':
        return <FieldPanel fieldId={resolvedRoute.fieldId} />
      case 'filter':
        return <QueryFieldPickerPanel kind="filter" />
      case 'sort':
        return <QueryFieldPickerPanel kind="sort" />
      default:
        return null
    }
  })()

  return (
    <ViewSettingsContext.Provider value={router}>
      <Popover
        open={open}
        onOpenChange={nextOpen => {
          if (nextOpen) {
            page.settings.open()
            return
          }

          page.settings.close()
        }}
        mode="blocking"
        backdrop="transparent"
      >
        <Popover.Trigger>
          <Button
            size="icon"
            pressed={open}
            title={t(meta.ui.toolbar.settings(currentView?.type))}
            aria-label={t(meta.ui.toolbar.settings(currentView?.type))}
            disabled={!currentView}
          >
            <Settings2 className="size-4" size={15} strokeWidth={1} />
          </Button>
        </Popover.Trigger>
        <Popover.Content
          initialFocus={-1}
          padding="none"
          contentClassName="w-[290px]"
        >
          <div
            className="flex max-h-[80vh] flex-col"
            onKeyDown={event => {
              if (event.defaultPrevented) {
                return
              }

              if (event.key === 'Escape' && resolvedRoute.kind !== 'root') {
                event.preventDefault()
                event.stopPropagation()
                router.back()
              }
            }}
          >
            {resolvedRoute.kind === 'root' ? null : (
              <PanelHeader
                title={t(meta.ui.viewSettings.routeTitle(resolvedRoute.kind))}
                onBack={router.back}
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col">
              {content}
            </div>
          </div>
        </Popover.Content>
      </Popover>
    </ViewSettingsContext.Provider>
  )
}
