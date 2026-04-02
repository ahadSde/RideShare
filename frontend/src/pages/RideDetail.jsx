import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import useAuth from '../context/useAuth';
import api from '../api';
import { calculateFare } from '../utils/fare';

export default function RideDetail() {
  const { rideId } = useParams();
  const { state }  = useLocation();
  const location   = useLocation();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const rideFromState = state?.ride;
  const pickup        = state?.pickup;
  const drop          = state?.drop;
  const riderDist     = state?.riderDist || 0;

  const [ride,       setRide]       = useState(rideFromState || null);
  const [comments,   setComments]   = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo,    setReplyTo]    = useState(null);
  const [replyText,  setReplyText]  = useState('');
  const [posting,    setPosting]    = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested,  setRequested]  = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  // Determine if this is driver view
  // true if: URL has /comments OR user is a driver OR explicitly passed
  const isDriverView = !!(
    state?.isDriverView ||
    location.pathname.includes('/comments') ||
    user?.role === 'driver'
  );

  useEffect(() => {
    fetchComments();
    if (!rideFromState) fetchRide();
  }, [rideId]);

  const fetchRide = async () => {
    try {
      const res = await api.get(`/rides/${rideId}`);
      setRide(res.data.ride);
    } catch (err) {
      console.error('Failed to fetch ride:', err.message);
    }
  };

  const fetchComments = async () => {
    try {
      const res = await api.get(`/rides/${rideId}/comments`);
      setComments(res.data.comments || []);
    } catch {}
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await api.post(`/rides/${rideId}/comments`, { message: newComment });
      setNewComment('');
      await fetchComments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post');
    }
    setPosting(false);
  };

  const postReply = async (commentId) => {
    if (!replyText.trim()) return;
    setPosting(true);
    try {
      await api.post(`/rides/${rideId}/comments/${commentId}/reply`, { message: replyText });
      setReplyTo(null);
      setReplyText('');
      await fetchComments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reply');
    }
    setPosting(false);
  };

  const requestSeat = async () => {
    if (!pickup || !drop) return;
    setRequesting(true);
    setError('');
    try {
      await api.post(`/rides/${rideId}/request`, {
        pickupName: pickup.name,
        dropName:   drop.name,
        pickupLat:  pickup.lat,
        pickupLng:  pickup.lng,
        dropLat:    drop.lat,
        dropLng:    drop.lng,
        distanceKm: riderDist,
      });
      setSuccess("✅ Seat requested! Waiting for driver approval. You'll be notified via email.");
      setRequested(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request seat');
    }
    setRequesting(false);
  };

  // Only calculate fare for rider
  const pricePerKm = parseFloat(ride?.price_per_km || 0);
  const fareBreakdown = !isDriverView
    ? calculateFare(riderDist, pricePerKm)
    : { baseFare: 0, platformFee: 1, totalFare: 0 };
  const fareAmount = fareBreakdown.totalFare;

  const formatDateTime = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(date).toLocaleDateString('en-IN');
  };

  if (!ride) return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-gray-400 animate-pulse mb-4">Loading ride...</div>
        <button onClick={() => navigate(-1)} className="text-[#c8f135] text-sm">← Go back</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-3 border-b border-[#2a2d3a] sticky top-0 bg-[#0e0f13] z-50">
        <button onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white text-sm transition-all">
          ← Back
        </button>
        <div className="text-lg font-extrabold">Ride<span className="text-[#c8f135]">Share</span></div>
        {isDriverView ? (
          <button onClick={() => navigate(`/ride/${rideId}/requests`)}
            className="text-xs bg-[#c8f135] text-[#0e0f13] font-bold px-3 py-1.5 rounded-lg">
            👥 Requests
          </button>
        ) : (
          <button onClick={() => navigate('/dashboard')}
            className="text-xs border border-[#2a2d3a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-all">
            Dashboard
          </button>
        )}
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Ride Info Card */}
        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {ride.from_name?.split(',')[0]} → {ride.to_name?.split(',')[0]}
            </h2>
            {/* Show fare only for riders */}
            {!isDriverView && fareAmount > 0 && (
              <span className="text-[#c8f135] text-2xl font-bold">₹{fareAmount}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#0e0f13] rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">📍 From</div>
              <div className="text-sm font-medium">{ride.from_name?.split(',')[0]}</div>
            </div>
            <div className="bg-[#0e0f13] rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">🏁 To</div>
              <div className="text-sm font-medium">{ride.to_name?.split(',')[0]}</div>
            </div>
            <div className="bg-[#0e0f13] rounded-xl p-3 col-span-2">
              <div className="text-xs text-gray-500 mb-1">📅 Departure</div>
              <div className="text-sm font-medium">{formatDateTime(ride.departure_time)}</div>
            </div>
            <div className="bg-[#0e0f13] rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">💺 Seats left</div>
              <div className="text-sm font-medium">{ride.seats_available}</div>
            </div>
            <div className="bg-[#0e0f13] rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">⛽ Fare rate</div>
              <div className="text-sm font-medium">₹{ride.price_per_km}/km</div>
            </div>

            {/* Rider sees their trip distance only */}
            {!isDriverView && riderDist > 0 && (
              <div className="bg-[#0e0f13] rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">📏 Your distance</div>
                <div className="text-sm font-medium">{riderDist} km</div>
              </div>
            )}

            {/* Driver sees full route distance only */}
            {isDriverView && ride.distance_km && (
              <div className="bg-[#0e0f13] rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">📏 Route distance</div>
                <div className="text-sm font-medium">{ride.distance_km} km</div>
              </div>
            )}
          </div>

          {/* Driver note */}
          {ride.description && (
            <div className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl p-4 mb-4">
              <div className="text-xs text-gray-500 mb-1">📝 Driver's note</div>
              <p className="text-sm text-gray-300">{ride.description}</p>
            </div>
          )}

          {/* Fare breakdown — RIDER ONLY */}
          {!isDriverView && riderDist > 0 && fareAmount > 0 && (
            <div className="bg-[#c8f135]/05 border border-[#c8f135]/15 rounded-xl p-4 mb-5">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">
                  Distance fare ({riderDist} km × ₹{pricePerKm})
                </span>
                <span>₹{fareBreakdown.baseFare}</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-gray-400">Platform fee</span>
                <span>₹{fareBreakdown.platformFee}</span>
              </div>
              <div className="flex justify-between border-t border-[#c8f135]/15 pt-3">
                <span className="font-semibold">You'll pay (after approval)</span>
                <span className="text-[#c8f135] text-xl font-bold">₹{fareAmount}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2 mb-4">
              {error}
            </p>
          )}

          {/* Success + dashboard link */}
          {success && (
            <div className="bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-3 mb-4">
              <p className="text-green-400 text-sm mb-2">{success}</p>
              {/* <button onClick={() => navigate('/dashboard')}
                className="text-[#c8f135] text-sm font-medium hover:underline">
                → Go to Dashboard to track your booking
              </button> */}
            </div>
          )}

          {/* Request button — RIDER ONLY */}
          {!isDriverView && !requested && (
            <>
              <button onClick={requestSeat} disabled={requesting}
                className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all disabled:opacity-50">
                {requesting ? 'Requesting...' : '🙋 Request a Seat'}
              </button>
              <p className="text-center text-gray-600 text-xs mt-2">
                Driver will approve your request. You'll have 15 min to pay after approval.
              </p>
            </>
          )}

          {/* After requesting — go to dashboard */}
          {!isDriverView && requested && (
            <button onClick={() => navigate('/dashboard')}
              className="w-full border border-[#c8f135] text-[#c8f135] font-bold py-3.5 rounded-xl hover:bg-[#c8f135]/10 transition-all">
              → Go to Dashboard
            </button>
          )}
        </div>

        {/* Comments Section */}
        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
          <h3 className="font-semibold mb-1">Questions & Answers</h3>
          <p className="text-gray-500 text-xs mb-5">Public Q&A — all riders can see this</p>

          <div className="flex gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c8f135] to-blue-500 flex items-center justify-center text-[#0e0f13] font-bold text-xs flex-shrink-0">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder={isDriverView
                  ? 'Post an announcement for riders...'
                  : 'Ask a question about this ride...'}
                rows={2}
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none resize-none"
              />
              <button onClick={postComment} disabled={posting || !newComment.trim()}
                className="mt-2 bg-[#c8f135] text-[#0e0f13] font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-40">
                {posting ? 'Posting...' : isDriverView ? 'Post Note' : 'Post Question'}
              </button>
            </div>
          </div>

          {comments.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">
              {isDriverView ? 'No questions from riders yet.' : 'No questions yet. Be the first to ask!'}
            </p>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="border-b border-[#2a2d3a] pb-4 last:border-0">
                  <div className="flex gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      comment.user_role === 'driver' ? 'bg-[#c8f135] text-[#0e0f13]' : 'bg-[#2a2d3a] text-white'
                    }`}>
                      {comment.user_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{comment.user_name}</span>
                        {comment.user_role === 'driver' && (
                          <span className="text-xs bg-[#c8f135]/10 text-[#c8f135] border border-[#c8f135]/20 px-2 py-0.5 rounded-full">Driver</span>
                        )}
                        <span className="text-xs text-gray-600">{timeAgo(comment.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-300">{comment.message}</p>
                      <button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                        className="text-xs text-gray-500 hover:text-[#c8f135] mt-1 transition-all">
                        {replyTo === comment.id ? 'Cancel' : 'Reply'}
                      </button>
                    </div>
                  </div>

                  {replyTo === comment.id && (
                    <div className="ml-11 mt-3 flex gap-2">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder="Write a reply..."
                        className="flex-1 bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
                      <button onClick={() => postReply(comment.id)} disabled={posting || !replyText.trim()}
                        className="bg-[#c8f135] text-[#0e0f13] font-bold text-sm px-3 py-2 rounded-lg disabled:opacity-40">
                        Reply
                      </button>
                    </div>
                  )}

                  {comment.replies?.length > 0 && (
                    <div className="ml-11 mt-3 space-y-3">
                      {comment.replies.map(reply => (
                        <div key={reply.id} className="flex gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            reply.user_role === 'driver' ? 'bg-[#c8f135] text-[#0e0f13]' : 'bg-[#2a2d3a] text-white'
                          }`}>
                            {reply.user_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium">{reply.user_name}</span>
                              {reply.user_role === 'driver' && (
                                <span className="text-xs bg-[#c8f135]/10 text-[#c8f135] border border-[#c8f135]/20 px-2 py-0.5 rounded-full">Driver</span>
                              )}
                              <span className="text-xs text-gray-600">{timeAgo(reply.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-300">{reply.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
