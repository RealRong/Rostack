import type {
  InteractionBinding,
  InteractionSession
} from '../../runtime/interaction'
import type { InteractionCtx } from '../../runtime/interaction/ctx'
import type { PointerDownInput, PointerSample } from '../../types/input'
import {
  clearStrokeOverlay,
  commitStrokeSession,
  startStrokeSession,
  stepStrokeSession,
  type StrokeSession,
  writeStrokeSession
} from './draw'
import {
  commitEraseSession,
  startEraseSession,
  stepEraseSession,
  type EraseSession,
  writeEraseSession
} from './erase'

type DrawInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write'
>

type DrawPointer = {
  samples: readonly PointerSample[]
}

type DrawSession = StrokeSession | EraseSession

const resolveDrawSession = (
  ctx: DrawInteractionCtx,
  input: PointerDownInput
): DrawSession | null => (
  startEraseSession(ctx, input)
  ?? startStrokeSession(ctx, input)
)

const stepDrawSession = (input: {
  ctx: DrawInteractionCtx
  session: DrawSession
  pointer: DrawPointer
  force?: boolean
}) => (
  input.session.kind === 'stroke'
    ? stepStrokeSession(input.session, input.pointer, input.force)
    : stepEraseSession(input.ctx, input.session, input.pointer)
)

const writeDrawSession = (
  ctx: DrawInteractionCtx,
  previous: DrawSession,
  next: DrawSession
) => {
  if (next.kind === 'stroke') {
    writeStrokeSession(
      ctx,
      previous.kind === 'stroke' ? previous : next,
      next
    )
    return
  }

  writeEraseSession(
    ctx,
    previous.kind === 'erase' ? previous : next,
    next
  )
}

const commitDrawSession = (
  ctx: DrawInteractionCtx,
  session: DrawSession
) => {
  if (session.kind === 'stroke') {
    commitStrokeSession(ctx, session)
    return
  }

  commitEraseSession(ctx, session)
}

const createDrawSession = (
  ctx: DrawInteractionCtx,
  initial: DrawSession
): InteractionSession => {
  let session = initial

  if (session.kind === 'erase' && session.ids.length > 0) {
    ctx.write.preview.draw.setHidden(session.ids)
  }

  const step = (
    input: DrawPointer,
    force = false
  ) => {
    const nextSession = stepDrawSession({
      ctx,
      session,
      pointer: input,
      force
    })
    writeDrawSession(ctx, session, nextSession)
    session = nextSession
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input, true)
      commitDrawSession(ctx, session)
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {
      if (session.kind === 'stroke') {
        clearStrokeOverlay(ctx)
        return
      }

      ctx.write.preview.draw.clear()
    }
  }
}

export const createDrawInteraction = (
  ctx: DrawInteractionCtx
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const session = resolveDrawSession(ctx, input)

    return session
      ? createDrawSession(ctx, session)
      : null
  }
})
