import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if redirected from registration with prefilled username
  useEffect(() => {
    if (location.state?.registeredUsername) {
      setIdentifier(location.state.registeredUsername);
    }
    if (location.state?.registeredMessage) {
      setInfoMessage(location.state.registeredMessage);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate('/chat');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-window">
        {/* Titlebar */}
        <div className="window-titlebar">
          <div className="window-titlebar-title">
            <span>&#9993;</span>
            <span>Desktop Messenger - Authentication</span>
          </div>
          <div>[ _ &#9633; &#10005; ]</div>
        </div>

        <div className="login-body">
          <div className="login-header-text">
            <h2>Sign In to Messenger</h2>
            <p>Enter your registered username (or email) and password to start chatting.</p>
          </div>

          {!isConfigured && (
            <div className="config-warning-banner">
              <strong>&#9888; Supabase Setup Required:</strong>
              <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>client/.env</code> and run <code>supabase/schema.sql</code> in your Supabase SQL Editor.</p>
            </div>
          )}

          {infoMessage && (
            <div className="success-banner">
              <span>&#10003;</span>
              <span>{infoMessage}</span>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <span>&#9888;</span>
              <span>{error}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-identifier">Username or Email</label>
              <input
                id="login-identifier"
                type="text"
                className="form-input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. alex or alex@example.com"
                disabled={isSubmitting}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn-login"
              disabled={isSubmitting || !isConfigured}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-switch-link">
            Don't have an account yet? <Link to="/register">Register here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
