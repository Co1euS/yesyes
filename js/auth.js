(function () {
  const AUTH_URL = "https://kawqlkiphjfmwxpbvbnk.supabase.co/auth/v1";
  const AUTH_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthd3Fsa2lwaGpmbXd4cGJ2Ym5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTY0NzAsImV4cCI6MjEwNTE5MjQ3MH0.c158edOdxJXcS-baRXieVH5dPs_5oBfzrl4Xp50uAIc";
  const SESSION_KEY = "bmhs_student_auth";
  const PROFILE_FIELDS = ["room", "name", "studentCard", "studentNumber"];

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }

  function saveSession(session) {
    if (!session || !session.access_token) return;
    const current = readSession() || {};
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...current,
      ...session,
      expires_at: session.expires_at || (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : current.expires_at),
    }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function authRequest(path, options = {}, token) {
    const response = await fetch(`${AUTH_URL}/${path}`, {
      ...options,
      headers: {
        apikey: AUTH_KEY,
        Authorization: `Bearer ${token || AUTH_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.msg || data.message || data.error_description || data.error || "인증 요청을 처리하지 못했습니다.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function isSchoolEmail(email) {
    return /^[^\s@]+@bmt\.hs\.kr$/i.test(String(email || "").trim());
  }

  function isEmailVerified(user) {
    return !!(user && user.email_confirmed_at);
  }

  function hasProfile(user) {
    const profile = user && user.user_metadata;
    return !!profile && PROFILE_FIELDS.every((field) => String(profile[field] || "").trim());
  }

  async function restore() {
    let session = readSession();
    if (!session || !session.access_token) return null;

    try {
      if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 30) {
        if (!session.refresh_token) throw new Error("로그인 세션이 만료되었습니다.");
        session = await authRequest("token?grant_type=refresh_token", {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        saveSession(session);
      }
      const user = await authRequest("user", {}, session.access_token);
      if (!isSchoolEmail(user.email) || !isEmailVerified(user)) {
        clearSession();
        return null;
      }
      return user;
    } catch (error) {
      clearSession();
      return null;
    }
  }

  async function signUp(email, password) {
    if (!isSchoolEmail(email)) throw new Error("학교 이메일(@bmt.hs.kr)만 사용할 수 있습니다.");
    const result = await authRequest("signup", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (result.access_token && isEmailVerified(result.user)) saveSession(result);
    else clearSession();
    return result;
  }

  async function signIn(email, password) {
    if (!isSchoolEmail(email)) throw new Error("학교 이메일(@bmt.hs.kr)을 입력하세요.");
    const result = await authRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const user = result.user || await authRequest("user", {}, result.access_token);
    if (!isEmailVerified(user)) {
      clearSession();
      throw new Error("이메일 인증이 필요합니다. 받은 편지함의 인증 링크를 누른 뒤 다시 로그인하세요.");
    }
    saveSession(result);
    return user;
  }

  async function saveProfile(profile) {
    const session = readSession();
    if (!session || !session.access_token) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인하세요.");
    for (const field of PROFILE_FIELDS) {
      if (!String(profile[field] || "").trim()) throw new Error("호실, 이름, 학생증 번호, 학번을 모두 입력하세요.");
    }
    const result = await authRequest("user", {
      method: "PUT",
      body: JSON.stringify({ data: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, String(profile[field]).trim()])) }),
    }, session.access_token);
    return result;
  }

  async function signOut() {
    const session = readSession();
    if (session && session.access_token) {
      try { await authRequest("logout", { method: "POST" }, session.access_token); }
      catch (e) {}
    }
    clearSession();
    location.replace(new URL("login.html", location.href).href);
  }

  function addAccountControls(user) {
    const header = document.querySelector(".header-inner");
    if (!header) return;
    const controls = document.createElement("div");
    controls.className = "account-controls";
    controls.innerHTML = `<span>${String(user.user_metadata.name).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))} 학생</span><button class="btn secondary small" type="button">로그아웃</button>`;
    controls.querySelector("button").addEventListener("click", signOut);
    header.appendChild(controls);
  }

  window.StudentAuth = { restore, signUp, signIn, saveProfile, signOut, isSchoolEmail, isEmailVerified, hasProfile, readSession };

  if (location.pathname.split("/").pop().toLowerCase() === "login.html") return;

  document.documentElement.style.visibility = "hidden";
  restore().then((user) => {
    if (!user) {
      const login = new URL("login.html", location.href);
      login.searchParams.set("next", location.pathname + location.search + location.hash);
      location.replace(login.href);
      return;
    }
    if (!hasProfile(user)) {
      const login = new URL("login.html", location.href);
      login.searchParams.set("setup", "1");
      login.searchParams.set("next", location.pathname + location.search + location.hash);
      location.replace(login.href);
      return;
    }
    window.CURRENT_STUDENT = user;
    addAccountControls(user);
    document.documentElement.style.visibility = "visible";
  });
})();
