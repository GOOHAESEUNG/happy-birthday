// Firestore entries 컬렉션을 entries.json 정적 파일로 덤프
// 사용: node backup.js
// DB가 사라지기 전에 재실행하면 최신 상태가 반영됨

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const k = t.slice(0, idx);
    const v = t.slice(idx + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const projectId = process.env.FIREBASE_PROJECT_ID || 'happy-day-a6473';
const apiKey = process.env.FIREBASE_API_KEY;

if (!apiKey) {
  console.error('FIREBASE_API_KEY 가 .env 에 없습니다.');
  process.exit(1);
}

function fromFirestoreValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) {
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (v.mapValue !== undefined) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(val);
    }
    return out;
  }
  return null;
}

function docToObject(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

async function fetchAll() {
  const all = [];
  let pageToken = '';
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/entries`
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const doc of data.documents || []) {
      all.push(docToObject(doc));
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

(async () => {
  const entries = await fetchAll();
  entries.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
    return tb - ta;
  });
  const valid = entries.filter((e) => Array.isArray(e.stars) && e.stars.length > 0);
  const outPath = path.resolve(__dirname, 'entries.json');
  fs.writeFileSync(outPath, JSON.stringify(valid));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`${valid.length}개 별자리 → entries.json (${kb} KB)`);
})().catch((err) => {
  console.error('백업 실패:', err);
  process.exit(1);
});
