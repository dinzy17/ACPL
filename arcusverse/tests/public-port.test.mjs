import test from "node:test";
import assert from "node:assert/strict";
import {
  advertiseUrls,
  baseUrlWithPort,
  publicBaseUrl,
  publicUrlPort,
  repointAdvertiseUrls
} from "../server/store.mjs";

function withPublicUrl(value, fn) {
  const prev = process.env.PUBLIC_URL;
  if (value == null) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = value;
  try {
    return fn();
  } finally {
    if (prev == null) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = prev;
  }
}

test("portless PUBLIC_URL resolves to the port that must be served", () => {
  withPublicUrl("http://3.16.112.125", () => {
    assert.equal(publicBaseUrl(3000), "http://3.16.112.125");
    assert.equal(publicUrlPort(3000), 80);
  });
  withPublicUrl("https://acpl.example.com", () => {
    assert.equal(publicUrlPort(3000), 443);
  });
});

test("explicit port in PUBLIC_URL needs no extra listener", () => {
  withPublicUrl("http://3.16.112.125:3000", () => {
    assert.equal(publicUrlPort(3000), 3000);
  });
  withPublicUrl("3.16.112.125", () => {
    assert.equal(publicBaseUrl(3000), "http://3.16.112.125:3000");
    assert.equal(publicUrlPort(3000), 3000);
  });
});

test("no PUBLIC_URL means no advertised port", () => {
  withPublicUrl(null, () => {
    assert.equal(publicUrlPort(3000), null);
  });
});

test("falling back repoints every advertised URL at the served port", () => {
  withPublicUrl("http://3.16.112.125", () => {
    const urls = advertiseUrls(3000);
    assert.equal(urls.appUrl, "http://3.16.112.125");

    repointAdvertiseUrls(urls, 3000);
    assert.equal(urls.appUrl, "http://3.16.112.125:3000");
    assert.deepEqual(urls.appUrls, ["http://3.16.112.125:3000"]);
    assert.deepEqual(urls.spectatorUrls, ["http://3.16.112.125:3000/live"]);
  });
});

test("baseUrlWithPort keeps the scheme and drops trailing slashes", () => {
  assert.equal(baseUrlWithPort("http://3.16.112.125", 3000), "http://3.16.112.125:3000");
  assert.equal(baseUrlWithPort("http://3.16.112.125:80/", 3000), "http://3.16.112.125:3000");
  assert.equal(baseUrlWithPort("https://acpl.example.com", 8443), "https://acpl.example.com:8443");
});
