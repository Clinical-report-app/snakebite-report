'use strict';
/* Hyam Institute Snakebite Case Report: offline web app prototype */

const CONFIG = {
  formVersion: '2.2-pwa',
  /* Set to a server URL to enable sending. Reports are POSTed as multipart form data:
     field "record" (JSON) plus "bitePhoto_N" and "snakePhoto" image files. */
  endpoint: ''
};

const single = {};        // single choice groups
const multi = {};         // multi choice groups (Sets)
let bitePhotos = [];      // {blob, name, url, stage, daysAfterBite}
let snakePhoto = null;    // {blob, name, url}
let reportRef = null;
let restoring = false;

/* ---------- On-device storage (IndexedDB) ---------- */
const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('hyam-snakebite', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('reports', { keyPath: 'ref' }); r.result.createObjectStore('drafts'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); let out;
      const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error);
    });
  };
  return {
    put: (store, val, key) => run(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)),
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    all: store => run(store, 'readonly', s => s.getAll())
  };
})();

function makeRef(){
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = 'HI-';
  for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}
function setRef(r){ reportRef = r; document.getElementById('formRef').textContent = 'REF ' + r; }

/* ---------- Countries ---------- */
const ISO = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GF GA GM GE DE GH GR GD GP GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');
const NAME_FIX = { CD:'Democratic Republic of the Congo', CG:'Republic of the Congo', MM:'Myanmar', PS:'Palestine', HK:'Hong Kong', MO:'Macao', KP:'North Korea', KR:'South Korea', CI:"Côte d'Ivoire" };
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' }); } catch (e) {}
const countryName = code => code === 'OTHER' ? 'Other' : (NAME_FIX[code] || (regionNames ? regionNames.of(code) : code));
(function fillCountries(){
  const sel = document.getElementById('country');
  ISO.map(code => ({ code, name: countryName(code) }))
     .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
     .forEach(c => sel.add(new Option(c.name, c.code)));
  sel.add(new Option('Other / not listed', 'OTHER'));
})();

/* ---------- Option groups ---------- */
const valOf = el => el.dataset.v || el.textContent.trim();
function setOpt(el, on){
  el.classList.remove('active', 'active-danger');
  if (on) el.classList.add(el.hasAttribute('data-danger') ? 'active-danger' : 'active');
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}
document.querySelectorAll('[data-key]').forEach(group => {
  group.querySelectorAll('.opt').forEach(opt => {
    opt.setAttribute('role', group.classList.contains('multi') ? 'checkbox' : 'radio');
    opt.setAttribute('aria-checked', 'false');
    opt.tabIndex = 0;
    opt.addEventListener('click', () => pick(group, opt));
    opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(group, opt); } });
  });
});
function pick(group, opt){
  const key = group.dataset.key, v = valOf(opt);
  if (group.classList.contains('multi')) {
    const s = multi[key] || (multi[key] = new Set());
    if (s.has(v)) { s.delete(v); setOpt(opt, false); }
    else {
      group.querySelectorAll('.opt').forEach(o => {
        const clash = opt.hasAttribute('data-exclusive') ? o !== opt : o.hasAttribute('data-exclusive');
        if (clash) { s.delete(valOf(o)); setOpt(o, false); }
      });
      s.add(v); setOpt(opt, true);
    }
  } else {
    group.querySelectorAll('.opt').forEach(o => setOpt(o, false));
    setOpt(opt, true); single[key] = v;
  }
  const f = group.closest('.field'); if (f) f.classList.remove('error');
  const nx = group.nextElementSibling; if (nx && nx.classList.contains('field')) nx.classList.remove('error');
  refresh(); scheduleSave();
}

