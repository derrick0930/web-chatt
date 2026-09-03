import React from 'react';

export function StatusBadge({ isOnline }) {
  return (
    <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
      <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
      {isOnline ? '● Online' : '○ Offline'}
    </span>
  );
}
