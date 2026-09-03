import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { MessageBubble } from './MessageBubble';

export function MessageList() {
  const { user } = useAuth();
  const { messages, activePeer, isLoadingMessages } = useChat();
  const endOfMessagesRef = useRef(null);

  // Automatic scrolling to bottom when messages update
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingMessages]);

  if (!activePeer) {
    return (
      <div className="messages-container">
        <div className="empty-chat-placeholder">
          <p><strong>No conversation selected.</strong></p>
          <p>Search a username or pick an existing conversation to chat.</p>
        </div>
      </div>
    );
  }

  if (isLoadingMessages) {
    return (
      <div className="messages-container">
        <div className="empty-chat-placeholder">
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-container">
      {messages.length === 0 ? (
        <div className="empty-chat-placeholder">
          <p>No messages yet.</p>
          <p>Send a message to start chatting with <strong>@{activePeer.username}</strong>.</p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.sender_id === user?.id || msg.sender === user?.username}
            peerUsername={activePeer.username}
          />
        ))
      )}
      <div ref={endOfMessagesRef} />
    </div>
  );
}
