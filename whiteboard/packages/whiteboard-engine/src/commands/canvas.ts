import type { EngineCommands } from '@engine-types/command'
import type { Write } from '@engine-types/write'

export const canvas = ({
  write
}: {
  write: Write
}): EngineCommands['canvas'] => ({
  delete: (refs) => write.apply({
    domain: 'document',
    command: {
      type: 'delete',
      refs
    },
    origin: 'user'
  }),
  duplicate: (refs) => write.apply({
    domain: 'document',
    command: {
      type: 'duplicate',
      refs
    },
    origin: 'user'
  }),
  order: {
    set: (refs) => write.apply({
      domain: 'document',
      command: {
        type: 'order',
        mode: 'set',
        refs
      },
      origin: 'user'
    }),
    bringToFront: (refs) => write.apply({
      domain: 'document',
      command: {
        type: 'order',
        mode: 'front',
        refs
      },
      origin: 'user'
    }),
    sendToBack: (refs) => write.apply({
      domain: 'document',
      command: {
        type: 'order',
        mode: 'back',
        refs
      },
      origin: 'user'
    }),
    bringForward: (refs) => write.apply({
      domain: 'document',
      command: {
        type: 'order',
        mode: 'forward',
        refs
      },
      origin: 'user'
    }),
    sendBackward: (refs) => write.apply({
      domain: 'document',
      command: {
        type: 'order',
        mode: 'backward',
        refs
      },
      origin: 'user'
    })
  }
})
