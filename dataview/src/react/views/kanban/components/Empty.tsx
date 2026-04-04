export const Empty = () => {
  return (
    <div className="rounded-2xl border border-dashed border-default bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
      This kanban view requires `groupBy` before it can render columns.
    </div>
  )
}
