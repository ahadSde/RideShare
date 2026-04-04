import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { toastOptions } from './utils/toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster toastOptions={toastOptions} />
    <App />
  </StrictMode>,
)
