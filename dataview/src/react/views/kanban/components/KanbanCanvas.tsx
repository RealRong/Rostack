import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useKanbanContext } from '../context'
import { Column } from './Column'
import { Overlay } from './Overlay'

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

export const KanbanCanvas = () => {
  const controller = useKanbanContext()

  return (
    <div className="flex flex-col gap-6">
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
