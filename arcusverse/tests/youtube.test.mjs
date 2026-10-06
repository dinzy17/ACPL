import test from "node:test";
import assert from "node:assert/strict";
import { parseYoutubeVideoId, youtubeEmbedSrc } from "../lib/youtube.mjs";

test("parseYoutubeVideoId accepts common URL shapes", () => {
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYoutubeVideoId(""), null);
  assert.equal(parseYoutubeVideoId("https://example.com/x"), null);
});

test("youtubeEmbedSrc builds embed URL", () => {
  const src = youtubeEmbedSrc("https://youtube.com/live/dQw4w9WgXcQ");
  assert.ok(src?.startsWith("https://www.youtube.com/embed/dQw4w9WgXcQ?"));
});
