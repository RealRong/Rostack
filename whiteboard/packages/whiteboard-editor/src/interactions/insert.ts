import type { InteractionBinding } from '../runtime/interaction'
import type { InteractionCtx } from '../runtime/interaction/ctx'
import type { InsertPresetKey } from '../types/tool'
import { selectTool } from '../tool/model'

export const createInsertInteraction = (
  editor: Pick<InteractionCtx, 'read' | 'write'>
): InteractionBinding => ({
  key: 'insert.preset',
  start: (start) => {
    const tool = editor.read.tool.get()

    if (
      tool.type !== 'insert'
      || start.pick.kind !== 'background'
      || !tool.preset
      || start.editable
      || start.ignoreInput
      || start.ignoreSelection
    ) {
      return null
    }

    const presetKey = tool.preset as InsertPresetKey
    const result = editor.write.document.insert.preset(presetKey, {
      at: start.world
    })
    if (result) {
      editor.write.session.tool.set(selectTool())
    }

    return 'handled'
  }
})
