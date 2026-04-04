import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { BoardProvider, useBoardContext, useBoardController } from '../board'
import { Empty } from './Empty'
import { Column } from './Column'
import { Overlay } from './Overlay'

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

const KanbanBoardCanvas = () => {
  const controller = useBoardContext()
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
        {controller.selection.marqueeBox ? (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-primary/60 bg-primary/10"
            style={{
              left: controller.selection.marqueeBox.left,
              top: controller.selection.marqueeBox.top,
              width: controller.selection.marqueeBox.width,
              height: controller.selection.marqueeBox.height
            }}
          />
        ) : null}
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

export const Board = () => {
  const controller = useBoardController()

  if (!controller.currentView.view.query.group) {
    return (
      <div style={contentInsetStyle}>
        <Empty />
      </div>
    )
  }

  return (
    <BoardProvider value={controller}>
      <KanbanBoardCanvas />
    </BoardProvider>
  )
}
