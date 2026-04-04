# RideShare Frontend

React + Vite frontend for the RideShare microservices project.

## Features

- Rider and driver authentication
- Driver ride posting with map-based route selection
- Rider ride search with map-based pickup and drop selection
- Real-road route rendering using OpenRouteService
- Ride request, approval, payment, and booking tracking flows
- Dashboard views for both riders and drivers
- Toast notifications for user actions

## Prerequisites

- Node.js 18+
- API Gateway running at `http://localhost:3000`
- OpenRouteService API key

## Environment Setup

Create a `.env` file in the `frontend` folder:

```env
VITE_ORS_API_KEY=your_openrouteservice_api_key_here
```

## Install and Run

```bash
npm install
npm run dev
```

The app starts on:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

## Key Pages

- `/` Login / register
- `/dashboard` User dashboard
- `/post-ride` Driver ride posting
- `/search` Rider ride search
- `/ride/:rideId` Ride detail and seat request flow
- `/ride/:rideId/requests` Driver approval queue
- `/pay/:bookingId` Rider payment page

## Notes

- This frontend expects the backend services to be available through the API Gateway.
- Real route rendering depends on a valid OpenRouteService key.
- Payment works in demo mode when Razorpay test keys are not configured on the backend.
