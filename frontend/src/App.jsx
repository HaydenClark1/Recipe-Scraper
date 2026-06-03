import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { RecipeProvider } from './context/RecipeContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { RequireAuth } from './components/RequireAuth.jsx'
import { TabBar } from './components/TabBar.jsx'
import { ScrapePage } from './pages/ScrapePage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { SavedPage } from './pages/SavedPage.jsx'
import { RecipeDetailPage } from './pages/RecipeDetailPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { SignupPage } from './pages/SignupPage.jsx'
import { useTheme } from './hooks/useTheme.js'
import './styles/global.css'
import './App.css'

function TabLayout() {
  return (
    <div className="tab-layout">
      <div className="tab-content">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

const router = createHashRouter([
  { path: '/', element: <Navigate to="/scrape" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <RequireAuth><TabLayout /></RequireAuth>,
    children: [
      { path: '/scrape', element: <ScrapePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/saved',  element: <SavedPage /> },
    ],
  },
  { path: '/recipe', element: <RequireAuth><RecipeDetailPage /></RequireAuth> },
])

function ThemeRoot() {
  useTheme()
  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <AuthProvider>
      <RecipeProvider>
        <ThemeRoot />
      </RecipeProvider>
    </AuthProvider>
  )
}
