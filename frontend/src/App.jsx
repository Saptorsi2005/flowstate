import './App.css'
import Landing from './pages/Landing'
import { Route, Routes } from 'react-router-dom'
import Profile from './pages/Profile'

function App() {
  return (
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route path='/profile' element={<Profile />} />
    </Routes>
  )
}

export default App
