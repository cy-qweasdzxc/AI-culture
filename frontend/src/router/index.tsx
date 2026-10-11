import { createBrowserRouter } from 'react-router-dom'
import RequireJourney from '@/components/RequireJourney'
import JourneyLayout from '@/layouts/JourneyLayout'
import PublicLayout from '@/layouts/PublicLayout'
import AdminPage from '@/pages/AdminPage'
import ChatPage from '@/pages/ChatPage'
import CluesPage from '@/pages/CluesPage'
import CodexPage from '@/pages/CodexPage'
import DemoPage from '@/pages/DemoPage'
import EndingPage from '@/pages/EndingPage'
import HomePage from '@/pages/HomePage'
import IntroPage from '@/pages/IntroPage'
import MapPage from '@/pages/MapPage'
import NotFoundPage from '@/pages/NotFoundPage'
import ReportPage from '@/pages/ReportPage'
import RolePage from '@/pages/RolePage'
import SettingsPage from '@/pages/SettingsPage'
import SpotPage from '@/pages/SpotPage'
import TaskPage from '@/pages/TaskPage'
import ThemePage from '@/pages/ThemePage'

/**
 * 信息架构（技术方案第 3 节，共 15 个规定路由 + 404）。
 * 旅程必需页面在旅程未创建时重定向到角色选择页。
 */
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/intro', element: <IntroPage /> },
      { path: '/theme', element: <ThemePage /> },
      { path: '/role', element: <RolePage /> },
      { path: '/demo', element: <DemoPage /> },
    ],
  },
  {
    element: <JourneyLayout />,
    children: [
      {
        path: '/map',
        element: (
          <RequireJourney>
            <MapPage />
          </RequireJourney>
        ),
      },
      {
        path: '/spot/:spotId',
        element: (
          <RequireJourney>
            <SpotPage />
          </RequireJourney>
        ),
      },
      {
        path: '/chat/:npcId',
        element: (
          <RequireJourney>
            <ChatPage />
          </RequireJourney>
        ),
      },
      {
        path: '/task/:taskId',
        element: (
          <RequireJourney>
            <TaskPage />
          </RequireJourney>
        ),
      },
      { path: '/clues', element: <CluesPage /> },
      { path: '/codex', element: <CodexPage /> },
      {
        path: '/ending/:endingId',
        element: (
          <RequireJourney>
            <EndingPage />
          </RequireJourney>
        ),
      },
      { path: '/report', element: <ReportPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '/admin', element: <AdminPage /> },
  { path: '*', element: <NotFoundPage /> },
])
