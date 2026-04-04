import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { paymentAPI } from '../api';
import api from '../api';
import { parseServerDate } from '../utils/datetime';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';

export default function PayNow() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    fetchBooking();
  }, [bookingId]);

  // Countdown timer
  useEffect(() => {
    if (!booking?.payment_deadline) return;
    const interval = setInterval(() => {
      const parsedDeadline = parseServerDate(booking.payment_deadline);
      if (!parsedDeadline) {
        setTimeLeft('');
        clearInterval(interval);
        return;
      }
      const diff = parsedDeadline.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [booking]);

  const fetchBooking = async () => {
    try {
      const res = await api.get(`/rides/booking/${bookingId}`);
      setBooking(res.data.booking);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Booking not found');
      setError(message);
      showErrorToast(message);
    }
    setLoading(false);
  };

  const pay = async () => {
    if (paying || !booking || timeLeft === 'Expired') return;
    setPaying(true);
    setError('');
    try {
      const orderRes = await paymentAPI.createOrder({
        bookingId: booking.id,
        riderId: user.id,
        amount: booking.fare_amount,
      });

      const { razorpayOrderId, keyId } = orderRes.data;

      if (keyId && keyId !== 'rzp_test_REPLACE_ME' && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: keyId,
          amount: booking.fare_amount * 100,
          currency: 'INR',
          name: 'RideShare',
          description: `Booking ${booking.id}`,
          order_id: razorpayOrderId,
          handler: async (response) => {
            await paymentAPI.verify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              bookingId: booking.id,
            });
            showSuccessToast('Payment successful. Your seat is confirmed.');
            setPaid(true);
          },
          prefill: { name: user.name, email: user.email },
          theme: { color: '#c8f135' },
        });
        rzp.open();
      } else {
        // Mock payment
        await paymentAPI.verify({
          razorpayOrderId,
          razorpayPaymentId: 'mock_pay_' + Date.now(),
          razorpaySignature: '',
          bookingId: booking.id,
        });
        showSuccessToast('Payment successful. Your seat is confirmed.');
        setPaid(true);
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Payment failed');
      setError(message);
      showErrorToast(message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  );

  if (paid) return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center p-8">
      <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
        <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
        <p className="text-gray-400 text-sm mb-6">Your seat is confirmed. The driver has been notified.</p>
        <button onClick={() => navigate('/dashboard')}
          className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-xl">
          Go to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex items-center justify-center p-8">
      <div className="bg-[#16181f] border border-[#2a2d3a] rounded-2xl p-8 max-w-md w-full">
        <button onClick={() => navigate('/dashboard')} className="text-gray-500 text-sm mb-6 hover:text-white">← Dashboard</button>

        <h2 className="text-2xl font-bold mb-2">Complete Payment</h2>
        <p className="text-gray-500 text-sm mb-6">Your seat has been approved! Pay now to confirm.</p>

        {/* Countdown */}
        {timeLeft && timeLeft !== 'Expired' && (
          <div className="bg-[#c8f135]/10 border border-[#c8f135]/20 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
            <span className="text-sm text-[#c8f135]">⏰ Time remaining</span>
            <span className="text-[#c8f135] font-bold font-mono text-lg">{timeLeft}</span>
          </div>
        )}
        {timeLeft === 'Expired' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 text-center text-red-400 text-sm">
            ⚠️ Payment window expired. Your seat has been released.
          </div>
        )}

        {booking && (
          <>
            <div className="divide-y divide-[#2a2d3a] mb-5">
              {[
                ['From', booking.pickup_name?.split(',')[0]],
                ['To', booking.drop_name?.split(',')[0]],
                ['Distance', `${booking.distance_km} km`],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-3 text-sm">
                  <span className="text-gray-400">{l}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-[#c8f135]/05 border border-[#c8f135]/15 rounded-xl p-4 mb-6 flex justify-between items-center">
              <span className="font-semibold">Total to pay</span>
              <span className="text-[#c8f135] text-2xl font-bold">₹{booking.fare_amount}</span>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2 mb-4">{error}</p>}

        <button onClick={pay} disabled={paying || timeLeft === 'Expired' || !booking}
          className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all disabled:opacity-50">
          {paying ? 'Processing...' : `Pay ₹${booking?.fare_amount} via Razorpay →`}
        </button>
        <p className="text-center text-gray-600 text-xs mt-3">🔒 Secured by Razorpay</p>
      </div>
    </div>
  );
}
