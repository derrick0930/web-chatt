import React from 'react';
import { formatMessageTime } from '../utils/dateFormatter';

export function MessageBubble({ message, isSelf, peerUsername }) {
  const formattedTime = formatMessageTime(message.created_at || message.timestamp);
  const text = message.content || message.text || '';

  // System call history message (starts with call icon)
  if (text.startsWith('📞') || text.startsWith('📹') || message.sender === 'system') {
    return (
      <div className="system-message-row">
        <div className="system-message-bubble">
          <span>{text}</span>
          {formattedTime && <span className="system-message-time">{formattedTime}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`message-row ${isSelf ? 'self' : 'other'}`}>
      <div className="message-meta">
        <span className="message-sender">
          {isSelf ? 'You' : `@${peerUsername || 'User'}`}
        </span>
        <span className="message-timestamp">{formattedTime}</span>
      </div>
      <div className="message-bubble">
        {text}
      </div>
    </div>
  );
}
