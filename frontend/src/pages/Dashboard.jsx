import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { rideAPI } from '../api';
import { formatServerDate, parseServerDate } from '../utils/datetime';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const filteredRides = rides.filter(ride => {
    if (user?.role === 'driver') {
      if (showAll) return true;
      return ['active', 'in_progress'].includes(ride.status);
    } else {
      if (showAll) return true;
      // For rider — show open bookings only while the ride itself is current.
      const isOpenBooking = ['requested', 'approved', 'payment_pending', 'confirmed'].includes(ride.status);
      const isCurrentRide = ['active', 'in_progress'].includes(ride.ride_status);
      const isRecentlyRejected = ['rejected', 'expired'].includes(ride.status) &&
        (() => {
          const createdAt = parseServerDate(ride.created_at);
          return createdAt && (Date.now() - createdAt.getTime()) < 24 * 60 * 60 * 1000;
        })();
      return (isOpenBooking && isCurrentRide) || isRecentlyRejected;
    }
  });

  const totalPages = Math.max(1, Math.ceil(filteredRides.length / pageSize));
  const paginatedRides = filteredRides.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [showAll, user?.role]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const loadRides = () => {
      rideAPI.my()
        .then(res => setRides(res.data.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    loadRides();
    const interval = setInterval(loadRides, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (s) => ({
    active:      'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    in_progress: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    completed:   'bg-green-500/10 text-green-400 border border-green-500/20',
    cancelled:   'bg-red-500/10 text-red-400 border border-red-500/20',
    pending:     'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    confirmed:   'bg-green-500/10 text-green-400 border border-green-500/20',
  }[s] || 'bg-gray-500/10 text-gray-400');

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#2a2d3a] bg-[#0e0f13]/95 backdrop-blur sticky top-0 z-50">
        <div className="text-xl font-extrabold">Ride<span className="text-[#c8f135]">Share</span></div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="border border-[#2a2d3a] text-white px-4 py-2 rounded-lg text-sm hover:border-[#c8f135] hover:text-[#c8f135] transition-all">
            Profile
          </button>
          {user?.role === 'rider' && (
            <button onClick={() => navigate('/search')}
              className="border border-[#2a2d3a] text-white px-4 py-2 rounded-lg text-sm hover:border-[#c8f135] hover:text-[#c8f135] transition-all">
              Find a Ride
            </button>
          )}
          {user?.role === 'driver' && (
            <button onClick={() => navigate('/post-ride')}
              className="bg-[#c8f135] text-[#0e0f13] px-4 py-2 rounded-lg text-sm font-bold hover:shadow-[0_0_16px_rgba(200,241,53,0.3)] transition-all">
              + Post Ride
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#c8f135] to-blue-500 flex items-center justify-center font-bold text-[#0e0f13] text-sm">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <button onClick={handleLogout} className="text-gray-500 text-sm hover:text-red-400 transition-all">Logout</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Good day, <span className="text-[#c8f135]">{user?.name?.split(' ')[0]}</span> 👋</h1>
          <p className="text-gray-500 mt-1 text-sm capitalize">{user?.role} account · {user?.email}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: '🚗', label: user?.role === 'driver' ? 'Rides Posted' : 'Rides Booked', value: rides.length },
            { icon: '⭐', label: 'Rating', value: '4.9' },
            { icon: '🌿', label: 'CO₂ Saved', value: `${rides.length * 6} kg` },
          ].map((s, i) => (
            <div key={i} className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
              <div className="text-2xl mb-3">{s.icon}</div>
              <div className="text-3xl font-bold text-[#c8f135] mb-1">{s.value}</div>
              <div className="text-gray-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Rides list */}
        <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              {user?.role === 'driver' ? 'Your Rides' : (showAll ? 'Your Booking History' : 'Upcoming Bookings')}
            </h2>
            <div className="flex items-center gap-3">
              {(user?.role === 'driver' || user?.role === 'rider') && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showAll ? 'border-[#c8f135] text-[#c8f135]' : 'border-[#2a2d3a] text-gray-500'}`}>
                  {user?.role === 'driver'
                    ? (showAll ? 'All rides' : 'Active only')
                    : (showAll ? 'All bookings' : 'Current only')}
                </button>
              )}
              <button
                onClick={() => navigate(user?.role === 'driver' ? '/post-ride' : '/search')}
                className="text-[#c8f135] text-sm">
                {user?.role === 'driver' ? '+ Post new' : 'Find a ride →'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>
          ) : filteredRides.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🚗</div>
              <p className="text-gray-500 text-sm">
                {user?.role === 'driver'
                  ? 'No rides posted yet.'
                  : (showAll ? 'No booking history yet.' : 'No current bookings right now.')}
              </p>
              <button
                onClick={() => navigate(user?.role === 'driver' ? '/post-ride' : '/search')}
                className="mt-4 bg-[#c8f135] text-[#0e0f13] px-6 py-2 rounded-lg text-sm font-bold">
                {user?.role === 'driver' ? 'Post your first ride' : 'Find a ride'}
              </button>
            </div>
          ) : (
            <>
            <div className="divide-y divide-[#2a2d3a]">
              {paginatedRides.map((ride, i) => (
                <div key={i} className="py-4 flex items-center justify-between hover:bg-[#1e2029] rounded-xl px-3 -mx-3 transition-all">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {(user?.role === 'rider' ? ride.pickup_name : ride.from_name)?.split(',')[0]}
                      <span className="text-[#c8f135]">→</span>
                      {(user?.role === 'rider' ? ride.drop_name : ride.to_name)?.split(',')[0]}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {ride.distance_km} km ·{' '}
                      {formatServerDate(ride.departure_time || ride.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-3 py-1 rounded-full ${statusColor(ride.status)}`}>
                      {ride.status}
                    </span>
                    {user?.role === 'driver' && (
                      <>
                        <button
                          onClick={() => navigate(`/ride/${ride.id}/comments`, { state: { ride, isDriverView: true } })}
                          className="text-xs text-gray-500 hover:text-[#c8f135] border border-[#2a2d3a] px-2 py-1 rounded-lg transition-all">
                          💬 Q&A
                        </button>
                        <button
                          onClick={() => navigate(`/ride/${ride.id}/requests`)}
                          className="text-xs text-gray-500 hover:text-[#c8f135] border border-[#2a2d3a] px-2 py-1 rounded-lg transition-all">
                          👥 Requests
                        </button>
                      </>
                    )}
                    {user?.role === 'rider' && (
                      <button
                        onClick={() => navigate(`/ride/${ride.ride_id || ride.id}`, {
                          state: {
                            ride,
                            existingBookingStatus: ride.status,
                            fromBookingHistory: true,
                          },
                        })}
                        className="text-xs text-gray-500 hover:text-[#c8f135] border border-[#2a2d3a] px-2 py-1 rounded-lg transition-all">
                        💬 Q&A
                      </button>
                    )}
                    {user?.role === 'rider' && ride.status === 'approved' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/pay/${ride.id}`);
                        }}
                        className="bg-[#c8f135] text-[#0e0f13] text-xs font-bold px-3 py-1.5 rounded-lg animate-pulse">
                        ⚡ Pay Now!
                      </button>
                    )}
                    <span className="text-[#c8f135] font-bold text-sm">
                      ₹{ride.fare_amount || Math.round(ride.distance_km * ride.price_per_km)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {filteredRides.length > pageSize && (
              <div className="flex items-center justify-between pt-5 mt-5 border-t border-[#2a2d3a]">
                <p className="text-xs text-gray-500">
                  Showing {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, filteredRides.length)} of {filteredRides.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#c8f135] hover:text-white transition-all">
                    Previous
                  </button>
                  <span className="text-xs text-gray-500 px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="border border-[#2a2d3a] px-3 py-1.5 rounded-lg text-xs text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#c8f135] hover:text-white transition-all">
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
