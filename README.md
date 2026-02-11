# Flex Pay (Vite + React + TypeScript)

This project replicates the supplied reference pages from:

- `References/app.uat.varklin.com_account-new-payment_2026-02-10_22-42-17.html`
- `References/app.uat.varklin.com_account-new-payment-select-type_2026-02-10_22-42-28.html`
- `References/app.uat.varklin.com_account-new-payment-supplier-single_2026-02-10_22-42-34.html`

## Routes

- `/auth` (login + sign up + forgot password)
- `/auth/reset` (set new password from recovery link)
- `/new-payment`
- `/select-type`
- `/supplier-single`
- `/get-paid`

All app routes are protected behind login.

Allowed email domains:

- `@pay.com.au`
- `@waller.com.au`

## Supabase Setup

Create a `.env.local` file:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Run

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test
```

## Deploy To Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, import the project.
3. Keep defaults for Vite:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add project environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

This repo includes `vercel.json` to support React Router routes.

### Supabase Auth Redirect URLs

In Supabase Auth settings, add these URLs:

- `http://localhost:5173/auth`
- `http://localhost:5173/auth/reset`
- `https://<your-vercel-domain>/auth`
- `https://<your-vercel-domain>/auth/reset`
