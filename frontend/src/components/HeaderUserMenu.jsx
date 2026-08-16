import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import Modal from './Modal';
import './HeaderUserMenu.css';

export default function HeaderUserMenu({ user, logout }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfileClick = () => {
    setIsOpen(false);
    setIsProfileOpen(true);
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div className="header-user-menu" ref={menuRef}>
        <div 
          className="user-profile-badge clickable" 
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          tabIndex={0}
        >
          <div className="user-avatar-circle">{user?.name?.charAt(0) || 'U'}</div>
          <div className="user-info-text">
            <span className="user-name">{user?.name}</span>
            <span className="user-meta">
              {user?.employee_id} • {user?.role === 'admin' ? 'Administrator' : (user?.designation || 'Staff')}
            </span>
          </div>
        </div>

        {isOpen && (
          <div className="user-dropdown-menu">
            <button className="dropdown-item" onClick={handleProfileClick}>
              <User size={16} />
              <span>Profile</span>
            </button>
            <button className="dropdown-item text-danger" onClick={handleLogoutClick}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>

      <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="My Profile" maxWidth="480px">
        <div className="profile-details-grid">
          <div className="profile-field">
            <span className="profile-label">Full Name</span>
            <span className="profile-value">{user?.name}</span>
          </div>
          <div className="profile-field">
            <span className="profile-label">Email Address</span>
            <span className="profile-value">{user?.email}</span>
          </div>
          
          {user?.role !== 'admin' && (
            <>
              <div className="profile-field">
                <span className="profile-label">Phone Number</span>
                <span className="profile-value">{user?.phone || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Designation</span>
                <span className="profile-value">{user?.designation || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Date of Joining</span>
                <span className="profile-value">
                  {user?.date_of_joining ? new Date(user.date_of_joining).toLocaleDateString('en-IN') : 'Not provided'}
                </span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Gender</span>
                <span className="profile-value">{user?.gender || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Bank Name</span>
                <span className="profile-value">{user?.bank_name || 'Not provided'}</span>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
