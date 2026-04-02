export const Empty = () => {
  return (
    <div className="ui-surface-empty rounded-2xl px-6 py-10 text-sm">
      This kanban view requires `groupBy` before it can render columns.
    </div>
  )
}
