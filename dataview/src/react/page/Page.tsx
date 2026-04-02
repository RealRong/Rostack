import { useMemo, type CSSProperties } from 'react'
import { usePageActions } from '@dataview/react/editor'
import { ViewQueryBar } from '@dataview/react/page/features/viewQuery/ViewQueryBar'
import { PageInteractionHost } from '@dataview/react/page/PageInteractionHost'
import { PageKeyboardHost } from '@dataview/react/page/KeyboardHost'
import { PropertyValueEditorHost } from '@dataview/react/page/PropertyValueEditorHost'
import { BlockingSurfaceProvider } from '@dataview/react/ui/blockingSurface'
import { PageBody, type PageBodyProps } from './Body'
import { PageToolbar } from './Toolbar'
import { PAGE_INLINE_INSET_CSS, PAGE_INLINE_INSET_VALUE } from './layout'

export interface PageProps {
  table?: PageBodyProps['table']
  kanban?: PageBodyProps['kanban']
}

const pageStyle: CSSProperties = {
  ['--page-inline-inset' as string]: PAGE_INLINE_INSET_VALUE
}

const chromeStyle: CSSProperties = {
  paddingInline: PAGE_INLINE_INSET_CSS
}

export const Page = (props: PageProps) => {
  const page = usePageActions()
  const blockingSurfaceController = useMemo(() => ({
    setBlockingSurface: page.surface.set,
    clearBlockingSurface: page.surface.clear
  }), [page])

  return (
    <BlockingSurfaceProvider controller={blockingSurfaceController}>
      <div
        className="relative flex h-full min-h-0 flex-col overflow-hidden"
        style={pageStyle}
      >
        <div
          data-page-scroll=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        >
          <div className="flex min-h-full flex-col gap-5 py-6">
            <div
              className="flex flex-col gap-2"
              style={chromeStyle}
            >
              <PageToolbar />
              <ViewQueryBar />
            </div>
            <PageBody
              table={props.table}
              kanban={props.kanban}
            />
          </div>
        </div>
        <PageInteractionHost />
        <PageKeyboardHost />
        <PropertyValueEditorHost />
      </div>
    </BlockingSurfaceProvider>
  )
}
