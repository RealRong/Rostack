import type * as source from '../contracts/source'

export interface EventSyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TEvent
> {
  hasChanged(change: TChange): boolean
  build(input: source.Input<TSnapshot, TChange, TSink>): TEvent
  emit(event: TEvent, sink: TSink): void
}

export const createEventSync = <
  TSnapshot,
  TChange,
  TSink,
  TEvent
>(
  spec: EventSyncSpec<TSnapshot, TChange, TSink, TEvent>
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    if (!spec.hasChanged(input.change)) {
      return
    }

    spec.emit(
      spec.build(input),
      input.sink
    )
  }
})
