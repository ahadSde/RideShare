import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';
import { formatServerDate } from '../utils/datetime';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const isValidPhone = (value) => {
    if (!value.trim()) return true;
    const digits = value.replace(/\D/g, '');
    return (
      digits.length === 10 && /^[6-9]/.test(digits)
    ) || (
      digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))
    );
  };

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      phone: user.phone || '',
    });
  }, [user]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!isValidPhone(form.phone)) {
      showErrorToast('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
      });
      showSuccessToast('Profile updated successfully.');
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#2a2d3a] bg-[#0e0f13]/95 backdrop-blur sticky top-0 z-50">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
          ← Dashboard
        </button>
        <div className="text-xl font-extrabold">Ride<span className="text-[#c8f135]">Share</span></div>
        <div className="w-9" />
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-10 grid md:grid-cols-[280px_1fr] gap-6">
        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6 h-fit">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c8f135] to-blue-500 flex items-center justify-center font-bold text-[#0e0f13] text-3xl mb-4">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-gray-500 text-sm mt-1 capitalize">{user.role}</p>

          <div className="mt-6 space-y-3 text-sm">
            <div className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3">
              <div className="text-gray-500 text-xs mb-1">Email</div>
              <div>{user.email}</div>
            </div>
            <div className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3">
              <div className="text-gray-500 text-xs mb-1">Joined</div>
              <div>{formatServerDate(user.created_at)}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Edit Profile</h2>
            <p className="text-gray-500 text-sm mt-1">
              Update your basic details.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Full name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                inputMode="tel"
                maxLength={14}
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
                placeholder="10-digit phone number"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Email</label>
                <input
                  value={user.email || ''}
                  disabled
                  className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Role</label>
                <input
                  value={user.role || ''}
                  disabled
                  className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#c8f135] text-[#0e0f13] px-5 py-3 rounded-xl font-bold disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="border border-[#2a2d3a] px-5 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#c8f135] transition-all">
                Back to dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
