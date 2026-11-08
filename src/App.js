import React, { useState } from 'react';
import './App.css';

function App() {
  // --- STATE AND LOGIC CORES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('login'); // Can be 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(''); // Extra field for registration

  // Opens modal in a specific mode ('login' or 'register')
  const openModal = (mode) => {
    setModalMode(mode);
    setIsModalOpen(true);
  };

  const closeModal = (e) => {
    if (e) e.preventDefault();
    setIsModalOpen(false);
    // Clear inputs on close
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (modalMode === 'login') {
      alert(`Welcome back! Logging into dashboard with: ${email}`);
    } else {
      alert(`Thank you for registering, ${name || 'User'}! An account confirmation has been sent to: ${email}`);
    }
    closeModal();
  };

  const infoSections = [
    { icon: '🌱', title: 'Community Support', text: 'Connect with volunteers and team guides ready to assist you anytime.' },
    { icon: '🔒', title: 'Safe & Secure', text: 'Your account data is kept completely private and protected.' },
    { icon: '💡', title: 'Easy Learning', text: 'Access free guides and step-by-step documentation made for everyone.' },
    { icon: '💬', title: 'Open Communication', text: 'Reach out to our support channel directly whenever you have questions.' }
  ];

  return (
    <div className="app-container">
      {/* ========== NAVBAR ========== */}
      <nav className="navbar">
        <a href="#home" className="logo">
          <div className="logo-icon">H</div>
          <span>Hope, Inc.</span>
        </a>
        <div className="nav-links">
          <a href="#about">About Us</a>
          <a href="#guides">Resources</a>
        </div>
        <div className="nav-actions">
          <button className="btn btn-ghost" onClick={() => openModal('login')}>Sign In</button>
          <button className="btn btn-primary" onClick={() => openModal('register')}>Register</button>
        </div>
      </nav>

      {/* ========== HERO LAYER ========== */}
      <header className="hero" id="home">
        <div className="hero-content">
          <h1>
             Connect and Grow with <span>Hope, Inc.</span>
          </h1>
          <p>
            Welcome to our central resource hub. We are dedicated to providing easy access to information, clear community guides, and helpful digital tools for everyone.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={() => openModal('register')}>Register Now</button>
            <a href="#about" className="btn btn-outline">Learn More</a>
          </div>
        </div>

        {/* GRAPHIC PANEL */}
        <div className="dashboard-preview">
          <div className="preview-header">
            <div className="preview-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>Hope, Inc. Main Portal Menu</span>
          </div>
          <div className="preview-body">
            <div className="module-card">
              <div className="module-icon" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>📊</div>
              <h4>Information Center</h4>
              <p>Read news, updates, and direct notifications.</p>
            </div>
            <div className="module-card">
              <div className="module-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>👥</div>
              <h4>Member Directory</h4>
              <p>Connect safely with our active coordinators.</p>
            </div>
            <div className="module-card">
              <div className="module-icon" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>📁</div>
              <h4>Shared Files</h4>
              <p>Download free printable files and guides.</p>
            </div>
            <div className="module-card">
              <div className="module-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>✉️</div>
              <h4>Help Desk</h4>
              <p>Send a message directly to our staff.</p>
            </div>
          </div>
        </div>
      </header>

      {/* ========== ABOUT SECTION ========== */}
      <section className="features" id="about">
        <div className="section-title">
          <h2>How We Help You</h2>
          <p>Explore the features built to make our digital system approachable and accessible for all users</p>
        </div>
        <div className="features-grid">
          {infoSections.map((section, index) => (
            <div className="feature-card" key={index}>
              <div className="feature-icon">{section.icon}</div>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========== FINAL BANNER ========== */}
      <section className="cta-banner" id="guides">
        <div className="cta-box">
          <h2>Ready to get started?</h2>
          <p>Create your profile today to access our full community dashboard and start learning.</p>
          <button className="btn btn-primary" onClick={() => openModal('register')}>Create Your Account</button>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer>
        <div className="footer-brand">&copy; {new Date().getFullYear()} Hope, Inc.</div>
        <p>An accessible digital platform for everyone.</p>
      </footer>

      {/* ========== DYNAMIC SIGN IN / REGISTER OVERLAY MODAL ========== */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>{modalMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
              <p>{modalMode === 'login' ? 'Access your community dashboard' : 'Join our portal to unlock resources'}</p>
            </div>
            <button className="modal-close" onClick={closeModal}>&times;</button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleFormSubmit}>
              {/* Only show Full Name if registering */}
              {modalMode === 'register' && (
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    placeholder="Alex Smith" 
                    value={name}
                    onChange={(e) => setName(e.target.value)} 
                    required 
                  />
                </div>
              )}
              
              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  placeholder="yourname@email.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
              </div>
              
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                {modalMode === 'login' ? 'Sign In' : 'Register Account'}
              </button>

              {/* Dynamic toggle switch between the two states */}
              <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8' }}>
                {modalMode === 'login' ? (
                  <span>
                    New to Hope, Inc.?{' '}
                    <a href="#toggle" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); setModalMode('register'); }}>
                      Register here
                    </a>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <a href="#toggle" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); setModalMode('login'); }}>
                      Sign in here
                    </a>
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;