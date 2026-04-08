import type { NodeId } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import { useEditor } from '#react/runtime/hooks'
import { useMindmapTreeView } from '../hooks/useMindmapTreeView'
import { MindmapTreeView } from './MindmapTreeView'

const MindmapTreeById = ({
  treeId
}: {
  treeId: NodeId
}) => {
  const view = useMindmapTreeView(treeId)

  if (!view) return null

  return <MindmapTreeView view={view} />
}

export const MindmapSceneLayer = () => {
  const editor = useEditor()
  const treeIds = useStoreValue(editor.read.mindmap.list)

  if (!treeIds.length) return null

  return (
    <>
      {treeIds.map((treeId) => (
        <MindmapTreeById
          key={treeId}
          treeId={treeId}
        />
      ))}
    </>
  )
}
