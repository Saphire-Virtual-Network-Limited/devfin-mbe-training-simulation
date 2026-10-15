# DevFin Practice Lab

A phone-first practice simulator that trains Sapphire MBEs to fill the DevFin
device finance application. Each run gives the MBE a made-up customer and a
real field problem: a NIN mixed up with a phone number, a payment that stalls,
a bank that's unavailable for the mandate, a referee who says no. Scores are
saved and trainers see who is field-ready.

The screens, field rules and messages copy the live DevFin web app as recorded
on 14 Oct 2026. No real customer data is used anywhere. Every customer is
generated.

## Stack

Same stack as `devfin-business-dashboard`, so the team maintains one setup:

| Part | Choice | Why |
|---|---|---|
| App | Next.js 16.3.4, React 19.2.8 | Matches the dashboard. Server routes keep the database and auth secrets off the phone. |
| Database | Neon Postgres via `@neondatabase/serverless` 1.1.0 | Matches the dashboard and is provisioned from Vercel Marketplace. |
| Hosting | Vercel | Matches the other DTO apps. |
| Auth | DevFin staff login (Platform Engine) plus a demo account | A password change in the DevFin staff app applies here at the next sign-in. |

All dependency versions are pinned exactly. Install with `npm install --ignore-scripts`.

## Local setup

```bash
npm install --ignore-scripts
cp .env.example .env.local     # fill in the values (see below)
npm run hash-password          # paste the output into DEMO_LOGIN_PASSWORD_HASH
npm run migrate                # creates the tables; safe to re-run
npm run dev
```

## Deploying to Vercel

1. In Vercel (team `digital-transformation-office`), **Add New → Project** and import `DTO-Sapphire/devfin-mbe-training`. The framework is detected as Next.js.
2. **Storage → Neon**: add a database to the project. That sets `DATABASE_URL`. Then run `npm run migrate` once with that URL in `.env.local` (`vercel env pull .env.local` fetches it).
3. **Settings → Environment Variables**, for Production and Preview. Mark the secrets as *Sensitive*:
   - `SESSION_SECRET`: output of `openssl rand -base64 48` (Sensitive)
   - `DEMO_LOGIN_ENABLED=true`, `DEMO_LOGIN_USERNAME=demo`
   - `DEMO_LOGIN_PASSWORD_HASH`: output of `npm run hash-password` (Sensitive)
   - `DEMO_LOGIN_ROLE`: `trainer` lets the demo account open the trainer view too, `mbe` keeps it to practice only
   - `TRAINER_STAFF_CODES`: e.g. `MBE-E8CABF,MBE-12AB34`
4. Redeploy. Sign in with the demo account to check the full flow.

## Sign-in

- **Staff sign-in** checks the username and password against the DevFin staff
  login on the Platform Engine (`/api/v1/staff/auth/*`), the same login MBEs
  use in the DevFin web app. This app never stores staff passwords.
  **Status: not connected yet.** See `src/lib/auth/staff-login.ts`. The
  request and response format must be confirmed by the Platform Engine team
  before it's wired up. Until then the sign-in page says staff sign-in is
  unavailable.
- **Demo account**: always available for testing when the four `DEMO_LOGIN_*`
  variables are set. Its attempts are tagged "demo" and left out of trainer
  reports unless a trainer chooses to include them. Set
  `DEMO_LOGIN_ENABLED=false` to switch it off.
- **Trainers** are the staff codes in `TRAINER_STAFF_CODES`.

## Security notes

| Risk | What was done |
|---|---|
| Stolen or edited session cookie | HMAC-SHA256 signed, httpOnly, Secure, SameSite=Lax, 12-hour expiry inside the signed payload, constant-time comparison. A forged role is rejected (tested). |
| Password guessing | 5 failures per username or 20 per IP in 15 minutes locks sign-in for that window. Counts live in Postgres because serverless instances don't share memory. Only a hash of the IP is stored. |
| Demo password leak | Stored only as a scrypt hash in a Vercel Sensitive variable, never in the repo. Rotate by generating a new hash. |
| Staff passwords | Never stored or logged. Checked by the Platform Engine on every sign-in. |
| Cross-site requests | POST routes require JSON and an Origin that matches the host, on top of SameSite cookies. |
| Faked scores | The server ignores the browser's score and pass/fail and recomputes both from the mistakes list, after strict validation. **Limitation:** a technically skilled trainee could still send an attempt with fewer mistakes than they made, because the simulation runs on the phone. Treat assessment scores as training records, not certification. Closing this fully means running the simulation on the server. |
| Error leaks | Every API error uses one `{ error: { code, message } }` shape with no stack traces. Logs are structured JSON without passwords, tokens or cookies. |
| Framing / indexing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, `noindex`. |
| Real customer data | None. All customers, banks, referees and stores are generated or fictional. |

Sessions last 12 hours, so a staff password change applies at the next sign-in, not immediately. Changing `SESSION_SECRET` signs everyone out at once.

## Assumptions to confirm with the product team

These come from one recorded application and live in `src/sim/data.ts`:

- Minimum down payment is the larger of 20% of the price or price − ₦200,000, plus the ₦11,000 admin fee.
- Monthly repayment uses a flat 11% per month (matches ₦75,920 → ₦21,005 × 6).
- Tenure is 6 months only.
- All 7 readiness items must be ticked before continuing.
- The device list holds only the TECNO models seen in the recording. Pickup stores are fictional.

## Tests

```bash
npm test     # 31 unit and API tests: offer maths, scoring, attempt validation,
             # session signing, password hashing, sign-in, lockout, cross-site blocking
npm run lint
```

The full 8-step flow was also run end-to-end in a browser at phone width against a production build.

## Where things live

```
src/sim/          the simulator: app facts (data.ts), scenarios, scoring, DOM renderer (app.ts)
src/lib/auth/     sessions, demo password, staff login adapter, sign-in rules
src/lib/          database access, trainer report, HTTP helpers
src/app/          pages (/, /login, /trainer) and API routes
scripts/          migrate.mjs, hash-password.mjs
```
