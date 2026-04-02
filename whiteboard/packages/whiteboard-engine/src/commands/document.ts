import type { Slice, SliceInsertOptions } from '@whiteboard/core/document'
import type { Write } from '@engine-types/write'
import type { EngineCommands } from '@engine-types/command'

export const document = ({
  write
}: {
  write: Write
}) => {
  return {
    replace: write.replace,
    insert: (slice: Slice, options?: SliceInsertOptions) => write.apply({
      domain: 'document',
      command: {
        type: 'insert',
        slice,
        options
      },
      origin: 'user'
    }),
    background: {
      set: (background) => write.apply({
        domain: 'document',
        command: {
          type: 'background',
          background
        },
        origin: 'user'
      })
    }
  } satisfies EngineCommands['document']
}
