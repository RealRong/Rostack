import { compileNodeFieldUpdates } from '@whiteboard/core/schema'
import type { EngineInstance } from '@whiteboard/engine'
import type { Editor, EditorRead, EditorWriteApi } from '../../types/editor'
import type { EditorViewportRuntime } from './types'
import { createCanvasActions } from '../commands/canvas'
import { createClipboardActions } from '../commands/clipboard'
import { createEdgesActions } from '../commands/edge'
import { createFramesActions } from '../commands/frame'
import { createGroupsActions } from '../commands/group'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from '../commands/node/document'

const isSameSize = (
  left: {
    width: number
    height: number
  } | null | undefined,
  right: {
    width: number
    height: number
  } | null | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

export const createEditorActions = ({
  engine,
  read,
  write,
  viewport,
  selection,
  edit
}: {
  engine: EngineInstance
  read: EditorRead
  write: EditorWriteApi
  viewport: EditorViewportRuntime['read']
  selection: Editor['state']['selection']
  edit: Editor['state']['edit']
}): Editor['actions'] => {
  const canvas = createCanvasActions({
    read,
    commands: {
      canvas: engine.commands.canvas,
      group: engine.commands.group.order,
      selection: write.session.selection
    }
  })

  const groups = createGroupsActions({
    read,
    commands: {
      group: write.document.group,
      selection: write.session.selection
    }
  })

  const nodes = {
    create: write.document.node.create,
    move: write.document.node.move,
    align: write.document.node.align,
    distribute: write.document.node.distribute,
    delete: write.document.node.delete,
    deleteCascade: write.document.node.deleteCascade,
    duplicate: write.document.node.duplicate,
    update: write.document.node.document.update,
    updateMany: write.document.node.document.updateMany,
    text: {
      set: ({
        nodeIds,
        patch,
        sizeById
      }) => {
        if (!nodeIds.length) {
          return undefined
        }

        const hasPatch = (
          patch.color !== undefined
          || patch.size !== undefined
          || patch.weight !== undefined
          || patch.italic !== undefined
          || patch.align !== undefined
        )
        const updates = nodeIds.map((id) => {
          const committed = engine.read.node.item.get(id)
          const nextMeasuredSize = committed?.node.type === 'text'
            ? sizeById?.[id]
            : undefined
          const sizeUpdate = committed && nextMeasuredSize && !isSameSize(nextMeasuredSize, committed.rect)
            ? {
                fields: {
                  size: nextMeasuredSize
                }
              }
            : undefined

          return {
            id,
            update: mergeNodeUpdates(
              patch.color !== undefined
                ? styleUpdate('color', patch.color)
                : undefined,
              patch.size !== undefined
                ? styleUpdate('fontSize', patch.size)
                : undefined,
              patch.weight !== undefined
                ? styleUpdate('fontWeight', patch.weight)
                : undefined,
              patch.italic !== undefined
                ? styleUpdate('fontStyle', patch.italic ? 'italic' : 'normal')
                : undefined,
              patch.align !== undefined
                ? styleUpdate('textAlign', patch.align)
                : undefined,
              sizeUpdate
            )
          }
        })

        if (!hasPatch && !sizeById) {
          return undefined
        }

        return write.document.node.document.updateMany(updates)
      },
      commit: write.document.node.text.commit
    },
    style: {
      set: (nodeIds, patch) => {
        if (!nodeIds.length) {
          return undefined
        }

        const hasPatch = (
          patch.fill !== undefined
          || patch.fillOpacity !== undefined
          || patch.stroke !== undefined
          || patch.strokeWidth !== undefined
          || patch.strokeOpacity !== undefined
          || patch.strokeDash !== undefined
          || patch.opacity !== undefined
        )
        if (!hasPatch) {
          return undefined
        }

        return write.document.node.document.updateMany(
          nodeIds.map((id) => {
            const node = engine.read.node.item.get(id)?.node
            const fillUpdate = patch.fill !== undefined
              ? (
                  node?.type === 'sticky'
                    ? compileNodeFieldUpdates([
                        {
                          field: {
                            scope: 'style',
                            path: 'fill'
                          },
                          value: patch.fill
                        },
                        {
                          field: {
                            scope: 'data',
                            path: 'background'
                          },
                          value: patch.fill
                        }
                      ])
                    : styleUpdate('fill', patch.fill)
                )
              : undefined

            return {
              id,
              update: mergeNodeUpdates(
                fillUpdate,
                patch.fillOpacity !== undefined
                  ? styleUpdate('fillOpacity', patch.fillOpacity)
                  : undefined,
                patch.stroke !== undefined
                  ? styleUpdate('stroke', patch.stroke)
                  : undefined,
                patch.strokeWidth !== undefined
                  ? styleUpdate('strokeWidth', patch.strokeWidth)
                  : undefined,
                patch.strokeOpacity !== undefined
                  ? styleUpdate('strokeOpacity', patch.strokeOpacity)
                  : undefined,
                patch.strokeDash !== undefined
                  ? styleUpdate('strokeDash', patch.strokeDash)
                  : undefined,
                patch.opacity !== undefined
                  ? styleUpdate('opacity', patch.opacity)
                  : undefined
              )
            }
          })
        )
      }
    },
    shape: {
      set: (nodeIds, patch) => {
        if (!nodeIds.length || patch.kind === undefined) {
          return undefined
        }

        return write.document.node.document.updateMany(
          nodeIds.flatMap((id) => {
            const node = engine.read.node.item.get(id)?.node
            if (node?.type !== 'shape') {
              return []
            }

            return [{
              id,
              update: dataUpdate('kind', patch.kind)
            }]
          })
        )
      }
    },
    lock: write.document.node.lock,
    frames: createFramesActions({
      commands: {
        node: {
          create: write.document.node.create
        },
        selection: write.session.selection
      }
    })
  } satisfies Editor['actions']['document']['nodes']

  const documentActionsWithoutClipboard = {
    board: {
      replace: write.document.doc.replace
    },
    history: write.document.history,
    canvas,
    nodes,
    edges: createEdgesActions({
      read,
      edit,
      session: write.session,
      document: write.document
    }),
    groups,
    mindmaps: write.document.mindmap
  } satisfies Omit<Editor['actions']['document'], 'clipboard'>

  return {
    session: write.session,
    view: {
      viewport: {
        set: write.view.viewport.set,
        panBy: write.view.viewport.panBy,
        zoomTo: write.view.viewport.zoomTo,
        fit: write.view.viewport.fit,
        reset: write.view.viewport.reset,
        setRect: write.view.viewport.setRect,
        setLimits: write.view.viewport.setLimits
      },
      pointer: write.view.pointer,
      space: write.view.space,
      draw: write.view.draw,
      preview: {
        nodeText: write.preview.node.text
      }
    },
    document: {
      ...documentActionsWithoutClipboard,
      clipboard: createClipboardActions({
        editor: {
          read,
          document: write.document,
          session: write.session,
          canvas,
          state: {
            viewport,
            selection
          }
        }
      })
    }
  } satisfies Editor['actions']
}
