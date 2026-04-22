import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  Input,
  Read,
  Result,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphRuntime } from '../runtime/createEditorGraphRuntime'

export interface EditorGraphHarness {
  runtime: Runtime
  read: Read
  update(input: Input): Result
  snapshot(): Snapshot
  lastTrace(): Result['trace']
}

const createHarnessRead = (
  runtime: Pick<Runtime, 'snapshot'>
): Read => ({
  snapshot: () => runtime.snapshot(),
  node: (id: NodeId) => runtime.snapshot().graph.nodes.byId.get(id),
  edge: (id: EdgeId) => runtime.snapshot().graph.edges.byId.get(id),
  mindmap: (id: MindmapId) => runtime.snapshot().graph.owners.mindmaps.byId.get(id),
  group: (id: GroupId) => runtime.snapshot().graph.owners.groups.byId.get(id),
  scene: () => runtime.snapshot().scene,
  ui: () => runtime.snapshot().ui
})

export const createEditorGraphHarness = (): EditorGraphHarness => {
  const baseRuntime = createEditorGraphRuntime()
  let trace: Result['trace']
  const runtime: Runtime = {
    snapshot: () => baseRuntime.snapshot(),
    update: (input) => {
      const result = baseRuntime.update(input)
      trace = result.trace
      return result
    },
    subscribe: (listener) => baseRuntime.subscribe(listener)
  }

  return {
    runtime,
    read: createHarnessRead(runtime),
    update: (input) => runtime.update(input),
    snapshot: () => runtime.snapshot(),
    lastTrace: () => trace
  }
}
