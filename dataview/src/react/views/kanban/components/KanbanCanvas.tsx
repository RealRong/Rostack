import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useKanbanContext } from '../context'
import { Column } from './Column'
import { Overlay } from './Overlay'

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
  const {
    active,
    runtime
  } = useKanbanContext()

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
            {active.sections.all.map(section => (
              <Column
                key={section.key}
                section={section}
              />
            ))}
          </div>
        </div>
      </div>
      <Overlay />
    </div>
  )
}
