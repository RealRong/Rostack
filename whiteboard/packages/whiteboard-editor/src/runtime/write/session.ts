import type { EngineInstance } from '@whiteboard/engine'
import {
  applySelectionTarget,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { EditorSessionWrite } from '../../types/editor'
import type { Tool } from '../../types/tool'
import type { RuntimeStateController } from '../state'
import { isSameTool } from '../../tool/model'

export const createSessionWrite = ({
  engine,
  runtime
}: {
  engine: EngineInstance
  runtime: Pick<RuntimeStateController, 'state'>
}): EditorSessionWrite => {
  const writeSelection = (input: {
    next: SelectionTarget
    apply: () => void
  }) => {
    if (isSelectionTargetEqual(runtime.state.selection.source.get(), input.next)) {
      return
    }

    runtime.state.edit.mutate.clear()
    input.apply()
  }

  return {
    tool: {
      set: (nextTool: Tool) => {
        if (nextTool.type === 'draw') {
          runtime.state.edit.mutate.clear()
          runtime.state.selection.mutate.clear()
        }
        if (isSameTool(runtime.state.tool.get(), nextTool)) {
          return
        }
        runtime.state.tool.set(nextTool)
      }
    },
    selection: {
      replace: (input) => {
        writeSelection({
          next: normalizeSelectionTarget(input),
          apply: () => {
            runtime.state.selection.mutate.replace(input)
          }
        })
      },
      add: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'add'),
          apply: () => {
            runtime.state.selection.mutate.add(input)
          }
        })
      },
      remove: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'subtract'),
          apply: () => {
            runtime.state.selection.mutate.remove(input)
          }
        })
      },
      toggle: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'toggle'),
          apply: () => {
            runtime.state.selection.mutate.toggle(input)
          }
        })
      },
      selectAll: () => {
        const next = normalizeSelectionTarget({
          nodeIds: [...engine.read.node.list.get()],
          edgeIds: [...engine.read.edge.list.get()]
        })
        writeSelection({
          next,
          apply: () => {
            runtime.state.selection.mutate.replace(next)
          }
        })
      },
      clear: () => {
        writeSelection({
          next: normalizeSelectionTarget({}),
          apply: () => {
            runtime.state.selection.mutate.clear()
          }
        })
      }
    },
    edit: runtime.state.edit.mutate
  }
}
