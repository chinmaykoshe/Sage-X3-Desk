import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Mail, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import api, { getApiError, setStoredToken } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { login } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  // Phase: 'request' | 'submitted' | 'reset' | 'done'
  const [phase, setPhase] = useState(token ? 'reset' : 'request');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRequest = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email, reason });
      setPhase('submitted');
    } catch (err) {
      addToast(getApiError(err, 'Failed to submit request'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match', 'error');
      return;
    }
    if (code.length !== 4) {
      addToast('Please enter the 4-digit code from your email', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { token, code, newPassword });
      addToast('Password reset successfully! Logging you in…', 'success');
      setPhase('done');
      // Auto login with returned token
      if (res.data?.data?.token) {
        setStoredToken(res.data.data.token, true);
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } else {
        setTimeout(() => navigate('/login'), 1200);
      }
    } catch (err) {
      addToast(getApiError(err, 'Reset failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-5">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#171717] text-[#C6F36B] font-extrabold text-lg tracking-tight shadow-sm">
            X3
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sage X3 Desk
          </h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Phase: request ─────────────────────────────────────────────── */}
          {phase === 'request' && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                  <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Forgot Password?</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Enter your work email to receive a password reset link and 4-digit code</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@sagex3desk.com"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Forgot my password"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending Link…' : 'Send Reset Link & Code'}
              </Button>
              <div className="text-center pt-1">
                <Link to="/login" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}

          {/* Phase: submitted ───────────────────────────────────────────── */}
          {phase === 'submitted' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Check Your Email</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A password reset link and a 4-digit verification code have been sent directly to <strong>{email}</strong>.
                Click the link in the email and enter your 4-digit code to set your new password.
              </p>
              <div className="pt-2">
                <Link to="/login" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            </div>
          )}

          {/* Phase: reset (token present) ───────────────────────────────── */}
          {phase === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                  <Lock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Set New Password</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Enter the 4-digit code from your email and your new password</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">4-Digit Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xl font-bold tracking-widest dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </form>
          )}

          {/* Phase: done ────────────────────────────────────────────────── */}
          {phase === 'done' && (
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Password Reset!</p>
              <p className="text-xs text-slate-500">Logging you in…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
