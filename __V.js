const XLSX = require('xlsx');
const H = ['위탁사명3-1','고객명','관련번호','휴대폰','전화번호','배송메세지','주문일시','주문상태','','상품명','Color 설명','Style 설명','우편번호','주소','설치비공지','특이사항','희망통화시간','고객번호','방문일정','마켓팅 동의'];
const S = Date.now().toString().slice(-6);
let n = 0;
const mk = (o) => {
  n += 1;
  const tel = o.tel ?? ('010-1' + S.slice(-3) + '-' + String(1000 + n));
  return ['동양생명(PA-01간병)보관에프', o.name, o.jumin, o.tel1 ?? tel, o.tel2 ?? tel, '',
    '08/22 10:00', '주문접수', null, o.product ?? '동양생명 방문거부시(전화상담)', '공통', '공통',
    o.zip ?? '48058', o.addr ?? '부산 해운대구', 'N', '', '', o.no ?? (S + String(n).padStart(2,'0')),
    '2026-09-10 (목) 10시', 'Y'];
};
const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H, ...rows]), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

let cookie, csrf, HD;
const classify = async (buf) => {
  const f = new FormData();
  f.append('files', new Blob([buf]), '20260825 동양생명.xlsx');
  const j = await (await fetch('http://localhost:3000/api/files/classify', { method: 'POST', body: f, headers: HD })).json();
  if (j.error) throw new Error(j.error);
  return j.files[0];
};
const deploy = async (buf, x) => {
  const uf = new FormData();
  uf.append('file', new Blob([buf]), '20260825 동양생명.xlsx');
  const up = await (await fetch('http://localhost:3000/api/files/upload', { method: 'POST', body: uf, headers: HD })).json();
  const picks = {};
  for (const rg of Object.keys(x.pendingKeysByRegion ?? {})) for (const k of x.pendingKeysByRegion[rg]) picks[k] = '파라인슈1';
  const dj = await (await fetch('http://localhost:3000/api/files/deploy', {
    method: 'POST', headers: { ...HD, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [up.fileId], classificationResults: x.classificationByDeptId, rowAssignments: [picks], memoRule: false }) })).json();
  return { up, dj };
};
const reasons = (x) => { const b = {}; for (const r of x.duplicateRows) b[r[0]] = (b[r[0]] || 0) + 1; return b; };
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log('  ' + (ok ? 'OK  ' : '### ') + label.padEnd(46) + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  return ok;
};

(async () => {
  const lg = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' }) });
  cookie = (lg.headers.getSetCookie?.() ?? []).map((s) => s.split(';')[0]).join('; ');
  csrf = /csrfToken=([^;]+)/.exec(cookie)[1];
  HD = { cookie, 'X-CSRF-Token': csrf };
  let all = true;

  // ── 1회차: 같은 사람 2건 → 3회 미달, 배정돼야 함
  console.log('[1] 같은 사람 2건 — 3회 미달');
  const 갑 = { name: '갑' + S, jumin: '650101-1000000', tel: '010-2222-' + S.slice(-4) };
  const b1 = xlsx([mk(갑), mk(갑), mk({ name: '병' + S, jumin: '770707-1000000', zip: '36759', addr: '경북 안동시' })]);
  const x1 = await classify(b1);
  all &= check('블랙 0건', reasons(x1), {});
  all &= check('한울부원 2 + 굿모닝 1', [x1.classification.한울부원, x1.classification.굿모닝제너럴], [2, 1]);
  const r1 = await deploy(b1, x1);
  all &= check('명단 등록 0명', r1.dj.blacklistedCount, 0);
  console.log();

  // ── 2회차: 같은 사람 1건 더 → 과거2 + 오늘1 = 3회
  console.log('[2] 같은 사람 1건 더 — 3회 도달');
  const b2 = xlsx([mk({ ...갑, no: S + '90' }), mk({ name: '정' + S, jumin: '880808-1000000', zip: '36759', addr: '경북 안동시' })]);
  const x2 = await classify(b2);
  all &= check('블랙 사유 1건', Object.keys(reasons(x2)).filter((k) => k.includes('3회')).length, 1);
  all &= check('갑은 배정 안 됨 (한울부원 0)', x2.classification.한울부원, 0);
  const r2 = await deploy(b2, x2);
  all &= check('명단 등록 1명', r2.dj.blacklistedCount, 1);
  console.log();

  // ── 3회차: 명단 등록 뒤 → '등록됨'으로 분류
  console.log('[3] 명단 등록 뒤 다시 올림');
  const b3 = xlsx([mk({ ...갑, no: S + '91' }), mk({ name: '무' + S, jumin: '990909-1000000', zip: '36759', addr: '경북 안동시' })]);
  const x3 = await classify(b3);
  all &= check('사유가 "블랙리스트 등록됨"', Object.keys(reasons(x3)).some((k) => k.includes('등록됨')), true);
  console.log();

  // ── 미리보기만 하면 등록 안 됨
  console.log('[4] 미리보기만 하고 배포 안 함');
  const 신규 = { name: '신규' + S, jumin: '600101-1000000', tel: '010-3333-' + S.slice(-4) };
  const b4 = xlsx([mk(신규), mk(신규), mk(신규), mk({ name: '기' + S, jumin: '910101-1000000', zip: '36759', addr: '경북 안동시' })]);
  const before = await (await fetch('http://localhost:3000/api/files/list?limit=1', { headers: { cookie } })).json();
  await classify(b4);
  console.log('     (분류만 수행)');
  require('fs').writeFileSync('__b4.json', JSON.stringify({ S }));
  console.log();
  console.log(all ? '=> [1~3] 전부 기대대로' : '=> ### 문제 있음 ###');
})();
