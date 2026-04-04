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
  const hostConfig = useMemo(
    () => ({
      viewport: {
        minZoom: resolvedConfig.viewport.minZoom,
        maxZoom: resolvedConfig.viewport.maxZoom,
        enablePan: resolvedConfig.viewport.enablePan,
        enableWheel: resolvedConfig.viewport.enableWheel,
        wheelSensitivity: resolvedConfig.viewport.wheelSensitivity
      }
    }),
    [resolvedConfig]
  )

  return {
    resolvedConfig,
    boardConfig,
    editorConfig,
    hostConfig
  }
}
