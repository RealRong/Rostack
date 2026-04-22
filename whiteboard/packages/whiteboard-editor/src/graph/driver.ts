import { scheduler, store } from '@shared/core'
import {
  createEditorGraphRuntime,
  type Change,
  type Read,
  type Result,
  type Runtime,
  type Snapshot
} from '@whiteboard/editor-graph'
import type { Engine } from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import { createEditorGraphInput, type EditorGraphInputReason } from './input'
import { createEditorGraphRead } from './read'
import {
  createEditorPublishedSources,
  type EditorPublishedSources
} from '../publish/sources'

export interface EditorGraphDriver {
  runtime: Runtime
  read: Read
  sources: EditorPublishedSources
  snapshot(): Snapshot
  result(): Result | null
  update(reasons: readonly EditorGraphInputReason[]): Result
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}

const FULL_REASONS: readonly EditorGraphInputReason[] = [
  'document',
  'session',
  'measure',
  'interaction',
  'viewport',
  'clock'
] as const

export const createEditorGraphDriver = ({
  engine,
  session,
  layout
}: {
  engine: Engine
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
  layout: Pick<EditorLayout, 'draft'>
}): EditorGraphDriver => {
  const runtime = createEditorGraphRuntime()
  const snapshotStore = store.createValueStore(runtime.snapshot())
  let currentResult: Result | null = null
  const listeners = new Set<(result: Result) => void>()
  const frameTask = scheduler.createFrameTask(() => {
    update(['clock'])
  })

  const notify = (
    result: Result
  ) => {
    listeners.forEach((listener) => {
      listener(result)
    })
  }

  const hasActiveMindmapEnterPreview = () => {
    const enter = store.read(session.preview.state).mindmap.preview?.enter
    if (!enter?.length) {
      return false
    }

    const now = scheduler.readMonotonicNow()
    return enter.some((entry) => entry.startedAt + entry.durationMs > now)
  }

  const stopClock = () => {
    frameTask.cancel()
  }

  const syncClock = () => {
    if (!hasActiveMindmapEnterPreview()) {
      stopClock()
      return
    }

    frameTask.schedule()
  }

  const update = (
    reasons: readonly EditorGraphInputReason[]
  ): Result => {
    const result = runtime.update(createEditorGraphInput({
      snapshot: engine.snapshot(),
      session,
      layout,
      reasons
    }))
    currentResult = result
    snapshotStore.set(result.snapshot)
    notify(result)
    syncClock()
    return result
  }

  const unsubscribes = [
    engine.subscribe(() => {
      update(['document'])
    }),
    session.state.tool.subscribe(() => {
      update(['session'])
    }),
    session.state.draw.subscribe(() => {
      update(['session'])
    }),
    session.state.edit.subscribe(() => {
      update(['session'])
    }),
    session.state.selection.subscribe(() => {
      update(['interaction'])
    }),
    session.preview.state.subscribe(() => {
      update(['session'])
    }),
    session.interaction.read.mode.subscribe(() => {
      update(['interaction'])
    }),
    session.viewport.read.subscribe(() => {
      update(['viewport'])
    })
  ]

  update(FULL_REASONS)

  return {
    runtime,
    read: createEditorGraphRead(runtime),
    sources: createEditorPublishedSources(snapshotStore),
    snapshot: () => snapshotStore.get(),
    result: () => currentResult,
    update,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      stopClock()
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe()
      })
      listeners.clear()
    }
  }
}
