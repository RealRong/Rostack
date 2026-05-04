import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'

const container = document.querySelector('#root, #app')

if (!container) {
  throw new Error('Root container not found.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
