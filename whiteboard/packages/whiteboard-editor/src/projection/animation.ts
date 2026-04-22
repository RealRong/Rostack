import { scheduler, store } from '@shared/core'
import type { InputDelta } from '@whiteboard/editor-graph'
import type { Engine } from '@whiteboard/engine'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import {
  createEmptyEditorGraphInputDelta,
  readActiveMindmapTickIds
} from './input'

export interface ProjectionAnimationSource {
  dispose(): void
}

const createMindmapTickDelta = (
  ids: ReadonlySet<string>
): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  delta.graph.mindmaps.tick = new Set(ids)
  return delta
}

export const createProjectionAnimationSource = ({
  engine,
  session,
  mark,
  flush
}: {
  engine: Engine
  session: Pick<EditorSession, 'preview'>
  mark: (delta: InputDelta) => void
  flush: () => void
}): ProjectionAnimationSource => {
  const frameTask = scheduler.createFrameTask(() => {
    const activeMindmapIds = readActiveMindmapTickIds({
      snapshot: engine.current().snapshot,
      preview: store.read(session.preview.state).mindmap.preview
    })
    if (activeMindmapIds.size === 0) {
      return
    }

    mark(createMindmapTickDelta(activeMindmapIds))
    flush()
    frameTask.schedule()
  })

  const sync = () => {
    const activeMindmapIds = readActiveMindmapTickIds({
      snapshot: engine.current().snapshot,
      preview: store.read(session.preview.state).mindmap.preview
    })
    if (activeMindmapIds.size === 0) {
      frameTask.cancel()
      return
    }

    frameTask.schedule()
  }

  const unsubscribePreview = session.preview.state.subscribe(sync)

  sync()

  return {
    dispose: () => {
      frameTask.cancel()
      unsubscribePreview()
    }
  }
}
