import { Routes, Route } from 'react-router-dom'
import App from '../App.jsx'

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/patient" element={<div>Patient Page</div>} />
      <Route path="/contact" element={<div>Contact Page</div>} />
    </Routes>
  )
}