const { stories, plans } = window.STORY_DATA;

const els = {
  view: document.querySelector("#view"),
  search: document.querySelector("#searchInput"),
  account: document.querySelector("#accountPill"),
  modal: document.querySelector("#checkoutModal"),
  checkout: document.querySelector("#checkoutContent"),
  closeCheckout: document.querySelector("#closeCheckout"),
  toastStack: document.querySelector("#toastStack"),
  menuToggle: document.querySelector("#menuToggle"),
  sidebar: document.querySelector(".sidebar")
};

const storageKey = "doctruyen_vip_state_v1";
let state = loadState();

function loadState() {
  const fallback = {
    user: { name: "Thanh", coins: 18, vipUntil: null },
    unlocked: {},
    transactions: [],
    readerSize: 19,
    darkReader: false,
    lastRead: { storyId: "tan-the-bac-ha", chapterId: "c2" }
  };

  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  renderAccount();
}

function money(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

function isVip() {
  return state.user.vipUntil && new Date(state.user.vipUntil).getTime() > Date.now();
}

function getStory(storyId) {
  return stories.find((story) => story.id === storyId);
}

function getChapter(storyId, chapterId) {
  return getStory(storyId)?.chapters.find((chapter) => chapter.id === chapterId);
}

function chapterKey(storyId, chapterId) {
  return `${storyId}:${chapterId}`;
}

function canRead(storyId, chapter) {
  return chapter.free || isVip() || Boolean(state.unlocked[chapterKey(storyId, chapter.id)]);
}

function unlockChapter(storyId, chapter) {
  if (canRead(storyId, chapter)) return true;
  if (state.user.coins < chapter.price) {
    toast("Khong du xu. Nap them hoac mua VIP de mo chuong.");
    openCheckout("coins_50");
    return false;
  }
  state.user.coins -= chapter.price;
  state.unlocked[chapterKey(storyId, chapter.id)] = true;
  state.transactions.unshift({
    id: crypto.randomUUID(),
    type: "unlock",
    title: `Mo khoa ${chapter.title}`,
    amount: -chapter.price,
    createdAt: new Date().toISOString()
  });
  saveState();
  toast(`Da dung ${chapter.price} xu de mo chuong.`);
  return true;
}

function renderAccount() {
  const vipText = isVip()
    ? `VIP den ${new Date(state.user.vipUntil).toLocaleDateString("vi-VN")}`
    : "Free";
  els.account.innerHTML = `
    <span class="status-chip ${isVip() ? "vip" : ""}">${vipText}</span>
    <span class="status-chip">${state.user.coins} xu</span>
    <button class="btn btn-primary" data-open-checkout="coins_50">Nap xu</button>
  `;
}

function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const name = link.dataset.nav;
    link.classList.toggle(
      "active",
      (route === "/" && name === "home") || route.includes(name)
    );
  });
}

function storyCard(story) {
  const lockedCount = story.chapters.filter((chapter) => !chapter.free).length;
  return `
    <article class="story-card">
      <a href="#/story/${story.id}" class="cover" style="background:${story.cover}">
        <strong>${story.title}</strong>
      </a>
      <div class="story-body">
        <div class="tags">${story.genre.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
        <h3>${story.title}</h3>
        <p>${story.summary}</p>
        <div class="card-footer">
          <span class="muted">${story.chapters.length} chuong · ${lockedCount} VIP</span>
          <a class="btn btn-secondary" href="#/story/${story.id}">Chi tiet</a>
        </div>
      </div>
    </article>
  `;
}

