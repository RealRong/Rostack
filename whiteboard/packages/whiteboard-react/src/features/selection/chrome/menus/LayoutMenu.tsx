import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type { ReactNode } from 'react'
import {
  MenuSection
} from './MenuPrimitives'

const LayoutIcon = ({
  children
}: {
  children: ReactNode
}) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="wb-node-toolbar-icon"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

const LayoutIconButton = ({
  label,
  disabled = false,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className="wb-node-toolbar-icon-button"
    disabled={disabled}
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    {children}
  </button>
)

export const LayoutMenu = ({
  canAlign,
  canDistribute,
  onAlign,
  onDistribute
}: {
  canAlign: boolean
  canDistribute: boolean
  onAlign: (mode: NodeAlignMode) => void
  onDistribute: (mode: NodeDistributeMode) => void
}) => (
  <MenuSection title="Layout">
    <div className="wb-node-toolbar-layout-panel">
      <div className="wb-node-toolbar-layout-align-grid">
        <LayoutIconButton
          label="Align top"
          disabled={!canAlign}
          onClick={() => {
            onAlign('top')
          }}
        >
          <LayoutIcon>
            <path d="M4.5 6.5h15" />
            <rect x="6" y="6.5" width="2.5" height="8" />
            <rect x="10.75" y="6.5" width="2.5" height="5" />
            <rect x="15.5" y="6.5" width="2.5" height="10" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Align left"
          disabled={!canAlign}
          onClick={() => {
            onAlign('left')
          }}
        >
          <LayoutIcon>
            <path d="M6.5 4.5v15" />
            <rect x="6.5" y="6" width="8" height="2.5" />
            <rect x="6.5" y="10.75" width="5" height="2.5" />
            <rect x="6.5" y="15.5" width="10" height="2.5" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Align right"
          disabled={!canAlign}
          onClick={() => {
            onAlign('right')
          }}
        >
          <LayoutIcon>
            <path d="M17.5 4.5v15" />
            <rect x="9.5" y="6" width="8" height="2.5" />
            <rect x="12.5" y="10.75" width="5" height="2.5" />
            <rect x="7.5" y="15.5" width="10" height="2.5" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Align bottom"
          disabled={!canAlign}
          onClick={() => {
            onAlign('bottom')
          }}
        >
          <LayoutIcon>
            <path d="M4.5 17.5h15" />
            <rect x="6" y="9.5" width="2.5" height="8" />
            <rect x="10.75" y="12.5" width="2.5" height="5" />
            <rect x="15.5" y="7.5" width="2.5" height="10" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Align horizontal center"
          disabled={!canAlign}
          onClick={() => {
            onAlign('horizontal')
          }}
        >
          <LayoutIcon>
            <path d="M4.5 12h15" />
            <rect x="6" y="8" width="2.5" height="8" />
            <rect x="10.75" y="9.5" width="2.5" height="5" />
            <rect x="15.5" y="7" width="2.5" height="10" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Align vertical center"
          disabled={!canAlign}
          onClick={() => {
            onAlign('vertical')
          }}
        >
          <LayoutIcon>
            <path d="M12 4.5v15" />
            <rect x="8" y="6" width="8" height="2.5" />
            <rect x="9.5" y="10.75" width="5" height="2.5" />
            <rect x="7" y="15.5" width="10" height="2.5" />
          </LayoutIcon>
        </LayoutIconButton>
      </div>
      <div className="wb-node-toolbar-layout-divider" />
      <div className="wb-node-toolbar-layout-distribute-grid">
        <LayoutIconButton
          label="Distribute horizontally"
          disabled={!canDistribute}
          onClick={() => {
            onDistribute('horizontal')
          }}
        >
          <LayoutIcon>
            <rect x="4.5" y="7" width="3" height="10" />
            <rect x="10.5" y="7" width="3" height="10" />
            <rect x="16.5" y="7" width="3" height="10" />
            <path d="M7.5 12h3" />
            <path d="M13.5 12h3" />
          </LayoutIcon>
        </LayoutIconButton>
        <LayoutIconButton
          label="Distribute vertically"
          disabled={!canDistribute}
          onClick={() => {
            onDistribute('vertical')
          }}
        >
          <LayoutIcon>
            <rect x="7" y="4.5" width="10" height="3" />
            <rect x="7" y="10.5" width="10" height="3" />
            <rect x="7" y="16.5" width="10" height="3" />
            <path d="M12 7.5v3" />
            <path d="M12 13.5v3" />
          </LayoutIcon>
        </LayoutIconButton>
      </div>
    </div>
  </MenuSection>
)
