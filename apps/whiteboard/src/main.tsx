import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@ui/css/core.css'
import './app.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
