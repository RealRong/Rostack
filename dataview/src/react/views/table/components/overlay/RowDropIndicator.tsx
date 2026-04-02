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
        <div className="ui-accent-indicator absolute inset-x-0 h-0.5 rounded-full" />
      </div>
    </div>
  )
}