/* ---------- Conditional panels and progress ---------- */
function readKey(key){
  if (key in single) return single[key];
  const el = document.getElementById(key);
  return el ? el.value : null;
}
function refresh(){
  document.querySelectorAll('[data-show-if]').forEach(el => {
    const rule = el.dataset.showIf; let show;
    if (rule.includes('~')) { const [k, v] = rule.split('~'); show = !!(multi[k] && multi[k].has(v)); }
    else { const [k, v] = rule.split('='); show = v.split('|').includes(readKey(k)); }
    el.classList.toggle('visible', show);
  });
  updateProgress();
}
const isHidden = el => !!el.closest('.cond:not(.visible)');
function requiredItems(){
  const items = [];
  document.querySelectorAll('[data-req]').forEach(el => {
    if (isHidden(el)) return;
    if (el.dataset.key) items.push({ el, filled: !!single[el.dataset.key] || !!(multi[el.dataset.key] && multi[el.dataset.key].size) });
    else { const input = el.querySelector('input, select, textarea'); items.push({ el, filled: !!(input && input.value.trim()) }); }
  });
  return items;
}
function updateProgress(){
  const items = requiredItems();
  const pct = items.length ? Math.round(items.filter(i => i.filled).length / items.length * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '% complete';
}
document.querySelectorAll('#mainForm input:not([type=file]), #mainForm select, #mainForm textarea').forEach(el => {
  const evt = (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'checkbox') ? 'change' : 'input';
  el.addEventListener(evt, () => { const f = el.closest('.field'); if (f) f.classList.remove('error'); refresh(); scheduleSave(); });
});
document.getElementById('biteDate').max = new Date().toISOString().slice(0, 10);

/* ---------- Photographs: re-encoded on the device to strip location and other metadata ---------- */
async function cleanImage(file){
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { bmp = await createImageBitmap(file); }
  const MAX = 2000, scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', 0.85));
}
const jpgName = n => n.replace(/\.[^.]+$/, '') + '.jpg';

const snakeInput = document.getElementById('snakePhoto');
const snakeMsg = document.createElement('span'); snakeMsg.className = 'hint'; snakeInput.after(snakeMsg);
snakeInput.addEventListener('change', async () => {
  const file = snakeInput.files[0]; snakeInput.value = '';
  if (!file) return;
  try {
    const blob = await cleanImage(file);
    if (snakePhoto) URL.revokeObjectURL(snakePhoto.url);
    snakePhoto = { blob, name: jpgName(file.name), url: URL.createObjectURL(blob) };
    showSnakePhoto(); scheduleSave();
  } catch (e) { snakeMsg.textContent = 'This image format could not be read. Please try a JPEG or PNG.'; }
});
function showSnakePhoto(){
  const img = document.getElementById('photoPreview');
  if (snakePhoto) { img.src = snakePhoto.url; img.style.display = 'block'; snakeMsg.textContent = snakePhoto.name + ' attached'; }
  else { img.style.display = 'none'; snakeMsg.textContent = ''; }
}

const STAGES = ['On arrival','Before antivenom','During treatment','After antivenom','After surgery','At discharge','Follow up','Other'];
const photoInput = document.querySelector('.bite-photo-input');
photoInput.addEventListener('change', async () => {
  const files = [...photoInput.files]; photoInput.value = '';
  let failed = 0;
  for (const file of files) {
    try { const blob = await cleanImage(file); bitePhotos.push({ blob, name: jpgName(file.name), url: URL.createObjectURL(blob), stage: '', daysAfterBite: null }); }
    catch (e) { failed++; }
  }
  renderPhotos();
  if (failed) document.getElementById('photoCount').textContent += (bitePhotos.length ? ' · ' : '') + failed + ' could not be read (please use JPEG or PNG)';
  scheduleSave();
});
function renderPhotos(){
  const list = document.getElementById('photoList'); list.innerHTML = '';
  bitePhotos.forEach((p, i) => {
    const card = document.createElement('div'); card.className = 'photo-card';
    card.innerHTML = '<img alt="Bite photograph ' + (i + 1) + '"><div class="pc-body"><div class="pc-name"></div>' +
      '<select aria-label="Stage of treatment"><option value="">Stage of treatment&hellip;</option>' + STAGES.map(s => '<option>' + s + '</option>').join('') + '</select>' +
      '<input type="number" min="0" max="365" placeholder="Days after bite" aria-label="Days after bite">' +
      '<button type="button" class="pc-remove">Remove</button></div>';
    card.querySelector('img').src = p.url;
    card.querySelector('.pc-name').textContent = p.name;
    const sel = card.querySelector('select'); sel.value = p.stage;
    sel.addEventListener('change', () => { p.stage = sel.value; scheduleSave(); });
    const day = card.querySelector('input'); day.value = p.daysAfterBite ?? '';
    day.addEventListener('input', () => { p.daysAfterBite = day.value === '' ? null : Number(day.value); scheduleSave(); });
    card.querySelector('.pc-remove').addEventListener('click', () => { URL.revokeObjectURL(p.url); bitePhotos.splice(i, 1); renderPhotos(); scheduleSave(); });
    list.appendChild(card);
  });
  document.getElementById('photoCount').textContent = bitePhotos.length ? bitePhotos.length + ' photograph' + (bitePhotos.length > 1 ? 's' : '') + ' added' : '';
  single.hasBitePhotos = bitePhotos.length ? 'yes' : 'no';
  if (!bitePhotos.length) document.getElementById('photoConsent').checked = false;
  refresh();
}

/* ---------- Validation and data record ---------- */
function validate(){
  let ok = true;
  requiredItems().forEach(({ el, filled }) => {
    const f = el.classList.contains('field') ? el : (el.closest('.field') || el.nextElementSibling);
    if (f) f.classList.toggle('error', !filled);
    if (!filled) ok = false;
  });
  const pc = document.getElementById('photoConsent');
  if (bitePhotos.length && !pc.checked) { pc.closest('.field').classList.add('error'); ok = false; }
  const decl = document.getElementById('declaration').checked;
  document.getElementById('declarationErr').style.display = decl ? 'none' : 'block';
  return ok && decl;
}
const num = v => v === '' ? null : Number(v);
function collectData(){
  const data = { ref: reportRef, formVersion: CONFIG.formVersion, submittedAt: new Date().toISOString() };
  document.querySelectorAll('.section[data-sec]').forEach(sec => {
    const out = {};
    sec.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
      if (isHidden(el) || el.type === 'file') return;
      if (el.type === 'checkbox') out[el.id] = el.checked;
      else if (el.type === 'number') out[el.id] = num(el.value);
      else out[el.id] = el.value.trim() || null;
    });
    sec.querySelectorAll('[data-key]').forEach(g => {
      if (isHidden(g)) return;
      const k = g.dataset.key;
      out[k] = g.classList.contains('multi') ? (multi[k] ? [...multi[k]] : []) : (single[k] || null);
    });
    data[sec.dataset.sec] = out;
  });
  data.snake.snakePhoto = snakePhoto ? snakePhoto.name : null;
  data.clinicalFeatures.bitePhotos = bitePhotos.map(p => ({ fileName: p.name, stage: p.stage || null, daysAfterBite: p.daysAfterBite }));
  /* Clinician identity is personal data: kept in a separate block so it can be stored separately */
  data.clinicianIdentity = data.clinician; delete data.clinician;
  return data;
}

