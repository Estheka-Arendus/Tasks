// Runs every ~15 min from GitHub Actions: sends due event reminders and test pushes to every registered phone.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();
const now = Date.now();
const TZ = 'Europe/Tallinn';
const LATE_LIMIT = 6 * 3600e3; // don't send a reminder that is more than 6 h overdue (e.g. after downtime)

const fmtTime = ms => new Intl.DateTimeFormat('et-EE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);
const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ms);
function whenText(ev) {
  const d = dayKey(ev.startAt), today = dayKey(now), tomorrow = dayKey(now + 864e5);
  const day = d === today ? 'Täna' : d === tomorrow ? 'Homme'
    : new Intl.DateTimeFormat('et-EE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(ev.startAt);
  return ev.time ? `${day} kell ${fmtTime(ev.startAt)}` : day;
}

const tokenSnap = await db.collection('tokens').get();
const tokens = tokenSnap.docs.map(d => d.id);
async function send(title, body, tag, onlyUid) {
  const list = onlyUid ? tokenSnap.docs.filter(d => d.get('uid') === onlyUid).map(d => d.id) : tokens;
  if (!list.length) return 0;
  const res = await fcm.sendEachForMulticast({ tokens: list, data: { title, body, tag }, webpush: { headers: { Urgency: 'high', TTL: '21600' } } });
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument'))
      return db.collection('tokens').doc(list[i]).delete();
  }));
  return res.successCount;
}

let sent = 0;
const evs = await db.collection('events').where('startAt', '>', now - 864e5).get();
for (const doc of evs.docs) {
  const ev = doc.data(); const done = ev.notified || [];
  const due = (ev.remind || []).filter(m => !done.includes(m) && ev.startAt - m * 60000 <= now);
  if (!due.length) continue;
  const fresh = due.filter(m => now - (ev.startAt - m * 60000) <= LATE_LIMIT);
  if (fresh.length) {
    const body = [whenText(ev), ev.place].filter(Boolean).join(' · ');
    sent += await send(ev.title, ev.startAt <= now ? 'Algab nüüd' + (ev.place ? ' · ' + ev.place : '') : body, 'ev-' + doc.id);
  }
  await doc.ref.update({ notified: FieldValue.arrayUnion(...due) });
}

const tests = await db.collection('testPush').get();
for (const t of tests.docs) { sent += await send('Tasks', 'Proovi-teade töötab ✅', 'test', t.get('uid')); await t.ref.delete(); }

console.log(`tokens=${tokens.length} events=${evs.size} pushes_sent=${sent}`);
