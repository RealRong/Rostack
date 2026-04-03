import { useMemo, type CSSProperties } from 'react'
import { BlockingSurfaceProvider } from '@ui/blocking-surface'
import { useDataView } from '@dataview/react/dataview'
import { ViewQueryBar } from '@dataview/react/page/features/viewQuery/ViewQueryBar'
import { PageInteractionHost, PageKeyboardHost } from '@dataview/react/page/hosts'
import { PropertyValueEditorHost } from '@dataview/react/runtime/valueEditor'
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
  const page = useDataView().page
  const blockingSurfaceController = useMemo(() => ({
    setBlockingSurface: page.surface.open,
    clearBlockingSurface: page.surface.close
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
