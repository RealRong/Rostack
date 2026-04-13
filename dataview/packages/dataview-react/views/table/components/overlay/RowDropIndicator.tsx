export const RowDropIndicator = (props: {
  top: number
  left: number
  width: number
}) => {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: props.left,
        top: props.top,
        width: props.width,
        transform: 'translateY(-1px)'
      }}
    >
      <div className="relative h-0">
        <div className="absolute inset-x-0 h-0.5 rounded-full bg-primary [box-shadow:0_0_0_1px_var(--background),0_0_0_6px_var(--ui-accent-overlay-subtle)]" />
      </div>
    </div>
  )
}
