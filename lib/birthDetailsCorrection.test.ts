import assert from "node:assert/strict";
import test from "node:test";
import { validateBirthDetailsCorrection } from "./birthDetailsCorrection.ts";

test("accepts a complete known-time correction", () => {
  const value = validateBirthDetailsCorrection({ fullName: "  Asha   Rao ", dateOfBirth: "1992-02-29", birthTime: "06:30", birthTimeKnown: true, birthPlace: "Delhi, India" });
  assert.equal(value?.fullName, "Asha Rao"); assert.equal(value?.birthTime, "06:30");
});
test("accepts an unknown birth time as null", () => {
  const value = validateBirthDetailsCorrection({ fullName: "Asha Rao", dateOfBirth: "1992-02-29", birthTime: "", birthTimeKnown: false, birthPlace: "Delhi, India" });
  assert.equal(value?.birthTime, null);
});
test("rejects invalid calendar dates, markup, and partial data", () => {
  assert.equal(validateBirthDetailsCorrection({ fullName: "<b>Asha</b>", dateOfBirth: "1992-02-30", birthTime: "25:00", birthTimeKnown: true, birthPlace: "" }), null);
});
