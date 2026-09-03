import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';

export function MessageInput() {
  const [text, setText] = useState('');
  const { sendMessage, activePeer } = useChat();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !activePeer) return;
    sendMessage(trimmed);
    setText('');
  };

  const handleKeyDown = (e) => {
    // Send on Enter (without Shift), Shift+Enter allows newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSendDisabled = !text.trim() || !activePeer;

  return (
    <div className="chat-input-container">
      <div className="chat-input-main-row">
        <textarea
          className="chat-textarea"
          rows={2}
          placeholder={
            activePeer
              ? `Write message to @${activePeer.username}... (Enter to send, Shift+Enter for new line)`
              : 'Select a conversation to start typing...'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!activePeer}
        />
        <button
          type="button"
          className="btn-send"
          onClick={handleSend}
          disabled={isSendDisabled}
          title={!activePeer ? 'Select a user to chat' : 'Send Message'}
        >
          Send
        </button>
      </div>
      <div className="input-hint">
        Press <strong>Enter</strong> to send &bull; <strong>Shift + Enter</strong> for a new line
      </div>
    </div>
  );
}