function renderHome() {
  const featured = stories[0];
  const lastStory = getStory(state.lastRead.storyId);
  const lastChapter = getChapter(state.lastRead.storyId, state.lastRead.chapterId);
  els.view.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <span class="eyebrow">MVP doc truyen thu phi</span>
        <h1>Thu vien truyen co paywall, VIP va nap xu.</h1>
        <p>Ban dau dung payOS/VietQR mock de chay thu. Khi co key that, thay API tao don va webhook la co the charge phi tu doc gia Viet Nam.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/read/${state.lastRead.storyId}/${state.lastRead.chapterId}">Doc tiep</a>
          <a class="btn btn-secondary" href="#/library">Xem thu vien</a>
          <button class="btn btn-secondary" data-open-checkout="vip_30">Mua VIP 30 ngay</button>
        </div>
      </div>
      <aside class="panel">
        <span class="eyebrow">Dang doc</span>
        <h2>${lastStory.title}</h2>
        <p class="muted">${lastChapter.title}</p>
        <div class="metrics-grid">
          <div class="metric"><span class="muted">Xu</span><strong>${state.user.coins}</strong></div>
          <div class="metric"><span class="muted">VIP</span><strong>${isVip() ? "Co" : "Chua"}</strong></div>
          <div class="metric"><span class="muted">Mo khoa</span><strong>${Object.keys(state.unlocked).length}</strong></div>
        </div>
      </aside>
    </section>

    <div class="section-head">
      <div>
        <span class="eyebrow">Truyen moi cap nhat</span>
        <h2>De doc va de ban goi VIP</h2>
      </div>
      <a class="btn btn-secondary" href="#/library">Tat ca truyen</a>
    </div>
    <section class="story-grid">${stories.map(storyCard).join("")}</section>

    <div class="section-head">
      <div>
        <span class="eyebrow">Payment</span>
        <h2>Goi charge phi de test</h2>
      </div>
    </div>
    <section class="plans-grid">${plans.map(planCard).join("")}</section>
  `;
}

function planCard(plan) {
  return `
    <article class="payment-card">
      <span class="eyebrow">${plan.type === "vip" ? "VIP" : "Nap xu"}</span>
      <h3>${plan.title}</h3>
      <strong>${money(plan.price)}</strong>
      <p class="muted">${plan.description}</p>
      <button class="btn btn-primary" data-open-checkout="${plan.id}">Thanh toan</button>
    </article>
  `;
}

function renderLibrary() {
  const query = els.search.value.trim().toLowerCase();
  const filtered = stories.filter((story) => {
    const haystack = `${story.title} ${story.author} ${story.genre.join(" ")} ${story.summary}`.toLowerCase();
    return haystack.includes(query);
  });

  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Thu vien</span>
        <h1>Truyen dang ban</h1>
      </div>
      <button class="btn btn-primary" data-open-checkout="vip_30">Len VIP</button>
    </div>
    <section class="story-grid">${filtered.map(storyCard).join("") || emptyState("Khong tim thay truyen phu hop.")}</section>
  `;
}

function renderStory(storyId) {
  const story = getStory(storyId);
  if (!story) return renderNotFound();

  els.view.innerHTML = `
    <section class="story-detail">
      <div class="detail-cover" style="background:${story.cover}">
        <div>
          <span class="eyebrow" style="color:#fff">DocTruyen VIP</span>
          <h1>${story.title}</h1>
        </div>
      </div>
      <div>
        <span class="eyebrow">${story.status}</span>
        <h1>${story.title}</h1>
        <p class="muted">Tac gia: ${story.author} · ${story.reads.toLocaleString("vi-VN")} luot doc · ${story.rating}/5</p>
        <div class="tags">${story.genre.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
        <p>${story.summary}</p>
        <div class="paywall-actions">
          <a class="btn btn-primary" href="#/read/${story.id}/${story.chapters[0].id}">Doc tu dau</a>
          <button class="btn btn-secondary" data-open-checkout="vip_30">Mua VIP</button>
        </div>
        <div class="chapter-list">
          ${story.chapters.map((chapter) => chapterRow(story.id, chapter)).join("")}
        </div>
      </div>
    </section>
  `;
}

function chapterRow(storyId, chapter) {
  const locked = !canRead(storyId, chapter);
  return `
    <article class="chapter-row">
      <div>
        <strong>${chapter.title}</strong>
        <span class="muted">${chapter.free ? "Mien phi" : locked ? `${chapter.price} xu hoac VIP` : "Da mo khoa"}</span>
      </div>
      <a class="btn ${locked ? "btn-secondary" : "btn-primary"}" href="#/read/${storyId}/${chapter.id}">
        ${locked ? "Mo khoa" : "Doc"}
      </a>
    </article>
  `;
}

