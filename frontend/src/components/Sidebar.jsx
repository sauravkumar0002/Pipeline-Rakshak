import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FiGrid, FiCpu, FiBarChart2, FiCheckSquare,
  FiDatabase, FiChevronLeft, FiChevronRight,
  FiRefreshCw, FiSettings, FiVideo,
} from 'react-icons/fi';
import logoImg from '../assets/logo.png';
import '../styles/sidebar.css';

const Sidebar = ({ isCollapsed, onToggle }) => {
  const menuItems = [
    { path: "/", name: "Dashboard", icon: <FiGrid /> },
    { path: "/inspect", name: "Corrosion Detection", icon: <FiCpu /> },
    { path: "/live", name: "Live Monitoring", icon: <FiVideo /> },
    { path: "/history", name: "Inspection History", icon: <FiBarChart2 /> },
    { path: "/verification", name: "Verification", icon: <FiCheckSquare /> },
    { path: "/analytics", name: "Analytics", icon: <FiBarChart2 /> },
    { path: "/retraining", name: "Dataset & Retraining", icon: <FiRefreshCw /> },
    { path: "/models", name: "Model Management", icon: <FiDatabase /> },
    { path: "/settings", name: "Settings", icon: <FiSettings /> },
  ];

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sidebar-header">
        <div className="logo-img-wrap">
          <img src={logoImg} alt="Pipeline Rakshak" className="logo-img" />
        </div>
        {!isCollapsed && <span className="logo-text">Pipeline Rakshak</span>}
      </div>
      <ul className="sidebar-menu">
        {menuItems.map((item) => (
          <li className="menu-item" key={item.name}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `menu-link${isActive ? ' active' : ''}`}
            >
              <span className="menu-icon">{item.icon}</span>
              {!isCollapsed && <span className="menu-text">{item.name}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <button className="sidebar-toggle" onClick={onToggle}>
        {isCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
      </button>
    </div>
  );
};

export default Sidebar;
