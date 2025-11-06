/* eslint-disable n/no-unsupported-features/node-builtins */
import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  createRegExpFromExtensions,
  ANY_ATTACHMENT_REGEXP,
  BINARY_ATTACHMENT_REGEXP,
} from "./index.js";

describe("createRegExpFromExt", () => {
  const regexp = createRegExpFromExtensions("foo");

  it("accepts the extension", () => {
    strictEqual(regexp.test("test.foo"), true);
  });

  it("accepts uppercase", () => {
    strictEqual(regexp.test("test.FOO"), true);
  });

  it("rejects intermediate extensions", () => {
    strictEqual(regexp.test("test.foo.bar"), false);
  });

  it("rejects other extensions", () => {
    strictEqual(regexp.test("test.bar"), false);
  });

  it("rejects extensions starting with it", () => {
    strictEqual(regexp.test("test.foob"), false);
  });

  it("rejects extensions ending with it", () => {
    strictEqual(regexp.test("test.afoo"), false);
  });
});

describe("ANY_ATTACHMENT_REGEXP", () => {
  const regexp = ANY_ATTACHMENT_REGEXP;
  it("accepts audio files", () => {
    strictEqual(regexp.test("audio.mp3"), true);
  });

  it("accepts video files", () => {
    strictEqual(regexp.test("video.mp4"), true);
  });

  it("accepts font files", () => {
    strictEqual(regexp.test("diagram.svg"), true);
  });

  ["index.html", "index.json", "index.md", "contributors.txt"].forEach(
    (filename) =>
      it(`rejects ${filename}`, () => {
        strictEqual(regexp.test(filename), false);
      })
  );
});

describe("BINARY_ATTACHMENT_REGEXP", () => {
  const regexp = BINARY_ATTACHMENT_REGEXP;
  it("rejects svg files", () => {
    strictEqual(regexp.test("diagram.svg"), false);
  });
});
