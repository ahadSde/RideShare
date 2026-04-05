import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { rideAPI, paymentAPI } from '../api';
import { calculateFare } from '../utils/fare';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';
import { formatServerDateTime } from '../utils/datetime';

export default function Confirm() {
  const { bookingId } = useParams();
  const { state }     = useLocation();
  const { user }      = useAuth();
  const navigate      = useNavigate();

  const { ride, pickup, drop, riderDist } = state || {};
  const fareBreakdown = ride ? calculateFare(riderDist, ride.price_per_km) : { baseFare: 0, platformFee: 1, totalFare: 0 };
  const fareAmount = fareBreakdown.totalFare;

  const [booking, setBooking]   = useState(null);
  const [step,    setStep]      = useState('review'); // review | booked | paying | paid | error
  const [error,   setError]     = useState('');

  // Step 1 — Book the seat
  const bookSeat = async () => {
    if (step === 'paying') return;
    setStep('paying');
    try {
      const res = await rideAPI.book(ride.id, {
        pickupName:  pickup.name,
        dropName:    drop.name,
        pickupLat:   pickup.lat,
        pickupLng:   pickup.lng,
        dropLat:     drop.lat,
        dropLng:     drop.lng,
        distanceKm:  riderDist,
      });
      setBooking(res.data.booking);
      setStep('booked');
      showSuccessToast('Seat booked. Complete payment to confirm.');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Booking failed. Please try again.');
      setError(message);
      showErrorToast(message);
      setStep('error');
    }
  };

  // Step 2 — Pay via Razorpay
  const pay = async () => {
    if (step === 'paid' || !booking) return;
    try {
      const orderRes = await paymentAPI.createOrder({
        bookingId:  booking.id,
        riderId:    user.id,
        amount:     fareAmount,
      });

      const { razorpayOrderId, keyId, mode } = orderRes.data;

      // If Razorpay keys are configured, open real checkout
      if (mode === 'razorpay' && keyId && keyId !== 'rzp_test_REPLACE_ME' && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: keyId,
          amount: fareAmount * 100,
          currency: 'INR',
          name: 'RideShare',
          description: `Booking ${booking.id}`,
          order_id: razorpayOrderId,
          handler: async (response) => {
            await paymentAPI.verify({
              razorpayOrderId:   response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              bookingId: booking.id,
            });
            showSuccessToast('Payment successful. Your seat is confirmed.');
            setStep('paid');
          },
          modal: {
            ondismiss: () => {
              const message = 'Payment was cancelled before completion.';
              setError(message);
              showErrorToast(message);
              setStep('booked');
            },
          },
          prefill: { name: user.name, email: user.email },
          theme: { color: '#c8f135' },
        });
        rzp.on('payment.failed', (response) => {
          const message = response?.error?.description || 'Payment failed.';
          setError(message);
          showErrorToast(message);
          setStep('error');
        });
        rzp.open();
      } else {
        // Mock payment for demo (no real Razorpay keys)
        await paymentAPI.verify({
          razorpayOrderId,
          razorpayPaymentId: 'mock_pay_' + Date.now(),
          razorpaySignature: '',
          bookingId: booking.id,
        });
        showSuccessToast('Payment successful. Your seat is confirmed.');
        setStep('paid');
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Payment failed.');
      setError(message);
      showErrorToast(message);
      setStep('error');
    }
  };

  if (!ride) return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 mb-4">No ride selected.</p>
        <button onClick={() => navigate('/search')} className="text-[#c8f135]">← Search rides</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Nav */}
        <button onClick={() => navigate('/search')} className="text-gray-500 text-sm mb-6 hover:text-white">← Back to search</button>

        {/* PAID */}
        {step === 'paid' && (
          <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
            <p className="text-gray-400 text-sm mb-6">Your seat is confirmed. The driver has been notified.</p>
            <div className="bg-[#0e0f13] rounded-xl p-4 mb-6 text-left">
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Booking ID</span><span className="font-mono text-xs text-[#c8f135]">{booking?.id?.slice(0,8)}...</span></div>
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Route</span><span>{pickup?.name?.split(',')[0]} → {drop?.name?.split(',')[0]}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Amount Paid</span><span className="text-[#c8f135] font-bold">₹{fareAmount}</span></div>
            </div>
            <button onClick={() => navigate('/dashboard')} className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-xl">Go to Dashboard</button>
          </div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div className="bg-[#16181f] border border-red-500/30 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-red-400 text-sm mb-6">{error}</p>
            <button onClick={() => navigate('/search')} className="w-full border border-[#2a2d3a] text-white py-3 rounded-xl hover:border-[#c8f135] transition-all">Try Again</button>
          </div>
        )}

        {/* REVIEW & BOOKED */}
        {(step === 'review' || step === 'booked' || step === 'paying') && (
          <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8">
            <h2 className="text-2xl font-bold mb-2">Confirm Booking</h2>
            <p className="text-gray-500 text-sm mb-6">Review your ride details and complete payment</p>

            {/* Booking ID (after booking) */}
            {booking && (
              <div className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl px-4 py-3 flex justify-between items-center mb-5">
                <div><div className="text-xs text-gray-500">Booking Reference</div><div className="font-mono text-sm text-[#c8f135] mt-0.5"># {booking.id.slice(0,8).toUpperCase()}...</div></div>
                <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full">Pending Payment</span>
              </div>
            )}

            {/* Details */}
            <div className="divide-y divide-[#2a2d3a] mb-5">
              {[
                ['From',      pickup?.name?.split(',')[0]],
                ['To',        drop?.name?.split(',')[0]],
                ['Departure', formatServerDateTime(ride.departure_time, 'en-IN', { dateStyle:'medium', timeStyle:'short' })],
                ['Distance',  `${riderDist} km`],
                ['Seats Left',`${ride.seats_available}`],
                ['Fare Rate', `₹${ride.price_per_km}/km`],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-3 text-sm">
                  <span className="text-gray-400">{l}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>

            {/* Payment breakdown */}
            <div className="bg-[#c8f135]/05 border border-[#c8f135]/15 rounded-xl p-4 mb-6">
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Distance fare ({riderDist} km × ₹{ride.price_per_km})</span><span>₹{fareBreakdown.baseFare}</span></div>
              <div className="flex justify-between text-sm mb-3"><span className="text-gray-400">Platform fee</span><span>₹{fareBreakdown.platformFee}</span></div>
              <div className="flex justify-between border-t border-[#c8f135]/15 pt-3">
                <span className="font-semibold">Total</span>
                <span className="text-[#c8f135] text-2xl font-bold">₹{fareAmount}</span>
              </div>
            </div>

            {/* Action button */}
            {step === 'review' && (
              <button onClick={bookSeat}
                className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all">
                Book Seat →
              </button>
            )}
            {step === 'paying' && (
              <button disabled className="w-full bg-[#c8f135]/50 text-[#0e0f13] font-bold py-3.5 rounded-xl">
                Booking seat...
              </button>
            )}
            {step === 'booked' && (
              <button onClick={pay}
                className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all">
                Pay ₹{fareAmount} via Razorpay →
              </button>
            )}

            <p className="text-center text-gray-600 text-xs mt-3">🔒 Secured by Razorpay · UPI, Cards, Netbanking</p>
          </div>
        )}
      </div>
    </div>
  );
}
