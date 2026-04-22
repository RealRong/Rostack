import type * as editor from './editor'

export interface Input<TSink> {
  previous?: editor.Snapshot
  next: editor.Snapshot
  change: editor.Change
  sink: TSink
}

export interface Sync<TSink> {
  sync(input: Input<TSink>): void
}
