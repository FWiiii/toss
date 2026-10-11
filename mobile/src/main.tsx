import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { MobileApp } from './mobile-app'
import '@/app/globals.css'
import './mobile.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MobileApp />
    </ThemeProvider>
  </StrictMode>,
)
