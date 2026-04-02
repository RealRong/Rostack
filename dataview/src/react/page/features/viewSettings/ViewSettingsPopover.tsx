import { Settings2 } from 'lucide-react'
import { Button } from '@ui/button'
import { PanelHeader } from '@ui/panel-header'
import { Popover } from '@ui/popover'
import {
  useActiveView,
  usePageActions,
  usePageValue
} from '@dataview/react/editor'
import { meta, renderMessage } from '@dataview/meta'
import { PropertySchemaEditor } from '@dataview/react/properties/schema'
import {
  ViewSettingsContext,
} from './context'
import { GroupPanel } from './panels/GroupPanel'
import { LayoutPanel } from './panels/LayoutPanel'
import { PropertyCreatePanel } from './panels/PropertyCreatePanel'
import { PropertyListPanel } from './panels/PropertyListPanel'
import { QueryFieldPickerPanel } from './panels/QueryFieldPickerPanel'
import { RootPanel } from './panels/RootPanel'
import { ViewPropertiesPanel } from './panels/ViewPropertiesPanel'

export const ViewSettingsPopover = () => {
  const page = usePageActions()
  const currentView = useActiveView()
  const viewSettings = usePageValue(state => state.settings)
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
        return <GroupPanel />
      case 'viewProperties':
        return <ViewPropertiesPanel />
      case 'propertyList':
        return <PropertyListPanel />
      case 'propertyCreate':
        return <PropertyCreatePanel />
      case 'propertyEdit':
        return <PropertySchemaEditor propertyId={resolvedRoute.propertyId} />
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
        initialFocus={-1}
        surface="blocking"
        backdrop="transparent"
        trigger={(
          <Button
            size="icon"
            pressed={open}
            title={renderMessage(meta.ui.toolbar.settings(currentView?.type))}
            aria-label={renderMessage(meta.ui.toolbar.settings(currentView?.type))}
            disabled={!currentView}
          >
            <Settings2 className="size-4" size={15} strokeWidth={1} />
          </Button>
        )}
        contentClassName="w-[290px] p-0"
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
              title={renderMessage(meta.ui.viewSettings.routeTitle(resolvedRoute.kind))}
              onBack={router.back}
            />
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            {content}
          </div>
        </div>
      </Popover>
    </ViewSettingsContext.Provider>
  )
}