function renderReader(storyId, chapterId) {
  const story = getStory(storyId);
  const chapter = getChapter(storyId, chapterId);
  if (!story || !chapter) return renderNotFound();

  document.documentElement.style.setProperty("--reader-size", `${state.readerSize}px`);
  document.body.classList.toggle("reader-dark", state.darkReader);

  const index = story.chapters.findIndex((item) => item.id === chapter.id);
  const prev = story.chapters[index - 1];
  const next = story.chapters[index + 1];
  const readable = canRead(storyId, chapter);

  state.lastRead = { storyId, chapterId };
  saveState();

  els.view.innerHTML = `
    <article class="reader">
      <div class="reader-toolbar">
        <a class="btn btn-secondary" href="#/story/${story.id}">Danh sach chuong</a>
        <div>
          <button class="icon-btn" data-reader-size="-1" aria-label="Giam co chu">A-</button>
          <button class="icon-btn" data-reader-size="1" aria-label="Tang co chu">A+</button>
          <button class="btn btn-secondary" id="toggleReaderTheme">${state.darkReader ? "Sang" : "Toi"}</button>
        </div>
      </div>
      <h1>${chapter.title}</h1>
      <p class="muted">${story.title} · ${chapter.free ? "Chuong mien phi" : `${chapter.price} xu / VIP`}</p>
      ${
        readable
          ? `<section class="reader-content">${chapter.body.map((p) => `<p>${p}</p>`).join("")}</section>`
          : paywallBlock(storyId, chapter)
      }
      <div class="reader-toolbar" style="margin-top:18px; position:static">
        ${prev ? `<a class="btn btn-secondary" href="#/read/${story.id}/${prev.id}">Chuong truoc</a>` : "<span></span>"}
        ${next ? `<a class="btn btn-primary" href="#/read/${story.id}/${next.id}">Chuong sau</a>` : "<span></span>"}
      </div>
    </article>
  `;
}

function paywallBlock(storyId, chapter) {
  return `
    <section class="paywall">
      <span class="eyebrow">Chuong khoa</span>
      <h2>${chapter.title}</h2>
      <p>Chuong nay can ${chapter.price} xu hoac goi VIP 30 ngay. Ban dang co ${state.user.coins} xu.</p>
      <div class="paywall-actions">
        <button class="btn btn-primary" data-unlock-chapter="${storyId}:${chapter.id}">Mo bang ${chapter.price} xu</button>
        <button class="btn btn-secondary" data-open-checkout="vip_30">Mua VIP</button>
        <button class="btn btn-secondary" data-open-checkout="coins_50">Nap xu</button>
      </div>
    </section>
  `;
}

