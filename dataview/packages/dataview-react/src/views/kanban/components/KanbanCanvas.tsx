import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useKanbanRuntimeContext } from '@dataview/react/views/kanban/KanbanView'
import { Column } from '@dataview/react/views/kanban/components/Column'
import {
  useStoreValue
} from '@shared/react'

const PAGE_PADDING_BOTTOM = 180

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS,
  boxSizing: 'border-box' as const,
  minWidth: '100%',
  display: 'inline-block',
  verticalAlign: 'top' as const,
  overflowAnchor: 'none'
} as const

export const KanbanCanvas = () => {
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={runtime.scrollRef}
        className="relative overflow-x-auto overflow-y-visible"
      >
        <div
          style={contentInsetStyle}
        >
          <div
            className="flex min-w-max items-start gap-4"
            style={{
              paddingBottom: PAGE_PADDING_BOTTOM,
              overflowAnchor: 'none'
            }}
          >
            {board.sections.map(section => (
              <Column
                key={section.key}
                sectionKey={section.key}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
