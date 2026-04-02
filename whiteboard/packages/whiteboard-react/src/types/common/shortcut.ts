export type ShortcutAction =
  | 'group.create'
  | 'group.ungroup'
  | 'selection.selectAll'
  | 'selection.clear'
  | 'selection.delete'
  | 'selection.duplicate'
  | 'history.undo'
  | 'history.redo'

export type ShortcutBinding = {
  key: string
  action: ShortcutAction
}

export type ShortcutOverrides = readonly ShortcutBinding[]
  | ((defaults: readonly ShortcutBinding[]) => readonly ShortcutBinding[])
