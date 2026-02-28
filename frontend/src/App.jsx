import './App.css'
import Landing from './pages/Landing'
import { Route, Routes } from 'react-router-dom'
import Profile from './pages/Profile'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import AuthLayout from './layouts/AuthLayout'
import AppLayout from './layouts/AppLayout'

function App() {
  return (
    <Routes>
      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      {/* App Routes */}
      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}

export default App
