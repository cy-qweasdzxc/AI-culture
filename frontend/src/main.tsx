import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import JourneyBootstrap from '@/components/JourneyBootstrap'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <JourneyBootstrap>
      <RouterProvider router={router} />
    </JourneyBootstrap>
  </React.StrictMode>,
)
