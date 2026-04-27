import { scheduler } from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  GraphState,
  MindmapView,
  EditorSceneSourceChange
} from '@whiteboard/editor-scene'
import type {
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  MindmapTopicData,
  Rect
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type {
  MindmapActions,
  MindmapInsertBehavior,
  MindmapInsertRelation
} from '@whiteboard/editor/action/types'
import type {
  EditorProcedure,
  EditorPublishRequest,
  EditorTaskRequest
} from '@whiteboard/editor/boundary/procedure'
import {
  readActiveMindmapTickIds
} from '@whiteboard/editor/scene/binding'
import type { EditorSceneApi } from '@whiteboard/editor/types/editor'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorWrite } from '@whiteboard/editor/write'

const DEFAULT_MINDMAP_ENTER_DURATION_MS = 220

const publish = (
  change?: EditorSceneSourceChange
): EditorPublishRequest => ({
  kind: 'publish',
  change
})

const task = {
  frame: (
    procedure: EditorProcedure<void>
  ): EditorTaskRequest => ({
    kind: 'task',
    lane: 'frame',
    procedure
  }),
  delay: (
    delayMs: number,
    procedure: EditorProcedure<void>
  ): EditorTaskRequest => ({
    kind: 'task',
    lane: 'delay',
    delayMs,
    procedure
  })
}

const withMindmapPreview = (
  session: Pick<EditorSession, 'preview'>,
  project: (current: MindmapPreviewState | undefined) => MindmapPreviewState | undefined
) => {
  session.preview.write.set((current) => {
    const nextPreview = project(current.mindmap.preview)
    if (nextPreview === current.mindmap.preview) {
      return current
    }

    if (!nextPreview) {
      return current.mindmap.preview === undefined
        ? current
        : {
            ...current,
            mindmap: {}
          }
    }

    return {
      ...current,
      mindmap: {
        ...current.mindmap,
        preview: nextPreview
      }
    }
  })
}

const appendMindmapEnterPreview = (
  session: Pick<EditorSession, 'preview'>,
  entry: MindmapEnterPreview
) => {
  withMindmapPreview(session, (current) => ({
    ...current,
    enter: [
      ...(current?.enter ?? []).filter((preview) => (
        preview.treeId !== entry.treeId || preview.nodeId !== entry.nodeId
      )),
      entry
    ]
  }))
}

const removeMindmapEnterPreview = (
  session: Pick<EditorSession, 'preview'>,
  entry: Pick<MindmapEnterPreview, 'treeId' | 'nodeId'>
) => {
  withMindmapPreview(session, (current) => {
    if (!current) {
      return undefined
    }

    const nextEnter = current.enter?.filter((preview) => (
      preview.treeId !== entry.treeId || preview.nodeId !== entry.nodeId
    ))

    return {
      ...current,
      enter: nextEnter?.length ? nextEnter : undefined
    }
  })
}

const toRectCenter = (
  rect: Rect
) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

const readInsertAnchorId = (
  input: MindmapInsertInput
) => {
  const anchorId = input.options?.layout?.anchorId
  if (anchorId) {
    return anchorId
  }

  switch (input.kind) {
    case 'child':
      return input.parentId
    case 'sibling':
    case 'parent':
      return input.nodeId
  }
}

const buildMindmapEnterPreview = ({
  structure,
  graph,
  treeId,
  nodeId,
  anchorId
}: {
  structure: EditorSceneApi['query']['mindmap']['structure']
  graph: GraphState
  treeId: MindmapId
  nodeId: MindmapNodeId
  anchorId?: MindmapNodeId
}): MindmapEnterPreview | undefined => {
  const currentStructure = structure(treeId)
  const computed = graph.owners.mindmaps.get(treeId)?.tree.layout
  if (!currentStructure || !computed) {
    return undefined
  }

  const parentId = currentStructure.tree.nodes[nodeId]?.parentId
  const toRect = computed.node[nodeId]
  const anchorRect = computed.node[anchorId ?? parentId ?? '']
  if (!toRect || !parentId || !anchorRect) {
    return undefined
  }

  const anchorCenter = toRectCenter(anchorRect)
  const targetCenter = toRectCenter(toRect)

  return {
    treeId,
    nodeId,
    parentId,
    route: [anchorCenter, targetCenter],
    fromRect: {
      x: anchorCenter.x - toRect.width / 2,
      y: anchorCenter.y - toRect.height / 2,
      width: toRect.width,
      height: toRect.height
    },
    toRect: {
      ...toRect
    },
    startedAt: scheduler.readMonotonicNow(),
    durationMs: DEFAULT_MINDMAP_ENTER_DURATION_MS
  }
}

type MindmapProcedureDeps = {
  engine: Pick<Engine, 'current'>
  graph: Pick<EditorSceneApi, 'query'>
  session: Pick<EditorSession, 'preview'>
  write: Pick<EditorWrite, 'mindmap'>
  focusNode: (input: {
    nodeId: MindmapNodeId
    behavior: MindmapInsertBehavior | undefined
  }) => void
  focusRoot: (input: {
    nodeId: MindmapNodeId
    focus: 'edit-root' | 'select-root' | 'none' | undefined
  }) => void
}

