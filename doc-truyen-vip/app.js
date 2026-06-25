const initialStoryData = window.STORY_DATA || { stories: [], plans: [] };
let stories = initialStoryData.stories || [];
const plans = initialStoryData.plans || [];

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
const audioVoicePresets = [
  {
    id: "nu-cam-xuc",
    label: "Hoài My - nữ Việt",
    voiceMatch: /hoai|my|female|woman|natural/i,
    fallbackRate: 1,
    fallbackPitch: 1.08
  },
  {
    id: "nam-tram",
    label: "Nam Minh - nam Việt",
    voiceMatch: /nam|minh|male|man|natural/i,
    fallbackRate: 0.92,
    fallbackPitch: 0.78
  }
];
const audioSpeedOptions = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
const preferGeneratedMp3 = true;
let state = loadState();
let activeRouteHash = "";
let speechState = {
  key: "",
  chunks: [],
  index: 0,
  chunkProgress: 0,
  playing: false,
  paused: false
};
let isAudioSeeking = false;
let audioWasPlayingBeforeSeek = false;
let audioProgressFrame = 0;
let storyCatalogReady = false;
let storyCatalogError = "";
const authorizedChapterCache = new Map();
const supabaseConfig = window.SUPABASE_CONFIG || {};
const sharedCommentsEnabled = Boolean(
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("YOUR_") &&
  !supabaseConfig.anonKey.includes("YOUR_")
);
const supabaseClient = sharedCommentsEnabled && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
const remoteComments = {};
let authSession = null;
let authUser = null;
let userVipUntil = null;
let accountSummary = {
  wallet: { balance_vnd: 0, coin_balance: 0 },
  progress: [],
  unlocked: [],
  vip: [],
  transactions: []
};

function defaultLastRead() {
  return {
    storyId: stories[0]?.id || "",
    chapterId: stories[0]?.chapters[0]?.id || ""
  };
}

