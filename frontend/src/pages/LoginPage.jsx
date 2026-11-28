import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { getApiError, setStoredToken } from '../services/api';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('sagex3_remember') !== 'false');
  const [submitting, setSubmitting] = useState(false);
  // Email verification state (after register when mailer is active)
  const [verifyState, setVerifyState] = useState(null); // { email, code, resending, error }
  const { login, register: registerUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: localStorage.getItem('sagex3_remembered_email') || '',
      password: '',
      fullName: '',
      designation: 'Sage X3 Developer',
    },
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      if (mode === 'login') {
        localStorage.setItem('sagex3_remember', String(rememberMe));
        if (rememberMe) {
          localStorage.setItem('sagex3_remembered_email', values.email);
        } else {
          localStorage.removeItem('sagex3_remembered_email');
        }
        await login(values.email, values.password, rememberMe);
        addToast('Welcome back to Sage X3 Desk');
        navigate('/');
      } else {
        const res = await registerUser(values);
        // If mailer is active, server returns { pending: true, email }
        const data = res?.data?.data || res;
        if (data?.pending) {
          setVerifyState({ email: data.email || values.email, code: '', resending: false, error: null });
        } else {
          addToast('Account created successfully');
          navigate('/');
        }
      }
    } catch (err) {
      const errMsg = getApiError(err, 'Authentication failed');
      addToast(errMsg, 'error');
      // If server asks for email verification, automatically show OTP screen
      if (err.response?.status === 403 && /verify.*email/i.test(errMsg)) {
        setVerifyState({ email: values.email, code: '', resending: false, error: null });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!verifyState?.code || verifyState.code.length !== 4) {
      setVerifyState((v) => ({ ...v, error: 'Enter the 4-digit code from your email' }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/auth/verify-email', { email: verifyState.email, code: verifyState.code });
      const { token } = res.data?.data || {};
      if (token) {
        setStoredToken(token, true);
        window.location.href = '/';
      } else {
        navigate('/login');
      }
      addToast('Email verified — welcome to Sage X3 Desk!');
    } catch (err) {
      setVerifyState((v) => ({ ...v, error: getApiError(err, 'Invalid code') }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setVerifyState((v) => ({ ...v, resending: true, error: null }));
    try {
      await api.post('/auth/resend-verification', { email: verifyState.email });
      addToast('Verification code resent — check your inbox');
    } catch (err) {
      setVerifyState((v) => ({ ...v, error: getApiError(err, 'Could not resend code') }));
    } finally {
      setVerifyState((v) => ({ ...v, resending: false }));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#171717] text-[#C6F36B] font-extrabold text-lg tracking-tight shadow-sm">
            X3
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sage X3 Desk
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Centralized Sage X3 Team Operations, Ticketing & Deployment Platform
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => { if (!verifyState) setMode('login'); }}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { if (!verifyState) setMode('register'); }}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Register Team Member
            </button>
          </div>

          {/* Email Verification step (after register with mailer active) */}
          {verifyState ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                  <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Verify Your Email</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">We sent a 4-digit code to <strong>{verifyState.email}</strong></p>
                </div>
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                value={verifyState.code}
                onChange={(e) => setVerifyState((v) => ({ ...v, code: e.target.value.replace(/\D/g, '').slice(0, 4), error: null }))}
                placeholder="1234"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-2xl font-bold tracking-widest dark:border-slate-700 dark:bg-slate-800"
              />
              {verifyState.error && <p className="text-xs text-rose-500">{verifyState.error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Verifying OTP…' : 'Verify OTP & Create Account'}
              </Button>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <button type="button" onClick={handleResend} disabled={verifyState.resending} className="text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                  {verifyState.resending ? 'Resending…' : 'Resend code'}
                </button>
                <button type="button" onClick={() => setVerifyState(null)} className="hover:underline">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      {...register('fullName', { required: mode === 'register' ? 'Full name is required' : false })}
                      placeholder="e.g. Rohan Kulkarni"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  {errors.fullName && <p className="mt-1 text-xs text-rose-500">{errors.fullName.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Designation
                  </label>
                  <input
                    {...register('designation')}
                    placeholder="Sage X3 Developer"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  {...register('email', { required: 'Email is required' })}
                  placeholder="name@sagex3desk.com"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Remember me</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {rememberMe ? 'Stays signed in' : 'Session only'}
                </span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In to Workspace' : 'Create Account (Send OTP)'}
            </Button>

            {mode === 'login' && (
              <div className="text-center pt-1">
                <Link to="/reset-password" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
