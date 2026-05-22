// Firebase設定
const DB_URL = "https://divide-team-default-rtdb.firebaseio.com";

window.onerror = (msg) => alert("エラー: " + msg);

const COLORS = [
  {bg:"#3b82f6",light:"#eff6ff",border:"#bfdbfe",text:"#1d4ed8"},
  {bg:"#ef4444",light:"#fef2f2",border:"#fecaca",text:"#b91c1c"},
  {bg:"#10b981",light:"#ecfdf5",border:"#a7f3d0",text:"#065f46"},
  {bg:"#f59e0b",light:"#fffbeb",border:"#fde68a",text:"#b45309"},
  {bg:"#8b5cf6",light:"#f5f3ff",border:"#ddd6fe",text:"#6d28d9"},
  {bg:"#ec4899",light:"#fdf2f8",border:"#fbcfe8",text:"#9d174d"},
  {bg:"#6366f1",light:"#eef2ff",border:"#c7d2fe",text:"#4338ca"},
  {bg:"#f97316",light:"#fff7ed",border:"#fed7aa",text:"#c2410c"},
  {bg:"#14b8a6",light:"#f0fdfa",border:"#99f6e4",text:"#0f766e"},
  {bg:"#06b6d4",light:"#ecfeff",border:"#a5f3fc",text:"#0e7490"},
];

const genCode = () => Math.random().toString(36).substring(2,6).toUpperCase();
const genId = () => Math.random().toString(36).substring(2,10);

let myId = localStorage.getItem("myId") || genId();
localStorage.setItem("myId", myId);

let roomCode = "";
let pollTimer = null;
let isAdmin = false;

// Firebase REST API
async function dbGet(path) {
  const r = await fetch(`${DB_URL}/${path}.json`);
  return r.json();
}
async function dbSet(path, data) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PUT", headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  });
}

