import { useEffect, useState } from 'react';
import api from '../api';
import { formatServerDate } from '../utils/datetime';
import { getApiErrorMessage, showErrorToast } from '../utils/toast';

const Stars = ({ score, small = false }) => (
  <div className={`flex items-center gap-0.5 ${small ? 'text-sm' : 'text-lg'}`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <span key={star} className={star <= score ? 'text-[#c8f135]' : 'text-gray-600'}>
        ★
      </span>
    ))}
  </div>
);

export default function UserReviewsModal({ open, onClose, userId, title = 'Reviews' }) {
  const [summary, setSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPage(1);
      return;
    }
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [summaryRes, reviewsRes] = await Promise.all([
          api.get(`/rides/users/${userId}/reviews/summary`),
          api.get(`/rides/users/${userId}/reviews`, { params: { page, limit: 5 } }),
        ]);
        setSummary(summaryRes.data.summary || { averageRating: 0, totalReviews: 0 });
        setReviews(reviewsRes.data.reviews || []);
        setTotalPages(reviewsRes.data.totalPages || 1);
      } catch (err) {
        showErrorToast(getApiErrorMessage(err, 'Failed to load reviews.'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, userId, page]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#16181f] border border-[#2a2d3a] rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#2a2d3a]">
          <div>
            <h3 className="text-xl font-bold">{title}</h3>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
              <Stars score={Math.round(summary.averageRating || 0)} />
              <span>{summary.averageRating || 0} / 5</span>
              <span>•</span>
              <span>{summary.totalReviews} review{summary.totalReviews === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="text-gray-500 text-sm text-center py-12">Loading reviews...</div>
          ) : reviews.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-12">No reviews yet.</div>
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
                      <Stars score={review.score} small />
                      <div className="text-xs text-gray-500 mt-1">{formatServerDate(review.created_at)}</div>
                    </div>
                  </div>
                  {review.review_text && (
                    <p className="text-sm text-gray-300 mt-3 leading-relaxed">{review.review_text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {summary.totalReviews > 5 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#2a2d3a]">
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40">
                Previous
              </button>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
