import type { RefObject } from 'react'
import { PresenceLayer } from '@whiteboard/react/features/collab/PresenceLayer'
import { EdgeToolbar } from '@whiteboard/react/features/edge/components/EdgeToolbar'
import { ContextMenu } from '@whiteboard/react/features/selection/chrome/ContextMenu'
import { NodeToolbar } from '@whiteboard/react/features/selection/chrome/NodeToolbar'
import { ToolPalette } from '@whiteboard/react/features/toolbox/ToolPalette'
import { ViewportDock } from '@whiteboard/react/features/viewport/ViewportDock'
import type { WhiteboardPresenceBinding } from '@whiteboard/react/types/common/presence'

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
