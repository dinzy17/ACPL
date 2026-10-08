import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { saveCelebrationGifBuffer, loadStore, saveStore } from "../server/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "../public/celebrations");
const store = loadStore();
for (const kind of ["sold", "unsold"]) {
  const src = path.join(dir, `tiger-${kind}.gif`);
  if (!fs.existsSync(src)) {
    console.log("skip missing", src);
    continue;
  }
  const buf = fs.readFileSync(src);
  const saved = saveCelebrationGifBuffer(buf, kind);
  store.meta = store.meta || {};
  store.meta.celebrations = {
    ...(store.meta.celebrations || {}),
    [saved.kind]: { url: saved.url, bytes: saved.bytes, ext: saved.ext, updatedAt: Date.now() }
  };
  console.log(kind, saved);
}
saveStore(store);
console.log("done");
