import assert from "node:assert/strict";
import test from "node:test";
import { calculateNumerologyProfile } from "./calculations.ts";
import { serializeNumerologyBlueprint } from "./messages.ts";
import {
  buildDeterministicCalculationAnswer,
  isCalculationExplanationRequest,
  selectNumerologyResponseDepth,
} from "./prompt.ts";

const profile = calculateNumerologyProfile({
  fullName: "Anita Sharma",
  dateOfBirth: "1992-08-14",
  timezone: "Asia/Kolkata",
  now: new Date("2026-07-16T06:00:00.000Z"),
});

test("selects response depth from the user's intent", () => {
  assert.equal(selectNumerologyResponseDepth("Career"), "brief");
  assert.equal(selectNumerologyResponseDepth("What does my Life Path mean?"), "standard");
  assert.equal(selectNumerologyResponseDepth("Explain everything in detail"), "deep");
  assert.equal(selectNumerologyResponseDepth("I feel lost and deeply worried"), "deep");
});

test("returns exact deterministic steps for calculation questions", () => {
  const question = "How was my Life Path calculated?";
  assert.equal(isCalculationExplanationRequest(question), true);
  assert.equal(isCalculationExplanationRequest("Show my calculations"), true);

  const answer = buildDeterministicCalculationAnswer(profile, question);
  assert.match(answer, /^Life Path: 7/m);
  assert.match(answer, /Month: 8/);
  assert.match(answer, /Day: 14 -> 1 \+ 4 = 5/);
  assert.match(answer, /Total: 8 \+ 5 \+ 3 = 16 -> 1 \+ 6 = 7/);
});

test("saved blueprint messages omit the full name and date of birth", () => {
  const content = serializeNumerologyBlueprint(profile, "Anita");
  assert.equal(content.includes("Anita Sharma"), false);
  assert.equal(content.includes("1992-08-14"), false);
  assert.equal(content.includes('"displayFirstName":"Anita"'), true);
});
