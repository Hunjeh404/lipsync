// 대본 줄과 음성인식 단어 시각을 글자 단위로 맞춰 줄마다 시작·끝 시각을 정한다
const norm = s => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');

// words: [{ text, timestamp: [s, e] }], lines: [string] → [{ text, start, end }]  (end=null 은 다음 줄 시작까지)
export function alignLines(words, lines, dur) {
  const R = [];       // 인식된 글자와 그 글자가 차지한 시각
  for (const w of words) {
    const t = norm(w.text), [s, e0] = w.timestamp, e = e0 ?? s + .3; if (!t || s == null) continue;
    for (let k = 0; k < t.length; k++) R.push({ c: t[k], s: s + (e - s) * k / t.length, e: s + (e - s) * (k + 1) / t.length });
  }
  const T = [];       // 대본 글자와 그 글자가 속한 줄
  lines.forEach((l, i) => { for (const c of norm(l)) T.push({ c, line: i }); });
  const n = T.length, m = R.length, out = lines.map(text => ({ text, start: null, end: null }));
  if (!n || !m) return out;

  // 편집 거리 정렬: 같은 글자 0, 다른 글자 1, 빠진 글자 1
  const dir = new Uint8Array((n + 1) * (m + 1)); let prev = new Uint32Array(m + 1), cur = new Uint32Array(m + 1);
  for (let j = 0; j <= m; j++) { prev[j] = j; dir[j] = 2; }
  for (let i = 1; i <= n; i++) {
    cur[0] = i; dir[i * (m + 1)] = 1;
    for (let j = 1; j <= m; j++) {
      const d = prev[j - 1] + (T[i - 1].c === R[j - 1].c ? 0 : 1), u = prev[j] + 1, l = cur[j - 1] + 1;
      if (d <= u && d <= l) { cur[j] = d; dir[i * (m + 1) + j] = 0; } else if (u <= l) { cur[j] = u; dir[i * (m + 1) + j] = 1; } else { cur[j] = l; dir[i * (m + 1) + j] = 2; }
    }
    [prev, cur] = [cur, prev];
  }
  const hit = new Int32Array(n).fill(-1);      // 대본 글자 → 맞은 인식 글자
  for (let i = n, j = m; i > 0 || j > 0;) {
    const d = i > 0 && j > 0 ? dir[i * (m + 1) + j] : i > 0 ? 1 : 2;
    if (d === 0) { hit[i - 1] = j - 1; i--; j--; } else if (d === 1) i--; else j--;
  }
  const first = lines.map(() => -1), last = lines.map(() => -1);
  T.forEach((t, k) => { if (hit[k] < 0) return; if (first[t.line] < 0) first[t.line] = hit[k]; last[t.line] = hit[k]; });
  out.forEach((o, i) => { if (first[i] >= 0) { o.start = R[first[i]].s; o.end = R[last[i]].e; } });

  // 맞은 글자가 없는 줄은 앞뒤 줄 사이에 글자 수대로 나눠 넣는다
  for (let i = 0; i < out.length; i++) {
    if (out[i].start != null) continue;
    let j = i; while (j < out.length && out[j].start == null) j++;
    const a = i ? out[i - 1].end : 0, b = j < out.length ? out[j].start : (dur || a + 3 * (j - i)), len = out.slice(i, j).map(o => Math.max(1, norm(o.text).length)), tot = len.reduce((x, y) => x + y, 0);
    let t = a; for (let k = i; k < j; k++) { const d = (b - a) * len[k - i] / tot; out[k].start = t; out[k].end = t + d; t += d; }
    i = j - 1;
  }
  // 겹치지 않게 다듬고, 다음 줄과 가까우면 다음 줄까지 이어 보이게
  for (let i = 0; i < out.length; i++) {
    const o = out[i], nx = out[i + 1];
    o.start = Math.max(0, +o.start.toFixed(2));
    if (nx && nx.start < o.start + .2) nx.start = o.start + .2;
    if (nx && nx.start - o.end < .6) o.end = null;
    else o.end = +Math.min(o.end + .3, nx ? nx.start : dur || o.end + .3).toFixed(2);
  }
  return out;
}