export const createMindmapActionProcedures = ({
  engine,
  graph,
  session,
  write,
  focusNode,
  focusRoot
}: MindmapProcedureDeps) => {
  const animation = {
    active: false
  }

  const readActiveMindmapIds = (
  ) => readActiveMindmapTickIds({
    engine,
    preview: session.preview.state.get().mindmap.preview
  })

  const tickMindmapEnter = function* (
  ): EditorProcedure<void> {
    const activeMindmapIds = readActiveMindmapIds()
    if (activeMindmapIds.size === 0) {
      animation.active = false
      return
    }

    void activeMindmapIds
    yield publish({
      clock: true
    })

    if (readActiveMindmapIds().size === 0) {
      animation.active = false
      return
    }

    yield task.frame(tickMindmapEnter())
  }

  const ensureMindmapEnterAnimation = function* (
  ): EditorProcedure<void> {
    if (animation.active || readActiveMindmapIds().size === 0) {
      return
    }

    animation.active = true
    yield task.frame(tickMindmapEnter())
  }

  const removeMindmapEnter = function* (
    entry: Pick<MindmapEnterPreview, 'treeId' | 'nodeId'>
  ): EditorProcedure<void> {
    removeMindmapEnterPreview(session, entry)
  }

  const focusMindmapNode = function* (
    input: {
      nodeId: MindmapNodeId
      behavior: MindmapInsertBehavior | undefined
      delayMs?: number
    }
  ): EditorProcedure<void> {
    const delayMs = input.delayMs ?? 0
    if (delayMs > 0) {
      yield task.delay(
        delayMs,
        focusMindmapNode({
          ...input,
          delayMs: 0
        })
      )
      return
    }

    focusNode({
      nodeId: input.nodeId,
      behavior: input.behavior
    })
  }

  const focusMindmapRoot = function* (
    input: {
      nodeId: MindmapNodeId
      focus: 'edit-root' | 'select-root' | 'none' | undefined
    }
  ): EditorProcedure<void> {
    focusRoot({
      nodeId: input.nodeId,
      focus: input.focus
    })
  }

  const scheduleMindmapEnter = function* (
    input: {
      treeId: MindmapId
      nodeId: MindmapNodeId
      anchorId?: MindmapNodeId
    }
  ): EditorProcedure<number> {
    const published = yield publish()
    const preview = buildMindmapEnterPreview({
      structure: graph.query.mindmap.structure,
      graph: published.graph,
      treeId: input.treeId,
      nodeId: input.nodeId,
      anchorId: input.anchorId
    })
    if (!preview) {
      return 0
    }

    appendMindmapEnterPreview(session, preview)
    yield task.delay(
      preview.durationMs + 34,
      removeMindmapEnter(preview)
    )
    yield* ensureMindmapEnterAnimation()
    return preview.durationMs
  }

  const create = function* (
    payload: Parameters<MindmapActions['create']>[0],
    options: Parameters<MindmapActions['create']>[1]
  ): EditorProcedure<ReturnType<MindmapActions['create']>> {
    const result = write.mindmap.create(payload)
    if (result.ok) {
      yield* focusMindmapRoot({
        nodeId: result.data.rootId,
        focus: options?.focus
      })
    }
    return result
  }

  const insert = function* (
    id: Parameters<MindmapActions['insert']>[0],
    input: Parameters<MindmapActions['insert']>[1],
    options: Parameters<MindmapActions['insert']>[2]
  ): EditorProcedure<ReturnType<MindmapActions['insert']>> {
    const result = write.mindmap.topic.insert(id, input)
    if (!result.ok) {
      return result
    }

    const focusDelayMs = options?.behavior?.enter === 'from-anchor'
      ? yield* scheduleMindmapEnter({
          treeId: id,
          nodeId: result.data.nodeId,
          anchorId: readInsertAnchorId(input)
        })
      : 0

    yield* focusMindmapNode({
      nodeId: result.data.nodeId,
      behavior: options?.behavior,
      delayMs: focusDelayMs
    })
    return result
  }

  const insertRelative = function* (
    input: Parameters<MindmapActions['insertRelative']>[0]
  ): EditorProcedure<ReturnType<MindmapActions['insertRelative']>> {
    const structure = graph.query.mindmap.structure(input.id)
    if (!structure) {
      return undefined
    }

    const insertInput = mindmapApi.plan.relativeInsertInput({
      structure: {
        rootId: structure.rootId,
        nodeIds: structure.nodeIds,
        tree: structure.tree
      },
      targetNodeId: input.targetNodeId,
      relation: input.relation,
      side: input.side,
      payload: input.payload
    })
    if (!insertInput) {
      return undefined
    }

    const result = write.mindmap.topic.insert(input.id, insertInput)
    if (!result.ok) {
      return result
    }

    const focusDelayMs = input.behavior?.enter === 'from-anchor'
      ? yield* scheduleMindmapEnter({
          treeId: input.id,
          nodeId: result.data.nodeId,
          anchorId: input.targetNodeId
        })
      : 0

    yield* focusMindmapNode({
      nodeId: result.data.nodeId,
      behavior: input.behavior,
      delayMs: focusDelayMs
    })
    return result
  }

  return {
    create,
    insert,
    insertRelative
  }
}
