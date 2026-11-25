import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getApiError } from '../services/api';
import Button from '../components/ui/Button';

const DEMO_ACCOUNTS = [
  { label: 'Administrator', email: 'admin@sagex3desk.com', role: 'Full Control' },
  { label: 'Team Lead', email: 'ananya.rao@sagex3desk.com', role: 'Approvals & SLA' },
  { label: '4GL Developer', email: 'rohan.k@sagex3desk.com', role: 'Tasks & Time Logs' },
];

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const { login, register: registerUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: { email: '', password: '', fullName: '', designation: 'Sage X3 Developer' },
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(values.email, values.password);
        addToast('Welcome back to Sage X3 Desk');
      } else {
        await registerUser(values);
        addToast('Account created successfully');
      }
      navigate('/');
    } catch (err) {
      addToast(getApiError(err, 'Authentication failed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (email) => {
    setMode('login');
    setValue('email', email);
    setValue('password', 'Password@123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-base shadow-sm">
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
              onClick={() => setMode('login')}
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
              onClick={() => setMode('register')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Register Team Member
            </button>
          </div>

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
                  type="password"
                  {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In to Workspace' : 'Create Account'}
            </Button>
          </form>

          {/* Quick Demo Role Switcher */}
          <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Quick Demo Credentials (Password: <code className="font-mono">Password@123</code>)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc.email)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
                >
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {acc.label}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{acc.role}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
