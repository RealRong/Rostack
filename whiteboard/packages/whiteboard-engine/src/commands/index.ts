import type { EngineCommands } from '@engine-types/command'
import type { Write } from '@engine-types/write'
import { document } from './document'
import { edge } from './edge'
import { mindmap } from './mindmap'
import { node } from './node'

export const createCommands = ({
  write
}: {
  write: Write
}): EngineCommands => {
  return {
    document: document({
      write
    }),
    history: write.history,
    edge: edge({
      apply: write.apply
    }),
    node: node({
      apply: write.apply
    }),
    mindmap: mindmap({
      apply: write.apply
    })
  }
}