/* ---------- Drafts: saved automatically so nothing is lost if the app closes ---------- */
function snapshot(){
  const fields = {};
  document.querySelectorAll('#mainForm input[id]:not([type=file]), #mainForm select[id], #mainForm textarea[id]').forEach(el => {
    fields[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  const m = {}; Object.keys(multi).forEach(k => m[k] = [...multi[k]]);
  return {
    ref: reportRef, savedAt: new Date().toISOString(), fields, single: { ...single }, multi: m,
    bitePhotos: bitePhotos.map(({ blob, name, stage, daysAfterBite }) => ({ blob, name, stage, daysAfterBite })),
    snakePhoto: snakePhoto ? { blob: snakePhoto.blob, name: snakePhoto.name } : null
  };
}
const hasContent = d => d && (Object.values(d.fields).some(v => v && v !== false) || Object.keys(d.single).some(k => k !== 'hasBitePhotos') || Object.values(d.multi).some(a => a.length) || d.bitePhotos.length || d.snakePhoto);
let saveTimer;
function scheduleSave(){
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => DB.put('drafts', snapshot(), 'current').catch(() => {}), 500);
}
function restore(d){
  restoring = true;
  setRef(d.ref || makeRef());
  Object.entries(d.fields || {}).forEach(([id, v]) => {
    const el = document.getElementById(id); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  Object.entries(d.single || {}).forEach(([k, v]) => {
    single[k] = v;
    const g = document.querySelector('[data-key="' + k + '"]');
    if (g) g.querySelectorAll('.opt').forEach(o => setOpt(o, valOf(o) === v));
  });
  Object.entries(d.multi || {}).forEach(([k, arr]) => {
    multi[k] = new Set(arr);
    const g = document.querySelector('[data-key="' + k + '"]');
    if (g) g.querySelectorAll('.opt').forEach(o => setOpt(o, multi[k].has(valOf(o))));
  });
  bitePhotos = (d.bitePhotos || []).map(p => ({ ...p, url: URL.createObjectURL(p.blob) }));
  snakePhoto = d.snakePhoto ? { ...d.snakePhoto, url: URL.createObjectURL(d.snakePhoto.blob) } : null;
  renderPhotos(); showSnakePhoto();
  restoring = false;
}

/* ---------- Submit, sync and saved reports ---------- */
async function submitForm(){
  if (!validate()) {
    const first = document.querySelector('.field.error, #declarationErr[style*="block"]');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const record = collectData();
  const report = {
    ref: reportRef, createdAt: record.submittedAt, status: 'pending', record,
    bitePhotos: bitePhotos.map(({ blob, name, stage, daysAfterBite }) => ({ blob, name, stage, daysAfterBite })),
    snakePhoto: snakePhoto ? { blob: snakePhoto.blob, name: snakePhoto.name } : null
  };
  try { await DB.put('reports', report); }
  catch (e) { toast('Could not save on this device: storage may be full.'); return; }
  clearTimeout(saveTimer);
  await DB.del('drafts', 'current').catch(() => {});
  document.getElementById('recordOut').textContent = JSON.stringify(record, null, 2);
  document.getElementById('mainForm').style.display = 'none';
  document.getElementById('successScreen').classList.add('visible');
  document.getElementById('successRef').textContent = 'Case reference: ' + reportRef;
  document.getElementById('successBody').textContent = CONFIG.endpoint
    ? 'Thank you. The report is saved on this device and will be sent to the Hyam Institute automatically whenever there is a connection.'
    : 'Thank you. The report is saved on this device. (Prototype: no server is connected yet, so reports stay on this device until exported.)';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await trySync(); updateDeviceBar();
}

let syncing = false;
async function trySync(){
  if (!CONFIG.endpoint || !navigator.onLine || syncing) return;
  syncing = true;
  try {
    const pending = (await DB.all('reports')).filter(r => r.status === 'pending');
    for (const r of pending) {
      const fd = new FormData();
      fd.append('record', JSON.stringify(r.record));
      r.bitePhotos.forEach((p, i) => fd.append('bitePhoto_' + i, p.blob, p.name));
      if (r.snakePhoto) fd.append('snakePhoto', r.snakePhoto.blob, r.snakePhoto.name);
      try {
        const res = await fetch(CONFIG.endpoint, { method: 'POST', body: fd });
        if (res.ok) { r.status = 'sent'; r.sentAt = new Date().toISOString(); await DB.put('reports', r); }
      } catch (e) { break; }
    }
  } finally { syncing = false; updateDeviceBar(); }
}

async function updateDeviceBar(){
  const net = document.getElementById('netStatus');
  net.textContent = navigator.onLine ? 'Online' : 'Offline';
  net.classList.toggle('offline', !navigator.onLine);
  let reports = [];
  try { reports = await DB.all('reports'); } catch (e) {}
  const pending = reports.filter(r => r.status === 'pending').length;
  document.getElementById('deviceCount').textContent = reports.length
    ? reports.length + ' report' + (reports.length > 1 ? 's' : '') + ' on this device' + (pending ? ', ' + pending + ' not yet sent' : '')
    : 'No reports saved on this device';
  if (!document.getElementById('reportsPanel').hidden) renderReports(reports);
}

function renderReports(reports){
  const list = document.getElementById('reportsList'); list.innerHTML = '';
  if (!reports.length) { list.innerHTML = '<p class="rp-empty">No reports saved on this device yet.</p>'; return; }
  reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(r => {
    const row = document.createElement('div'); row.className = 'rp-row';
    const when = new Date(r.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const f = r.record.facility || {}, o = r.record.outcome || {};
    row.innerHTML = '<div class="rp-main"><div class="rp-ref"></div><div class="rp-meta"></div></div><span class="rp-status"></span><button type="button" class="rp-del">Delete</button>';
    row.querySelector('.rp-ref').textContent = r.ref;
    row.querySelector('.rp-meta').textContent = [when, f.country ? countryName(f.country) : null, o.outcome, (r.bitePhotos.length ? r.bitePhotos.length + ' photo' + (r.bitePhotos.length > 1 ? 's' : '') : null)].filter(Boolean).join(' · ');
    const st = row.querySelector('.rp-status'); st.textContent = r.status === 'sent' ? 'Sent' : 'Not sent'; st.classList.add(r.status);
    row.querySelector('.rp-del').addEventListener('click', async () => {
      if (!confirm('Delete report ' + r.ref + ' from this device? This cannot be undone.')) return;
      await DB.del('reports', r.ref); updateDeviceBar();
    });
    list.appendChild(row);
  });
}

const toDataURL = blob => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
async function exportReports(){
  const reports = await DB.all('reports');
  if (!reports.length) { toast('There are no reports to export.'); return; }
  const out = [];
  for (const r of reports) {
    out.push({
      ...r.record, status: r.status,
      attachments: {
        bitePhotos: await Promise.all(r.bitePhotos.map(async p => ({ fileName: p.name, stage: p.stage || null, daysAfterBite: p.daysAfterBite, dataUrl: await toDataURL(p.blob) }))),
        snakePhoto: r.snakePhoto ? { fileName: r.snakePhoto.name, dataUrl: await toDataURL(r.snakePhoto.blob) } : null
      }
    });
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'hyam-snakebite-reports-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function clearForm(){
  if (!confirm('Clear all fields and start a new report?')) return;
  clearTimeout(saveTimer);
  await DB.del('drafts', 'current').catch(() => {});
  location.reload();
}
function newReport(){ location.reload(); }

function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ---------- Start up ---------- */
document.getElementById('viewReportsBtn').addEventListener('click', async () => {
  const p = document.getElementById('reportsPanel'); p.hidden = !p.hidden;
  if (!p.hidden) { await updateDeviceBar(); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
document.getElementById('closeReportsBtn').addEventListener('click', () => { document.getElementById('reportsPanel').hidden = true; });
document.getElementById('exportBtn').addEventListener('click', exportReports);
window.addEventListener('online', () => { updateDeviceBar(); trySync(); });
window.addEventListener('offline', updateDeviceBar);

(async function init(){
  let draft = null;
  try { draft = await DB.get('drafts', 'current'); } catch (e) {}
  if (hasContent(draft)) { restore(draft); toast('Your unfinished report has been restored.'); }
  else setRef(makeRef());
  refresh(); updateDeviceBar(); trySync();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
