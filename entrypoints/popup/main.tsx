import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import '@/styles/app.css'
import { loadSettings } from '@/lib/settings'
import { App } from './App'

loadSettings().then(() =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
