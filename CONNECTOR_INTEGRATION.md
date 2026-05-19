# How to run the Python connector service

1. Install dependencies:

```
pip install flask requests
```

2. Set required environment variables (see top of connector.py):

- MESHCTRL_PATH
- MESHCENTRAL_URL
- MESHCENTRAL_USER
- MESHCENTRAL_PASS
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, etc.
- (Optional) SECRET_TOKEN, BACKEND_CALLBACK_URL, SERVICE_PORT, SERVICE_HOST

3. Run the service:

```
python connector.py --serve
```

The service will listen on http://0.0.0.0:8000 by default.

# Backend integration

The Python connector **polls** the backend for tasks and **POSTs** results when an RDP link is ready.

## Backend `.env`

```
CONNECTOR_SECRET_TOKEN=your-shared-secret
BACKEND_PUBLIC_URL=http://localhost:5000
```

## Connector `.env`

```
SECRET_TOKEN=your-shared-secret
BACKEND_POLL_URL=http://localhost:5000/connector/poll
BACKEND_CALLBACK_URL=http://localhost:5000/connector/callback
```

## Callback body (connector → backend)

```json
{
  "bookingId": "clx...",
  "rdpLink": "https://mesh.example.com/...",
  "shareId": "optional-share-id",
  "success": true,
  "error": null,
  "stdout": "...",
  "stderr": "..."
}
```

The backend stores `rdpLink` on the `Booking` row. The frontend reads it via `GET /bookings` or `GET /bookings/:id` (`rdpReady: true` when set).

## Legacy direct HTTP to connector

The backend can still call the connector service via HTTP (see `src/integrations/connector.service.js`):

- CONNECTOR_URL (default: http://localhost:8000)
- CONNECTOR_SECRET_TOKEN (if using SECRET_TOKEN)

# Example usage in backend

```
import { generateRdpLink } from '../integrations/connector.service';

const payload = { ... };
const result = await generateRdpLink(payload);
```
