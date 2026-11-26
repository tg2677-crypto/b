// 팀별 구글 시트 "일정" 탭 → 구독용 캘린더 파일(팀폴더/calendar.ics) 생성
// GitHub Actions(.github/workflows/calendars.yml)가 3시간마다 실행해요.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const TEAMS = [
  { dir: 'charis',   name: '카리스',     sheet: '1dAe6YaJHM7gcgrobXn9Hzi-9ki4nqmmfSMf0aMYm2dc' },
  { dir: 'Garak',    name: '가락불스',   sheet: '1t5ckHfUYsqVeMXTZypEHrIyhc9yDUT4JYqF3wD9x594' },
  { dir: 'rattlers', name: '래틀러스',   sheet: '1_eHRVsDQxtLlhan0I7DW6hCH8jUqthxxUGM1_eVUpxg' },
  { dir: 'obp',      name: 'OBP브라더스', sheet: '13bQgNIZb9eh0B8MY13BENX-Yu449EHf_YoUlwdGHQN8' },
];
const PAGE = 'https://tg2677-crypto.github.io/b/';

const clean = s => String(s ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
function cellText(c){
  if(!c) return '';
  if(c.f != null && c.f !== '') return String(c.f);
  if(c.v == null) return '';
  const m = String(c.v).match(/^Date\((\d+),(\d+),(\d+)/);
  if(m) return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return String(c.v);
}
async function loadSchedule(sheet){
  const url = `https://docs.google.com/spreadsheets/d/${sheet}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent('일정')}`;
  const txt = await (await fetch(url)).text();
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  if(j.status !== 'ok') throw new Error('sheet error');
  let heads = j.table.cols.map(c => clean(c.label));
  let rows = j.table.rows.map(r => (r.c || []).map(c => clean(cellText(c))));
  if(heads.every(h => !h)){ heads = rows[0] || []; rows = rows.slice(1); }
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(heads.map((h, i) => [h, r[i] || ''])));
}
function parseDate(s){
  let m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if(m) return [+m[1], +m[2], +m[3]];
  m = String(s || '').match(/(\d{1,2})\s*[\/.\-월]\s*(\d{1,2})/);
  if(m) return [new Date().getFullYear(), +m[1], +m[2]];
  return null;
}
const pad = n => String(n).padStart(2, '0');
const utc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const tx = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const enc = new TextEncoder();
function fold(line){
  let out = '', cur = '', n = 0;
  for(const ch of line){ const b = enc.encode(ch).length; if(n + b > 74){ out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
function scoreText(v){ return clean(v); }

function buildIcs(team, games){
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//baseball-team-page//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:⚾ ${team.name} 경기`, 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H'];
  const seen = new Map();
  for(const g of games){
    const d = parseDate(g['날짜']); if(!d) continue;
    const opp = clean(g['상대팀']) || '상대팀';
    const hm = String(g['시간'] || '').match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/);
    const v = String(g['선후공'] || ''), res = clean(g['결과']), sc = scoreText(g['점수']);
    const title = `⚾ ${team.name} vs ${opp}` + (res ? ` (${res}${sc ? ' ' + sc : ''})` : '');
    const desc = [g['리그'] ? `리그: ${clean(g['리그'])}` : '', v.includes('선') ? '선공 (먼저 공격)' : v.includes('후') ? '후공 (나중에 공격)' : '',
      `팀 페이지: ${PAGE}${team.dir}/`].filter(Boolean).join('\n');
    const base = `${d[0]}${pad(d[1])}${pad(d[2])}-${hm ? pad(+hm[1]) + pad(+(hm[2] || 0)) : 'x'}`;
    const k = (seen.get(base) || 0) + 1; seen.set(base, k);
    L.push('BEGIN:VEVENT', `UID:${base}${k > 1 ? '-' + k : ''}-${team.dir}@tg2677-crypto.github.io`, `DTSTAMP:${utc(new Date(Date.UTC(d[0], d[1] - 1, d[2])))}`);
    if(hm){
      const s = new Date(Date.UTC(d[0], d[1] - 1, d[2], Math.min(23, +hm[1]) - 9, Math.min(59, +(hm[2] || 0))));
      L.push(`DTSTART:${utc(s)}`, `DTEND:${utc(new Date(s.getTime() + 2 * 3600e3))}`);
    } else {
      const s = new Date(Date.UTC(d[0], d[1] - 1, d[2]));
      L.push(`DTSTART;VALUE=DATE:${ymd(s)}`, `DTEND;VALUE=DATE:${ymd(new Date(s.getTime() + 86400e3))}`);
    }
    L.push(`SUMMARY:${tx(title)}`);
    if(clean(g['장소'])) L.push(`LOCATION:${tx(clean(g['장소']))}`);
    L.push(`DESCRIPTION:${tx(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', `DESCRIPTION:${tx(`⚾ 내일 ${team.name} vs ${opp}`)}`, 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${hm ? '-PT2H' : 'PT8H'}`, `DESCRIPTION:${tx(`⚾ 곧 ${team.name} vs ${opp}`)}`, 'END:VALARM',
      'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

let failed = 0;
for(const team of TEAMS){
  try{
    const games = await loadSchedule(team.sheet);
    const ics = buildIcs(team, games), out = `${team.dir}/calendar.ics`;
    const old = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if(old !== ics) writeFileSync(out, ics);
    console.log(`${team.dir}: ${games.length}개 일정${old === ics ? ' (변경 없음)' : ' → 저장'}`);
  }catch(e){ failed++; console.log(`${team.dir}: 실패 - ${e.message}`); } // 실패하면 기존 파일 유지
}
if(failed === TEAMS.length) process.exit(1);
