import type { ComponentProps } from 'react'

export type MenuLineTypeIconProps = ComponentProps<'svg'>

export const ArrowCurve = ({
  ...props
}: MenuLineTypeIconProps) => (
  <svg
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    {...props}
  >
    <path
      d="M20 11.5s-2.722-.208-4.555 1.835C13.61 15.38 14.5 19 13 21S8.723 22.27 8.723 22.27"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M23.754 10.685a1 1 0 0 1-.004 1.665l-3.197 2.12A1 1 0 0 1 19 13.637V9.374a1 1 0 0 1 1.557-.83l3.197 2.141Z"
      fill="currentColor"
    />
  </svg>
)

export default ArrowCurve
