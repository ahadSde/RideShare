import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../api';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!token) {
      showErrorToast('Reset link is invalid or missing.');
      return;
    }
    if (form.newPassword.length < 6) {
      showErrorToast('New password must be at least 6 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      showErrorToast('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.resetPassword({ token, newPassword: form.newPassword });
      showSuccessToast('Password reset successfully. Please sign in.');
      navigate('/');
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Failed to reset password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8">
        <button onClick={() => navigate('/')} className="text-gray-500 text-sm mb-6 hover:text-white">← Back to sign in</button>
        <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
        <p className="text-gray-500 text-sm mb-6">
          Set a new password for your account.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-2">New password</label>
            <input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Confirm new password</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
              placeholder="Re-enter new password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-xl disabled:opacity-60">
            {submitting ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
}
