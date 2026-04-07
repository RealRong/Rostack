import {
  memo,
  useCallback,
  useMemo,
  type CSSProperties
} from 'react'
import type { GroupId } from '@whiteboard/core/types'
import { useEditor } from '../../../runtime/hooks/useEditor'
import { usePickRef } from '../../../runtime/hooks/usePickRef'
import { useStoreValue } from '../../../runtime/hooks/useStoreValue'

const SHELL_HITS = [
  {
    key: 'top',
    style: {
      left: 0,
      top: 'calc(-5px / var(--wb-zoom, 1))',
      width: '100%',
      height: 'calc(10px / var(--wb-zoom, 1))'
    }
  },
  {
    key: 'right',
    style: {
      top: 0,
      right: 'calc(-5px / var(--wb-zoom, 1))',
      width: 'calc(10px / var(--wb-zoom, 1))',
      height: '100%'
    }
  },
  {
    key: 'bottom',
    style: {
      left: 0,
      bottom: 'calc(-5px / var(--wb-zoom, 1))',
      width: '100%',
      height: 'calc(10px / var(--wb-zoom, 1))'
    }
  },
  {
    key: 'left',
    style: {
      top: 0,
      left: 'calc(-5px / var(--wb-zoom, 1))',
      width: 'calc(10px / var(--wb-zoom, 1))',
      height: '100%'
    }
  }
] as const

const GroupShellHitItem = ({
  groupId,
  side,
  style
}: {
  groupId: GroupId
  side: typeof SHELL_HITS[number]['key']
  style: CSSProperties
}) => {
  const bindPickRef = usePickRef({
    kind: 'group',
    id: groupId,
    part: 'shell'
  })
  const ref = useCallback((element: HTMLDivElement | null) => {
    bindPickRef(element)
  }, [bindPickRef])

  return (
    <div
      ref={ref}
      className="wb-group-shell-hit"
      data-side={side}
      style={style}
    />
  )
}

const GroupShellItem = memo(({
  groupId
}: {
  groupId: GroupId
}) => {
  const editor = useEditor()
  const selection = useStoreValue(editor.read.selection.summary)
  const bounds = useMemo(
    () => editor.read.group.bounds(groupId),
    [editor, groupId, selection]
  )

  if (!bounds) {
    return null
  }

  const style: CSSProperties = {
    transform: `translate(${bounds.x}px, ${bounds.y}px)`,
    width: bounds.width,
    height: bounds.height
  }

  return (
    <div
      className="wb-group-shell"
      data-group-id={groupId}
      style={style}
    >
      {SHELL_HITS.map((hit) => (
        <GroupShellHitItem
          key={hit.key}
          groupId={groupId}
          side={hit.key}
          style={hit.style}
        />
      ))}
      <div className="wb-group-shell-frame" />
    </div>
  )
})

GroupShellItem.displayName = 'GroupShellItem'

export const GroupLayer = () => {
  const editor = useEditor()
  const selection = useStoreValue(editor.read.selection.summary)
  const groupIds = selection.groups.ids

  if (!groupIds.length) {
    return null
  }

  return (
    <div className="wb-group-layer">
      {groupIds.map((groupId) => (
        <GroupShellItem
          key={groupId}
          groupId={groupId}
        />
      ))}
    </div>
  )
}
