import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { RecipeProvider } from './context/RecipeContext.jsx'
import { TabBar } from './components/TabBar.jsx'
import { ScrapePage } from './pages/ScrapePage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { SavedPage } from './pages/SavedPage.jsx'
import { RecipeDetailPage } from './pages/RecipeDetailPage.jsx'
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
  {
    element: <TabLayout />,
    children: [
      { path: '/scrape', element: <ScrapePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/saved',  element: <SavedPage /> },
    ],
  },
  { path: '/recipe', element: <RecipeDetailPage /> },
])

export default function App() {
  return (
    <RecipeProvider>
      <RouterProvider router={router} />
    </RecipeProvider>
  )
}
