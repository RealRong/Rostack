import { type CSSProperties } from 'react'
import { OverlayProvider } from '@shared/ui/overlay'
import { PageTitle } from '@dataview/react/page/PageTitle'
import { ViewQueryBar } from '@dataview/react/page/features/viewQuery/ViewQueryBar'
import {
  PageInlineSessionHost,
  PageKeyboardHost,
  PageMarqueeHost
} from '@dataview/react/page/hosts'
import { FieldValueEditorHost } from '@dataview/react/runtime/valueEditor'
import { PageBody, type PageBodyProps } from '@dataview/react/page/Body'
import { PageToolbar } from '@dataview/react/page/Toolbar'
import { PAGE_INLINE_INSET_CSS, PAGE_INLINE_INSET_VALUE } from '@dataview/react/page/layout'

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
  return (
    <OverlayProvider>
      <div
        className="relative flex h-full min-h-0 flex-col overflow-hidden"
        style={pageStyle}
      >
        <div
          data-page-scroll=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            overflowAnchor: 'none'
          }}
        >
          <div className="flex min-h-full flex-col gap-5 pt-6">
            <div
              className="flex flex-col gap-2"
              style={chromeStyle}
            >
              <PageTitle />
              <PageToolbar />
              <ViewQueryBar />
            </div>
            <PageBody
              table={props.table}
              kanban={props.kanban}
            />
          </div>
        </div>
        <PageInlineSessionHost />
        <PageMarqueeHost />
        <PageKeyboardHost />
        <FieldValueEditorHost />
      </div>
    </OverlayProvider>
  )
}
