import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYoutubeVideoId,
  parseYoutubeChannelId,
  youtubeEmbedSrc,
  isYoutubeUrl
} from "../lib/youtube.mjs";

test("parseYoutubeVideoId accepts common URL shapes", () => {
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId(""), null);
  assert.equal(parseYoutubeVideoId("https://example.com/x"), null);
});

test("parseYoutubeChannelId and live_stream embed", () => {
  assert.equal(
    parseYoutubeChannelId("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw/live"),
    "UCuAXFkgsw1L7xaCfnd5JJOw"
  );
  const src = youtubeEmbedSrc("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw/live");
  assert.ok(src?.includes("embed/live_stream"));
  assert.ok(src?.includes("channel=UCuAXFkgsw1L7xaCfnd5JJOw"));
});

test("youtubeEmbedSrc builds embed URL", () => {
  const src = youtubeEmbedSrc("https://youtube.com/live/dQw4w9WgXcQ");
  assert.ok(src?.startsWith("https://www.youtube.com/embed/dQw4w9WgXcQ?"));
});

test("isYoutubeUrl accepts youtube hosts", () => {
  assert.equal(isYoutubeUrl("https://www.youtube.com/@someone/live"), true);
  assert.equal(isYoutubeUrl("https://example.com"), false);
});