// 画面切り替え
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// エラー表示
function showError(msg) {
  const el = document.getElementById("home-error");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

// ポーリング開始
function startPoll(fn) {
  stopPoll();
  fn();
  pollTimer = setInterval(fn, 1500);
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ========== HOME ==========
const tabs = document.querySelectorAll(".tab-btn");
tabs.forEach(t => t.addEventListener("click", () => {
  tabs.forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  document.getElementById("join-fields").style.display = t.dataset.tab === "join" ? "block" : "none";
  document.getElementById("home-btn").textContent = t.dataset.tab === "create" ? "ルームを作成する" : "入室申請する";
  document.getElementById("home-btn").className = "btn " + (t.dataset.tab === "create" ? "btn-primary" : "btn-green");
  showError("");
}));

document.getElementById("home-btn").addEventListener("click", async () => {
  const name = document.getElementById("input-name").value.trim();
  const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
  showError("");

  if (!name) return showError("名前を入力してください");

  if (activeTab === "create") {
    const code = genCode();
    const data = { adminId: myId, adminName: name, teamSize: 5, participants: {}, teams: {}, gameStarted: false };
    await dbSet(`rooms/${code}`, data);
    roomCode = code; isAdmin = true;
    startAdminPoll();
    showScreen("admin");
  } else {
    const code = document.getElementById("input-code").value.trim().toUpperCase();
    if (code.length !== 4) return showError("ルームコードは4文字です");
    const room = await dbGet(`rooms/${code}`);
    if (!room) return showError("ルームが見つかりません");
    const me = { id: myId, name, status: "waiting", joinedAt: Date.now() };
    await dbSet(`rooms/${code}/participants/${myId}`, me);
    roomCode = code; isAdmin = false;
    renderWaiting(name, code);
    showScreen("waiting");
    startWaitingPoll(name);
  }
});

// ========== WAITING ==========
function renderWaiting(name, code) {
  document.getElementById("waiting-name").textContent = name;
  document.getElementById("waiting-code").textContent = code;
}

function startWaitingPoll(name) {
  startPoll(async () => {
    const me = await dbGet(`rooms/${roomCode}/participants/${myId}`);
    if (!me) return;
    if (me.status === "approved") {
      stopPoll();
      const room = await dbGet(`rooms/${roomCode}`);
      renderParticipant(room, name);
      showScreen("participant");
      startParticipantPoll(name);
    }
    if (me.status === "kicked") {
      stopPoll(); roomCode = ""; showScreen("home");
      showError("管理者により退出させられました");
    }
  });
}

// ========== PARTICIPANT ==========
function renderParticipant(room, myName) {
  const teams = room.teams ? Object.values(room.teams) : [];
  const myTeam = teams.find(t => t.members && Object.values(t.members).some(m => m.id === myId));
  const ti = myTeam ? teams.indexOf(myTeam) : 0;
  const c = COLORS[ti % COLORS.length];

  const hero = document.getElementById("p-team-hero");
  hero.style.background = c.bg;

  if (myTeam && room.gameStarted) {
    document.getElementById("p-team-number").textContent = ti + 1;
    document.getElementById("p-team-label").textContent = `チーム ${ti + 1}`;
    hero.style.display = "block";
    document.getElementById("p-waiting-notice").style.display = "none";

    const members = Object.values(myTeam.members || {});
    document.getElementById("p-member-count").textContent = `あなたのチームメンバー（${members.length}人）`;
    document.getElementById("p-members").innerHTML = members.map(m => `
      <div class="member-row">
        <div class="avatar" style="background:${c.bg}">${m.name[0]}</div>
        <span class="member-name">${m.name}</span>
        ${m.id === myId ? '<span class="badge-me">あなた</span>' : ""}
      </div>`).join("");

    document.getElementById("p-all-teams").innerHTML = teams.map((t, i) => {
      const col = COLORS[i % COLORS.length];
      const mems = Object.values(t.members || {});
      return `<div style="margin-bottom:0.75rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
          <span style="background:${col.bg};color:white;font-size:0.75rem;font-weight:700;padding:0.2rem 0.75rem;border-radius:9999px">チーム ${i+1}</span>
          <span style="font-size:0.75rem;color:${col.text};font-weight:600">${mems.length}人</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;padding-left:0.5rem">
          ${mems.map(m => `<span style="background:${col.light};color:${col.text};font-size:0.75rem;padding:0.2rem 0.6rem;border-radius:9999px;font-weight:500">${m.name}${m.id===myId?" 👈":""}</span>`).join("")}
        </div>
      </div>`;
    }).join("");
  } else {
    hero.style.display = "none";
    document.getElementById("p-waiting-notice").style.display = "block";
  }
}

function startParticipantPoll(myName) {
  startPoll(async () => {
    const me = await dbGet(`rooms/${roomCode}/participants/${myId}`);
    if (!me || me.status === "kicked") {
      stopPoll(); roomCode = ""; showScreen("home");
      showError("管理者により退出させられました"); return;
    }
    const room = await dbGet(`rooms/${roomCode}`);
    if (room) renderParticipant(room, myName);
  });
}

// ========== ADMIN ==========
function startAdminPoll() {
  startPoll(async () => {
    const room = await dbGet(`rooms/${roomCode}`);
    if (room) renderAdmin(room);
  });
}

function renderAdmin(room) {
  const participants = room.participants ? Object.values(room.participants) : [];
  const waiting = participants.filter(p => p.status === "waiting");
  const approved = participants.filter(p => p.status === "approved");
  const teams = room.teams ? Object.values(room.teams) : [];

  // ヘッダー
  document.getElementById("admin-code-display").textContent = roomCode;
  document.getElementById("admin-stats").textContent = `承認済み: ${approved.length}人 / 申請中: ${waiting.length}人`;
  const badge = document.getElementById("admin-status-badge");
  badge.textContent = room.gameStarted ? "🏃 試合中" : "⏳ 待機中";
  badge.className = "status-badge " + (room.gameStarted ? "status-game" : "status-wait");

  // 申請一覧
  const reqSec = document.getElementById("req-section");
  if (waiting.length > 0) {
    reqSec.style.display = "block";
    document.getElementById("req-count").textContent = `入室申請 (${waiting.length}件)${room.gameStarted ? " — 途中参加" : ""}`;
    document.getElementById("req-list").innerHTML = waiting.map(p => `
      <div class="request-row">
        <div class="req-avatar">${p.name[0]}</div>
        <span class="req-name">${p.name}</span>
        ${room.gameStarted
          ? `<button class="btn-add" onclick="addLate('${p.id}')">追加</button>
             <button class="btn-reject" onclick="kickUser('${p.id}')">拒否</button>`
          : `<button class="btn-approve" onclick="approveUser('${p.id}')">承認</button>
             <button class="btn-reject" onclick="kickUser('${p.id}')">拒否</button>`
        }
      </div>`).join("");
  } else {
    reqSec.style.display = "none";
  }

  // チーム設定（試合前のみ）
  const setupSec = document.getElementById("setup-section");
  if (!room.gameStarted) {
    setupSec.style.display = "block";
    [2,3,4,5,6,7,8,10].forEach(n => {
      const btn = document.getElementById(`sz-${n}`);
      if (btn) btn.className = "size-btn" + (room.teamSize === n ? " active" : "");
    });
    const rem = approved.length % room.teamSize;
    document.getElementById("preview-text").innerHTML =
      `承認済み <strong>${approved.length}人</strong> ÷ <strong>${room.teamSize}人</strong> = 約 <strong>${Math.ceil(approved.length/(room.teamSize||1))}チーム</strong>` +
      (rem ? `<span style="font-size:0.75rem;color:#818cf8"> （最終チームは${rem}人）</span>` : "");
    document.getElementById("shuffle-btn").disabled = approved.length < 2;
  } else {
    setupSec.style.display = "none";
  }

  // 承認済み一覧
  document.getElementById("approved-count").textContent = `承認済み参加者 (${approved.length}人)`;
  if (approved.length === 0) {
    document.getElementById("approved-list").innerHTML = '<div class="empty-msg">まだ参加者がいません</div>';
  } else {
    document.getElementById("approved-list").innerHTML = approved.map(p => {
      const ti = teams.findIndex(t => t.members && Object.values(t.members).some(m => m.id === p.id));
      const col = ti >= 0 ? COLORS[ti % COLORS.length] : null;
      return `<div class="request-row">
        <div class="req-avatar" style="background:${col?col.light:"#f3f4f6"};color:${col?col.text:"#6b7280"}">${p.name[0]}</div>
        <div style="flex:1">
          <div style="font-size:0.9rem;font-weight:500;color:#1f2937">${p.name}</div>
          ${col ? `<div style="font-size:0.75rem;color:${col.text};font-weight:600">チーム ${ti+1}</div>` : ""}
        </div>
        <button class="btn-kick" onclick="kickUser('${p.id}')">キック</button>
      </div>`;
    }).join("");
  }

  // チーム結果
  const teamsSec = document.getElementById("teams-section");
  if (room.gameStarted && teams.length > 0) {
    teamsSec.style.display = "block";
    document.getElementById("teams-list").innerHTML = teams.map((t, i) => {
      const col = COLORS[i % COLORS.length];
      const mems = Object.values(t.members || {});
      return `<div class="team-result" style="background:${col.light};border-color:${col.border}">
        <div class="team-result-header">
          <span style="background:${col.bg};color:white;font-size:0.8rem;font-weight:800;padding:0.25rem 0.75rem;border-radius:9999px">チーム ${i+1}</span>
          <span style="font-size:0.8rem;color:${col.text};font-weight:600">${mems.length}人</span>
        </div>
        <div class="team-result-members">
          ${mems.map(m => `<span class="member-tag" style="color:${col.text}">${m.name}</span>`).join("")}
        </div>
      </div>`;
    }).join("");
  } else {
    teamsSec.style.display = "none";
  }
}

// チームサイズ変更
[2,3,4,5,6,7,8,10].forEach(n => {
  document.getElementById(`sz-${n}`)?.addEventListener("click", async () => {
    await dbSet(`rooms/${roomCode}/teamSize`, n);
  });
});

// シャッフル
document.getElementById("shuffle-btn").addEventListener("click", async () => {
  const room = await dbGet(`rooms/${roomCode}`);
  const approved = Object.values(room.participants || {}).filter(p => p.status === "approved");
  if (approved.length < 2) return;
  const shuffled = [...approved].sort(() => Math.random() - 0.5);
  const sz = room.teamSize || 5;
  const teams = {};
  let ti = 0;
  for (let i = 0; i < shuffled.length; i += sz) {
    const chunk = shuffled.slice(i, i + sz);
    const members = {};
    chunk.forEach(m => members[m.id] = m);
    teams[`team${ti}`] = { id: `team${ti}`, members };
    ti++;
  }
  await dbSet(`rooms/${roomCode}/teams`, teams);
  await dbSet(`rooms/${roomCode}/gameStarted`, true);
});

// コピー
document.getElementById("copy-btn").addEventListener("click", () => {
  navigator.clipboard?.writeText(roomCode).catch(()=>{});
  const btn = document.getElementById("copy-btn");
  btn.textContent = "✓";
  setTimeout(() => btn.textContent = "📋", 2000);
});

// 終了
document.getElementById("exit-btn").addEventListener("click", async () => {
  if (confirm("ルームを終了しますか？")) {
    await dbSet(`rooms/${roomCode}`, null);
    stopPoll(); roomCode = "";
    showScreen("home");
  }
});

window.approveUser = async (id) => {
  await dbSet(`rooms/${roomCode}/participants/${id}/status`, "approved");
};
window.kickUser = async (id) => {
  await dbSet(`rooms/${roomCode}/participants/${id}/status`, "kicked");
};
window.addLate = async (id) => {
  const room = await dbGet(`rooms/${roomCode}`);
  const teams = room.teams ? Object.entries(room.teams) : [];
  if (!teams.length) return;
  const p = room.participants[id];
  const smallest = teams.reduce((m, [k,t]) => {
    const cnt = Object.keys(t.members||{}).length;
    return cnt < m[1] ? [k, cnt] : m;
  }, [teams[0][0], Object.keys(teams[0][1].members||{}).length]);
  await dbSet(`rooms/${roomCode}/teams/${smallest[0]}/members/${id}`, p);
  await dbSet(`rooms/${roomCode}/participants/${id}/status`, "approved");
};

showScreen("home");