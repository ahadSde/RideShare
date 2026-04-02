import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { parseServerDate } from '../utils/datetime';

export default function DriverRequests() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => { fetchRequests(); }, [rideId]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const [reqRes, rideRes] = await Promise.all([
        api.get(`/rides/${rideId}/requests`),
        api.get(`/rides/${rideId}`),
      ]);
      setRequests(reqRes.data.requests || []);
      setRide(rideRes.data.ride);
    } catch (err) {
      // If ride detail endpoint not available, just fetch requests
      try {
        const res = await api.get(`/rides/${rideId}/requests`);
        setRequests(res.data.requests || []);
      } catch {}
    }
    setLoading(false);
  };

  const approve = async (bookingId) => {
    setProcessing(bookingId);
    try {
      await api.patch(`/rides/${rideId}/requests/${bookingId}/approve`);
      await fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve');
    }
    setProcessing(null);
  };

  const reject = async (bookingId) => {
    setProcessing(bookingId);
    try {
      await api.patch(`/rides/${rideId}/requests/${bookingId}/reject`);
      await fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject');
    }
    setProcessing(null);
  };

  const statusColor = (s) => ({
    requested:       'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    approved:        'bg-[#c8f135]/10 text-[#c8f135] border border-[#c8f135]/20',
    payment_pending: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    confirmed:       'bg-green-500/10 text-green-400 border border-green-500/20',
    expired:         'bg-gray-500/10 text-gray-400 border border-gray-500/20',
    rejected:        'bg-red-500/10 text-red-400 border border-red-500/20',
  }[s] || 'bg-gray-500/10 text-gray-400');

  const timeLeft = (deadline) => {
    const parsedDeadline = parseServerDate(deadline);
    if (!parsedDeadline) return null;
    const diff = parsedDeadline.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s left`;
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white">
      <nav className="flex items-center justify-between px-6 py-3 border-b border-[#2a2d3a] sticky top-0 bg-[#0e0f13] z-50">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">← Dashboard</button>
        <div className="text-lg font-extrabold">Ride<span className="text-[#c8f135]">Share</span></div>
        <div/>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-1">Seat Requests</h2>
          <p className="text-gray-500 text-sm">Review and approve riders for your ride</p>
        </div>

        {loading ? (
          <div className="text-gray-500 text-center py-12">Loading requests...</div>
        ) : requests.length === 0 ? (
          <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">🙋</div>
            <p className="text-gray-500 text-sm">No requests yet for this ride.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req, i) => (
              <div key={req.id} className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold text-sm">
                      {req.rider_name?.[0]?.toUpperCase() || (i + 1)}
                    </div>
                    <div>
                      <div className="font-medium">{req.rider_name || `Rider ${i + 1}`}</div>
                      <div className="text-gray-500 text-xs">{req.rider_phone || 'No phone'}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusColor(req.status)}`}>
                    {req.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#0e0f13] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Pickup</div>
                    <div className="text-sm font-medium">{req.pickup_name?.split(',')[0]}</div>
                  </div>
                  <div className="bg-[#0e0f13] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Drop</div>
                    <div className="text-sm font-medium">{req.drop_name?.split(',')[0]}</div>
                  </div>
                  <div className="bg-[#0e0f13] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Distance</div>
                    <div className="text-sm font-medium">{req.distance_km} km</div>
                  </div>
                  <div className="bg-[#0e0f13] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-1">Fare</div>
                    <div className="text-sm font-bold text-[#c8f135]">₹{req.fare_amount}</div>
                  </div>
                </div>

                {/* Payment deadline timer */}
                {req.status === 'approved' && req.payment_deadline && (
                  <div className="bg-[#c8f135]/10 border border-[#c8f135]/20 rounded-xl px-4 py-2 mb-4 text-sm text-[#c8f135]">
                    ⏰ Payment deadline: {timeLeft(req.payment_deadline)}
                  </div>
                )}

                {/* Action buttons — only for pending requests */}
                {req.status === 'requested' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => approve(req.id)}
                      disabled={processing === req.id}
                      className="flex-1 bg-[#c8f135] text-[#0e0f13] font-bold py-2.5 rounded-xl text-sm hover:shadow-[0_0_16px_rgba(200,241,53,0.3)] transition-all disabled:opacity-50">
                      {processing === req.id ? 'Processing...' : '✅ Approve'}
                    </button>
                    <button
                      onClick={() => reject(req.id)}
                      disabled={processing === req.id}
                      className="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 font-bold py-2.5 rounded-xl text-sm hover:bg-red-500/20 transition-all disabled:opacity-50">
                      ❌ Reject
                    </button>
                  </div>
                )}

                {req.status === 'confirmed' && (
                  <div className="text-center text-green-400 text-sm font-medium py-2">
                    ✅ Payment confirmed — seat booked!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
