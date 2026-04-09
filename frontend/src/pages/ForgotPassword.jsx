import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await authAPI.forgotPassword({ email });
      showSuccessToast(res.data.message);
      navigate('/');
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Failed to send reset link.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8">
        <button onClick={() => navigate('/')} className="text-gray-500 text-sm mb-6 hover:text-white">← Back to sign in</button>
        <h1 className="text-2xl font-bold mb-2">Forgot Password</h1>
        <p className="text-gray-500 text-sm mb-6">
          Enter your email and we’ll send you a reset link if an account exists.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-xl disabled:opacity-60">
            {submitting ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
}
