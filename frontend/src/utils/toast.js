import toast from 'react-hot-toast';

export const getApiErrorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.error || fallback;

const baseStyle = {
  border: '1px solid rgba(42, 45, 58, 0.95)',
  background: '#16181f',
  color: '#ffffff',
  boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)',
};

export const toastOptions = {
  duration: 3500,
  position: 'top-right',
  style: baseStyle,
  success: {
    duration: 2800,
    style: {
      ...baseStyle,
      border: '1px solid rgba(200, 241, 53, 0.35)',
    },
    iconTheme: {
      primary: '#c8f135',
      secondary: '#0e0f13',
    },
  },
  error: {
    duration: 4200,
    style: {
      ...baseStyle,
      border: '1px solid rgba(239, 68, 68, 0.35)',
    },
    iconTheme: {
      primary: '#ef4444',
      secondary: '#0e0f13',
    },
  },
};

export const showSuccessToast = (message) => toast.success(message);
export const showErrorToast = (message) => toast.error(message);
