import type {
  Change,
  GraphChange,
  GraphSnapshot,
  SceneSnapshot,
  Snapshot,
  UiSnapshot
} from '../contracts/editor'

export interface PublishSlice<TValue, TChange> {
  read(snapshot: Snapshot): TValue
  change(change: Change): TChange
}

export interface EditorGraphPublishSpec {
  graph: PublishSlice<GraphSnapshot, GraphChange>
  scene: PublishSlice<SceneSnapshot, Change['scene']>
  ui: {
    selection: PublishSlice<
      UiSnapshot['selection'],
      Change['ui']['selection']
    >
    chrome: PublishSlice<
      UiSnapshot['chrome'],
      Change['ui']['chrome']
    >
  }
}

const createSlice = <TValue, TChange>(input: {
  read(snapshot: Snapshot): TValue
  change(change: Change): TChange
}): PublishSlice<TValue, TChange> => ({
  read: input.read,
  change: input.change
})

export const createEditorGraphPublishSpec = (): EditorGraphPublishSpec => ({
  graph: createSlice({
    read: (snapshot) => snapshot.graph,
    change: (change) => change.graph
  }),
  scene: createSlice({
    read: (snapshot) => snapshot.scene,
    change: (change) => change.scene
  }),
  ui: {
    selection: createSlice({
      read: (snapshot) => snapshot.ui.selection,
      change: (change) => change.ui.selection
    }),
    chrome: createSlice({
      read: (snapshot) => snapshot.ui.chrome,
      change: (change) => change.ui.chrome
    })
  }
})
