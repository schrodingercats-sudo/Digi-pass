# PassDigi

One-time scan event pass verification system with:

- User portal (`/index.html`) for registration + downloadable digital pass
- Admin portal (`/admin.html`) for high-speed camera/manual verification
- Secure one-time redemption (only possible from authenticated admin scanner)
- Scan logs + override controls + multi-admin support

The stack is plain `HTML/CSS/JS` + Vercel serverless API routes + Supabase.

## Product Flow

1. User registers with name/email/phone.
2. System issues a pass with:
   - signed QR payload (`PDG:<jwt-token>`)
   - human-readable fallback code (`PD-XXXXXXXX`)
3. User pass is saved locally (`localStorage` + cookie token).
4. Admin scans QR from `admin.html` or enters code manually.
5. Server verifies token/code and atomically redeems pass if valid.
6. Duplicate scans fail (`already_redeemed`).
7. User device polling updates status and shows success animation when redeemed.

## Core Security Rules

- QR does not auto-redeem on open/scan.
- Redemption endpoint requires admin session cookie.
- Pass token is signed (`PASS_TOKEN_SECRET`).
- One-time use enforced by conditional update (`status='active'`).
- Tampering UI fields cannot forge pass validity because canonical pass data is server-side.

## Tech Structure

```
api/
  _lib/
    config.js
    supabase.js
    auth.js
    pass-token.js
    validators.js
    parsers.js
    event.js
    pass-repository.js
    admin-repository.js
    serializers.js
  pass-register.js
  pass-status.js
  admin-login.js
  admin-logout.js
  admin-me.js
  admin-seed-supervisor.js
  admin-users.js
  admin-redeem.js
  admin-override.js
  admin-history.js
index.html
admin.html
styles/main.css
scripts/user.js
scripts/admin.js
supabase/schema.sql
```

## Prerequisites

- Node.js 20+
- Supabase project
- Vercel account (for deployment)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill values.
   - Use `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) for server APIs.
   - `SUPABASE_PUBLISHABLE_KEY` is optional and not enough for secure server writes.

3. In Supabase SQL editor, run:

```sql
-- file content
supabase/schema.sql
```

4. Run local dev server:

```bash
npm run dev
```

This runs a local Node server that serves both static files and `/api/*` routes.

Fast startup (recommended for daily use):

```bash
npm run dev:open
```

This starts the local API server and opens `http://127.0.0.1:3000/index.html`.

Optional (Vercel runtime parity):

```bash
npm run dev:vercel
```

5. Validate critical flow quickly:

```bash
npm run smoke-test
```

5. Open:
   - `http://localhost:3000/index.html` (user)
   - `http://localhost:3000/admin.html` (admin)

## First Supervisor Setup

On `admin.html`, open **First-time setup** and create the first supervisor with:

- setup key = `ADMIN_SETUP_KEY` from `.env`
- full name, email, password

After first supervisor is created, login and create more admin accounts from the Admin Accounts section.

## Supabase Notes

- Use service role key only in server-side API routes.
- Do not expose service role key in frontend code.
- Default event row is created with slug `default-event`.
- Change event dates/venue/name in `event_settings`.

## Deployment (Vercel)

1. Push repo to Git provider.
2. Import project in Vercel.
3. Add environment variables from `.env.example`.
4. Deploy.

## API Endpoints

- `POST /api/pass-register`
- `GET /api/pass-status?token=...`
- `POST /api/admin-login`
- `POST /api/admin-logout`
- `GET /api/admin-me`
- `POST /api/admin-seed-supervisor`
- `GET/POST /api/admin-users` (supervisor only)
- `POST /api/admin-redeem`
- `POST /api/admin-override`
- `GET /api/admin-history`

## UI Direction

The UI follows a receipt-machine inspired visual system:

- paper texture, mono metadata lines, perforated ticket styling
- bold warm palette for gate-readability
- high contrast result states (success/warning/error)
- fast scanner feedback with audio cue + live scan history
