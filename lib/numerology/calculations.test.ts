import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNumerologyProfile,
  normalizeNumerologyName,
  reduceNumber,
} from "./calculations.ts";

test("reduces ordinary and master numbers consistently", () => {
  assert.equal(reduceNumber(16).reducedNumber, 7);
  assert.equal(reduceNumber(11).reducedNumber, 11);
  assert.equal(reduceNumber(22).reducedNumber, 22);
  assert.equal(reduceNumber(33).reducedNumber, 33);
  assert.equal(reduceNumber(11, false).reducedNumber, 2);
});

test("normalizes case, spaces, punctuation, numbers, and Latin diacritics", () => {
  assert.equal(normalizeNumerologyName("  Jose D'Souza 2nd "), "JOSEDSOUZAND");
  assert.equal(normalizeNumerologyName("marie-claire"), "MARIECLAIRE");
});

test("calculates the documented Life Path example", () => {
  const profile = calculateNumerologyProfile({
    fullName: "Anita Sharma",
    dateOfBirth: "1992-08-14",
    timezone: "Asia/Kolkata",
    now: new Date("2026-07-16T06:00:00.000Z"),
  });

  assert.equal(profile.coreNumbers.lifePath.reducedNumber, 7);
  assert.equal(profile.coreNumbers.birthday.reducedNumber, 5);
  assert.match(profile.coreNumbers.lifePath.steps.at(-1) || "", /16 -> 1 \+ 6 = 7/);
});

test("treats Y as a consonant", () => {
  const profile = calculateNumerologyProfile({
    fullName: "Amy Ray",
    dateOfBirth: "2000-01-01",
    timezone: "UTC",
    now: new Date("2026-01-02T12:00:00.000Z"),
  });

  assert.equal(profile.nameBreakdown.vowels.includes("Y"), false);
  assert.equal(profile.nameBreakdown.consonants.filter((letter) => letter === "Y").length, 2);
});

test("supports leap-year dates and rejects invalid dates", () => {
  assert.doesNotThrow(() =>
    calculateNumerologyProfile({
      fullName: "Ada Lovelace",
      dateOfBirth: "2000-02-29",
      timezone: "UTC",
    }),
  );
  assert.throws(() =>
    calculateNumerologyProfile({
      fullName: "Ada Lovelace",
      dateOfBirth: "2001-02-29",
      timezone: "UTC",
    }),
  );
});

test("rejects names without supported vowels or consonants", () => {
  assert.throws(() =>
    calculateNumerologyProfile({
      fullName: "",
      dateOfBirth: "2000-01-01",
      timezone: "UTC",
    }),
  );
  assert.throws(() =>
    calculateNumerologyProfile({
      fullName: "1234",
      dateOfBirth: "2000-01-01",
      timezone: "UTC",
    }),
  );
  assert.throws(() =>
    calculateNumerologyProfile({
      fullName: "AEIOU",
      dateOfBirth: "2000-01-01",
      timezone: "UTC",
    }),
  );
});

test("calculates Personal Year, Month, and Day from the server date", () => {
  const profile = calculateNumerologyProfile({
    fullName: "Anita Sharma",
    dateOfBirth: "1992-08-14",
    timezone: "Asia/Kolkata",
    now: new Date("2026-07-16T18:45:00.000Z"),
  });

  assert.equal(profile.cycles.calculatedForDate, "2026-07-17");
  assert.equal(profile.cycles.personalYear.reducedNumber, 5);
  assert.equal(profile.cycles.personalMonth.reducedNumber, 3);
  assert.equal(profile.cycles.personalDay.reducedNumber, 2);
});

test("profile output changes when source name or date changes", () => {
  const base = {
    fullName: "Anita Sharma",
    dateOfBirth: "1992-08-14",
    timezone: "UTC",
    now: new Date("2026-01-01T12:00:00.000Z"),
  };
  const original = calculateNumerologyProfile(base);
  const renamed = calculateNumerologyProfile({ ...base, fullName: "Anita Verma" });
  const reborn = calculateNumerologyProfile({ ...base, dateOfBirth: "1992-08-15" });

  assert.notEqual(
    original.coreNumbers.expression.rawTotal,
    renamed.coreNumbers.expression.rawTotal,
  );
  assert.notEqual(
    original.coreNumbers.lifePath.reducedNumber,
    reborn.coreNumbers.lifePath.reducedNumber,
  );
});
