import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { rideAPI } from '../api';
import 'leaflet/dist/leaflet.css';
import { calculateFare } from '../utils/fare';
import { getApiErrorMessage, showErrorToast } from '../utils/toast';
import { formatServerTime, getLocalDateInputValue } from '../utils/datetime';

const ORS_KEY = import.meta.env.VITE_ORS_API_KEY || '';

export default function SearchRide() {
  const navigate  = useNavigate();
  const mapRef    = useRef(null);
  const mapObj    = useRef(null);
  const markersRef = useRef({ pickup: null, drop: null });
  const routeRef  = useRef(null);
  const geocodeControllers = useRef({ pickup: null, drop: null });
  const geocodeTimers = useRef({ pickup: null, drop: null });

  const [pickup, setPickup] = useState(null);
  const [drop,   setDrop]   = useState(null);
  const [nextClick, setNextClick] = useState('pickup');
  const [pickupSearch, setPickupSearch] = useState('');
  const [dropSearch,   setDropSearch]   = useState('');
  const [pickupSuggs,  setPickupSuggs]  = useState([]);
  const [dropSuggs,    setDropSuggs]    = useState([]);
  const [date,   setDate]   = useState('');
  const [rides,  setRides]  = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [status,   setStatus]   = useState({ type: 'info', msg: 'Search or click map to set your pickup.' });

  useEffect(() => {
    if (mapObj.current) return;
    import('leaflet').then(L => {
      const map = L.default.map(mapRef.current).setView([13.0, 80.2], 7);
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      map.on('click', e => handleMapClick(e.latlng, L.default));
      mapObj.current = { map, L: L.default };
    });
    setDate(getLocalDateInputValue());

    return () => {
      Object.values(geocodeControllers.current).forEach(controller => controller?.abort());
      Object.values(geocodeTimers.current).forEach(timer => timer && clearTimeout(timer));
    };
  }, []);

  const makeIcon = (L, color) => L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:${color};border:3px solid #0e0f13;border-radius:50%;box-shadow:0 0 0 3px ${color}44"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });

  const handleMapClick = async (latlng, L) => {
    const type = nextClick;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json`);
      const data = await res.json();
      const name = data.display_name.split(',').slice(0, 3).join(', ');
      setPointOnMap({ lat: latlng.lat, lng: latlng.lng, name }, type, L);
    } catch {
      setPointOnMap({ lat: latlng.lat, lng: latlng.lng, name: `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}` }, type, L);
    }
  };

  const setPointOnMap = (loc, type, L) => {
    const { map } = mapObj.current;
    const icon = makeIcon(L, type === 'pickup' ? '#c8f135' : '#ef4444');
    if (markersRef.current[type]) map.removeLayer(markersRef.current[type]);
    markersRef.current[type] = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
    map.setView([loc.lat, loc.lng], 12, { animate: true });
    if (type === 'pickup') { setPickup(loc); setPickupSearch(loc.name); setNextClick('drop'); setStatus({ type: 'info', msg: '✅ Pickup set! Now set your drop point.' }); }
    else { setDrop(loc); setDropSearch(loc.name); setNextClick('pickup'); setStatus({ type: 'info', msg: '✅ Both points set! Click Search Rides.' }); }
  };

  useEffect(() => {
    if (pickup && drop) fetchRoute();
  }, [pickup, drop]);

  const fetchRoute = async () => {
    if (!mapObj.current) return;
    const { map, L } = mapObj.current;
    setStatus({ type: 'loading', msg: '🗺️ Calculating real road route...' });

    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_KEY}&start=${pickup.lng},${pickup.lat}&end=${drop.lng},${drop.lat}`;
      const res = await fetch(url);
      const data = await res.json();
      const seg = data.features[0].properties.segments[0];
      const distKm = Math.round(seg.distance / 1000);
      const durMin = Math.round(seg.duration / 60);
      const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);

      if (routeRef.current) map.removeLayer(routeRef.current);
      const shadow = L.polyline(coords, { color: '#0e0f13', weight: 7, opacity: 0.5 }).addTo(map);
      const line = L.polyline(coords, { color: '#c8f135', weight: 4, opacity: 0.9 }).addTo(map);
      routeRef.current = L.layerGroup([shadow, line]).addTo(map);
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });

      setRouteInfo({
        distKm,
        durMin,
        coords: data.features[0].geometry.coordinates,
      });
      setStatus({ type: 'success', msg: `✅ ${distKm} km via real roads · ${Math.floor(durMin / 60)}h ${durMin % 60}m` });
    } catch {
      const distKm = Math.round(haversine(pickup.lat, pickup.lng, drop.lat, drop.lng) * 1.35);
      const durMin = Math.round(distKm / 60 * 60);

      if (routeRef.current) map.removeLayer(routeRef.current);
      routeRef.current = L.polyline([[pickup.lat, pickup.lng], [drop.lat, drop.lng]], {
        color: '#c8f135',
        weight: 3,
        dashArray: '8 6',
        opacity: 0.7,
      }).addTo(map);
      map.fitBounds([[pickup.lat, pickup.lng], [drop.lat, drop.lng]], { padding: [50, 50] });

      setRouteInfo({ distKm, durMin, coords: null });
      setStatus({ type: 'info', msg: `⚠️ Using estimated distance: ${distKm} km` });
    }
  };

  const geocode = (q, type, setSuggs) => {
    if (geocodeTimers.current[type]) {
      clearTimeout(geocodeTimers.current[type]);
    }

    if (geocodeControllers.current[type]) {
      geocodeControllers.current[type].abort();
      geocodeControllers.current[type] = null;
    }

    if (q.length < 3) {
      setSuggs([]);
      return;
    }

    geocodeTimers.current[type] = setTimeout(async () => {
      const controller = new AbortController();
      geocodeControllers.current[type] = controller;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Geocode request failed: ${res.status}`);
        setSuggs(await res.json());
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSuggs([]);
        }
      } finally {
        if (geocodeControllers.current[type] === controller) {
          geocodeControllers.current[type] = null;
        }
      }
    }, 350);
  };

  const searchRides = async () => {
    if (loading || !pickup || !drop) return;
    setLoading(true); setSearched(true);
    try {
      const res = await rideAPI.search({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropLat: drop.lat, dropLng: drop.lng, date });
      setRides(res.data.rides || []);
      setStatus({ type: 'success', msg: `✅ Found ${res.data.rides?.length || 0} rides · ${res.data.source === 'cache' ? 'from cache ⚡' : 'from DB'}` });
    } catch (err) {
      const message = getApiErrorMessage(err, 'Search failed. Try again.');
      setStatus({ type: 'error', msg: message });
      showErrorToast(message);
    } finally { setLoading(false); }
  };

  const haversine = (lat1,lng1,lat2,lng2) => {
    const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  };

  const riderDist = routeInfo?.distKm || (pickup && drop ? Math.round(haversine(pickup.lat,pickup.lng,drop.lat,drop.lng)*1.35) : 0);
  const searchFareEstimate = calculateFare(riderDist, 5.5);
  const statusStyle = { info:'bg-blue-500/10 text-blue-300 border-blue-500/20', success:'bg-green-500/10 text-green-300 border-green-500/20', error:'bg-red-500/10 text-red-300 border-red-500/20', loading:'bg-[#c8f135]/10 text-[#c8f135] border-[#c8f135]/20' };

  return (
    <div className="h-screen bg-[#0e0f13] text-white flex flex-col">
      <nav className="flex items-center justify-between px-6 py-3 border-b border-[#2a2d3a]">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">← Dashboard</button>
        <div className="text-lg font-extrabold">Ride<span className="text-[#c8f135]">Share</span></div>
        <div/>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-96 bg-[#16181f] border-r border-[#2a2d3a] overflow-y-auto p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Find a Ride</h2>
            <p className="text-gray-500 text-sm">Set your pickup and drop to find matching drivers.</p>
          </div>

          <div className={`text-xs px-3 py-2 rounded-lg border ${statusStyle[status.type] || statusStyle.info}`}>{status.msg}</div>

          {/* Pickup */}
          <div className="relative">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#c8f135]"></span> Your Pickup
            </div>
            <input value={pickupSearch} onChange={e => { setPickupSearch(e.target.value); geocode(e.target.value, 'pickup', setPickupSuggs); }}
              placeholder="Where are you starting?"
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
            {pickupSuggs.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-[#1e2029] border border-[#2a2d3a] rounded-lg z-50 max-h-48 overflow-y-auto mt-1">
                {pickupSuggs.map((s, i) => (
                  <div key={i} onMouseDown={() => { setPickupSuggs([]); setPointOnMap({ lat: parseFloat(s.lat), lng: parseFloat(s.lon), name: s.display_name.split(',').slice(0,3).join(', ') }, 'pickup', mapObj.current.L); }}
                    className="px-3 py-2.5 text-sm hover:bg-[#c8f135]/10 cursor-pointer border-b border-[#2a2d3a] last:border-0">
                    <div className="font-medium">{s.display_name.split(',')[0]}</div>
                    <div className="text-gray-500 text-xs">{s.display_name.split(',').slice(1,3).join(',')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Drop */}
          <div className="relative">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Your Drop
            </div>
            <input value={dropSearch} onChange={e => { setDropSearch(e.target.value); geocode(e.target.value, 'drop', setDropSuggs); }}
              placeholder="Where are you going?"
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#c8f135] outline-none"/>
            {dropSuggs.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-[#1e2029] border border-[#2a2d3a] rounded-lg z-50 max-h-48 overflow-y-auto mt-1">
                {dropSuggs.map((s, i) => (
                  <div key={i} onMouseDown={() => { setDropSuggs([]); setPointOnMap({ lat: parseFloat(s.lat), lng: parseFloat(s.lon), name: s.display_name.split(',').slice(0,3).join(', ') }, 'drop', mapObj.current.L); }}
                    className="px-3 py-2.5 text-sm hover:bg-[#c8f135]/10 cursor-pointer border-b border-[#2a2d3a] last:border-0">
                    <div className="font-medium">{s.display_name.split(',')[0]}</div>
                    <div className="text-gray-500 text-xs">{s.display_name.split(',').slice(1,3).join(',')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-[#0e0f13] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white focus:border-[#c8f135] outline-none"/>
          </div>

          {riderDist > 0 && (
            <div className="bg-[#0e0f13] border border-[#c8f135]/20 rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Your distance</span><span className="font-medium">{riderDist} km</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-sm">Est. fare</span><span className="text-[#c8f135] font-bold">₹{searchFareEstimate.totalFare}</span></div>
              {/* <div className="text-xs text-[#c8f135] mt-2">Tap to view details & request →</div> */}
            </div>
          )}

          <button onClick={searchRides} disabled={!pickup || !drop || loading}
            className="w-full bg-[#c8f135] text-[#0e0f13] font-bold py-3 rounded-xl disabled:opacity-40 hover:shadow-[0_0_20px_rgba(200,241,53,0.3)] transition-all">
            {loading ? 'Searching...' : '🔍 Search Rides'}
          </button>

          {/* Results */}
          {searched && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-3">{rides.length} ride{rides.length !== 1 ? 's' : ''} found</p>
              {rides.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No rides found on this route for the selected date.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {rides.map((ride, i) => {
                    const rideFare = calculateFare(riderDist, ride.price_per_km);
                    return (
                    <div key={i} className="bg-[#0e0f13] border border-[#2a2d3a] rounded-xl p-4 hover:border-[#c8f135]/40 transition-all cursor-pointer"
                      // onClick={() => navigate('/ride/' + ride.id, { state: { ride, pickup, drop, riderDist } })}>
                      onClick={() => {
                        const dist = pickup && drop 
                          ? (routeInfo?.distKm || Math.round(haversine(pickup.lat,pickup.lng,drop.lat,drop.lng)*1.35))
                          : 0;
                        navigate('/ride/' + ride.id, { 
                          state: { ride, pickup, drop, riderDist: dist } 
                        });
                      }}>  
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-sm">{ride.from_name?.split(',')[0]} → {ride.to_name?.split(',')[0]}</div>
                        <span className="text-[#c8f135] font-bold">₹{rideFare.totalFare}</span>
                      </div>
                      <div className="text-gray-500 text-xs flex gap-3">
                        <span>🪑 {ride.seats_available} seats</span>
                        <span>📍 {ride.distance_km} km</span>
                        <span>🕐 {formatServerTime(ride.departure_time)}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1">
          <div ref={mapRef} className="w-full h-full"/>
        </div>
      </div>
    </div>
  );
}
