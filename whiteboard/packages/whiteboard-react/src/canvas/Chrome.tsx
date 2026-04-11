import type { RefObject } from 'react'
import { PresenceLayer } from '../features/collab/PresenceLayer'
import { EdgeToolbar } from '../features/edge/components/EdgeToolbar'
import { ContextMenu } from '../features/selection/chrome/ContextMenu'
import { NodeToolbar } from '../features/selection/chrome/NodeToolbar'
import { ToolPalette } from '../features/toolbox/ToolPalette'
import { ViewportDock } from '../features/viewport/ViewportDock'
import type { WhiteboardPresenceBinding } from '../types/common/presence'

export const Chrome = ({
  containerRef,
  presenceBinding
}: {
  containerRef: RefObject<HTMLDivElement | null>
  presenceBinding?: WhiteboardPresenceBinding
}) => {
  return (
    <>
      <ToolPalette />
      <ViewportDock />
      <PresenceLayer binding={presenceBinding} />
      <NodeToolbar
        containerRef={containerRef}
      />
      <EdgeToolbar
        containerRef={containerRef}
      />
      <ContextMenu
        containerRef={containerRef}
      />
    </>
  )
}
