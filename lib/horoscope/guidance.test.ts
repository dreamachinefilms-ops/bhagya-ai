import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyGuidance, sunSign } from "./guidance.ts";

const birth = { dateOfBirth: "1990-08-10", birthTime: "10:30", birthTimeKnown: true, birthPlace: "Delhi", latitude: 28.6, longitude: 77.2, timezoneOffset: "+05:30" };
test("derives a solar sign without claiming unsupported precision", () => { assert.equal(sunSign("1990-08-10"), "Leo"); const result = buildDailyGuidance({ profile: { firstName: "Asha" }, birth, date: "2026-07-22" }); assert.equal(result.sourceMode, "birth-profile-guidance"); assert.equal(result.luckyNumber, null); });
