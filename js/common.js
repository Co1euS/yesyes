const SCHOOL_NAME = "부산기계공업고등학교 기숙사";

// ===== Supabase 설정 =====
const SUPABASE_URL = "https://kawqlkiphjfmwxpbvbnk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthd3Fsa2lwaGpmbXd4cGJ2Ym5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTY0NzAsImV4cCI6MjEwNTE5MjQ3MH0.c158edOdxJXcS-baRXieVH5dPs_5oBfzrl4Xp50uAIc";

const DB_PREFIX = "bmhs_dorm_";

// 서버와 동기화하는 데이터 종류
const KNOWN_KEYS = ["dinner", "stay", "notices", "free", "points", "repairs"];

// Supabase REST API 호출 헬퍼
function sb(path, options = {}) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {}),
    },
  });
}

// ===== 클라이언트 캐시 (localStorage 백업) =====
const cache = {};
const listeners = {};
let remoteLoaded = false;
const readyCallbacks = [];

function db(key) {
  if (!cache[key]) {
    try {
      cache[key] = JSON.parse(localStorage.getItem(DB_PREFIX + key) || "[]");
    } catch (e) {
      cache[key] = [];
    }
  }
  return cache[key];
}

function dbSaveLocal(key, data) {
  cache[key] = data;
  try {
    localStorage.setItem(DB_PREFIX + key, JSON.stringify(data));
  } catch (e) {}
}

function dbOnChange(key, cb) {
  (listeners[key] = listeners[key] || []).push(cb);
}

function fire(key) {
  (listeners[key] || []).forEach((cb) => cb());
}

// 초기 로딩 완료 후 실행 (원격 데이터 반영 후 시딩 등에 사용)
function dbInit(cb) {
  if (remoteLoaded) cb();
  else readyCallbacks.push(cb);
}

// 서버에서 전체 데이터 불러오기
async function loadRemote() {
  if (SUPABASE_ANON_KEY.startsWith("여기에")) {
    remoteLoaded = true;
    readyCallbacks.forEach((cb) => cb());
    return;
  }
  try {
    const r = await sb("items?select=*&order=id.desc&limit=10000");
    if (!r.ok) throw new Error("load failed");
    const rows = await r.json();
    const byKey = {};
    for (const row of rows) {
      (byKey[row.category] = byKey[row.category] || []).push(row.data);
    }
    // 서버 데이터(비어 있어도)로 항상 덮어써서 모든 기기가 동일하게 보이게 함
    for (const k of KNOWN_KEYS) {
      const list = byKey[k] || [];
      cache[k] = list;
      try {
        localStorage.setItem(DB_PREFIX + k, JSON.stringify(list));
      } catch (e) {}
    }
  } catch (e) {
    // 오프라인이면 localStorage 백업 사용
  }
  remoteLoaded = true;
  readyCallbacks.forEach((cb) => cb());
  Object.keys(listeners).forEach(fire);
}

// 전체 교체 (삭제/수정 등) + 서버 반영
function dbSave(key, data) {
  const before = db(key);
  const removed = before.filter((o) => !data.some((n) => String(n.id) === String(o.id)));
  const changed = data.filter((n) => {
    const o = before.find((x) => String(x.id) === String(n.id));
    return o && JSON.stringify(o) !== JSON.stringify(n);
  });
  dbSaveLocal(key, data);
  fire(key);
  if (!SUPABASE_ANON_KEY.startsWith("여기에")) {
    removed.forEach((o) => {
      sb("items?id=eq." + o.id, { method: "DELETE" }).catch(() => {});
    });
    changed.forEach((n) => {
      sb("items?id=eq." + n.id, {
        method: "PATCH",
        body: JSON.stringify({ data: n }),
      }).catch(() => {});
    });
  }
}

// 추가 + 서버 반영
async function dbPush(key, item) {
  item.id = item.id || Date.now() + Math.floor(Math.random() * 1000);
  item.createdAt = item.createdAt || new Date().toISOString();
  const data = db(key);
  data.unshift(item);
  dbSaveLocal(key, data);
  fire(key);
  if (!SUPABASE_ANON_KEY.startsWith("여기에")) {
    try {
      const r = await sb("items", {
        method: "POST",
        body: JSON.stringify({ id: item.id, category: key, data: item }),
      });
      if (!r.ok) throw new Error("insert failed");
    } catch (e) {
      alert("서버에 저장하지 못했습니다. 인터넷 연결을 확인하세요.");
    }
  }
  return item;
}

// 페이지 로드 시 서버 데이터 동기화
loadRemote();

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 게시글에 자주 쓰이는 한국어·영어 욕설과 초성 표현
const BANNED_WORDS = [
  "씨발", "시발", "씨벌", "시벌", "씨팔", "시팔", "씹팔", "씨바", "시바", "씹할", "씹새", "씹쌔", "씹년", "씹놈", "십새끼",
  "개새끼", "개새", "개쌔끼", "개색기", "개색끼", "개자식", "개년", "개놈", "개같", "개걸레", "새끼",
  "병신", "븅신", "빙신", "병맛", "좆", "좃", "좇", "존나", "졸라", "좆나", "좆까", "좃까", "좇까", "좆같", "좃같", "좇같",
  "지랄", "염병", "니미", "애미", "애비", "에미", "에비", "엠창", "창년", "창녀", "걸레년", "걸레같",
  "미친놈", "미친년", "미친새끼", "또라이", "돌아이", "느금마", "느개비", "호로새끼", "후레자식", "씹덕새끼", "쌍놈", "쌍년", "썅",
  "ㅅㅂ", "ㅅㅂㄴ", "ㅅㅂㄹ", "ㅆㅂ", "ㅆㅂㄴ", "ㅂㅅ", "ㅈㄹ", "ㅈㄴ", "ㄱㅅㄲ", "ㄱㅐㅅㅐㄲㅣ", "ㅈ같", "ㅈ까", "ㅁㅊㄴ", "ㅁㅊㄴㅇ",
  "fuck", "fucking", "shit", "bullshit", "bitch", "bastard", "asshole", "motherfucker", "슬럿", "퍽"
];