function renderWallet() {
  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Vi doc gia</span>
        <h1>Nap xu va VIP</h1>
      </div>
      <span class="status-chip ${isVip() ? "vip" : ""}">${isVip() ? "Dang VIP" : "Tai khoan free"}</span>
    </div>
    <section class="plans-grid">${plans.map(planCard).join("")}</section>
    <div class="section-head"><h2>Lich su giao dich</h2></div>
    ${transactionTable()}
  `;
}

function transactionTable() {
  if (!state.transactions.length) return emptyState("Chua co giao dich nao.");
  return `
    <table class="admin-table">
      <thead><tr><th>Thoi gian</th><th>Noi dung</th><th>Loai</th><th>Gia tri</th></tr></thead>
      <tbody>
        ${state.transactions.map((tx) => `
          <tr>
            <td>${new Date(tx.createdAt).toLocaleString("vi-VN")}</td>
            <td>${tx.title}</td>
            <td>${tx.type}</td>
            <td>${tx.amount > 0 ? money(tx.amount) : `${tx.amount} xu`}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAdmin() {
  const totalLocked = stories.flatMap((story) => story.chapters).filter((chapter) => !chapter.free).length;
  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Admin demo</span>
        <h1>Van hanh noi dung</h1>
      </div>
      <button class="btn btn-danger" id="resetDemo">Reset demo</button>
    </div>
    <section class="metrics-grid">
      <div class="metric"><span class="muted">Tong truyen</span><strong>${stories.length}</strong></div>
      <div class="metric"><span class="muted">Chuong khoa</span><strong>${totalLocked}</strong></div>
      <div class="metric"><span class="muted">Giao dich</span><strong>${state.transactions.length}</strong></div>
    </section>
    <div class="section-head"><h2>Bang truyen</h2></div>
    <table class="admin-table">
      <thead><tr><th>Truyen</th><th>Tac gia</th><th>Chuong</th><th>Trang thai</th><th>Cap nhat</th></tr></thead>
      <tbody>
        ${stories.map((story) => `
          <tr>
            <td>${story.title}</td>
            <td>${story.author}</td>
            <td>${story.chapters.length}</td>
            <td>${story.status}</td>
            <td>${story.updatedAt}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openCheckout(planId) {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) return;
  const orderCode = `DTV${Date.now().toString().slice(-8)}`;
  els.checkout.innerHTML = `
    <span class="eyebrow">payOS / VietQR mock</span>
    <h2 id="checkoutTitle">${plan.title}</h2>
    <p class="muted">${plan.description}</p>
    <div class="qr-box" aria-label="Ma QR thanh toan demo"><span>${orderCode}</span></div>
    <p><strong>So tien:</strong> ${money(plan.price)}</p>
    <p><strong>Noi dung:</strong> ${orderCode} ${plan.id}</p>
    <p class="muted">Ban that se goi API payOS de tao payment link/QR va dung webhook de kich hoat goi sau khi thanh toan.</p>
    <div class="paywall-actions">
      <button class="btn btn-primary" data-confirm-payment="${plan.id}">Mo phong da thanh toan</button>
      <button class="btn btn-secondary" id="copyOrderCode">Copy ma don</button>
    </div>
  `;
  els.modal.hidden = false;
}

function confirmPayment(planId) {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) return;
  if (plan.type === "vip") {
    const base = isVip() ? new Date(state.user.vipUntil) : new Date();
    base.setDate(base.getDate() + plan.days);
    state.user.vipUntil = base.toISOString();
  } else {
    state.user.coins += plan.coins;
  }
  state.transactions.unshift({
    id: crypto.randomUUID(),
    type: plan.type,
    title: plan.title,
    amount: plan.price,
    createdAt: new Date().toISOString()
  });
  saveState();
  els.modal.hidden = true;
  toast(`Da kich hoat ${plan.title}.`);
  route();
}

function emptyState(text) {
  return `<div class="panel"><p class="muted">${text}</p></div>`;
}

function renderNotFound() {
  els.view.innerHTML = emptyState("Khong tim thay trang nay.");
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  els.toastStack.append(item);
  setTimeout(() => item.remove(), 3200);
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [_, routeName, id, chapterId] = hash.split("/");
  document.body.classList.toggle("reader-dark", state.darkReader && routeName === "read");
  setActiveNav(hash);
  if (hash === "/") renderHome();
  else if (routeName === "library") renderLibrary();
  else if (routeName === "story") renderStory(id);
  else if (routeName === "read") renderReader(id, chapterId);
  else if (routeName === "wallet") renderWallet();
  else if (routeName === "admin") renderAdmin();
  else renderNotFound();
  els.view.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const checkoutButton = event.target.closest("[data-open-checkout]");
  if (checkoutButton) openCheckout(checkoutButton.dataset.openCheckout);

  const confirmButton = event.target.closest("[data-confirm-payment]");
  if (confirmButton) confirmPayment(confirmButton.dataset.confirmPayment);

  const unlockButton = event.target.closest("[data-unlock-chapter]");
  if (unlockButton) {
    const [storyId, chapterId] = unlockButton.dataset.unlockChapter.split(":");
    const chapter = getChapter(storyId, chapterId);
    if (chapter && unlockChapter(storyId, chapter)) route();
  }

  const sizeButton = event.target.closest("[data-reader-size]");
  if (sizeButton) {
    state.readerSize = Math.min(24, Math.max(16, state.readerSize + Number(sizeButton.dataset.readerSize)));
    saveState();
    route();
  }

  if (event.target.id === "toggleReaderTheme") {
    state.darkReader = !state.darkReader;
    saveState();
    route();
  }

  if (event.target.id === "resetDemo") {
    localStorage.removeItem(storageKey);
    state = loadState();
    toast("Da reset du lieu demo.");
    route();
  }

  if (event.target.id === "copyOrderCode") {
    const text = els.checkout.querySelector(".qr-box span")?.textContent || "";
    navigator.clipboard?.writeText(text);
    toast("Da copy ma don demo.");
  }
});

els.closeCheckout.addEventListener("click", () => {
  els.modal.hidden = true;
});

els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) els.modal.hidden = true;
});

els.search.addEventListener("input", () => {
  if ((location.hash || "#/") !== "#/library") location.hash = "#/library";
  else renderLibrary();
});

els.menuToggle.addEventListener("click", () => {
  els.sidebar.classList.toggle("open");
});

window.addEventListener("hashchange", () => {
  els.sidebar.classList.remove("open");
  route();
});

renderAccount();
route();
