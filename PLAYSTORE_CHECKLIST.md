# Bhagya.ai Play Store Checklist

## App Basics

- [ ] Google Play developer account created
- [ ] App name confirmed: Bhagya.ai
- [ ] Package ID confirmed: com.dreamachinefilms.bhagya
- [ ] Production app URL set in `NEXT_PUBLIC_APP_URL`
- [ ] Capacitor `server.url` points to the HTTPS production Bhagya.ai URL
- [ ] No OpenAI, Prokerala, Supabase service role, or other backend secret keys are included in Android/frontend code

## Store Listing

- [ ] Short description written
- [ ] Full description written
- [ ] App icon prepared: 512x512 PNG
- [ ] Adaptive icon foreground prepared
- [ ] Adaptive icon background prepared
- [ ] Feature graphic prepared: 1024x500
- [ ] At least 2 phone screenshots prepared
- [ ] Privacy policy URL ready
- [ ] Terms URL ready
- [ ] Copyright/licensing reviewed for all zodiac, astrology, tarot, palmistry, and other visual assets

## App Content And Compliance

- [ ] Data safety form completed
- [ ] Content rating questionnaire completed
- [ ] Health, financial, or spiritual guidance disclaimers reviewed if needed
- [ ] Login/signup flow tested
- [ ] Google login tested inside the Android WebView
- [ ] Supabase Auth URL configuration includes production URL
- [ ] Deep link handling planned if external-browser auth does not return to the app reliably

## Android Build

- [ ] Android project opens in Android Studio
- [ ] Gradle sync passes
- [ ] Target SDK checked against the current Google Play requirement
- [ ] Version name set
- [ ] Version code increased before each uploaded AAB
- [ ] Signed Android App Bundle generated
- [ ] Play App Signing enabled during upload

## Release Flow

- [ ] Internal testing release created
- [ ] Internal testing install verified on a physical Android phone
- [ ] Closed testing completed if required
- [ ] Production release prepared
- [ ] Rollout monitored after release

## Future Update Strategy

- Backend, prompt, Prokerala, OpenAI, and database changes can be updated on the hosted server without rebuilding the Android shell.
- Hosted Next.js UI changes can be shipped by redeploying Bhagya.ai, then the Android app will load the updated site.
- Native Android shell changes require a rebuild and Play Store update. This includes icons, splash assets, package ID, native permissions, deep links, native plugins, Gradle configuration, and app signing changes.
- Always increase Android `versionCode` before uploading a new AAB to Google Play.
