import { useState } from "react"
import { Routes, Route, Link } from "react-router-dom"
import { X } from "lucide-react"
import App from "./App"
import PatientPage from "./pages/PatientPage"
import ConsultationPage from "./pages/ConsultationPage"
import Logo from "./components/Logo"

export default function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="page">
     <Logo/>
     {open && <div className="overlay" onClick={()=>setOpen(false)}>
        
     </div>}
      <button className="menuBtn" onClick={() => setOpen(!open)}>
        {!open ? (
          <span className="menuWrap">
            <span>MENU</span>
            <span className="dots">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </span>
        ) : (
          <span className="menuWrap">
            <span>MENU</span>
            <X size={18} />
          </span>
        )}
      </button>

      <div className={`sidebar ${open ? "open" : ""}`}>
        <nav className="nav">
          <Link onClick={() => setOpen(false)} to="/">HOME</Link>
          <Link onClick={() => setOpen(false)} to="/patient">PATIENT</Link>
          <Link onClick={() => setOpen(false)} to="/consult">CONSULT</Link>
        </nav>
      </div>

      <div className="content">
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/patient" element={<PatientPage/>} />
          <Route path="/consult" element={<ConsultationPage/>} />
        </Routes>
      </div>
    </div>
  )
}