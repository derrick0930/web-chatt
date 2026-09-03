import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { StatusBadge } from './StatusBadge';
import { formatMessageTime } from '../utils/dateFormatter';

export function Sidebar() {
  const { user, logout } = useAuth();
  const {
    conversations,
    activeConversation,
    selectConversation,
    searchQuery,
    searchResults,
    isSearching,
    searchUsers,
    openConversationWithUser
  } = useChat();

  const [loadingUserId, setLoadingUserId] = useState(null);

  const handleStartChat = async (targetUser) => {
    if (!targetUser || loadingUserId) return;
    setLoadingUserId(targetUser.id);
    try {
      await openConversationWithUser(targetUser);
    } catch (err) {
      console.error('Failed to open chat:', err);
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <aside className="chat-sidebar">
      {/* Current Logged-in User Profile */}
      <div className="user-profile-panel">
        <div className="user-profile-info">
          <div className="user-avatar-circle">
            {user?.username ? user.username[0].toUpperCase() : 'U'}
          </div>
          <div className="user-details">
            <span className="label">Logged in as</span>
            <span className="name">@{user?.username}</span>
          </div>
        </div>
        <button className="btn-logout" onClick={logout} title="Sign out of Messenger">
          Log Out
        </button>
      </div>

      {/* Username Search Box */}
      <div className="sidebar-search-container">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="🔍 Search username to chat..."
          value={searchQuery}
          onChange={(e) => searchUsers(e.target.value)}
        />
        {searchQuery && (
          <button
            className="sidebar-search-clear"
            onClick={() => searchUsers('')}
            title="Clear search"
          >
            &#10005;
          </button>
        )}
      </div>

      {/* Search Results View */}
      {searchQuery.trim() ? (
        <div className="sidebar-section">
          <div className="sidebar-section-title">Search Results</div>
          {isSearching ? (
            <div className="sidebar-loading-text">Searching users...</div>
          ) : searchResults.length === 0 ? (
            <div className="sidebar-empty-text">No user found matching "{searchQuery}"</div>
          ) : (
            <ul className="contacts-list">
              {searchResults.map((resultUser) => {
                const isOpening = loadingUserId === resultUser.id;

                return (
                  <li
                    key={resultUser.id}
                    className="contact-item"
                    onClick={() => handleStartChat(resultUser)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="contact-info">
                      <div className="contact-avatar">
                        {resultUser.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="contact-name">@{resultUser.username}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <StatusBadge isOnline={Boolean(resultUser.is_online)} />
                      <button
                        type="button"
                        className="btn-start-chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartChat(resultUser);
                        }}
                        disabled={isOpening}
                        title="Open chat"
                      >
                        {isOpening ? 'Opening...' : 'Chat'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        /* Existing Conversations List */
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            Conversations {conversations.length > 0 && `(${conversations.length})`}
          </div>
          {conversations.length === 0 ? (
            <div className="sidebar-empty-text">
              No conversations yet.<br />Search a username above to start chatting!
            </div>
          ) : (
            <ul className="contacts-list">
              {conversations.map((conv) => {
                const isActive = activeConversation?.id === conv.id;
                const lastMsgTime = conv.lastMessage?.created_at
                  ? formatMessageTime(conv.lastMessage.created_at)
                  : '';

                return (
                  <li
                    key={conv.id}
                    className={`contact-item ${isActive ? 'active' : ''}`}
                    onClick={() => selectConversation(conv)}
                  >
                    <div className="contact-info">
                      <div className="contact-avatar">
                        {conv.peer.username[0].toUpperCase()}
                      </div>
                      <div className="contact-text-meta">
                        <div className="contact-name">@{conv.peer.username}</div>
                        {conv.lastMessage && (
                          <div className="contact-last-msg">
                            {conv.lastMessage.content}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="contact-status-column">
                      <StatusBadge isOnline={conv.peer.is_online} />
                      {lastMsgTime && <span className="contact-time">{lastMsgTime}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
