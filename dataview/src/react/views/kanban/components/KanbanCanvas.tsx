import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useKanbanContext } from '../context'
import { Column } from './Column'
import { Overlay } from './Overlay'

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

export const KanbanCanvas = () => {
  const controller = useKanbanContext()
  const dragDisabledBySort = controller.currentView.view.query.sorters.length > 0

  return (
    <div className="flex flex-col gap-6">
      {dragDisabledBySort ? (
        <div style={contentInsetStyle}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Card reorder is disabled while a field sort is active. Clear sort to drag cards again.
          </div>
        </div>
      ) : null}

      <div
        ref={controller.scrollRef}
        className="relative overflow-x-auto pb-4"
        style={contentInsetStyle}
      >
        <div className="flex min-w-max items-start gap-4">
          {controller.currentView.sections.map(section => (
            <Column
              key={section.key}
              section={section}
            />
          ))}
        </div>
      </div>
      <Overlay />
    </div>
  )
}
