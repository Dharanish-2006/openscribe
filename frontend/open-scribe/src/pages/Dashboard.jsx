import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../api/auth";
import Document from "./Document";

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("docs");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    username: user?.username || "",
    bio: user?.bio || "",
  });
  const [pwForm, setPwForm] = useState({
    old_password: "",
    new_password: "",
    new_password2: "",
  });
  const [profileMsg, setProfileMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [profileErrors, setProfileErrors] = useState({});
  const [pwErrors, setPwErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileErrors({});
    setProfileMsg(null);
    try {
      const { data } = await authAPI.updateProfile(profileForm);
      updateUser(data);
      setProfileMsg({ type: "success", text: "Profile updated successfully!" });
    } catch (err) {
      setProfileErrors(err.response?.data || {});
      setProfileMsg({ type: "error", text: "Failed to update profile." });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.new_password2) {
      setPwErrors({ new_password2: "Passwords do not match" });
      return;
    }
    setSaving(true);
    setPwErrors({});
    setPwMsg(null);
    try {
      await authAPI.changePassword(pwForm);
      setPwMsg({ type: "success", text: "Password changed successfully!" });
      setPwForm({ old_password: "", new_password: "", new_password2: "" });
    } catch (err) {
      setPwErrors(err.response?.data || {});
      setPwMsg({ type: "error", text: "Failed to change password." });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    try {
      await authAPI.deleteAccount();
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      navigate("/login");
    } catch {
      alert("Failed to delete account");
    }
  };

  const fieldError = (errors, key) =>
    errors[key] && (
      <span className="field-error">
        {Array.isArray(errors[key]) ? errors[key][0] : errors[key]}
      </span>
    );

  const initials = user
    ? (user.first_name?.[0] || user.username?.[0] || "?").toUpperCase()
    : "?";

  const navItems = [
    { key: "docs", icon: "📃", label: "Docs" },
    { key: "profile", icon: "👤", label: "Profile" },
    { key: "security", icon: "🔒", label: "Security" },
    { key: "danger", icon: "🗑️", label: "Danger" },
  ];

  return (
    <div className="dashboard">
      {/* Top Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <span className="navbar-logo">⬡</span>
          <span className="navbar-brand">OpenScribe</span>
        </div>

        <div className="navbar-center">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${tab === item.key ? "active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="navbar-right">
          <div className="user-menu" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <span className="user-name">
                {user?.full_name || user?.username}
              </span>
            </div>
            <span className="chevron">{menuOpen ? "▲" : "▼"}</span>
          </div>

          {menuOpen && (
            <div className="dropdown">
              <div className="dropdown-header">
                <div className="avatar avatar-lg">{initials}</div>
                <div>
                  <div className="dropdown-name">
                    {user?.full_name || user?.username}
                  </div>
                  <div className="dropdown-email">{user?.email}</div>
                </div>
              </div>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item"
                onClick={() => {
                  setTab("profile");
                  setMenuOpen(false);
                }}
              >
                👤 Profile Settings
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  setTab("security");
                  setMenuOpen(false);
                }}
              >
                🔒 Security
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleLogout}>
                → Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {tab === "docs" && <Document />}

        {tab === "profile" && (
          <section className="tab-panel">
            <div className="panel-header">
              <h2>Profile Settings</h2>
              <p>Manage your personal information</p>
            </div>
            {profileMsg && (
              <div className={`msg-banner msg-${profileMsg.type}`}>
                {profileMsg.text}
              </div>
            )}
            <form onSubmit={saveProfile} className="settings-form">
              <div className="field-row">
                <div className="field">
                  <label>First Name</label>
                  <input
                    value={profileForm.first_name}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        first_name: e.target.value,
                      })
                    }
                    placeholder="John"
                  />
                  {fieldError(profileErrors, "first_name")}
                </div>
                <div className="field">
                  <label>Last Name</label>
                  <input
                    value={profileForm.last_name}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        last_name: e.target.value,
                      })
                    }
                    placeholder="Doe"
                  />
                  {fieldError(profileErrors, "last_name")}
                </div>
              </div>
              <div className="field">
                <label>Username</label>
                <input
                  value={profileForm.username}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, username: e.target.value })
                  }
                  placeholder="johndoe"
                />
                {fieldError(profileErrors, "username")}
              </div>
              <div className="field">
                <label>Bio</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, bio: e.target.value })
                  }
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
                {fieldError(profileErrors, "bio")}
              </div>
              <div className="field readonly">
                <label>
                  Email <span className="badge">Cannot be changed</span>
                </label>
                <input value={user?.email} disabled />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner-sm" /> : "Save Changes"}
              </button>
            </form>
          </section>
        )}

        {tab === "security" && (
          <section className="tab-panel">
            <div className="panel-header">
              <h2>Security</h2>
              <p>Update your password</p>
            </div>
            {pwMsg && (
              <div className={`msg-banner msg-${pwMsg.type}`}>{pwMsg.text}</div>
            )}
            <form onSubmit={changePassword} className="settings-form">
              <div className="field">
                <label>Current Password</label>
                <input
                  type="password"
                  value={pwForm.old_password}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, old_password: e.target.value })
                  }
                  placeholder="••••••••"
                  required
                />
                {fieldError(pwErrors, "old_password")}
              </div>
              <div className="field-row">
                <div className="field">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={pwForm.new_password}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, new_password: e.target.value })
                    }
                    placeholder="••••••••"
                    required
                  />
                  {fieldError(pwErrors, "new_password")}
                </div>
                <div className="field">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={pwForm.new_password2}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, new_password2: e.target.value })
                    }
                    placeholder="••••••••"
                    required
                  />
                  {fieldError(pwErrors, "new_password2")}
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner-sm" /> : "Change Password"}
              </button>
            </form>
          </section>
        )}

        {tab === "danger" && (
          <section className="tab-panel">
            <div className="panel-header">
              <h2>Danger Zone</h2>
              <p>Irreversible and destructive actions</p>
            </div>
            <div className="danger-card">
              <div>
                <h3>Delete Account</h3>
                <p>
                  Once deleted, all your data will be permanently removed. This
                  action cannot be undone.
                </p>
              </div>
              {!showDeleteConfirm ? (
                <button
                  className="btn-danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Account
                </button>
              ) : (
                <div className="confirm-box">
                  <p>Are you absolutely sure?</p>
                  <div className="confirm-actions">
                    <button className="btn-danger" onClick={deleteAccount}>
                      Yes, Delete
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {menuOpen && (
        <div className="dropdown-overlay" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  );
}
