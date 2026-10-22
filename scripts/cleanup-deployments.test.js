import { describe, it } from "node:test";
import { deepStrictEqual, throws } from "node:assert/strict";
import { classifyDeployments } from "./cleanup-deployments.js";

const CUTOFF = Date.UTC(2026, 9, 1);
const OLD = "deployments/20260901-120000-100-1/";
const RECENT = "deployments/20261010-120000-200-1/";

describe("classifyDeployments", () => {
  const cases = [
    {
      name: "expires old inactive deployment",
      input: [OLD],
      active: [],
      expected: { expired: [OLD], retained: [], unrecognized: [] },
    },
    {
      name: "retains old active deployment",
      input: [OLD],
      active: ["20260901-120000-100-1"],
      expected: { expired: [], retained: [OLD], unrecognized: [] },
    },
    {
      name: "retains recent deployment",
      input: [RECENT],
      active: [],
      expected: { expired: [], retained: [RECENT], unrecognized: [] },
    },
    {
      name: "retains deployment at the cutoff",
      input: ["deployments/20261001-000000-300-1/"],
      active: [],
      expected: {
        expired: [],
        retained: ["deployments/20261001-000000-300-1/"],
        unrecognized: [],
      },
    },
    {
      name: "skips unrecognized folder",
      input: ["deployments/main/", "deployments/20260901-120000/"],
      active: [],
      expected: {
        expired: [],
        retained: [],
        unrecognized: ["deployments/main/", "deployments/20260901-120000/"],
      },
    },
    {
      name: "classifies mixed listing",
      input: [OLD, RECENT, "deployments/main/"],
      active: [],
      expected: {
        expired: [OLD],
        retained: [RECENT],
        unrecognized: ["deployments/main/"],
      },
    },
  ];

  for (const { name, input, active, expected } of cases) {
    it(name, () => {
      deepStrictEqual(
        classifyDeployments(input, {
          cutoff: CUTOFF,
          activeDeployments: new Set(active),
        }),
        expected
      );
    });
  }

  it("throws for prefix outside deployments/", () => {
    throws(
      () =>
        classifyDeployments(["fred/"], {
          cutoff: CUTOFF,
          activeDeployments: new Set(),
        }),
      /Unexpected deployment prefix/
    );
  });
});
