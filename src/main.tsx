import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'normalize.css/normalize.css'
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'
import './global.css'
import App from './App.tsx'
import { AppUpdatePrompt } from './AppUpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AppUpdatePrompt />
  </StrictMode>,
)
