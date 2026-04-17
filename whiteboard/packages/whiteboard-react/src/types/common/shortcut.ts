export type ShortcutAction =
  | 'group.merge'
  | 'group.ungroup'
  | 'selection.selectAll'
  | 'selection.clear'
  | 'selection.delete'
  | 'selection.duplicate'
  | 'history.undo'
  | 'history.redo'
  | 'mindmap.navigate.parent'
  | 'mindmap.navigate.first-child'
  | 'mindmap.navigate.prev-sibling'
  | 'mindmap.navigate.next-sibling'
  | 'mindmap.insert.child'
  | 'mindmap.insert.sibling'
  | 'mindmap.insert.parent'

export type ShortcutBinding = {
  key: string
  action: ShortcutAction
}

export type ShortcutOverrides = readonly ShortcutBinding[]
  | ((defaults: readonly ShortcutBinding[]) => readonly ShortcutBinding[])
