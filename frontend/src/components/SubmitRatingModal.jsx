import { useState } from 'react';
import api from '../api';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';

const SelectableStars = ({ score, onChange }) => (
  <div className="flex items-center gap-1 text-3xl">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        type="button"
        key={star}
        onClick={() => onChange(star)}
        className={star <= score ? 'text-[#c8f135]' : 'text-gray-600'}>
        ★
      </button>
    ))}
  </div>
);

export default function SubmitRatingModal({ open, onClose, bookingId, targetLabel, onSubmitted }) {
  const [score, setScore] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      await api.post(`/rides/bookings/${bookingId}/reviews`, { score, reviewText });
      showSuccessToast('Rating submitted successfully.');
      setScore(5);
      setReviewText('');
      onSubmitted?.();
      onClose();
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Failed to submit rating.'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#16181f] border border-[#2a2d3a] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#2a2d3a]">
          <div>
            <h3 className="text-xl font-bold">Leave a Rating</h3>
            <p className="text-sm text-gray-500 mt-1">Share your experience with {targetLabel}.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">×</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-3">Your rating</label>
            <SelectableStars score={score} onChange={setScore} />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Review (optional)</label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 outline-none focus:border-[#c8f135] resize-none"
              placeholder="Write a short review..."
            />
            <div className="text-right text-xs text-gray-600 mt-2">{reviewText.length}/500</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#c8f135] text-[#0e0f13] px-5 py-3 rounded-xl font-bold disabled:opacity-60">
              {saving ? 'Submitting...' : 'Submit rating'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-[#2a2d3a] px-5 py-3 rounded-xl text-gray-300 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