function loadState() {
  const fallback = {
    user: { name: "Thanh", coins: 18, vipUntil: null },
    unlocked: {},
    transactions: [],
    comments: {},
    readerSize: 19,
    darkReader: false,
    audioVoice: "nu-cam-xuc",
    audioSpeed: 1,
    commenterName: "",
    lastRead: defaultLastRead(),
    chapterFilters: {}
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const merged = { ...fallback, ...saved, user: { ...fallback.user, ...(saved.user || {}) } };
    if (!getChapter(merged.lastRead?.storyId, merged.lastRead?.chapterId)) {
      merged.lastRead = defaultLastRead();
    }
    return merged;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  renderAccount();
}

function accountDisplayName() {
  return (
    authUser?.user_metadata?.display_name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split("@")[0] ||
    state.commenterName ||
    "Độc giả"
  );
}

function accountEmail() {
  return authUser?.email || "";
}

function isLoggedIn() {
  return Boolean(authUser?.id);
}

function hasAccountVip() {
  return userVipUntil && new Date(userVipUntil).getTime() > Date.now();
}

function vipDaysLeft() {
  if (!hasAccountVip()) return 0;
  return Math.max(0, Math.ceil((new Date(userVipUntil).getTime() - Date.now()) / 86400000));
}

function currentAccountProgress() {
  const remote = accountSummary.progress?.[0];
  if (remote && getChapter(remote.story_id, remote.chapter_id)) {
    return remote;
  }
  return state.lastRead;
}

async function loadVipEntitlement() {
  userVipUntil = null;
  if (!supabaseClient || !authUser) return;
  const { data, error } = await supabaseClient
    .from("vip_entitlements")
    .select("active_until")
    .eq("user_id", authUser.id)
    .gt("active_until", new Date().toISOString())
    .order("active_until", { ascending: false })
    .limit(1);
  if (!error && data?.[0]?.active_until) userVipUntil = data[0].active_until;
}

function resetAccountSummary() {
  accountSummary = {
    wallet: { balance_vnd: 0, coin_balance: 0 },
    progress: [],
    unlocked: [],
    vip: [],
    transactions: []
  };
}

async function loadAccountSummary() {
  resetAccountSummary();
  if (!supabaseClient || !authUser) return;

  const [walletRes, progressRes, unlockedRes, vipRes, txRes] = await Promise.all([
    supabaseClient.from("account_wallets").select("balance_vnd,coin_balance").eq("user_id", authUser.id).maybeSingle(),
    supabaseClient.from("reading_progress").select("story_id,chapter_id,updated_at").eq("user_id", authUser.id).order("updated_at", { ascending: false }),
    supabaseClient.from("unlocked_chapters").select("story_id,chapter_id,source,created_at").eq("user_id", authUser.id).order("created_at", { ascending: false }),
    supabaseClient.from("vip_entitlements").select("plan_id,active_until,source,created_at").eq("user_id", authUser.id).order("active_until", { ascending: false }),
    supabaseClient.from("coin_transactions").select("amount,reason,story_id,chapter_id,created_at").eq("user_id", authUser.id).order("created_at", { ascending: false }).limit(20)
  ]);

  if (!walletRes.error && walletRes.data) accountSummary.wallet = walletRes.data;
  if (!progressRes.error && progressRes.data) accountSummary.progress = progressRes.data;
  if (!unlockedRes.error && unlockedRes.data) accountSummary.unlocked = unlockedRes.data;
  if (!vipRes.error && vipRes.data) accountSummary.vip = vipRes.data;
  if (!txRes.error && txRes.data) accountSummary.transactions = txRes.data;
}

async function upsertProfile() {
  if (!supabaseClient || !authUser) return;
  await supabaseClient
    .from("profiles")
    .upsert({
      id: authUser.id,
      email: accountEmail(),
      display_name: accountDisplayName(),
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
}

async function saveReadingProgress(storyId, chapterId) {
  if (!supabaseClient || !authUser) return;
  await supabaseClient
    .from("reading_progress")
    .upsert({
      user_id: authUser.id,
      story_id: storyId,
      chapter_id: chapterId,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,story_id" });
  await loadAccountSummary();
  renderAccount();
}

async function initAuth() {
  if (!supabaseClient) {
    renderAccount();
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  authSession = data?.session || null;
  authUser = authSession?.user || null;
  if (authUser) {
    state.commenterName = accountDisplayName();
    saveState();
    await upsertProfile();
  }
  await loadVipEntitlement();
  await loadAccountSummary();
  renderAccount();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    authSession = session || null;
    authUser = authSession?.user || null;
    if (authUser) {
      state.commenterName = accountDisplayName();
      saveState();
      await upsertProfile();
    }
    await loadVipEntitlement();
    await loadAccountSummary();
    renderAccount();
    hydrateVisibleComments();
  });
}

function normalizeCatalogStory(story) {
  return {
    ...story,
    genre: Array.isArray(story.genre) ? story.genre : [],
    reads: Number(story.reads || 0),
    rating: Number(story.rating || 0),
    chapters: Array.isArray(story.chapters) ? story.chapters.map((chapter) => ({
      ...chapter,
      free: chapter.free !== false,
      price: Number(chapter.price || chapter.price_coins || 0),
      audioUrls: chapter.audioUrls || chapter.audio_urls || {}
    })) : []
  };
}

function hydrateLastReadFromCatalog() {
  if (!stories.length) return;
  if (!getChapter(state.lastRead?.storyId, state.lastRead?.chapterId)) {
    state.lastRead = defaultLastRead();
    saveState();
  }
}

async function loadStoryCatalog() {
  storyCatalogError = "";
  if (!supabaseClient) {
    storyCatalogError = "Chưa kết nối database truyện.";
    storyCatalogReady = true;
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_story_catalog");
  if (error) {
    storyCatalogError = "Không tải được danh sách truyện từ database.";
    stories = [];
    storyCatalogReady = true;
    return;
  }

  const payload = data || {};
  stories = (payload.stories || []).map(normalizeCatalogStory);
  hydrateLastReadFromCatalog();
  storyCatalogReady = true;
}

async function loadChapterForReader(storyId, chapterId) {
  const key = chapterKey(storyId, chapterId);
  if (authorizedChapterCache.has(key)) return authorizedChapterCache.get(key);
  if (!supabaseClient) throw new Error("DATABASE_REQUIRED");

  const { data, error } = await supabaseClient.rpc("get_chapter_for_reader", {
    p_story_id: storyId,
    p_chapter_id: chapterId
  });
  if (error) throw error;

  const chapter = {
    ...data,
    id: data.id || chapterId,
    free: data.free !== false,
    price: Number(data.price || 0),
    body: Array.isArray(data.body) ? data.body : [],
    audioUrls: data.audioUrls || data.audio_urls || {}
  };
  if (chapter.can_read) authorizedChapterCache.set(key, chapter);
  return chapter;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC");
}

function clampReaderSize(value) {
  return Math.min(24, Math.max(16, Number(value) || 19));
}

function getSpeech() {
  return window.speechSynthesis || null;
}

function selectedAudioVoice() {
  return audioVoicePresets.some((voice) => voice.id === state.audioVoice)
    ? state.audioVoice
    : audioVoicePresets[0].id;
}

function selectedAudioVoiceProfile() {
  return audioVoicePresets.find((voice) => voice.id === selectedAudioVoice()) || audioVoicePresets[0];
}

function selectedAudioSpeed() {
  return audioSpeedOptions.includes(Number(state.audioSpeed)) ? Number(state.audioSpeed) : 1;
}

function audioKey(storyId, chapterId) {
  return `${storyId}:${chapterId}`;
}

function chapterAudioUrl(chapter, voiceId = selectedAudioVoice()) {
  if (!preferGeneratedMp3) return "";
  const urls = chapter.audioUrls || {};
  return urls[voiceId] || (voiceId === "nu-cam-xuc" ? chapter.audioUrl || chapter.audio || "" : "");
}

function splitSpeechChunks(chapter) {
  const chunks = chapter.body
    .map((paragraph) => normalizeText(paragraph).trim())
    .filter(Boolean);
  const result = [];
  let current = "";

  chunks.forEach((paragraph) => {
    if ((current + "\n\n" + paragraph).length > 900 && current) {
      result.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  });

  if (current) result.push(current);
  return result;
}

function stopSpeech() {
  const speech = getSpeech();
  if (speech) speech.cancel();
  speechState = { key: "", chunks: [], index: 0, chunkProgress: 0, playing: false, paused: false };
  updateAudioStatus("Đã dừng nghe.");
  updateAudioProgress(0, "0%");
}

function preferredVoice(profile = selectedAudioVoiceProfile()) {
  const speech = getSpeech();
  if (!speech) return null;
  const voices = speech.getVoices();
  return (
    voices.find((voice) => voice.lang === "vi-VN" && profile.voiceMatch.test(voice.name)) ||
    voices.find((voice) => voice.lang === "vi-VN") ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("vi")) ||
    null
  );
}

function audioPercent() {
  if (!speechState.chunks.length) return 0;
  const current = speechState.index + speechState.chunkProgress;
  return Math.min(100, Math.max(0, Math.round((current / speechState.chunks.length) * 100)));
}

function updateAudioProgress(percent = audioPercent(), label = `${percent}%`) {
  const fill = document.querySelector("[data-audio-progress]");
  const text = document.querySelector("[data-audio-progress-text]");
  const seek = document.querySelector("[data-audio-seek]");
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = label;
  if (seek && !isAudioSeeking && document.activeElement !== seek) seek.value = String(percent);
}

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function seekSpeechPercent(percent) {
  if (!speechState.chunks.length) {
    updateAudioProgress(percent, `${percent}%`);
    return;
  }
  const speech = getSpeech();
  const target = Math.min(
    speechState.chunks.length - 1,
    Math.max(0, Math.floor((percent / 100) * speechState.chunks.length))
  );
  speechState.index = target;
  speechState.chunkProgress = 0;
  updateAudioProgress(audioPercent());
  updateAudioStatus(`Đã tua tới đoạn ${target + 1}/${speechState.chunks.length}.`);
  if (speechState.playing && !speechState.paused && speech) {
    speech.cancel();
    setTimeout(speakNextChunk, 80);
  }
}

function speakNextChunk() {
  const speech = getSpeech();
  if (!speech || !speechState.playing || speechState.paused) return;
  const text = speechState.chunks[speechState.index];
  if (!text) {
    speechState = { ...speechState, playing: false, paused: false, index: 0, chunkProgress: 0 };
    updateAudioProgress(100, "100%");
    updateAudioStatus("Đã nghe hết chương.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const profile = selectedAudioVoiceProfile();
  const voice = preferredVoice(profile);
  if (voice) utterance.voice = voice;
  utterance.lang = "vi-VN";
  utterance.rate = Math.min(1.5, Math.max(0.75, selectedAudioSpeed() * profile.fallbackRate));
  utterance.pitch = Math.min(2, Math.max(0.5, profile.fallbackPitch));
  utterance.onstart = () => {
    speechState.chunkProgress = 0;
    updateAudioProgress();
  };
  utterance.onboundary = (event) => {
    if (!text.length || typeof event.charIndex !== "number") return;
    speechState.chunkProgress = Math.min(0.98, Math.max(0, event.charIndex / text.length));
    updateAudioProgress();
  };
  utterance.onend = () => {
    speechState.index += 1;
    speechState.chunkProgress = 0;
    updateAudioProgress();
    speakNextChunk();
  };
  utterance.onerror = () => {
    speechState.playing = false;
    updateAudioStatus("Trình duyệt không đọc được chương này.");
  };
  updateAudioStatus(`Đang nghe đoạn ${speechState.index + 1}/${speechState.chunks.length}...`);
  speech.speak(utterance);
}

function startSpeech(storyId, chapter) {
  const speech = getSpeech();
  if (!speech) {
    toast("Trình duyệt này chưa hỗ trợ đọc audio tự động.");
    return;
  }

  const key = audioKey(storyId, chapter.id);
  speech.cancel();
  speechState = {
    key,
    chunks: splitSpeechChunks(chapter),
    index: 0,
    chunkProgress: 0,
    playing: true,
    paused: false
  };
  updateAudioProgress(0, "0%");
  if (!preferredVoice()) {
    updateAudioStatus("Đang dùng giọng mặc định của trình duyệt. Nếu chưa nghe thấy, thử bấm lại sau 1 giây.");
  }
  speakNextChunk();
}

function toggleSpeechPause() {
  const speech = getSpeech();
  if (!speech || !speechState.playing) return;
  if (speechState.paused) {
    speechState.paused = false;
    speech.resume();
    updateAudioStatus("Tiếp tục nghe...");
  } else {
    speechState.paused = true;
    speech.pause();
    updateAudioStatus("Đã tạm dừng.");
  }
}

function updateAudioStatus(message) {
  const status = document.querySelector("[data-audio-status]");
  if (status) status.textContent = message;
}

function applyGeneratedAudioSpeed() {
  document.querySelectorAll("[data-generated-audio]").forEach((audio) => {
    audio.playbackRate = selectedAudioSpeed();
  });
}

function currentGeneratedAudio() {
  return document.querySelector("[data-generated-audio]");
}

function updateGeneratedAudioProgress(audio) {
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const percent = Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100));
  updateAudioProgress(percent, `${Math.round(percent)}%`);
  updateAudioStatus(`Đang ở ${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}.`);
}

function startAudioProgressLoop(audio) {
  cancelAnimationFrame(audioProgressFrame);
  const tick = () => {
    if (!isAudioSeeking) updateGeneratedAudioProgress(audio);
    if (!audio.paused && !audio.ended) {
      audioProgressFrame = requestAnimationFrame(tick);
    }
  };
  audioProgressFrame = requestAnimationFrame(tick);
}

function seekGeneratedAudioToPercent(percent, resumeAfterSeek = true) {
  const audio = currentGeneratedAudio();
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const target = Math.min(audio.duration, Math.max(0, (percent / 100) * audio.duration));
  audio.currentTime = target;
  updateGeneratedAudioProgress(audio);
  updateAudioStatus(`Đã tua tới ${formatAudioTime(target)} / ${formatAudioTime(audio.duration)}.`);
  if (resumeAfterSeek && audioWasPlayingBeforeSeek) {
    audio.play()
      .then(() => startAudioProgressLoop(audio))
      .catch(() => updateAudioStatus("Đã tua xong. Bấm play để phát tiếp."));
  }
  return true;
}

async function playAudioForChapter(storyId, chapter) {
  const audio = currentGeneratedAudio();
  if (audio) {
    stopSpeech();
    audio.playbackRate = selectedAudioSpeed();
    audio.play()
      .then(() => {
        updateAudioStatus(`Đang phát MP3 Edge ở tốc độ ${selectedAudioSpeed()}x.`);
        startAudioProgressLoop(audio);
      })
      .catch(() => {
        updateAudioStatus("Trình duyệt chặn autoplay. Bấm trực tiếp nút play trên player MP3.");
      });
    return;
  }
  try {
    const dbChapter = await loadChapterForReader(storyId, chapter.id);
    if (!dbChapter.can_read) {
      toast("Mở khóa chương trước rồi mới nghe được.");
      return;
    }
    startSpeech(storyId, { ...chapter, ...dbChapter });
  } catch {
    toast("Không tải được nội dung audio từ database.");
  }
}

function money(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

function isVip() {
  return hasAccountVip() || (state.user.vipUntil && new Date(state.user.vipUntil).getTime() > Date.now());
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
  if (!chapter) return false;
  if (chapter.free !== false) return true;
  if (isVip()) return true;
  return isChapterUnlocked(storyId, chapter.id);
}

function chapterPriceCoins(chapter) {
  return Math.max(0, Number(chapter?.price || chapter?.price_coins || 0));
}

function isChapterUnlocked(storyId, chapterId) {
  return accountSummary.unlocked.some((item) => item.story_id === storyId && item.chapter_id === chapterId);
}

function commentKey(storyId, chapterId = "story") {
  return chapterId === "story" ? `story:${storyId}` : `chapter:${storyId}:${chapterId}`;
}

function getComments(storyId, chapterId = "story") {
  const key = commentKey(storyId, chapterId);
  return sharedCommentsEnabled ? remoteComments[key] || [] : state.comments?.[key] || [];
}

function cleanCommentAuthor(value) {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "Độc giả";
}

function cleanCommentBody(value) {
  return normalizeText(value)
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 800);
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = supabaseConfig.url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${authSession?.access_token || supabaseConfig.anonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadRemoteComments(storyId, chapterId = "story") {
  if (!sharedCommentsEnabled) return;
  const key = commentKey(storyId, chapterId);
  const query = `comments?target_key=eq.${encodeURIComponent(key)}&is_hidden=eq.false&select=id,author,body,created_at&order=created_at.desc&limit=50`;
  const rows = await supabaseRequest(query);
  remoteComments[key] = rows.map((row) => ({
    id: row.id,
    author: row.author,
    text: row.body,
    createdAt: row.created_at
  }));
  refreshCommentPanel(storyId, chapterId);
}

async function addComment(storyId, chapterId, author, text) {
  const cleaned = cleanCommentBody(text);
  const cleanedAuthor = cleanCommentAuthor(author);
  if (!cleaned) {
    toast("Bạn chưa nhập nội dung bình luận.");
    return false;
  }
  if (cleaned.length < 2) {
    toast("Bình luận ngắn quá, viết thêm chút nữa nha.");
    return false;
  }

  state.commenterName = cleanedAuthor;
  saveState();

  if (sharedCommentsEnabled) {
    const key = commentKey(storyId, chapterId);
    await supabaseRequest("comments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        target_key: key,
        story_id: storyId,
        chapter_id: chapterId === "story" ? null : chapterId,
        user_id: authUser?.id || null,
        user_email: accountEmail() || null,
        author: cleanedAuthor,
        body: cleaned
      })
    });
    await loadRemoteComments(storyId, chapterId);
    toast("Đã gửi bình luận chung.");
    return true;
  }

  const key = commentKey(storyId, chapterId);
  state.comments = state.comments || {};
  state.comments[key] = [
    {
      id: crypto.randomUUID(),
      author: cleanedAuthor,
      text: cleaned,
      createdAt: new Date().toISOString()
    },
    ...(state.comments[key] || [])
  ];
  saveState();
  toast("Đã gửi bình luận.");
  return true;
}

function renderComments(storyId, chapterId = "story") {
  const comments = getComments(storyId, chapterId);
  const title = chapterId === "story" ? "Bình luận truyện" : "Bình luận chương";
  const targetKey = commentKey(storyId, chapterId);
  const commenterName = escapeHtml(state.commenterName || "");
  return `
    <section class="comments-panel" data-comments-scope="${targetKey}" data-comments-story="${storyId}" data-comments-chapter="${chapterId}">
      <div class="section-head compact">
        <div>
          <span class="eyebrow">Cộng đồng</span>
          <h2>${title}</h2>
        </div>
        <span class="status-chip">${comments.length} bình luận</span>
      </div>
      <p class="comment-mode ${sharedCommentsEnabled ? "shared" : "local"}">
        ${sharedCommentsEnabled
          ? "Bình luận chung: mọi độc giả đều thấy sau khi gửi."
          : "Chưa cấu hình Supabase nên bình luận tạm lưu trên trình duyệt này."}
      </p>
      <form class="comment-form" data-comment-form="${storyId}" data-comment-chapter="${chapterId}">
        <div class="comment-fields">
          <label>
            <span>Tên hiển thị</span>
            <input name="author" maxlength="40" value="${commenterName}" placeholder="Tên của bạn" autocomplete="nickname" />
          </label>
          <label>
            <span>Viết bình luận</span>
            <textarea name="comment" maxlength="800" placeholder="Chia sẻ cảm nghĩ của bạn..."></textarea>
          </label>
        </div>
        <input class="comment-honeypot" name="website" autocomplete="off" tabindex="-1" aria-hidden="true" />
        <button class="btn btn-primary" type="submit">Gửi bình luận</button>
      </form>
      <div class="comment-list">
        ${comments.map((comment) => `
          <article class="comment-item">
            <div class="comment-meta">
              <strong>${escapeHtml(comment.author)}</strong>
              <span>${new Date(comment.createdAt).toLocaleString("vi-VN")}</span>
            </div>
            <p>${escapeHtml(comment.text)}</p>
          </article>
        `).join("") || `<p class="muted">Chưa có bình luận nào. Bạn mở hàng đi.</p>`}
      </div>
    </section>
  `;
}

function refreshCommentPanel(storyId, chapterId = "story") {
  const key = commentKey(storyId, chapterId);
  const panel = [...document.querySelectorAll("[data-comments-scope]")]
    .find((item) => item.dataset.commentsScope === key);
  if (panel) {
    panel.outerHTML = renderComments(storyId, chapterId);
  }
}

function hydrateVisibleComments() {
  if (!sharedCommentsEnabled) return;
  document.querySelectorAll("[data-comments-scope]").forEach((panel) => {
    loadRemoteComments(panel.dataset.commentsStory, panel.dataset.commentsChapter)
      .catch(() => {
        const mode = panel.querySelector(".comment-mode");
        if (mode) {
          mode.textContent = "Không tải được bình luận chung. Kiểm tra Supabase config/RLS.";
          mode.classList.remove("shared");
          mode.classList.add("local");
        }
      });
  });
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEpisodeTitle(chapterTitle) {
  const match = chapterTitle.match(/^(Tập\s+\d+:\s*[^-]+)/i);
  return match ? match[1].trim() : "Chương lẻ";
}

function getStoryProgress(story) {
  const readable = story.chapters.filter((chapter) => canRead(story.id, chapter)).length;
  return Math.round((readable / story.chapters.length) * 100);
}

async function unlockChapter(storyId, chapter) {
  if (canRead(storyId, chapter)) return true;
  if (!supabaseClient) {
    toast("Chưa kết nối tài khoản, tạm thời chưa mở khóa chương tính phí được.");
    return false;
  }
  if (!isLoggedIn()) {
    openAuthModal();
    toast("Đăng nhập trước rồi mở khóa chương nha.");
    return false;
  }

  const { data, error } = await supabaseClient.rpc("unlock_chapter_with_coins", {
    p_story_id: storyId,
    p_chapter_id: chapter.id
  });

  if (error) {
    if (error.message?.includes("INSUFFICIENT_COINS")) {
      toast("Không đủ xu để mở chương này.");
    } else if (error.message?.includes("LOGIN_REQUIRED")) {
      openAuthModal();
      toast("Đăng nhập trước rồi mở khóa chương nha.");
    } else {
      toast("Mở khóa chưa thành công. Thử lại sau nha.");
    }
    return false;
  }

  const result = Array.isArray(data) ? data[0] : data;
  await loadAccountSummary();
  renderAccount();
  toast(result?.charged
    ? `Đã trừ ${Number(result.price_coins || 0).toLocaleString("vi-VN")} xu và mở chương.`
    : "Chương này đã được mở cho tài khoản của bạn.");
  return true;
}

function renderAccount() {
  if (!supabaseClient) {
    els.account.innerHTML = `
      <span class="status-chip vip">Đọc miễn phí</span>
      <a class="btn btn-primary" href="#/library">Chọn truyện</a>
    `;
    return;
  }

  if (!isLoggedIn()) {
    els.account.innerHTML = `
      <span class="status-chip">Chưa đăng nhập</span>
      <button class="btn btn-primary" data-open-auth>Đăng nhập</button>
    `;
    return;
  }

  els.account.innerHTML = `
    <a class="account-name" href="#/account">
      <strong>${escapeHtml(accountDisplayName())}</strong>
      <small>${hasAccountVip() ? `VIP còn ${vipDaysLeft()} ngày` : "Tài khoản thường"}</small>
    </a>
    <button class="btn btn-secondary" data-sign-out>Thoát</button>
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
  const progress = getStoryProgress(story);
  return `
    <article class="story-card">
      <a href="#/story/${story.id}" class="cover" style="background:${story.cover}">
        <strong>${story.title}</strong>
      </a>
      <div class="story-body">
        <div class="tags">${story.genre.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
        <h3>${story.title}</h3>
        <div class="story-meta">${story.author} · ${story.reads.toLocaleString("vi-VN")} lượt đọc · ${story.rating}/5</div>
        <p>${story.summary}</p>
        <div class="progress-bar" aria-label="Tiến độ đọc miễn phí">
          <span style="width:${progress}%"></span>
        </div>
        <div class="card-footer">
          <span class="muted">${story.chapters.length} chương · đọc miễn phí</span>
          <a class="btn btn-secondary" href="#/story/${story.id}">Xem truyện</a>
        </div>
      </div>
    </article>
  `;
}

function renderHome() {
  const lastStory = getStory(state.lastRead.storyId) || stories[0];
  const lastChapter = getChapter(lastStory.id, state.lastRead.chapterId) || lastStory.chapters[0];
  state.lastRead = { storyId: lastStory.id, chapterId: lastChapter.id };
  saveState();

  els.view.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <span class="eyebrow">Truyện phế thổ đang đăng</span>
        <h1>Phế Thổ: Ta Nhặt Được Cả Thế Giới</h1>
        <p>Thư viện đọc truyện tiếng Việt có dấu, tối ưu cho đọc dài, có phần nghe audio và lưu chương đang đọc. Hiện tại toàn bộ chương được mở miễn phí.</p>
        <div class="hero-kpis">
          <span>${lastStory.chapters.length} chương</span>
          <span>${lastStory.reads.toLocaleString("vi-VN")} lượt đọc</span>
          <span>${lastStory.rating}/5 đánh giá</span>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/read/${lastStory.id}/${lastChapter.id}">Đọc tiếp</a>
          <a class="btn btn-secondary" href="#/story/${lastStory.id}">Danh sách chương</a>
        </div>
      </div>
      <aside class="panel quick-panel">
        <span class="eyebrow">Đang đọc</span>
        <h2>${lastChapter.title}</h2>
        <p class="muted">${lastStory.title}</p>
        <a class="reading-strip" href="#/read/${lastStory.id}/${lastChapter.id}">
          <span>Tiếp tục đọc</span>
          <strong>${lastChapter.title}</strong>
        </a>
        <div class="metrics-grid">
          <div class="metric"><span class="muted">Trạng thái</span><strong>Free</strong></div>
          <div class="metric"><span class="muted">Audio</span><strong>2 giọng</strong></div>
          <div class="metric"><span class="muted">Bình luận</span><strong>Có</strong></div>
        </div>
      </aside>
    </section>

    <div class="section-head">
      <div>
        <span class="eyebrow">Thư viện</span>
        <h2>Truyện trong repo content</h2>
      </div>
      <a class="btn btn-secondary" href="#/library">Xem tất cả</a>
    </div>
    <section class="story-grid">${stories.map(storyCard).join("")}</section>

    <div class="section-head">
      <div>
        <span class="eyebrow">Trạng thái đọc</span>
        <h2>Đọc miễn phí</h2>
      </div>
    </div>
    <section class="plans-grid">
      <article class="payment-card">
        <span class="eyebrow">Truyện 2K</span>
        <h3>Đọc tự do</h3>
        <p>Thanh toán tạm thời đã tắt. Người đọc có thể vào từng chương để đọc và nghe audio ngay.</p>
        <a class="btn btn-primary" href="#/library">Vào thư viện</a>
      </article>
    </section>
  `;
}

function planCard(plan) {
  return `
    <article class="payment-card">
      <span class="eyebrow">Gói đọc</span>
      <h3>${plan.title}</h3>
      <strong>${money(plan.price)}</strong>
      <p class="muted">${plan.description}</p>
      <button class="btn btn-primary" data-open-checkout="${plan.id}">Thanh toán</button>
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
        <span class="eyebrow">Thư viện</span>
        <h1>Truyện đang đăng</h1>
      </div>
      <span class="status-chip vip">Tất cả chương miễn phí</span>
    </div>
    <section class="story-grid">${filtered.map(storyCard).join("") || emptyState("Không tìm thấy truyện phù hợp.")}</section>
  `;
}

function renderStory(storyId) {
  const story = getStory(storyId);
  if (!story) return renderNotFound();

  const episodes = [...new Set(story.chapters.map((chapter) => getEpisodeTitle(chapter.title)))];
  const filter = state.chapterFilters[story.id] || { episode: "all", query: "" };
  const filteredChapters = story.chapters.filter((chapter) => {
    const episodeMatch = filter.episode === "all" || getEpisodeTitle(chapter.title) === filter.episode;
    const queryMatch = !filter.query || chapter.title.toLowerCase().includes(filter.query.toLowerCase());
    return episodeMatch && queryMatch;
  });

  els.view.innerHTML = `
    <section class="story-detail">
      <div class="detail-cover" style="background:${story.cover}">
        <div>
          <span class="eyebrow" style="color:#fff">Truyện 2K</span>
          <h1>${story.title}</h1>
        </div>
      </div>
      <div>
        <span class="eyebrow">${story.status}</span>
        <h1>${story.title}</h1>
        <p class="muted">Tác giả: ${story.author} · ${story.reads.toLocaleString("vi-VN")} lượt đọc · ${story.rating}/5</p>
        <div class="tags">${story.genre.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
        <p>${story.summary}</p>
        <div class="paywall-actions">
          <a class="btn btn-primary" href="#/read/${story.id}/${story.chapters[0].id}">Đọc từ đầu</a>
          <a class="btn btn-secondary" href="#/read/${state.lastRead.storyId}/${state.lastRead.chapterId}">Đọc tiếp</a>
          <a class="btn btn-secondary" href="#/library">Xem thư viện</a>
        </div>

        <div class="chapter-tools">
          <label>
            <span>Tập</span>
            <select data-episode-filter="${story.id}">
              <option value="all">Tất cả tập</option>
              ${episodes.map((episode) => `
                <option value="${episode}" ${filter.episode === episode ? "selected" : ""}>${episode}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Tìm chương</span>
            <input data-chapter-search="${story.id}" value="${filter.query}" placeholder="Nhập tên chương..." />
          </label>
        </div>

        <p class="muted">${filteredChapters.length}/${story.chapters.length} chương đang hiển thị.</p>
        <div class="chapter-list">
          ${filteredChapters.map((chapter) => chapterRow(story.id, chapter)).join("") || emptyState("Không có chương phù hợp.")}
        </div>
        ${renderComments(story.id)}
      </div>
    </section>
  `;
}

function chapterRow(storyId, chapter) {
  const readable = canRead(storyId, chapter);
  const price = chapterPriceCoins(chapter);
  const label = chapter.free !== false
    ? "Miễn phí"
    : readable
      ? (isVip() ? "VIP" : "Đã mở")
      : `${price.toLocaleString("vi-VN")} xu`;
  return `
    <article class="chapter-row">
      <div>
        <strong>${chapter.title}</strong>
        <span class="muted">${label}</span>
      </div>
      ${readable
        ? `<a class="btn btn-primary" href="#/read/${storyId}/${chapter.id}">Đọc</a>`
        : `<button class="btn btn-primary" data-unlock-chapter="${storyId}:${chapter.id}">Mở khóa</button>`}
    </article>
  `;
}

function renderChapterNav(story, prev, next, extraClass = "") {
  return `
    <nav class="reader-nav ${extraClass}" aria-label="Chuyển chương">
      ${prev ? `<a class="btn btn-secondary" href="#/read/${story.id}/${prev.id}">Chương trước</a>` : "<span></span>"}
      ${next ? `<a class="btn btn-primary" href="#/read/${story.id}/${next.id}" data-audio-next>Chương sau</a>` : "<span></span>"}
    </nav>
  `;
}

function renderAudioPanel(story, chapter, readable, prev, next) {
  if (!readable) return "";
  const voiceId = selectedAudioVoice();
  const speed = selectedAudioSpeed();
  const audioUrl = chapterAudioUrl(chapter, voiceId);
  const voiceLabel = audioVoicePresets.find((voice) => voice.id === voiceId)?.label || "Hoài My - nữ Việt";
  const nativePlayer = audioUrl
    ? `<audio controls preload="metadata" src="${escapeHtml(audioUrl)}" data-generated-audio></audio>`
    : "";
  const modeText = audioUrl
    ? `Đang có MP3 Edge gen sẵn cho giọng ${voiceLabel}. Player bên dưới kéo tua qua lại được.`
    : `Chưa có MP3 cho giọng ${voiceLabel}. Cần gen audio trước khi bật nghe.`;
  const audioActions = audioUrl
    ? `
        <button class="btn btn-primary" data-speak-chapter="${story.id}:${chapter.id}">Nghe chương</button>
        <button class="btn btn-secondary" data-pause-speech>Tạm dừng / tiếp tục</button>
        <button class="btn btn-secondary" data-stop-speech>Dừng</button>
      `
    : `<button class="btn btn-secondary" disabled>Chưa có MP3</button>`;

  return `
    <section class="audio-panel" data-audio-panel="${story.id}:${chapter.id}">
      <div>
        <span class="eyebrow">Nghe truyện</span>
        <h2>Audio chương này</h2>
        <p class="muted">${modeText}</p>
      </div>
      <div class="audio-controls">
        <label>
          <span>Giọng đọc</span>
          <select data-audio-voice>
            ${audioVoicePresets.map((voice) => `
              <option value="${voice.id}" ${voice.id === voiceId ? "selected" : ""}>${voice.label}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>Tốc độ</span>
          <select data-audio-speed>
            ${audioSpeedOptions.map((option) => `
              <option value="${option}" ${option === speed ? "selected" : ""}>${option}x</option>
            `).join("")}
          </select>
        </label>
      </div>
      ${nativePlayer}
      <div class="audio-progress" aria-label="Tiến trình nghe">
        <span data-audio-progress style="width:0%"></span>
      </div>
      <label class="audio-seek">
        <span>Tua audio</span>
        <input type="range" min="0" max="100" value="0" step="0.1" data-audio-seek />
      </label>
      <div class="audio-actions">
        ${audioActions}
      </div>
      ${renderChapterNav(story, prev, next, "audio-chapter-nav")}
      <p class="audio-status"><span data-audio-status>${audioUrl ? "Sẵn sàng phát MP3 Edge." : "Chưa có file MP3 cho giọng này."}</span> <strong data-audio-progress-text>0%</strong></p>
    </section>
  `;
}

async function renderReader(storyId, chapterId) {
  const story = getStory(storyId);
  const chapter = getChapter(storyId, chapterId);
  if (!story || !chapter) return renderNotFound();

  state.readerSize = clampReaderSize(state.readerSize);
  document.documentElement.style.setProperty("--reader-size", `${state.readerSize}px`);
  document.body.classList.toggle("reader-dark", state.darkReader);

  const index = story.chapters.findIndex((item) => item.id === chapter.id);
  const prev = story.chapters[index - 1];
  const next = story.chapters[index + 1];
  let readable = canRead(storyId, chapter);
  let readerChapter = chapter;

  if (readable) {
    try {
      const dbChapter = await loadChapterForReader(storyId, chapterId);
      readable = Boolean(dbChapter.can_read);
      readerChapter = { ...chapter, ...dbChapter };
    } catch {
      readable = false;
    }
  }

  if (readable) {
    state.lastRead = { storyId, chapterId };
    saveState();
    saveReadingProgress(storyId, chapterId).catch(() => {});
  }

  els.view.innerHTML = `
    <article class="reader">
      <h1>${escapeHtml(chapter.title)}</h1>
      <p class="muted reader-meta">${escapeHtml(story.title)} · ${chapter.free !== false ? "Chương miễn phí" : `${chapterPriceCoins(chapter).toLocaleString("vi-VN")} xu`}</p>
      <div class="reader-toolbar">
        <a class="btn btn-secondary" href="#/story/${story.id}">Danh sách chương</a>
        ${renderChapterNav(story, prev, next, "reader-nav-top")}
        <div class="reader-settings">
          <button class="icon-btn" data-reader-size="-1" aria-label="Giảm cỡ chữ">A-</button>
          <button class="icon-btn" data-reader-size="1" aria-label="Tăng cỡ chữ">A+</button>
          <button class="btn btn-secondary" id="toggleReaderTheme">${state.darkReader ? "Nền sáng" : "Nền tối"}</button>
        </div>
      </div>
      ${
        readable
          ? `${renderAudioPanel(story, readerChapter, readable, prev, next)}<section class="reader-content">${readerChapter.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</section>`
          : paywallBlock(storyId, chapter)
      }
      ${renderChapterNav(story, prev, next, "reader-nav-bottom")}
      ${renderComments(story.id, chapter.id)}
    </article>
  `;
  applyGeneratedAudioSpeed();
}

function paywallBlock(storyId, chapter) {
  const price = chapterPriceCoins(chapter);
  return `
    <section class="paywall">
      <span class="eyebrow">Chương tính phí</span>
      <h2>${chapter.title}</h2>
      <p>Chương này cần ${price.toLocaleString("vi-VN")} xu để mở. Sau khi mở, hệ thống lưu vào tài khoản nên lần sau đăng nhập lại vẫn đọc được.</p>
      <div class="paywall-actions">
        <button class="btn btn-primary" data-unlock-chapter="${storyId}:${chapter.id}">Mở khóa bằng xu</button>
        <a class="btn btn-secondary" href="#/account">Xem tài khoản</a>
      </div>
    </section>
  `;
}

function renderWallet() {
  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Đọc miễn phí</span>
        <h1>Thanh toán đang tạm tắt</h1>
      </div>
      <span class="status-chip vip">Tất cả chương miễn phí</span>
    </div>
    <section class="plans-grid">
      <article class="payment-card">
        <span class="eyebrow">Truyện 2K</span>
        <h3>Không cần thanh toán</h3>
        <p>Giai đoạn này site mở free cho độc giả đọc và nghe truyện trước.</p>
        <a class="btn btn-primary" href="#/library">Vào thư viện</a>
      </article>
    </section>
  `;
}

function transactionTable() {
  if (!state.transactions.length) return emptyState("Chưa có giao dịch nào.");
  return `
    <table class="admin-table">
      <thead><tr><th>Thời gian</th><th>Nội dung</th><th>Loại</th><th>Giá trị</th></tr></thead>
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
  const totalFree = stories.flatMap((story) => story.chapters).filter((chapter) => chapter.free).length;
  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Quản trị</span>
        <h1>Vận hành nội dung</h1>
      </div>
      <button class="btn btn-danger" id="resetDemo">Làm mới dữ liệu thử</button>
    </div>
    <section class="metrics-grid">
      <div class="metric"><span class="muted">Tổng truyện</span><strong>${stories.length}</strong></div>
      <div class="metric"><span class="muted">Chương miễn phí</span><strong>${totalFree}</strong></div>
      <div class="metric"><span class="muted">Giao dịch</span><strong>${state.transactions.length}</strong></div>
    </section>
    <div class="section-head"><h2>Bảng truyện</h2></div>
    <table class="admin-table">
      <thead><tr><th>Truyện</th><th>Tác giả</th><th>Chương</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
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

function renderAccountPage() {
  if (!supabaseClient) {
    els.view.innerHTML = emptyState("Chưa cấu hình Supabase.");
    return;
  }
  if (!isLoggedIn()) {
    els.view.innerHTML = `
      <div class="page-title">
        <div>
          <span class="eyebrow">Tài khoản</span>
          <h1>Đăng nhập để lưu VIP và tiến độ đọc</h1>
        </div>
        <button class="btn btn-primary" data-open-auth>Đăng nhập</button>
      </div>
      <section class="panel">
        <p class="muted">Sau khi đăng nhập, hệ thống sẽ biết tài khoản nào có VIP, còn bao nhiêu ngày, ví còn bao nhiêu, đang đọc tới chương nào và đã mở chương nào.</p>
      </section>
    `;
    return;
  }

  const progress = currentAccountProgress();
  const progressStory = getStory(progress.story_id || progress.storyId) || stories[0];
  const progressChapter = getChapter(progressStory.id, progress.chapter_id || progress.chapterId) || progressStory.chapters[0];
  const activeVip = accountSummary.vip.filter((item) => new Date(item.active_until).getTime() > Date.now());
  const unlockedCount = accountSummary.unlocked.length;
  const wallet = accountSummary.wallet || { balance_vnd: 0, coin_balance: 0 };

  els.view.innerHTML = `
    <div class="page-title">
      <div>
        <span class="eyebrow">Tài khoản</span>
        <h1>${escapeHtml(accountDisplayName())}</h1>
        <p class="muted">${escapeHtml(accountEmail())}</p>
      </div>
      <button class="btn btn-secondary" data-sign-out>Đăng xuất</button>
    </div>

    <section class="metrics-grid">
      <div class="metric"><span class="muted">VIP</span><strong>${hasAccountVip() ? `${vipDaysLeft()} ngày` : "Chưa có"}</strong></div>
      <div class="metric"><span class="muted">Số dư</span><strong>${money(wallet.balance_vnd || 0)}</strong></div>
      <div class="metric"><span class="muted">Xu</span><strong>${Number(wallet.coin_balance || 0).toLocaleString("vi-VN")}</strong></div>
      <div class="metric"><span class="muted">Chương đã mở</span><strong>${unlockedCount}</strong></div>
    </section>

    <section class="panel account-panel">
      <div class="section-head compact">
        <div>
          <span class="eyebrow">Đang đọc</span>
          <h2>${progressChapter.title}</h2>
        </div>
        <a class="btn btn-primary" href="#/read/${progressStory.id}/${progressChapter.id}">Đọc tiếp</a>
      </div>
      <p class="muted">${progressStory.title}</p>
    </section>

    <section class="panel account-panel">
      <div class="section-head compact">
        <div>
          <span class="eyebrow">VIP</span>
          <h2>Lịch sử gói</h2>
        </div>
        <span class="status-chip ${hasAccountVip() ? "vip" : ""}">${hasAccountVip() ? "Đang hoạt động" : "Chưa kích hoạt"}</span>
      </div>
      ${activeVip.length ? `
        <div class="account-list">
          ${activeVip.map((item) => `
            <article class="account-list-item">
              <strong>${escapeHtml(item.plan_id)}</strong>
              <span>Còn tới ${new Date(item.active_until).toLocaleString("vi-VN")} · ${escapeHtml(item.source || "payment")}</span>
            </article>
          `).join("")}
        </div>
      ` : `<p class="muted">Tài khoản này chưa có VIP. Khi payment bật, gói mua sẽ ghi vào đây.</p>`}
    </section>

    <section class="panel account-panel">
      <div class="section-head compact">
        <div>
          <span class="eyebrow">Mở khóa</span>
          <h2>Chương đã mở</h2>
        </div>
        <span class="status-chip">${unlockedCount} chương</span>
      </div>
      ${unlockedCount ? `
        <div class="account-list">
          ${accountSummary.unlocked.slice(0, 20).map((item) => {
            const story = getStory(item.story_id);
            const chapter = getChapter(item.story_id, item.chapter_id);
            return `
              <article class="account-list-item">
                <strong>${escapeHtml(chapter?.title || item.chapter_id)}</strong>
                <span>${escapeHtml(story?.title || item.story_id)} · ${new Date(item.created_at).toLocaleString("vi-VN")}</span>
              </article>
            `;
          }).join("")}
        </div>
      ` : `<p class="muted">Hiện toàn bộ truyện đang free nên chưa cần mở khóa chương riêng.</p>`}
    </section>

    <section class="panel account-panel">
      <div class="section-head compact">
        <div>
          <span class="eyebrow">Ví xu</span>
          <h2>Lịch sử giao dịch</h2>
        </div>
        <span class="status-chip">${accountSummary.transactions.length} giao dịch</span>
      </div>
      ${accountSummary.transactions.length ? `
        <div class="account-list">
          ${accountSummary.transactions.map((item) => {
            const story = getStory(item.story_id);
            const chapter = getChapter(item.story_id, item.chapter_id);
            const amount = Number(item.amount || 0);
            return `
              <article class="account-list-item">
                <strong>${amount > 0 ? "+" : ""}${amount.toLocaleString("vi-VN")} xu</strong>
                <span>${escapeHtml(chapter?.title || item.reason)}${story ? ` · ${escapeHtml(story.title)}` : ""} · ${new Date(item.created_at).toLocaleString("vi-VN")}</span>
              </article>
            `;
          }).join("")}
        </div>
      ` : `<p class="muted">Chưa có giao dịch xu nào.</p>`}
    </section>
  `;
}

function openAuthModal() {
  if (!supabaseClient) {
    toast("Chưa cấu hình Supabase Auth.");
    return;
  }
  els.checkout.innerHTML = `
    <span class="eyebrow">Tài khoản</span>
    <h2 id="checkoutTitle">Đăng nhập Truyện 2K</h2>
    <p class="muted">Tài khoản dùng để ghi nhận bình luận, VIP, số dư, chương đã mở và tiến độ đọc.</p>
    <form class="auth-form" data-auth-form>
      <label>
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" placeholder="ban@example.com" required />
      </label>
      <label>
        <span>Mật khẩu</span>
        <input name="password" type="password" autocomplete="current-password" minlength="6" placeholder="Tối thiểu 6 ký tự" />
      </label>
      <label>
        <span>Tên hiển thị</span>
        <input name="displayName" maxlength="40" autocomplete="nickname" placeholder="Tên độc giả" value="${escapeHtml(state.commenterName || "")}" />
      </label>
      <div class="auth-actions">
        <button class="btn btn-primary" type="submit" data-auth-action="signin">Đăng nhập</button>
        <button class="btn btn-secondary" type="submit" data-auth-action="signup">Tạo tài khoản</button>
        <button class="btn btn-secondary" type="submit" data-auth-action="magic">Gửi link email</button>
      </div>
    </form>
  `;
  els.modal.hidden = false;
}

async function signInWithPassword(email, password) {
  if (!supabaseClient) return false;
  const cleanedEmail = String(email || "").trim().toLowerCase();
  if (!cleanedEmail || !password) {
    toast("Nhập email và mật khẩu trước nha.");
    return false;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: cleanedEmail,
    password
  });
  if (error) throw error;
  toast("Đã đăng nhập.");
  return true;
}

async function signUpWithPassword(email, password, displayName) {
  if (!supabaseClient) return false;
  const cleanedEmail = String(email || "").trim().toLowerCase();
  const cleanedName = cleanCommentAuthor(displayName || cleanedEmail.split("@")[0]);
  if (!cleanedEmail || !password) {
    toast("Nhập email và mật khẩu trước nha.");
    return false;
  }
  state.commenterName = cleanedName;
  saveState();
  const { error } = await supabaseClient.auth.signUp({
    email: cleanedEmail,
    password,
    options: {
      data: { display_name: cleanedName },
      emailRedirectTo: `${location.origin}${location.pathname}`
    }
  });
  if (error) throw error;
  toast("Đã tạo tài khoản. Nếu Supabase yêu cầu xác nhận, mở email để xác nhận.");
  return true;
}

async function sendLoginLink(email, displayName) {
  if (!supabaseClient) return false;
  const cleanedEmail = String(email || "").trim().toLowerCase();
  const cleanedName = cleanCommentAuthor(displayName || cleanedEmail.split("@")[0]);
  if (!cleanedEmail) {
    toast("Nhập email trước nha.");
    return false;
  }
  state.commenterName = cleanedName;
  saveState();
  const { error } = await supabaseClient.auth.signInWithOtp({
    email: cleanedEmail,
    options: {
      shouldCreateUser: true,
      data: { display_name: cleanedName },
      emailRedirectTo: `${location.origin}${location.pathname}`
    }
  });
  if (error) throw error;
  toast("Đã gửi link đăng nhập. Mở email rồi bấm link xác nhận.");
  return true;
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  authSession = null;
  authUser = null;
  userVipUntil = null;
  renderAccount();
  hydrateVisibleComments();
  toast("Đã đăng xuất.");
}

function openCheckout(planId) {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    toast("Thanh toán đang tạm tắt. Hiện tất cả chương đều đọc miễn phí.");
    return;
  }
  const orderCode = `DTV${Date.now().toString().slice(-8)}`;
  els.checkout.innerHTML = `
    <span class="eyebrow">VietQR / payOS</span>
    <h2 id="checkoutTitle">${plan.title}</h2>
    <p class="muted">${plan.description}</p>
    <div class="qr-box" aria-label="Mã QR thanh toán"><span>${orderCode}</span></div>
    <p><strong>Số tiền:</strong> ${money(plan.price)}</p>
    <p><strong>Nội dung:</strong> ${orderCode} ${plan.id}</p>
    <p class="muted">Cổng thanh toán đang ở chế độ thử nghiệm. Khi nối payOS thật, hệ thống sẽ tự kích hoạt gói sau khi ngân hàng xác nhận.</p>
    <div class="paywall-actions">
      <button class="btn btn-primary" data-confirm-payment="${plan.id}">Xác nhận thanh toán thử</button>
      <button class="btn btn-secondary" id="copyOrderCode">Copy mã đơn</button>
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
    type: "Thanh toán",
    title: plan.title,
    amount: plan.price,
    createdAt: new Date().toISOString()
  });
  saveState();
  els.modal.hidden = true;
  toast(`Đã kích hoạt ${plan.title}.`);
  route();
}

function emptyState(text) {
  return `<div class="panel"><p class="muted">${text}</p></div>`;
}

function renderNotFound() {
  els.view.innerHTML = emptyState("Không tìm thấy trang này.");
}

function renderCatalogGate() {
  if (!storyCatalogReady) {
    els.view.innerHTML = emptyState("Đang tải dữ liệu truyện từ database...");
    return false;
  }
  if (storyCatalogError || !stories.length) {
    els.view.innerHTML = emptyState(storyCatalogError || "Database chưa có truyện nào.");
    return false;
  }
  return true;
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  els.toastStack.append(item);
  setTimeout(() => item.remove(), 3200);
}

async function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const shouldScrollTop = hash !== activeRouteHash;
  if (shouldScrollTop) stopSpeech();
  activeRouteHash = hash;
  const [_, routeName, id, chapterId] = hash.split("/");
  document.body.classList.toggle("reader-dark", state.darkReader && routeName === "read");
  setActiveNav(hash);

  if (!renderCatalogGate()) return;

  if (hash === "/") renderHome();
  else if (routeName === "library") renderLibrary();
  else if (routeName === "story") renderStory(id);
  else if (routeName === "read") await renderReader(id, chapterId);
  else if (routeName === "account") renderAccountPage();
  else if (routeName === "wallet") renderLibrary();
  else if (routeName === "admin") renderAdmin();
  else renderNotFound();
  hydrateVisibleComments();
  els.view.focus({ preventScroll: true });
  if (shouldScrollTop) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-open-auth]")) {
    openAuthModal();
  }

  if (event.target.closest("[data-sign-out]")) {
    signOut();
  }

  const checkoutButton = event.target.closest("[data-open-checkout]");
  if (checkoutButton) openCheckout(checkoutButton.dataset.openCheckout);

  const confirmButton = event.target.closest("[data-confirm-payment]");
  if (confirmButton) confirmPayment(confirmButton.dataset.confirmPayment);

  const unlockButton = event.target.closest("[data-unlock-chapter]");
  if (unlockButton) {
    event.preventDefault();
    const [storyId, chapterId] = unlockButton.dataset.unlockChapter.split(":");
    const chapter = getChapter(storyId, chapterId);
    unlockButton.disabled = true;
    if (chapter && await unlockChapter(storyId, chapter)) route();
    unlockButton.disabled = false;
  }

  const sizeButton = event.target.closest("[data-reader-size]");
  if (sizeButton) {
    state.readerSize = clampReaderSize(state.readerSize + Number(sizeButton.dataset.readerSize));
    saveState();
    route();
  }

  const speakButton = event.target.closest("[data-speak-chapter]");
  if (speakButton) {
    const [storyId, chapterId] = speakButton.dataset.speakChapter.split(":");
    const chapter = getChapter(storyId, chapterId);
    if (chapter) await playAudioForChapter(storyId, chapter);
  }

  if (event.target.closest("[data-pause-speech]")) {
    toggleSpeechPause();
  }

  if (event.target.closest("[data-stop-speech]")) {
    stopSpeech();
  }

  if (event.target.id === "toggleReaderTheme") {
    state.darkReader = !state.darkReader;
    saveState();
    route();
  }

  if (event.target.id === "resetDemo") {
    localStorage.removeItem(storageKey);
    state = loadState();
    toast("Đã làm mới dữ liệu thử.");
    route();
  }

  if (event.target.id === "copyOrderCode") {
    const text = els.checkout.querySelector(".qr-box span")?.textContent || "";
    navigator.clipboard?.writeText(text);
    toast("Đã copy mã đơn.");
  }
});

document.addEventListener("submit", async (event) => {
  const authForm = event.target.closest("[data-auth-form]");
  if (authForm) {
    event.preventDefault();
    const button = event.submitter || authForm.querySelector("button[type='submit']");
    const action = button?.dataset.authAction || "signin";
    const email = authForm.elements.email.value;
    const password = authForm.elements.password.value;
    const displayName = authForm.elements.displayName.value;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Đang xử lý...";
    try {
      const ok = action === "signup"
        ? await signUpWithPassword(email, password, displayName)
        : action === "magic"
          ? await sendLoginLink(email, displayName)
          : await signInWithPassword(email, password);
      if (ok) {
        els.modal.hidden = true;
      }
    } catch {
      toast("Chưa xử lý được tài khoản. Kiểm tra email/mật khẩu hoặc xác nhận email.");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    return;
  }

  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const storyId = form.dataset.commentForm;
  const chapterId = form.dataset.commentChapter || "story";
  const input = form.elements.comment;
  const authorInput = form.elements.author;
  if (form.elements.website?.value) return;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Đang gửi...";
  try {
    if (await addComment(storyId, chapterId, authorInput?.value, input.value)) {
      input.value = "";
      if (authorInput) authorInput.value = state.commenterName || "";
      if (!sharedCommentsEnabled) {
        if (chapterId === "story") renderStory(storyId);
        else route();
      }
    }
  } catch {
    toast("Chưa gửi được bình luận chung. Kiểm tra Supabase config.");
  } finally {
    button.disabled = false;
    button.textContent = "Gửi bình luận";
  }
});

document.addEventListener("change", (event) => {
  const episodeSelect = event.target.closest("[data-episode-filter]");
  if (!episodeSelect) return;
  const storyId = episodeSelect.dataset.episodeFilter;
  state.chapterFilters[storyId] = {
    ...(state.chapterFilters[storyId] || { query: "" }),
    episode: episodeSelect.value
  };
  saveState();
  renderStory(storyId);
});

document.addEventListener("input", (event) => {
  const audioSeek = event.target.closest("[data-audio-seek]");
  if (audioSeek) {
    const percent = Number(audioSeek.value) || 0;
    const audio = currentGeneratedAudio();
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      const target = (percent / 100) * audio.duration;
      updateAudioProgress(percent, `${Math.round(percent)}%`);
      updateAudioStatus(`Tua tới ${formatAudioTime(target)} / ${formatAudioTime(audio.duration)}. Thả ra để phát từ đây.`);
      return;
    }
    updateAudioProgress(percent, `${percent}%`);
    return;
  }

  const chapterSearch = event.target.closest("[data-chapter-search]");
  if (!chapterSearch) return;
  const storyId = chapterSearch.dataset.chapterSearch;
  state.chapterFilters[storyId] = {
    ...(state.chapterFilters[storyId] || { episode: "all" }),
    query: chapterSearch.value
  };
  const cursor = chapterSearch.selectionStart || chapterSearch.value.length;
  saveState();
  renderStory(storyId);
  const nextInput = document.querySelector(`[data-chapter-search="${storyId}"]`);
  if (nextInput) {
    nextInput.focus();
    nextInput.setSelectionRange(cursor, cursor);
  }
});

document.addEventListener("change", (event) => {
  const voiceSelect = event.target.closest("[data-audio-voice]");
  if (voiceSelect) {
    state.audioVoice = voiceSelect.value;
    stopSpeech();
    saveState();
    route();
    return;
  }

  const speedSelect = event.target.closest("[data-audio-speed]");
  if (speedSelect) {
    state.audioSpeed = Number(speedSelect.value) || 1;
    saveState();
    applyGeneratedAudioSpeed();
    updateAudioStatus(`Đã đổi tốc độ sang ${selectedAudioSpeed()}x.`);
    if (speechState.playing && !speechState.paused) {
      getSpeech()?.cancel();
      setTimeout(speakNextChunk, 80);
    }
    return;
  }

  const audioSeek = event.target.closest("[data-audio-seek]");
  if (!audioSeek) return;
  if (seekGeneratedAudioToPercent(Number(audioSeek.value) || 0, true)) {
    isAudioSeeking = false;
    return;
  }
  seekSpeechPercent(Number(audioSeek.value) || 0);
});

document.addEventListener("pointerdown", (event) => {
  const audioSeek = event.target.closest("[data-audio-seek]");
  if (!audioSeek) return;
  const audio = currentGeneratedAudio();
  if (!audio) return;
  isAudioSeeking = true;
  audioWasPlayingBeforeSeek = !audio.paused && !audio.ended;
  if (audioWasPlayingBeforeSeek) audio.pause();
});

document.addEventListener("pointerup", (event) => {
  const audioSeek = event.target.closest("[data-audio-seek]");
  if (!audioSeek || !isAudioSeeking) return;
  seekGeneratedAudioToPercent(Number(audioSeek.value) || 0, true);
  isAudioSeeking = false;
});

document.addEventListener("keyup", (event) => {
  const audioSeek = event.target.closest("[data-audio-seek]");
  if (!audioSeek || !["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
  seekGeneratedAudioToPercent(Number(audioSeek.value) || 0, true);
});

document.addEventListener("timeupdate", (event) => {
  const audio = event.target.closest?.("[data-generated-audio]");
  if (!audio) return;
  if (!isAudioSeeking) updateGeneratedAudioProgress(audio);
}, true);

document.addEventListener("loadedmetadata", (event) => {
  const audio = event.target.closest?.("[data-generated-audio]");
  if (!audio) return;
  audio.playbackRate = selectedAudioSpeed();
  updateGeneratedAudioProgress(audio);
}, true);

document.addEventListener("ended", (event) => {
  const audio = event.target.closest?.("[data-generated-audio]");
  if (!audio) return;
  updateAudioProgress(100, "100%");
  const nextLink = document.querySelector("[data-audio-next]");
  updateAudioStatus(nextLink ? "Đã nghe hết MP3. Bấm Chương sau để nghe tiếp." : "Đã nghe hết MP3.");
}, true);

document.addEventListener("play", (event) => {
  const audio = event.target.closest?.("[data-generated-audio]");
  if (!audio) return;
  stopSpeech();
  audio.playbackRate = selectedAudioSpeed();
  updateAudioStatus(`Đang phát MP3 Edge ở tốc độ ${selectedAudioSpeed()}x.`);
  startAudioProgressLoop(audio);
}, true);

document.addEventListener("pause", (event) => {
  const audio = event.target.closest?.("[data-generated-audio]");
  if (!audio || audio.ended || isAudioSeeking) return;
  updateAudioStatus("Đã tạm dừng MP3.");
}, true);

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

getSpeech()?.addEventListener?.("voiceschanged", () => {
  if (!speechState.playing) return;
  updateAudioStatus("Đã sẵn sàng giọng đọc tiếng Việt.");
});

renderAccount();
route();
Promise.all([loadStoryCatalog(), initAuth()])
  .finally(() => route());
