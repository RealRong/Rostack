import { scheduler } from '@shared/core'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  Point
} from '@whiteboard/core/types'
import type {
  MindmapActions,
  MindmapInsertBehavior
} from '@whiteboard/editor/action/types'
import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import {
  clearNodePresentation,
  updateNodePresentation
} from '@whiteboard/editor/session/preview/node'
import type { EditorInputPreviewState } from '@whiteboard/editor/session/preview/types'
import type { EditorWrite } from '@whiteboard/editor/write'
import type { EditorTaskRuntime } from './runtime'
import {
  isEditorTaskRuntimeDisposedError
} from './runtime'

const DEFAULT_MINDMAP_ENTER_DURATION_MS = 220

type MindmapActionDeps = {
  graph: EditorScene
  editor: {
    preview: {
      get: () => EditorInputPreviewState
    }
    dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  }
  tasks: EditorTaskRuntime
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

type MindmapEnterJob = {
  nodeId: MindmapNodeId
  from: Point
  to: Point
  startedAt: number
  durationMs: number
}

const interpolatePoint = (
  from: Point,
  to: Point,
  progress: number
): Point => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress
})

const readProgress = (
  startedAt: number,
  durationMs: number
): number => {
  if (durationMs <= 0) {
    return 1
  }

  return Math.max(
    0,
    Math.min(
      1,
      (scheduler.readMonotonicNow() - startedAt) / durationMs
    )
  )
}

const withNodePresentation = (
  editor: MindmapActionDeps['editor'],
  nodeId: MindmapNodeId,
  position?: Point
) => {
  const current = editor.preview.get()
  const nextNode = position
    ? updateNodePresentation(current.node, nodeId, {
        position
      })
    : clearNodePresentation(current.node, nodeId)

  if (nextNode === current.node) {
    return
  }

  editor.dispatch({
    type: 'preview.set',
    preview: {
      ...current,
      node: nextNode
    }
  } satisfies EditorCommand)
}

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

const buildEnterJob = (input: {
  graph: EditorScene
  treeId: MindmapId
  nodeId: MindmapNodeId
  anchorId?: MindmapNodeId
}): MindmapEnterJob | undefined => {
  const tree = input.graph.mindmaps.tree(input.treeId)
  const targetRect = input.graph.nodes.get(input.nodeId)?.geometry.rect
  if (!tree || !targetRect) {
    return undefined
  }

  const parentId = tree.tree.nodes[input.nodeId]?.parentId
  const anchorRect = input.graph.nodes.get(
    input.anchorId ?? parentId ?? ''
  )?.geometry.rect
  if (!anchorRect) {
    return undefined
  }

  const anchor = geometryApi.rect.center(anchorRect)

  return {
    nodeId: input.nodeId,
    from: {
      x: anchor.x - targetRect.width / 2,
      y: anchor.y - targetRect.height / 2
    },
    to: {
      x: targetRect.x,
      y: targetRect.y
    },
    startedAt: scheduler.readMonotonicNow(),
    durationMs: DEFAULT_MINDMAP_ENTER_DURATION_MS
  }
}

const resolveEnterJob = async (input: {
  graph: EditorScene
  treeId: MindmapId
  nodeId: MindmapNodeId
  anchorId?: MindmapNodeId
  tasks: EditorTaskRuntime
}): Promise<MindmapEnterJob | undefined> => {
  const current = buildEnterJob(input)
  if (current) {
    return current
  }

  await input.tasks.nextFrame()
  return buildEnterJob(input)
}

const animateEnter = async (input: {
  editor: MindmapActionDeps['editor']
  tasks: EditorTaskRuntime
  job: MindmapEnterJob
}) => {
  withNodePresentation(input.editor, input.job.nodeId, input.job.from)

  try {
    while (true) {
      const progress = readProgress(
        input.job.startedAt,
        input.job.durationMs
      )
      if (progress >= 1) {
        break
      }

      await input.tasks.nextFrame()

      const nextProgress = readProgress(
        input.job.startedAt,
        input.job.durationMs
      )
      if (nextProgress >= 1) {
        break
      }

      withNodePresentation(
        input.editor,
        input.job.nodeId,
        interpolatePoint(input.job.from, input.job.to, nextProgress)
      )
    }
  } finally {
    withNodePresentation(
      input.editor,
      input.job.nodeId
    )
  }
}

const runTask = (
  task: Promise<void>
) => {
  void task.catch((error) => {
    if (isEditorTaskRuntimeDisposedError(error)) {
      return
    }

    throw error
  })
}

export const createMindmapActions = ({
  graph,
  editor,
  tasks,
  write,
  focusNode,
  focusRoot
}: MindmapActionDeps) => {
  const animateAndFocus = (input: {
    treeId: MindmapId
    nodeId: MindmapNodeId
    anchorId?: MindmapNodeId
    behavior: MindmapInsertBehavior | undefined
  }) => runTask((async () => {
    const shouldEnter = input.behavior?.enter === 'from-anchor'
    const job = shouldEnter
      ? await resolveEnterJob({
          graph,
          treeId: input.treeId,
          nodeId: input.nodeId,
          anchorId: input.anchorId,
          tasks
        })
      : undefined

    if (job) {
      await animateEnter({
        editor,
        tasks,
        job
      })
    }

    focusNode({
      nodeId: input.nodeId,
      behavior: input.behavior
    })
  })())

  const create: MindmapActions['create'] = (
    payload,
    options
  ) => {
    const result = write.mindmap.create(payload)
    if (result.ok) {
      focusRoot({
        nodeId: result.data.rootId,
        focus: options?.focus
      })
    }
    return result
  }

  const insert: MindmapActions['insert'] = (
    id,
    input,
    options
  ) => {
    const result = write.mindmap.topic.insert(id, input)
    if (result.ok) {
      animateAndFocus({
        treeId: id,
        nodeId: result.data.nodeId,
        anchorId: readInsertAnchorId(input),
        behavior: options?.behavior
      })
    }
    return result
  }

  const insertRelative: MindmapActions['insertRelative'] = (
    input
  ) => {
    const tree = graph.mindmaps.tree(input.id)
    if (!tree) {
      return undefined
    }

    const insertInput = mindmapApi.plan.relativeInsertInput({
      structure: {
        rootId: tree.rootId,
        nodeIds: tree.nodeIds as readonly MindmapNodeId[],
        tree: tree.tree
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
    if (result.ok) {
      animateAndFocus({
        treeId: input.id,
        nodeId: result.data.nodeId,
        anchorId: input.targetNodeId,
        behavior: input.behavior
      })
    }
    return result
  }

  return {
    create,
    insert,
    insertRelative
  }
}
