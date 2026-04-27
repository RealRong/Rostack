import { createTableIndex } from '@shared/spec'
import { compileNodeSpec } from '@whiteboard/editor/types/node/compile'
import type { NodeSpec } from '@whiteboard/react/types/node'

export const compileReactNodeSpec = (
  spec: NodeSpec
) => {
  const compiled = compileNodeSpec(spec)
  const entryByType = createTableIndex(spec, {
    fallback: () => undefined
  })
  const renderByType = createTableIndex(
    Object.fromEntries(
      entryByType.entries.map(([type, entry]) => [type, {
        render: entry.behavior.render,
        style: entry.behavior.style
      }])
    ),
    {
      fallback: () => undefined
    }
  )

  return {
    ...compiled,
    entryByType,
    renderByType
  } as const
}
