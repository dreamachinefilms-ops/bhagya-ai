import assert from "node:assert/strict";
import test from "node:test";
import { fromPreferenceRow, getUserFirstName, preferenceToResponseDepth, toPreferenceRow, validatePreferencesPatch } from "./userPreferences.ts";

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

test("preference database fields map explicitly between snake case and camel case", () => {
  const preferences = { language: "hi" as const, defaultService: "numerology" as const, responseDetail: "detailed" as const, timezone: "Asia/Kolkata", useChatPersonalization: false };
  const row = { language: "hi", default_service: "numerology", response_detail: "detailed", timezone: "Asia/Kolkata", use_chat_personalization: false };
  assert.deepEqual(fromPreferenceRow(row), preferences);
  assert.deepEqual(toPreferenceRow(preferences), row);
});

test("message intent overrides response detail preference", () => {
  assert.equal(preferenceToResponseDepth("concise", "Please explain in detail"), "deep");
  assert.equal(preferenceToResponseDepth("detailed", "Short answer please"), "brief");
  assert.equal(preferenceToResponseDepth("balanced", "What should I consider?"), "standard");
});
