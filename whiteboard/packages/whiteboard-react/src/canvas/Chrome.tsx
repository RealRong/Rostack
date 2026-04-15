import type { RefObject } from 'react'
import { PresenceLayer } from '@whiteboard/react/features/collab/PresenceLayer'
import { ContextMenu } from '@whiteboard/react/features/selection/chrome/ContextMenu'
import { SelectionToolbar } from '@whiteboard/react/features/selection/chrome/SelectionToolbar'
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
      <SelectionToolbar
        containerRef={containerRef}
      />
      <ContextMenu
        containerRef={containerRef}
      />
    </>
  )
}
