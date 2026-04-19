import { ToolbarQueryActions } from '@dataview/react/page/toolbar/QueryActions'
import { ToolbarTabs } from '@dataview/react/page/toolbar/ViewTabs'

export interface PageToolbarProps {}

export const PageToolbar = () => (
  <section className="text-card-foreground">
    <div className="flex items-center justify-between gap-3">
      <ToolbarTabs />
      <ToolbarQueryActions />
    </div>
  </section>
)

