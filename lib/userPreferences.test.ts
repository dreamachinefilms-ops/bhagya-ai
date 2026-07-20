import assert from "node:assert/strict";
import test from "node:test";
import { getUserFirstName, preferenceToResponseDepth, validatePreferencesPatch } from "./userPreferences.ts";

test("getUserFirstName prefers a saved preferred name", () => {
  assert.equal(getUserFirstName({ preferredFirstName: "  Maya Rose ", fullName: "Sagan Majumder" }), "Maya");
  assert.equal(getUserFirstName({ fullName: "  Sagan Majumder " }), "Sagan");
  assert.equal(getUserFirstName({ preferredFirstName: " ", fullName: null }), null);
});

test("preference validation accepts strict settings and rejects unknown fields", () => {
  assert.deepEqual(validatePreferencesPatch({ language: "hi", defaultService: "numerology", responseDetail: "detailed", timezone: "Asia/Kolkata", useChatPersonalization: false }), { language: "hi", defaultService: "numerology", responseDetail: "detailed", timezone: "Asia/Kolkata", useChatPersonalization: false });
  assert.equal(validatePreferencesPatch({ language: "fr" }), null);
  assert.equal(validatePreferencesPatch({ language: "en", userId: "another-user" }), null);
});

test("message intent overrides response detail preference", () => {
  assert.equal(preferenceToResponseDepth("concise", "Please explain in detail"), "deep");
  assert.equal(preferenceToResponseDepth("detailed", "Short answer please"), "brief");
  assert.equal(preferenceToResponseDepth("balanced", "What should I consider?"), "standard");
});
