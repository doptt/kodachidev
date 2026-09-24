// Entry point for /terms (terms/index.html)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Terms from './pages/Terms'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Terms />
  </StrictMode>,
)
