import React, { useState } from 'react';

export default function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing' or 'dashboard'
  const [activeModal, setActiveModal] = useState(null); // 'loginModal', 'registerModal', 'resetModal', or null

  // Matrix toggle states
  const [permissions, setPermissions] = useState({
    global: { superadmin: true, manager: false, user: false, guest: false },
    provisioning: { superadmin: true, manager: true, user: false, guest: false },
    export: { superadmin: true, manager: true, user: true, guest: false }
  });

  const handleToggle = (module, role) => {
    if (role === 'superadmin') return; // Locked
    setPermissions(prev => ({
      ...prev,
      [module]: { ...prev[module], [role]: !prev[module][role] }
    }));
  };

  return (
    <div>
      {/* AUTHENTICATION MODALS */}
      {activeModal === 'loginModal' && (
        <div className="modal-overlay active" onClick={(e) => e.target.classList.contains('modal-overlay') && setActiveModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Welcome Back</h2>
                <p>Enter your credentials to access your account</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => { e.preventDefault(); alert('Signed in!'); setActiveModal(null); }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" placeholder="name@company.com" required />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" placeholder="••••••••" required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Sign In</button>
              </form>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem' }}>
                <a href="#reset" onClick={(e) => { e.preventDefault(); setActiveModal('resetModal'); }} style={{ color: 'var(--primary-light)', textDecoration: 'none' }}>Forgot password?</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'registerModal' && (
        <div className="modal-overlay active" onClick={(e) => e.target.classList.contains('modal-overlay') && setActiveModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Create Account</h2>
                <p>Get started with your free workspace</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => { e.preventDefault(); alert('Account created!'); setActiveModal(null); }}>
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" placeholder="John Doe" required />
                </div>
                <div className="form-group">
                  <label>Work Email</label>
                  <input type="email" placeholder="name@company.com" required />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" placeholder="Create a password" required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Create Account</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'resetModal' && (
        <div className="modal-overlay active" onClick={(e) => e.target.classList.contains('modal-overlay') && setActiveModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Reset Password</h2>
                <p>We'll send recovery instructions to your email</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => { e.preventDefault(); alert('Reset link sent!'); setActiveModal(null); }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" placeholder="name@company.com" required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Send Reset Link</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* VIEWS */}
      {currentView === 'landing' ? (
        <div>
          <nav className="navbar">
            <a className="logo" onClick={() => setCurrentView('landing')} style={{ cursor: 'pointer' }}>
              <div className="logo-icon">⚡</div>
              Hope Inc
            </a>
            <div className="nav-links">
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="nav-actions">
              <button className="btn btn-ghost" onClick={() => setActiveModal('loginModal')}>Sign In</button>
              <button className="btn btn-primary" onClick={() => setActiveModal('registerModal')}>Get Started</button>
              <button className="btn btn-outline" onClick={() => setCurrentView('dashboard')}>View Dashboard</button>
            </div>
          </nav>

          <section className="hero">
            <div className="hero-content">
              <h1>Scale Your Workflow With <span>Next-Gen Intelligence</span></h1>
              <p>The ultimate platform designed to streamline operations, manage permissions, and elevate your team productivity seamlessly.</p>
              <div className="hero-cta">
                <button className="btn btn-primary" onClick={() => setActiveModal('registerModal')}>Start Free Trial</button>
                <button className="btn btn-outline" onClick={() => setCurrentView('dashboard')}>Explore Dashboard</button>
              </div>
            </div>
            <div className="dashboard-preview">
              <div className="preview-header">
                <div className="preview-dots"><span></span><span></span><span></span></div>
                <span>Workspace Overview</span>
              </div>
              <div className="preview-body">
                <div className="module-card">
                  <div className="module-icon" style={{ background: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent)' }}>📊</div>
                  <h4>Active Users</h4>
                  <p>1,482 active sessions</p>
                </div>
                <div className="module-card">
                  <div className="module-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>🛡️</div>
                  <h4>Security Logs</h4>
                  <p>Zero anomalies flagged</p>
                </div>
              </div>
            </div>
          </section>

          <section className="features" id="features">
            <div className="section-title">
              <h2>Engineered for Performance</h2>
              <p>Everything you need to scale your organization securely.</p>
            </div>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h3>Lightning Fast</h3>
                <p>Built on high-performance frameworks for instantaneous response times.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Granular Security</h3>
                <p>Advanced role matrices to manage enterprise-grade permissions easily.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📈</div>
                <h3>Deep Analytics</h3>
                <p>Gain actionable insights into workspace activity and performance trends.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🌐</div>
                <h3>Cloud Synchronized</h3>
                <p>Real-time data synchronization across all your team's connected devices.</p>
              </div>
            </div>
          </section>

          <section className="pricing" id="pricing">
            <div className="section-title">
              <h2>Simple, Transparent Pricing</h2>
              <p>Choose the right plan for your team size.</p>
            </div>
            <div className="pricing-grid">
              <div className="price-card">
                <h3>Starter</h3>
                <div className="cost">$29<span>/mo</span></div>
                <ul className="price-features">
                  <li>Up to 5 team members</li>
                  <li>Basic analytics suite</li>
                  <li>Standard support</li>
                </ul>
                <button className="btn btn-outline" onClick={() => setActiveModal('registerModal')}>Choose Starter</button>
              </div>
              <div className="price-card popular">
                <div className="badge">Most Popular</div>
                <h3>Professional</h3>
                <div className="cost">$79<span>/mo</span></div>
                <ul className="price-features">
                  <li>Up to 25 team members</li>
                  <li>Advanced user-rights matrix</li>
                  <li>Priority 24/7 support</li>
                </ul>
                <button className="btn btn-primary" onClick={() => setActiveModal('registerModal')}>Choose Pro</button>
              </div>
              <div className="price-card">
                <h3>Enterprise</h3>
                <div className="cost">$199<span>/mo</span></div>
                <ul className="price-features">
                  <li>Unlimited members</li>
                  <li>Custom security controls</li>
                  <li>Dedicated account manager</li>
                </ul>
                <button className="btn btn-outline" onClick={() => setActiveModal('registerModal')}>Contact Sales</button>
              </div>
            </div>
          </section>

          <footer>
            <div className="footer-brand">Hope Inc.</div>
            <div>&copy; 2026 Hope Inc. All rights reserved.</div>
          </footer>
        </div>
      ) : (
        /* DASHBOARD VIEW */
        <div className="app-layout">
          <aside className="sidebar">
            <a className="sidebar-logo" onClick={() => setCurrentView('landing')} style={{ cursor: 'pointer' }}>
              <div className="logo-icon">⚡</div>
              Hope Inc
            </a>
            <ul className="sidebar-menu">
              <li><a href="#" className="active">Overview</a></li>
              <li><a href="#">Analytics</a></li>
              <li><a href="#">User Management</a></li>
              <li><a href="#">Settings</a></li>
            </ul>
            <button className="btn btn-outline" style={{ marginTop: 'auto' }} onClick={() => setCurrentView('landing')}>Back to Home</button>
          </aside>

          <div className="dashboard-main">
            <header className="dashboard-header">
              <h3>Superadmin Control Panel</h3>
              <div className="nav-actions">
                <button className="btn btn-outline">Admin Profile</button>
              </div>
            </header>

            <main style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
              <div className="dashboard-preview">
                <div className="preview-header">
                  <div className="preview-dots"><span></span><span></span><span></span></div>
                  <span>System Diagnostics</span>
                </div>
                <div className="preview-body">
                  <div className="module-card">
                    <div className="module-icon" style={{ background: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent)' }}>📊</div>
                    <h4>Active Sessions</h4>
                    <p>1,482 active connections</p>
                  </div>
                  <div className="module-card">
                    <div className="module-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>🛡️</div>
                    <h4>Matrix Status</h4>
                    <p>Permissions fully synchronized</p>
                  </div>
                </div>
              </div>

              {/* USER-RIGHTS MANAGEMENT MATRIX */}
              <section>
                <div className="section-title" style={{ textAlign: 'left', marginBottom: '24px' }}>
                  <h2>User-Rights Management Matrix</h2>
                  <p>Configure granular access roles and permissions across system modules.</p>
                </div>
                <div className="matrix-container">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th>Permission Module</th>
                        <th>Superadmin</th>
                        <th>Manager</th>
                        <th>Standard User</th>
                        <th>Guest</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Global Settings Access</td>
                        <td><label className="switch"><input type="checkbox" checked disabled /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.global.manager} onChange={() => handleToggle('global', 'manager')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.global.user} onChange={() => handleToggle('global', 'user')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.global.guest} onChange={() => handleToggle('global', 'guest')} /><span className="slider"></span></label></td>
                      </tr>
                      <tr>
                        <td>User Provisioning & Roles</td>
                        <td><label className="switch"><input type="checkbox" checked disabled /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.provisioning.manager} onChange={() => handleToggle('provisioning', 'manager')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.provisioning.user} onChange={() => handleToggle('provisioning', 'user')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.provisioning.guest} onChange={() => handleToggle('provisioning', 'guest')} /><span className="slider"></span></label></td>
                      </tr>
                      <tr>
                        <td>Data Export & Reports</td>
                        <td><label className="switch"><input type="checkbox" checked disabled /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.export.manager} onChange={() => handleToggle('export', 'manager')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.export.user} onChange={() => handleToggle('export', 'user')} /><span className="slider"></span></label></td>
                        <td><label className="switch"><input type="checkbox" checked={permissions.export.guest} onChange={() => handleToggle('export', 'guest')} /><span className="slider"></span></label></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}