import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Settings from './pages/Settings'
import RequireAuth from './components/RequireAuth'
import Capture from './pages/notebook/Capture'
import Select from './pages/notebook/Select'
import Mastery from './pages/notebook/Mastery'
import Preview from './pages/notebook/Preview'
import List from './pages/notebook/List'
import Review from './pages/notebook/Review'

/**
 * Application routes (see instructions section 3).
 *
 * /login is public. All other routes are nested inside <RequireAuth>, which
 * redirects unauthenticated visitors to /login and renders <Outlet> once the
 * session is confirmed.
 *
 * Phase progress:
 *   Phase 0  Scaffold
 *   Phase 1  Login + RequireAuth
 *   Phase 2  Home (notebook CRUD)
 *   Phase 3  Capture + Select (OCR word selection)
 *   Phase 4  Preview (Gemini generation + save)
 *   Phase 5  List tab
 *   Phase 6  Mastery tab + Review tab  ← current
 *   Phase 7  Settings, CSV, i18n, deploy
 */
export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected — requires an authenticated Supabase session */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />

        {/* Notebook tabs */}
        <Route path="/notebook/:id/mastery" element={<Mastery />} />
        <Route path="/notebook/:id/list" element={<List />} />
        <Route path="/notebook/:id/review" element={<Review />} />

        {/* Capture flow */}
        <Route path="/notebook/:id/capture" element={<Capture />} />
        <Route path="/notebook/:id/select" element={<Select />} />
        <Route path="/notebook/:id/preview" element={<Preview />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
