const test = require("node:test");
const assert = require("node:assert/strict");
const https = require("https");
const { PassThrough } = require("stream");

const { fetchLatestRelease } = require("../../scripts/lib/download-utils");

function mockResponse(statusCode, headers = {}, body = "") {
  const response = new PassThrough();
  response.statusCode = statusCode;
  response.headers = headers;
  process.nextTick(() => response.end(body));
  return response;
}

test("falls back to the public GitHub release page when the API returns 403", async (t) => {
  const originalGet = https.get;
  const requestedUrls = [];

  https.get = (url, _options, callback) => {
    requestedUrls.push(url);
    let response;

    if (url === "https://api.github.com/repos/qdrant/qdrant/releases/latest") {
      response = mockResponse(403);
    } else if (url === "https://github.com/qdrant/qdrant/releases/latest") {
      response = mockResponse(302, {
        location: "/qdrant/qdrant/releases/tag/v1.18.3",
      });
    } else if (url === "https://github.com/qdrant/qdrant/releases/tag/v1.18.3") {
      response = mockResponse(200, {}, "<html></html>");
    } else if (url === "https://github.com/qdrant/qdrant/releases/expanded_assets/v1.18.3") {
      response = mockResponse(
        200,
        {},
        [
          '<a href="/qdrant/qdrant/releases/download/v1.18.3/qdrant-x86_64-unknown-linux-gnu.tar.gz">Linux</a>',
          '<a href="/qdrant/qdrant/releases/download/v1.18.3/qdrant-aarch64-apple-darwin.tar.gz?download=1&amp;x=2">macOS</a>',
        ].join("")
      );
    } else {
      throw new Error(`Unexpected URL: ${url}`);
    }

    const request = new PassThrough();
    request.setTimeout = () => request;
    process.nextTick(() => callback(response));
    return request;
  };

  t.after(() => {
    https.get = originalGet;
  });

  const release = await fetchLatestRelease("qdrant/qdrant");

  assert.equal(release.tag, "v1.18.3");
  assert.equal(release.assets.length, 2);
  assert.equal(release.assets[0].name, "qdrant-x86_64-unknown-linux-gnu.tar.gz");
  assert.equal(
    release.assets[0].url,
    "https://github.com/qdrant/qdrant/releases/download/v1.18.3/qdrant-x86_64-unknown-linux-gnu.tar.gz"
  );
  assert.equal(release.assets[1].name, "qdrant-aarch64-apple-darwin.tar.gz");
  assert.ok(requestedUrls.includes("https://github.com/qdrant/qdrant/releases/latest"));
});

test("uses the release-page fallback for an exact tag", async (t) => {
  const originalGet = https.get;

  https.get = (url, _options, callback) => {
    let response;
    if (url === "https://api.github.com/repos/example/project/releases/tags/v2.0.0") {
      response = mockResponse(403);
    } else if (url === "https://github.com/example/project/releases/expanded_assets/v2.0.0") {
      response = mockResponse(
        200,
        {},
        '<a href="/example/project/releases/download/v2.0.0/app.zip">app.zip</a>'
      );
    } else {
      throw new Error(`Unexpected URL: ${url}`);
    }

    const request = new PassThrough();
    request.setTimeout = () => request;
    process.nextTick(() => callback(response));
    return request;
  };

  t.after(() => {
    https.get = originalGet;
  });

  const release = await fetchLatestRelease("example/project", { tag: "v2.0.0" });
  assert.equal(release.tag, "v2.0.0");
  assert.deepEqual(release.assets, [
    {
      name: "app.zip",
      url: "https://github.com/example/project/releases/download/v2.0.0/app.zip",
    },
  ]);
});
