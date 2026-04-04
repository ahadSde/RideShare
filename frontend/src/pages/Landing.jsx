import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import { getApiErrorMessage, showErrorToast, showSuccessToast } from '../utils/toast';

export default function Landing() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]     = useState('login');    // 'login' | 'register'
  const [role, setRole]     = useState('rider');
  const [form, setForm]     = useState({ name:'', email:'', password:'', phone:'' });
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await login(form.email, form.password);
        console.log('Logged in user:', user);
        console.log('Token in storage:', localStorage.getItem('token'));
        showSuccessToast(`Welcome back, ${user?.name || 'there'}!`);
        // Wait a moment before navigating
        setTimeout(() => navigate('/dashboard'), 500);
      } else {
        await register({ ...form, role });
        showSuccessToast('Account created successfully.');
        setTimeout(() => navigate('/dashboard'), 500);
      }
    } catch (err) {
      showErrorToast(getApiErrorMessage(err, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f13] text-white flex">
      {/* Left */}
      <div className="flex-1 flex flex-col justify-center px-16 py-12">
        <div className="inline-flex items-center gap-2 bg-[#c8f135]/10 border border-[#c8f135]/25 text-[#c8f135] px-4 py-2 rounded-full text-xs font-medium mb-8 w-fit">
          <span className="w-2 h-2 rounded-full bg-[#c8f135] animate-pulse"></span>
          Smart Carpooling Platform
        </div>
        <h1 className="text-6xl font-extrabold leading-tight tracking-tight mb-5">
          Share the <span className="text-[#c8f135]">road,</span><br/>split the cost
        </h1>
        <p className="text-gray-400 text-lg max-w-md mb-10 leading-relaxed">
          Connect with drivers heading your way. Pay only for the distance you travel — no full fares, no empty seats.
        </p>
        <div className="flex gap-10">
          <div><div className="text-3xl font-bold text-[#c8f135]">2.4k</div><div className="text-xs text-gray-500 mt-1">Active Drivers</div></div>
          <div><div className="text-3xl font-bold text-[#c8f135]">₹18</div><div className="text-xs text-gray-500 mt-1">Avg per km</div></div>
          <div><div className="text-3xl font-bold text-[#c8f135]">98%</div><div className="text-xs text-gray-500 mt-1">On-time Rate</div></div>
        </div>
      </div>

      {/* Right — Auth Card */}
      <div className="w-[480px] bg-[#16181f] border-l border-[#2a2d3a] flex items-center justify-center p-12">
        <div className="w-full">
          <h2 className="text-2xl font-bold mb-1">
            {mode === 'login' ? 'Welcome back' : 'Get Started'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {mode === 'login' ? 'Sign in to your account' : 'Create your carpool account'}
          </p>

          {/* Mode toggle */}
          <div className="flex gap-2 bg-[#0e0f13] border border-[#2a2d3a] rounded-lg p-1 mb-6">
            {['login','register'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode===m ? 'bg-[#c8f135] text-[#0e0f13]' : 'text-gray-500 hover:text-white'}`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Role toggle (register only) */}
          {mode === 'register' && (
            <div className="flex gap-2 mb-5">
              {['driver','rider'].map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${role===r ? 'border-[#c8f135] text-[#c8f135] bg-[#c8f135]/08' : 'border-[#2a2d3a] text-gray-500'}`}>
                  {r === 'driver' ? '🚗 Driver' : '🙋 Rider'}
                </button>
              ))}
            </div>
          )}

          {/* Form */}
          {mode === 'register' && (
            <div className="mb-4">
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Full Name</label>
              <input name="name" value={form.name} onChange={handle} placeholder="Arjun Sharma"
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
            </div>
          )}
          <div className="mb-4">
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Email</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="arjun@email.com"
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
          </div>
          {mode === 'register' && (
            <div className="mb-4">
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Phone</label>
              <input name="phone" value={form.phone} onChange={handle} placeholder="+91 98765 43210"
                className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
            </div>
          )}
          <div className="mb-6">
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••"
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
          </div>

          <button onClick={submit} disabled={loading}
            className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-lg hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all disabled:opacity-50">
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>

          <p className="text-center text-gray-500 text-sm mt-4">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => setMode(mode==='login'?'register':'login')} className="text-[#c8f135]">
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
