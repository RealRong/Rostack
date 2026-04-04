export const ColumnDropIndicator = (props: {
  top: number
  inset?: number
}) => {
  return (
    <div
      className="pointer-events-none absolute z-10 h-1 rounded-full bg-primary/50"
      style={{
        top: props.top,
        left: props.inset ?? 0,
        right: props.inset ?? 0
      }}
    />
  )
}
