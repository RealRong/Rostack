import type { SelectionToolbarFilter } from '@whiteboard/editor'
import type { MenuItem } from '@ui'
import { Menu } from '@ui'
import { NodeTypeIcon } from '#react/features/node'
import type { WhiteboardRuntime } from '#react/types/runtime'

const toMenuItems = (
  editor: WhiteboardRuntime,
  filter: SelectionToolbarFilter,
  onClose: () => void
): MenuItem[] => [
  {
    kind: 'label' as const,
    key: 'filter:title',
    label: (
      <span className="block px-1.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-fg-muted">
        Filter {filter.label}
      </span>
    )
  },
  ...filter.types.map((item) => ({
    kind: 'action' as const,
    key: item.key,
    label: (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center text-fg-muted">
          <NodeTypeIcon icon={item.icon} />
        </span>
        <span className="flex-1 truncate">{item.name}</span>
        <span className="text-xs text-fg-muted">{item.count}</span>
      </div>
    ),
    onSelect: () => {
      onClose()
      editor.commands.selection.replace({
        nodeIds: item.nodeIds
      })
    }
  }))
]

export const SelectionFilterMenu = ({
  editor,
  filter,
  onClose
}: {
  editor: WhiteboardRuntime
  filter: SelectionToolbarFilter
  onClose: () => void
}) => (
  <Menu
    items={toMenuItems(editor, filter, onClose)}
    onClose={onClose}
    autoFocus
  />
)