function censorText(text) {
  const original = String(text ?? "");
  const compact = [];
  const positions = [];

  // 공백·기호를 끼워 넣거나 호환 자모를 쓰는 우회를 줄이기 위해
  // 글자와 숫자만 이어 붙여 비교하되, 원래 글자 위치를 보존합니다.
  let originalPosition = 0;
  for (const character of original) {
    const normalized = character.normalize("NFKC").toLowerCase();
    for (const part of normalized) {
      if (/[a-z0-9\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/i.test(part)) {
        compact.push(part);
        positions.push(originalPosition);
      }
    }
    originalPosition += character.length;
  }

  const normalizedText = compact.join("");
  const censoredPositions = new Set();
  for (const word of BANNED_WORDS) {
    const normalizedWord = [...word.normalize("NFKC").toLowerCase()]
      .filter((part) => /[a-z0-9\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/i.test(part))
      .join("");
    if (!normalizedWord) continue;

    let from = 0;
    while (from < normalizedText.length) {
      const matchAt = normalizedText.indexOf(normalizedWord, from);
      if (matchAt < 0) break;
      for (let i = matchAt; i < matchAt + normalizedWord.length; i++) {
        censoredPositions.add(positions[i]);
      }
      from = matchAt + normalizedWord.length;
    }
  }

  if (!censoredPositions.size) return original;
  let result = "";
  let position = 0;
  for (const character of original) {
    result += censoredPositions.has(position) ? "*" : character;
    position += character.length;
  }
  return result;
}

function promptWriter(defaultName) {
  const name = prompt("작성자 이름(기숙사 호실 포함, 예: 3층 302 김OO):", defaultName || "");
  return (name || "").trim();
}

// 사감(관리자) 인증
const ADMIN_PW_KEY = DB_PREFIX + "admin_pw";
let adminAuthed = false;

function adminPw() {
  const remote = cache["_pw"];
  if (remote && remote[0] && remote[0].pw) return remote[0].pw;
  return localStorage.getItem(ADMIN_PW_KEY) || "1234";
}

// 사감 비밀번호를 서버에 저장 (모든 기기에서 동일하게 적용)
async function setAdminPw(pw) {
  localStorage.setItem(ADMIN_PW_KEY, pw);
  try {
    await sb("items?category=eq._pw", { method: "DELETE" });
    await sb("items", {
      method: "POST",
      body: JSON.stringify({ id: 9999999999999, category: "_pw", data: { pw } }),
    });
  } catch (e) {}
  cache["_pw"] = [{ pw }];
}

function requireAdmin(onOk) {
  if (adminAuthed) return onOk();
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop open";
  wrap.innerHTML = `
    <div class="modal">
      <h2>🔒 사감 선생님 인증</h2>
      <label>비밀번호</label>
      <input type="password" id="authPw" placeholder="관리자 비밀번호">
      <div class="modal-actions">
        <button class="btn secondary" id="authCancel">취소</button>
        <button class="btn" id="authOk">인증</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector("#authPw");
  input.focus();
  const close = () => wrap.remove();
  const submit = () => {
    if (input.value === adminPw()) {
      adminAuthed = true;
      close();
      onOk();
    } else {
      alert("비밀번호가 올바르지 않습니다.");
      input.value = "";
      input.focus();
    }
  };
  wrap.querySelector("#authCancel").onclick = close;
  wrap.querySelector("#authOk").onclick = submit;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

// 사감 비밀번호 변경 (사감 인증 후 호출)
function changeAdminPw() {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop open";
  wrap.innerHTML = `
    <div class="modal">
      <h2>🔑 사감 비밀번호 변경</h2>
      <label>새 비밀번호</label>
      <input type="password" id="newPw1" placeholder="새 비밀번호">
      <label>새 비밀번호 확인</label>
      <input type="password" id="newPw2" placeholder="새 비밀번호 확인">
      <div class="modal-actions">
        <button class="btn secondary" id="pwCancel">취소</button>
        <button class="btn" id="pwOk">변경</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  const submit = () => {
    const p1 = wrap.querySelector("#newPw1").value;
    const p2 = wrap.querySelector("#newPw2").value;
    if (!p1 || p1.length < 4) return alert("비밀번호는 4자 이상 입력하세요.");
    if (p1 !== p2) return alert("비밀번호가 서로 일치하지 않습니다.");
    setAdminPw(p1);
    close();
    alert("비밀번호가 변경되었습니다.");
  };
  wrap.querySelector("#pwCancel").onclick = close;
  wrap.querySelector("#pwOk").onclick = submit;
  wrap.querySelector("#newPw2").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  wrap.querySelector("#newPw1").focus();
}
