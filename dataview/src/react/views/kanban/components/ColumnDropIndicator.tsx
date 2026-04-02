export const ColumnDropIndicator = (props: {
  top: number
}) => {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 h-1 rounded-full bg-primary/50"
      style={{ top: props.top }}
    />
  )
}
