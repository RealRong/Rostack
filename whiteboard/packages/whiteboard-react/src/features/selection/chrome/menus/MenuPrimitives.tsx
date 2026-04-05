import type { ReactNode } from 'react'

export const ColorSwatch = ({
  color,
  active = false,
  onClick
}: {
  color: string
  active?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    className="wb-node-toolbar-swatch"
    data-active={active ? 'true' : undefined}
    style={{ ['--wb-swatch-color' as string]: color }}
    onClick={onClick}
    aria-label={color}
  />
)

export const MenuSection = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}) => (
  <div className="wb-node-toolbar-menu-section">
    <div className="wb-node-toolbar-menu-title">{title}</div>
    {children}
  </div>
)

export const ChipRow = ({
  children
}: {
  children: ReactNode
}) => (
  <div className="wb-node-toolbar-chip-row">
    {children}
  </div>
)

export const ChipColumn = ({
  children
}: {
  children: ReactNode
}) => (
  <div className="wb-node-toolbar-chip-column">
    {children}
  </div>
)

export const Chip = ({
  active = false,
  disabled = false,
  tone,
  onClick,
  children
}: {
  active?: boolean
  disabled?: boolean
  tone?: 'danger'
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className="wb-node-toolbar-chip"
    data-active={active ? 'true' : undefined}
    data-tone={tone}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
)

export const MenuList = ({
  children
}: {
  children: ReactNode
}) => (
  <div className="wb-node-toolbar-menu-list">
    {children}
  </div>
)

export const MenuItem = ({
  disabled = false,
  tone,
  onClick,
  children
}: {
  disabled?: boolean
  tone?: 'danger'
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className="wb-node-toolbar-menu-item"
    disabled={disabled}
    data-tone={tone}
    onClick={onClick}
  >
    {children}
  </button>
)
