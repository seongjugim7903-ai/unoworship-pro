#!/usr/bin/env node
/**
 * scripts/build-hymn-data.mjs
 *
 * 한국어 찬송가 번호+제목 인덱스 빌드. 가사는 포함하지 않음 (저작권).
 *
 * 소스: 위키백과 (CC BY-SA 4.0)
 *   - https://ko.wikipedia.org/wiki/21세기_찬송가  → 645 곡 (새찬송가)
 *   - https://ko.wikipedia.org/wiki/통일찬송가      → 558 곡 (통일)
 *
 * 출력: data/hymns/new-hymn.json, data/hymns/old-hymn.json
 *       각 { version, attribution, hymns: [{num, title}] }
 *
 * 주의:
 *   - 제목만 추출 (사실 정보로 취급)
 *   - CC BY-SA 4.0 출처 표기는 앱 내에서 제공
 *   - 추출 패턴: 위키 내부 tistory URL slug "찬송가-N장-제목-가사악보..."
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── 새찬송가 1-100 수동 보정 (위키 URL 슬러그에 제목 없음) ──
//   출처: yeram.org/hymn/118684 (CC BY-SA 4.0 호환, 사실정보 취급)
const NEW_HYMN_1_100 = [
  [1,'만복의 근원 하나님'],[2,'찬양 성부 성자 성령'],[3,'성부 성자와 성령'],
  [4,'성부 성자와 성령'],[5,'이 천지간 만물들아'],[6,'목소리 높여서'],
  [7,'성부 성자 성령'],[8,'거룩 거룩 거룩 전능하신 주님'],
  [9,'하늘에 가득 찬 영광의 하나님'],[10,'전능왕 오셔서'],
  [11,'홀로 한 분 하나님께'],[12,'다 함께 주를 경배하세'],[13,'영원한 하늘나라'],
  [14,'주 우리 하나님'],[15,'하나님의 크신 사랑'],[16,'은혜로신 하나님 우리 주 하나님'],
  [17,'사랑의 하나님'],[18,'성도들아 찬양하자'],[19,'찬양하는 소리 있어'],
  [20,'큰 영광 중에 계신 주'],[21,'다 찬양하여라'],[22,'만유의 주 앞에'],
  [23,'만 입이 내게 있으면'],[24,'왕 되신 주'],[25,'면류관 벗어서'],
  [26,'구세주를 아는 이들'],[27,'빛나고 높은 보좌와'],[28,'복의 근원 강림하사'],
  [29,'성도여 다 함께'],[30,'전능하고 놀라우신'],[31,'찬양하라 복되신 구세주 예수'],
  [32,'만유의 주재'],[33,'영광스런 주를 보라'],[34,'참 놀랍도다 주 크신 이름'],
  [35,'큰 영화로신 주'],[36,'주 예수 이름 높이어'],[37,'주 예수 이름 높이어'],
  [38,'예수 우리 왕이여'],[39,'주 은혜를 받으려'],[40,'찬송으로 보답할 수 없는'],
  [41,'내 영혼아 주 찬양하여라'],[42,'거룩한 주님께'],[43,'즐겁게 안식할 날'],
  [44,'지난 이레 동안에'],[45,'거룩한 주의 날'],[46,'이 날은 주님 정하신'],
  [47,'하늘이 푸르고'],[48,'거룩하신 주 하나님'],[49,'하나님이 언약하신 그대로'],
  [50,'내게 있는 모든 것을'],[51,'주님 주신 거룩한 날'],[52,'거룩하신 나의 하나님'],
  [53,'성전을 떠나가기 전'],[54,'주여 복을 구하오니'],[55,'주 이름으로 모였던'],
  [56,'우리의 주여'],[57,'오늘 주신 말씀에'],[58,'지난밤에 보호하사'],
  [59,'하나님 아버지 어둔 밤이 지나'],[60,'영혼의 햇빛 예수님'],[61,'우리가 기다리던'],
  [62,'고요히 머리 숙여'],[63,'주가 세상을 다스리니'],[64,'기뻐하며 경배하세'],
  [65,'내 영혼아 찬양하라'],[66,'다 감사드리세'],[67,'영광의 왕께 다 경배하며'],
  [68,'오 하나님 우리의 창조주시니'],[69,'온 천하 만물 우러러'],[70,'피난처 있으니'],
  [71,'예부터 도움 되시고'],[72,'만왕의 왕 앞에 나오라'],[73,'내 눈을 들어 두루 살피니'],
  [74,'오 만세 반석이신'],[75,'주여 우리 무리를'],[76,'창조의 주 아버지께'],
  [77,'거룩하신 하나님'],[78,'저 높고 푸른 하늘과'],[79,'주 하나님 지으신 모든 세계'],
  [80,'천지에 있는 이름 중'],[81,'주는 귀한 보배'],[82,'성부의 어린 양이'],
  [83,'나의 맘에 근심 구름'],[84,'온 세상이 캄캄하여서'],[85,'구주를 생각만 해도'],
  [86,'내가 늘 의지하는 예수'],[87,'내 주님 입으신 그 옷은'],[88,'내 진정 사모하는'],
  [89,'샤론의 꽃 예수'],[90,'주 예수 내가 알기 전'],[91,'슬픈 마음 있는 사람'],
  [92,'위에 계신 나의 친구'],[93,'예수는 나의 힘이요'],
  [94,'주 예수보다 더 귀한 것은 없네'],[95,'나의 기쁨 나의 소망 되시며'],
  [96,'예수님은 누구신가'],[97,'정혼한 처녀에게'],[98,'예수님 오소서'],
  [99,'주님 앞에 떨며 서서'],[100,'미리암과 여인들이'],
];

async function fetchWikitext(title) {
  const url = `https://ko.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': 'UnoLive-Hymn-Indexer/0.1' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${title}`);
  return res.text();
}

function extractHymns(wikitext) {
  // tistory URL slug 패턴: "찬송가-N장-T1-T2-...-가사악보..." 또는 "찬송가-N장-T1-T2-...-가사-악보..."
  // 전체 줄에서 한 곡씩 스캔. 같은 번호가 여러 번 나올 수 있으므로 처음 것만 사용.
  const pattern = /찬송가-(\d+)장-([^\s\]]+?)-가사[-]?악보/g;
  const map = new Map();
  let m;
  while ((m = pattern.exec(wikitext)) !== null) {
    const num = parseInt(m[1], 10);
    if (map.has(num)) continue;

    // slug 내 하이픈을 공백으로 풀고, 남은 꼬리 단어 제거
    let title = m[2].replaceAll('-', ' ').trim();

    // 간혹 뒤에 "JPGPDFPPT" 같은 꼬리가 붙어 들어가는 경우 정리
    title = title.replace(/\s+(JPG|PDF|PPT|이미지)\b.*$/i, '').trim();

    if (title) map.set(num, title);
  }
  // 번호 순 정렬
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, title]) => ({ num, title }));
}

async function buildOne({ wikiTitle, outFile, versionId, versionName, expectedCount, manualSeed }) {
  console.log(`[hymn] ${versionName} — fetching...`);
  const wt = await fetchWikitext(wikiTitle);
  const hymns = extractHymns(wt);

  // 수동 보정 데이터 병합 (위키 URL 슬러그에 제목이 없는 번호 커버)
  if (manualSeed && manualSeed.length > 0) {
    const map = new Map(hymns.map((h) => [h.num, h]));
    for (const [num, title] of manualSeed) {
      if (!map.has(num)) map.set(num, { num, title });
    }
    hymns.length = 0;
    for (const v of [...map.values()].sort((a, b) => a.num - b.num)) hymns.push(v);
  }

  console.log(`[hymn] ${versionName} — 최종 ${hymns.length} 곡 (기대 ${expectedCount})`);

  // 누락 번호 확인
  const missing = [];
  for (let i = 1; i <= expectedCount; i++) {
    if (!hymns.find((h) => h.num === i)) missing.push(i);
  }
  if (missing.length > 0) {
    console.warn(`[hymn] ${versionName} — 누락 번호 (${missing.length}): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`);
  }

  const out = {
    version: { id: versionId, name: versionName, totalCount: expectedCount },
    attribution: '찬송가 목록 출처: 위키백과 (CC BY-SA 4.0)',
    license: 'CC BY-SA 4.0',
    source: `https://ko.wikipedia.org/wiki/${wikiTitle}`,
    note: '제목만 포함. 가사는 저작권 이슈로 포함하지 않습니다 (한국찬송가공회).',
    hymns,
  };

  const outPath = path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`[hymn] ✅ ${outPath} (${hymns.length}/${expectedCount} 곡)`);
}

async function main() {
  await buildOne({
    wikiTitle: '21세기_찬송가',
    outFile: 'data/hymns/new-hymn.json',
    versionId: 'new',
    versionName: '21세기 찬송가 (새찬송가)',
    expectedCount: 645,
    manualSeed: NEW_HYMN_1_100,
  });
  // 통일찬송가는 위키페이지가 목록을 포함하지 않음.
  //   별도 소스 확보 후 추후 추가 (안정화 문서 3.11 참조).
  console.log('[hymn] 통일찬송가: 추후 별도 데이터 확보 필요 (위키 페이지 목록 없음)');
}

main().catch((err) => { console.error(err); process.exit(1); });
