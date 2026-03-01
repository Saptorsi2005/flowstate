import './App.css'
import Landing from './pages/Landing'
import { Route, Routes } from 'react-router-dom'
import Profile from './pages/Profile'
import Home from './pages/Home'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      {/* Public Landing */}
      <Route path="/" element={<Landing />} />
      
      {/* Protected App Routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="home" element={<Home />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}

export default App
