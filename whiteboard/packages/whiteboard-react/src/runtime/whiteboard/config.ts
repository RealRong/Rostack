import { useMemo } from 'react'
import { normalizeConfig, toBoardConfig } from '../../config'
import type { WhiteboardOptions } from '../../types/common/board'

export const useWhiteboardConfig = (
  options?: WhiteboardOptions
) => {
  const resolvedConfig = useMemo(
    () => normalizeConfig(options),
    [options]
  )
  const boardConfig = useMemo(
    () => toBoardConfig(resolvedConfig),
    [resolvedConfig]
  )
  const editorConfig = useMemo(
    () => ({
      mindmapLayout: resolvedConfig.mindmapLayout,
      history: resolvedConfig.history
    }),
    [resolvedConfig]
  )
  const viewportLimits = useMemo(
    () => ({
      minZoom: resolvedConfig.viewport.minZoom,
      maxZoom: resolvedConfig.viewport.maxZoom
    }),
    [resolvedConfig]
  )

  return {
    resolvedConfig,
    boardConfig,
    editorConfig,
    viewportLimits
  }
}
