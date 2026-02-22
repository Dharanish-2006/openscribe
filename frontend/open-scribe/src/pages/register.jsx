import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '', username: '', first_name: '', last_name: '', password: '', password2: ''
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})
    if (form.password !== form.password2) {
      setErrors({ password2: 'Passwords do not match' })
      return
    }
    setLoading(true)
    try {
      await register(form)
      navigate('/dashboard')
    } catch (err) {
      setErrors(err.response?.data || { general: 'Registration failed' })
    } finally {
      setLoading(false)
    }
  }

  const fieldError = (key) => errors[key] && (
    <span className="field-error">{Array.isArray(errors[key]) ? errors[key][0] : errors[key]}</span>
  )

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-header">
          <div className="logo-mark">⬡</div>
          <h1>Create account</h1>
          <p>Join us today</p>
        </div>

        {errors.general && <div className="error-banner">{errors.general}</div>}

        <form onSubmit={submit} className="auth-form">
          <div className="field-row">
            <div className="field">
              <label>First Name</label>
              <input name="first_name" value={form.first_name} onChange={handle} placeholder="John" />
              {fieldError('first_name')}
            </div>
            <div className="field">
              <label>Last Name</label>
              <input name="last_name" value={form.last_name} onChange={handle} placeholder="Doe" />
              {fieldError('last_name')}
            </div>
          </div>

          <div className="field">
            <label>Email <span className="required">*</span></label>
            <input type="email" name="email" value={form.email} onChange={handle} placeholder="you@example.com" required />
            {fieldError('email')}
          </div>

          <div className="field">
            <label>Username <span className="required">*</span></label>
            <input name="username" value={form.username} onChange={handle} placeholder="johndoe" required />
            {fieldError('username')}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Password <span className="required">*</span></label>
              <input type="password" name="password" value={form.password} onChange={handle} placeholder="••••••••" required />
              {fieldError('password')}
            </div>
            <div className="field">
              <label>Confirm Password <span className="required">*</span></label>
              <input type="password" name="password2" value={form.password2} onChange={handle} placeholder="••••••••" required />
              {fieldError('password2')}
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner-sm" /> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}