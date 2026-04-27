import { spec as specApi } from '@shared/spec'
import { compileNodeSpec } from '@whiteboard/editor/types/node/compile'
import type { NodeSpec } from '@whiteboard/react/types/node'

export const compileReactNodeSpec = (
  spec: NodeSpec
) => {
  const compiled = compileNodeSpec(spec)
  const entryByType = specApi.table(spec, {
    fallback: () => undefined
  })
  const renderByType = specApi.table(
    entryByType.project(([, entry]) => ({
      render: entry.behavior.render,
      style: entry.behavior.style
    })),
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
