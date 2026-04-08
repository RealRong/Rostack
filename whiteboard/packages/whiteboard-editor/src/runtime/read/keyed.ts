import {
  createKeyedDerivedStore,
  type KeyedReadStore
} from '@shared/store'

export const createOverlayStateStore = <
  Id extends string,
  Overlay,
  State
>({
  overlay,
  project,
  isEqual
}: {
  overlay: KeyedReadStore<Id, Overlay>
  project: (overlay: Overlay) => State
  isEqual: (left: State, right: State) => boolean
}) => createKeyedDerivedStore({
  get: (readStore, id: Id) => project(
    readStore(overlay, id)
  ),
  isEqual
})

export const createPatchedItemStore = <
  Id extends string,
  Source,
  Overlay,
  Item
>({
  source,
  overlay,
  project,
  isEqual
}: {
  source: KeyedReadStore<Id, Source | undefined>
  overlay: KeyedReadStore<Id, Overlay>
  project: (source: Source, overlay: Overlay) => Item
  isEqual: (left: Item | undefined, right: Item | undefined) => boolean
}) => createKeyedDerivedStore({
  get: (readStore, id: Id) => {
    const entry = readStore(source, id)
    if (!entry) {
      return undefined
    }

    return project(entry, readStore(overlay, id))
  },
  isEqual
})
