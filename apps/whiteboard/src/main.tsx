import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './app.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container not found.')
}

const syncSystemTheme = () => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const theme = media.matches ? 'dark' : 'light'
    document.documentElement.classList.toggle('ui-dark-theme', theme === 'dark')
    document.documentElement.classList.toggle('ui-light-theme', theme !== 'dark')
  }

  apply()

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', apply)
    return
  }

  media.addListener(apply)
}

syncSystemTheme()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
