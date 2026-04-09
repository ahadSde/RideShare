import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import useAuth from './context/useAuth';
import Landing        from './pages/Landing';
import Dashboard      from './pages/Dashboard';
import PostRide       from './pages/PostRide';
import SearchRide     from './pages/SearchRide';
import Confirm        from './pages/Confirm';
import RideDetail     from './pages/RideDetail';
import DriverRequests from './pages/DriverRequests';
import PayNow         from './pages/PayNow';
import Profile        from './pages/Profile';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0e0f13]">
      <div className="text-[#c8f135] text-sm animate-pulse">Loading...</div>
    </div>
  );
  return user ? children : <Navigate to="/" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0e0f13]">
      <div className="text-[#c8f135] text-sm animate-pulse">Loading...</div>
    </div>
  );
  return user ? <Navigate to="/dashboard" replace /> : children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"                      element={<PublicRoute><Landing /></PublicRoute>} />
          <Route path="/dashboard"             element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/post-ride"             element={<PrivateRoute><PostRide /></PrivateRoute>} />
          <Route path="/search"                element={<PrivateRoute><SearchRide /></PrivateRoute>} />
          <Route path="/ride/:rideId"          element={<PrivateRoute><RideDetail /></PrivateRoute>} />
          <Route path="/ride/:rideId/driver" element={<PrivateRoute><RideDetail /></PrivateRoute>} />
          <Route path="/ride/:rideId/requests" element={<PrivateRoute><DriverRequests /></PrivateRoute>} />
          <Route path="/ride/:rideId/comments" element={<PrivateRoute><RideDetail /></PrivateRoute>} />
          <Route path="/pay/:bookingId"        element={<PrivateRoute><PayNow /></PrivateRoute>} />
          <Route path="/confirm/:bookingId"    element={<PrivateRoute><Confirm /></PrivateRoute>} />
          <Route path="/profile"               element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="*"                      element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
