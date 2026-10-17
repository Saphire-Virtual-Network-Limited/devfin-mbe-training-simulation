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
| Sign-in | MBE code + phone number, matched against the MBE list in Postgres | Simple for MBEs on a phone; every score is stored against the MBE's code. |

All dependency versions are pinned exactly. Install with `npm install --ignore-scripts`.

## Local setup

```bash
npm install --ignore-scripts
cp .env.example .env.local     # fill in the values (see below)
npm run hash-password          # paste the output into TRAINER_PASSCODE_HASH
npm run migrate                # creates the tables; safe to re-run
npm run import-mbes -- mbes.csv   # first load of the MBE list (code, phone, name, store)
npm run dev
```

## Deploying to Vercel

1. In Vercel (team `digital-transformation-office`), **Add New → Project** and import `Saphire-Virtual-Network-Limited/devfin-mbe-training-simulation`. The framework is detected as Next.js.
2. **Storage → Neon**: add a database to the project. That sets `DATABASE_URL`. Then run `npm run migrate` once with that URL in `.env.local` (`vercel env pull .env.local` fetches it).
3. **Settings → Environment Variables**, for Production and Preview. Mark the secrets as *Sensitive*:
   - `SESSION_SECRET`: output of `openssl rand -base64 48` (Sensitive)
   - `TRAINER_CODES`: MBE codes that get the trainer view, e.g. `MBE-E8CABF,MBE-12AB34`
   - `TRAINER_PASSCODE_HASH`: output of `npm run hash-password` (Sensitive)
   - `DEMO_LOGIN_ENABLED=true`, `DEMO_MBE_CODE=DEMO-0001`, `DEMO_MBE_PHONE=08000000001`
4. Load the MBE list once: put `code,phone,name,store` rows in a CSV (include the trainers) and run `npm run import-mbes -- mbes.csv`. After that, trainers add or switch off MBEs from the Trainer view.
5. Redeploy. Sign in with the demo code and phone to check the full flow, then with a trainer code to check the Trainer view.

## Sign-in

- **MBEs** sign in with their **MBE code and phone number**. Both must match a
  row on the MBE list (`mbes` table). Phone numbers are accepted in any common
  form (`0803…`, `+234 803…`) and stored as `0XXXXXXXXXX`. Each code is tied to
  one phone, and a phone can belong to only one active MBE.
- **Every score** is saved in `attempts` with the MBE's code (`attempts.mbe_code`
  → `mbes.code`), so the Trainer view shows each MBE's code, phone, store and
  results together.
- **Trainers** are the codes in `TRAINER_CODES`. Because they can change the MBE
  list and see everyone's results, they also enter the trainer passcode.
- **Switching an MBE off** (Trainer view) keeps their history and stops new
  sign-ins.
- **Demo account**: the `DEMO_MBE_CODE` + `DEMO_MBE_PHONE` pair always works for
  testing. It can practise but never opens the Trainer view. Its scores are
  tagged "demo" and left out of trainer reports unless a trainer includes them.
  Set `DEMO_LOGIN_ENABLED=false` to switch it off.

## Security notes

| Risk | What was done |
|---|---|
| Stolen or edited session cookie | HMAC-SHA256 signed, httpOnly, Secure, SameSite=Lax, 12-hour expiry inside the signed payload, constant-time comparison. A forged role is rejected (tested). |
| Code + phone is not a secret | An MBE's code and phone are known to colleagues, so another person could sign in as them and do their test. Accepted for a training tool: no money or customer data is reachable. Codes must be on the list, each code is bound to one phone, and trainers (who can change data) need a passcode too. If assessments become formal certification, add a one-time code sent to the MBE's phone. |
| Guessing | 5 failures per code or 20 per IP in 15 minutes locks sign-in for that window. Wrong code and wrong phone give the same message. Counts live in Postgres because serverless instances don't share memory. Only a hash of the IP is stored. |
| Trainer passcode leak | Stored only as a scrypt hash in a Vercel Sensitive variable, never in the repo. Rotate by generating a new hash. |
| Personal data | The MBE list holds staff names, codes and work phone numbers only, in Postgres. Phones are shown only in the Trainer view. Nothing about customers is stored. |
| Cross-site requests | POST routes require JSON and an Origin that matches the host, on top of SameSite cookies. |
| Faked scores | The server ignores the browser's score and pass/fail and recomputes both from the mistakes list, after strict validation. **Limitation:** a technically skilled trainee could still send an attempt with fewer mistakes than they made, because the simulation runs on the phone. Treat assessment scores as training records, not certification. Closing this fully means running the simulation on the server. |
| Error leaks | Every API error uses one `{ error: { code, message } }` shape with no stack traces. Logs are structured JSON without passwords, tokens or cookies. |
| Framing / indexing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, `noindex`. |
| Real customer data | None. All customers, banks, referees and stores are generated or fictional. |

Sessions last 12 hours, so switching an MBE off applies at their next sign-in, not immediately. Changing `SESSION_SECRET` signs everyone out at once.

## Assumptions to confirm with the product team

These come from one recorded application and live in `src/sim/data.ts`:

- Minimum down payment is the larger of 20% of the price or price − ₦200,000, plus the ₦11,000 admin fee.
- Monthly repayment uses a flat 11% per month (matches ₦75,920 → ₦21,005 × 6).
- Tenure is 6 months only.
- All 7 readiness items must be ticked before continuing.
- The device list holds only the TECNO models seen in the recording. Pickup stores are fictional.

## Tests

```bash
npm test     # 56 unit and API tests: offer maths, scoring, attempt validation, code/phone
             # cleaning, MBE list import, session signing, sign-in, trainer passcode,
             # lockout, switched-off MBEs, roster permissions, cross-site blocking
npm run lint
```

The full 8-step flow was also run end-to-end in a browser at phone width against a production build.

## Where things live

```
src/sim/          the simulator: app facts (data.ts), scenarios, scoring, DOM renderer (app.ts)
src/lib/auth/     sessions, trainer passcode, sign-in rules
src/lib/          database access, MBE list (roster.ts, mbe-id.ts), trainer report, HTTP helpers
src/app/          pages (/, /login, /trainer) and API routes
scripts/          migrate.mjs, import-mbes.mjs, hash-password.mjs
```
