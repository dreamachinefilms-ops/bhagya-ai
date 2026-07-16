import assert from "node:assert/strict";
import test from "node:test";

import { resolveBirthPlace } from "./locationResolver.ts";

const agraInputs = [
  "Agra",
  "Agra, India",
  "Agra, UP, India",
  "Agra, Uttar Pradesh, India",
  "MG Road, Agra",
  "Malhotra hospital, Agra",
  "Taj Mahal, India",
];

for (const input of agraInputs) {
  test(`resolves ${input}`, () => {
    const location = resolveBirthPlace(input);

    assert.equal(location?.name, "Agra");
    assert.equal(location?.displayName, "Agra, Uttar Pradesh, India");
    assert.equal(location?.timezoneId, "Asia/Kolkata");
  });
}

test("does not mistake Agartala for Agra", () => {
  assert.equal(resolveBirthPlace("Agartala, Tripura")?.name, "Agartala");
});
