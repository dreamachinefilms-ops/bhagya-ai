# Bhagya.ai Production Deployment Checklist

## Secrets And Environment

- [ ] Regenerate the OpenAI API key before production because the old key was visible in a screenshot.
- [ ] Regenerate the Prokerala Client Secret before production because the old secret was visible in a screenshot.
- [ ] Add all required environment variables to Vercel.
- [ ] Confirm `.env.local` is ignored and not committed.
- [ ] Confirm `.env.example` contains placeholder values only.

## Required Vercel Environment Variables

- [ ] `ASTROLOGY_PROVIDER=prokerala`
- [ ] `PROKERALA_CLIENT_ID`
- [ ] `PROKERALA_CLIENT_SECRET`
- [ ] `PROKERALA_BASE_URL=https://api.prokerala.com`
- [ ] `PROKERALA_AYANAMSA=1`
- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL=gpt-5.4-mini`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `NEXT_PUBLIC_APP_URL`

## Auth Configuration

- [ ] Add the production URL to Supabase Auth URL Configuration.
- [ ] Add the production URL to Google OAuth Authorized JavaScript Origins.
- [ ] Add the Supabase callback URL to Google OAuth Authorized Redirect URIs.
- [ ] Test Google login on the production URL.
- [ ] Test email login/signup on the production URL.

## Production Smoke Tests

- [ ] Test `/api/health` on the production URL and confirm it returns booleans only.
- [ ] Test a Prokerala astrology request on the production URL.
- [ ] Test OpenAI-backed replies on the production URL.
- [ ] Test Supabase permanent chat memory on the production URL.
- [ ] Test saved birth-detail memory on the production URL.
- [ ] Test the language selector on the production URL.
- [ ] Test multilingual replies on the production URL.
- [ ] Test mobile responsive UI.

## Release Readiness

- [ ] Run `npm run build` successfully before deployment.
- [ ] Confirm no backend secrets are exposed to frontend code.
- [ ] Confirm Supabase Auth and Google login still work after deployment.
- [ ] Confirm Prokerala and OpenAI backend logic still works after deployment.
- [ ] Confirm the live `NEXT_PUBLIC_APP_URL` is ready before creating the Android app shell.
