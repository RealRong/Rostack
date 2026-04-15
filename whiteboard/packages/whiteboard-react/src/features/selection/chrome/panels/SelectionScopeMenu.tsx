import { Shapes } from 'lucide-react'
import { Menu, type MenuItem } from '@shared/ui'
import type { SelectionToolbarScope } from '@whiteboard/editor'
import { NodeTypeIcon } from '@whiteboard/react/features/node'

const EdgeTypeIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none">
    <path
      d="M4 16 L20 8"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </svg>
)

const toMenuItems = ({
  scopes,
  activeScopeKey,
  onSelect,
  onClose
}: {
  scopes: readonly SelectionToolbarScope[]
  activeScopeKey: string
  onSelect: (key: string) => void
  onClose: () => void
}): MenuItem[] => {
  const items: MenuItem[] = []
  let currentSection: 'nodes' | 'edges' | null = null

  scopes.forEach((scope) => {
    const nextSection = scope.node ? 'nodes' : 'edges'
    if (currentSection !== nextSection) {
      currentSection = nextSection
      items.push({
        kind: 'label' as const,
        key: `scope:section:${nextSection}`,
        label: nextSection === 'nodes' ? 'Nodes' : 'Edges'
      })
    }

    items.push({
      kind: 'toggle' as const,
      key: scope.key,
      checked: scope.key === activeScopeKey,
      indicator: 'check' as const,
      label: (
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center text-fg-muted">
            {scope.node ? (
              scope.icon ? (
                <NodeTypeIcon icon={scope.icon} />
              ) : (
                <Shapes size={16} strokeWidth={1.9} />
              )
            ) : (
              <EdgeTypeIcon />
            )}
          </span>
          <span className="flex-1 truncate">{scope.label}</span>
          <span className="text-xs text-fg-muted">{scope.count}</span>
        </div>
      ),
      onSelect: () => {
        onClose()
        onSelect(scope.key)
      }
    })
  })

  return items
}

export const SelectionScopeMenu = ({
  scopes,
  activeScopeKey,
  onSelect,
  onClose
}: {
  scopes: readonly SelectionToolbarScope[]
  activeScopeKey: string
  onSelect: (key: string) => void
  onClose: () => void
}) => (
  <Menu
    items={toMenuItems({
      scopes,
      activeScopeKey,
      onSelect,
      onClose
    })}
    onClose={onClose}
    autoFocus={false}
  />
)
