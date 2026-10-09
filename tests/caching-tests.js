import { describe, it } from "node:test";
import assert from "node:assert";

const BASE_URL = "https://developer.allizom.org/";

describe("redirectPreferredLocale", () => {
  it("should redirect if preferredlocale is set", async () => {
    let response = await fetch(new URL("/en-US/docs/Web", BASE_URL));
    assert.ok(response.url.endsWith("/en-US/docs/Web"), response.url);

    response = await fetch(new URL("/en-US/docs/Web", BASE_URL), {
      headers: new Headers({
        cookie: "preferredlocale=fr",
      }),
    });
    assert.ok(response.url.endsWith("/fr/docs/Web"), response.url);
  });

  it("shouldn't redirect if page doesn't exist in preferred locale", async () => {
    let response = await fetch(
      new URL("/en-US/docs/MDN/Kitchensink", BASE_URL)
    );
    assert.ok(
      response.url.endsWith("/en-US/docs/MDN/Kitchensink"),
      response.url
    );

    response = await fetch(new URL("/en-US/docs/MDN/Kitchensink", BASE_URL), {
      headers: new Headers({
        cookie: "preferredlocale=fr",
      }),
    });
    assert.ok(
      response.url.endsWith("/en-US/docs/MDN/Kitchensink"),
      response.url
    );
  });
});

describe("redirectLocale", () => {
  it("should redirect to preferredlocale", async () => {
    let response = await fetch(new URL("/", BASE_URL), {
      headers: new Headers({
        cookie: "preferredlocale=en-US",
      }),
    });
    assert.ok(response.url.endsWith("/en-US/"), response.url);

    response = await fetch(new URL("/", BASE_URL), {
      headers: new Headers({
        cookie: "preferredlocale=fr",
      }),
    });
    assert.ok(response.url.endsWith("/fr/"), response.url);
  });

  it("should redirect to Accept-Language", async () => {
    let response = await fetch(new URL("/", BASE_URL), {
      headers: new Headers({
        "accept-language": "en-US",
      }),
    });
    assert.ok(response.url.endsWith("/en-US/"), response.url);

    response = await fetch(new URL("/", BASE_URL), {
      headers: new Headers({
        "accept-language": "fr",
      }),
    });
    assert.ok(response.url.endsWith("/fr/"), response.url);
  });
});
