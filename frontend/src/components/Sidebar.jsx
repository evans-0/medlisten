import { NavLink } from 'react-router-dom';

export default function Sidebar({ items }) {
  return (
    <nav className="sidebar">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `sidebar-item${isActive ? ' sidebar-item-active' : ''}`}
        >
          <span className="sidebar-icon">{item.icon}</span>
          <span className="sidebar-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
