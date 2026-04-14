import type {
  InteractionSession,
  InteractionSessionTransition,
  InteractionStartResult
} from '@whiteboard/editor/input/core/types'

export const FINISH = {
  kind: 'finish'
} satisfies InteractionSessionTransition

export const CANCEL = {
  kind: 'cancel'
} satisfies InteractionSessionTransition

export const HANDLED: InteractionStartResult = 'handled'

export const replaceSession = (
  session: InteractionSession
): InteractionSessionTransition => ({
  kind: 'replace',
  session
})
