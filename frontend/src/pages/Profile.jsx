import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { authAPI } from '../api';
import api from '../api';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';
import { formatServerDate } from '../utils/datetime';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [reviews, setReviews] = useState([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [loadingReviews, setLoadingReviews] = useState(false);
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

  useEffect(() => {
    if (!user?.id) return;

    const loadReviews = async () => {
      setLoadingReviews(true);
      try {
        const [summaryRes, reviewsRes] = await Promise.all([
          api.get(`/rides/users/${user.id}/reviews/summary`),
          api.get(`/rides/users/${user.id}/reviews`, { params: { page: reviewsPage, limit: 5 } }),
        ]);
        setReviewSummary(summaryRes.data.summary || { averageRating: 0, totalReviews: 0 });
        setReviews(reviewsRes.data.reviews || []);
        setReviewsTotalPages(reviewsRes.data.totalPages || 1);
      } catch (err) {
        showErrorToast(getApiErrorMessage(err, 'Failed to load your reviews.'));
      } finally {
        setLoadingReviews(false);
      }
    };

    loadReviews();
  }, [user?.id, reviewsPage]);

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

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    if (savingPassword) return;

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showErrorToast('Fill in all password fields.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      showErrorToast('New password must be at least 6 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showErrorToast('New password and confirm password do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await authAPI.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showSuccessToast('Password updated successfully.');
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Failed to update password.'));
    } finally {
      setSavingPassword(false);
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

        <div className="space-y-6">
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

        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Change Password</h2>
            <p className="text-gray-500 text-sm mt-1">
              Use your current password to set a new one.
            </p>
          </div>

          <form onSubmit={onPasswordSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Current password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
                placeholder="Enter current password"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">New password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Confirm password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135]"
                  placeholder="Re-enter new password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="bg-[#c8f135] text-[#0e0f13] px-5 py-3 rounded-xl font-bold disabled:opacity-60">
              {savingPassword ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>

        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold">Your Ratings & Reviews</h2>
              <p className="text-gray-500 text-sm mt-1">See how other users rated their ride experience with you.</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[#c8f135]">{reviewSummary.averageRating || 0}</div>
              <div className="text-xs text-gray-500">{reviewSummary.totalReviews} review{reviewSummary.totalReviews === 1 ? '' : 's'}</div>
            </div>
          </div>

          {loadingReviews ? (
            <div className="text-gray-500 text-sm py-8 text-center">Loading reviews...</div>
          ) : reviews.length === 0 ? (
            <div className="text-gray-500 text-sm py-8 text-center">No reviews yet.</div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">{review.from_user_name}</div>
                      <div className="text-xs text-gray-500 capitalize mt-0.5">{review.from_user_role}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#c8f135] text-sm">{'★'.repeat(review.score)}<span className="text-gray-600">{'★'.repeat(5 - review.score)}</span></div>
                      <div className="text-xs text-gray-500 mt-1">{formatServerDate(review.created_at)}</div>
                    </div>
                  </div>
                  {review.review_text && (
                    <p className="text-sm text-gray-300 mt-3">{review.review_text}</p>
                  )}
                </div>
              ))}

              {reviewSummary.totalReviews > 5 && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-xs text-gray-500">Page {reviewsPage} of {reviewsTotalPages}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setReviewsPage((page) => Math.max(1, page - 1))}
                      disabled={reviewsPage === 1}
                      className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40">
                      Previous
                    </button>
                    <button
                      onClick={() => setReviewsPage((page) => Math.min(reviewsTotalPages, page + 1))}
                      disabled={reviewsPage === reviewsTotalPages}
                      className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
