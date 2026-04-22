export interface Input<TSnapshot, TChange, TSink> {
  previous: TSnapshot
  next: TSnapshot
  change: TChange
  sink: TSink
}

export interface Sync<TSnapshot, TChange, TSink> {
  sync(input: Input<TSnapshot, TChange, TSink>): void
}
