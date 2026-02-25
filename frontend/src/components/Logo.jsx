import React from 'react';
import { useNavigate } from 'react-router-dom';

const Logo = () => {
  const goto = useNavigate();
  
  return (
    <div className="logo-wrapper" onClick={()=>{
        goto("/")
    }}>
      <div className="logo-container">
        <img 
          src="/logo.png" 
          alt="Logo" 
          className="logo-image"
        />
      </div>
    </div>
  );
};

export default Logo;