import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const { register, isConfigured } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically enforce lowercase and prevent spaces in username
  const handleUsernameChange = (e) => {
    const rawValue = e.target.value;
    const sanitized = rawValue.toLowerCase().replace(/\s+/g, '');
    setUsername(sanitized);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUser || !cleanEmail || !password || !confirmPassword) {
      setError('Please fill in all required fields.');
      return;
    }

    if (cleanUser.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanUser)) {
      setError('Username can only contain lowercase letters, numbers, and underscores (no spaces).');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(cleanUser, cleanEmail, password);
      // Immediately redirect to login screen so user can sign in with username and password
      navigate('/login', {
        state: {
          registeredUsername: cleanUser,
          registeredMessage: `Account @${cleanUser} registered successfully! Enter your password to log in.`
        }
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-window">
        {/* Classic Window Titlebar */}
        <div className="window-titlebar">
          <div className="window-titlebar-title">
            <span>&#9993;</span>
            <span>Desktop Messenger - New User Registration</span>
          </div>
          <div>[ _ &#9633; &#10005; ]</div>
        </div>

        <div className="login-body">
          <div className="login-header-text">
            <h2>Create Account</h2>
            <p>Register a unique username and email to start chatting.</p>
          </div>

          {!isConfigured && (
            <div className="config-warning-banner">
              <strong>&#9888; Supabase Setup Required:</strong>
              <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>client/.env</code> and run <code>supabase/schema.sql</code> in your Supabase SQL Editor.</p>
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
              <label htmlFor="reg-username">Username (lowercase, no spaces)</label>
              <input
                id="reg-username"
                type="text"
                className="form-input"
                value={username}
                onChange={handleUsernameChange}
                placeholder="e.g. alex_smith"
                disabled={isSubmitting}
                autoComplete="username"
                autoFocus
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                All lowercase, no spaces allowed (e.g. <code>alex</code>, <code>jordan_99</code>)
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. alex@example.com"
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-confirm-password">Confirm Password</label>
              <input
                id="reg-confirm-password"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn-login"
              disabled={isSubmitting || !isConfigured}
            >
              {isSubmitting ? 'Registering...' : 'Register Account'}
            </button>
          </form>

          <div className="auth-switch-link">
            Already have an account? <Link to="/login">Log in here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
