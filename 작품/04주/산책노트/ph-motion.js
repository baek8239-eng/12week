/* ============================================================================
   PLAYHEAD — 모션 런타임 (ph-motion.js) · 무의존
   로드 순서: tokens.css → ph.css → ph-motion.js
   원칙: 이 파일은 숫자를 소유하지 않는다. 물리·거리·시간은 전부 --ph-* 토큰에서 읽는다.
         스크롤은 가로채지 않는다 — window.scrollY 를 목표로 lerp 하는 층일 뿐이라
         스크롤바·키보드·앵커·터치 관성이 그대로 산다.
   모듈: Engine · Smooth · Reveal · Rules · Parallax · Speed · Pin(가로) · Words ·
         Night · Scrub · Smear · Marquee · Scramble · Roll · Menu · Toggles · Loader · Playlist
   ========================================================================== */
(() => {
  "use strict";

  /* ------------------------------------------------------------ 유틸 */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } },
  };

  /* ------------------------------------------------------------ 토큰 */
  const root = document.documentElement;
  let CS = getComputedStyle(root);
  const T = {
    refresh() { CS = getComputedStyle(root); T.rem = parseFloat(CS.fontSize) || 10; },
    raw: (n) => CS.getPropertyValue("--ph-" + n).trim(),
    num(n, f = 0) { const v = parseFloat(T.raw(n)); return Number.isFinite(v) ? v : f; },
    /** "3.6rem" · "12px" · "400ms" → px/ms 숫자 */
    len(n, f = 0) {
      const s = T.raw(n); const v = parseFloat(s);
      if (!Number.isFinite(v)) return f;
      if (s.endsWith("rem")) return v * T.rem;
      if (s.endsWith("vw")) return v * innerWidth / 100;
      return v;
    },
    rem: 10,
  };
  T.refresh();

  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const FINE = matchMedia("(hover: hover) and (pointer: fine)");

  /* ------------------------------------------------------------ Engine */
  const E = {
    target: 0, y: 0, pos: 0, vs: 0, vn: 0, vw: innerWidth, vh: innerHeight, max: 1,
    smooth: false, motion: !RM.matches, touched: false, touching: false,
    subs: [], resizers: [], idlers: [],
    on(fn) { E.subs.push(fn); return fn; },
    onResize(fn) { E.resizers.push(fn); return fn; },
    onIdle(fn) { E.idlers.push(fn); return fn; },
    /** 레이아웃 기준 top(문서 좌표) — 부드러운 층이든 네이티브든 같은 값 */
    top(el) { return el.getBoundingClientRect().top + (E.smooth ? E.y : scrollY); },
    jump(y, instant) {
      scrollTo({ top: y, behavior: "instant" });
      if (instant) { E.target = E.y = E.pos = y; }
    },
  };
  window.PH = { E, T };

  let last = performance.now(), lastScroll = 0, idleFired = true, main = null, spacer = null;

  function measure() {
    T.refresh();
    E.vw = innerWidth; E.vh = innerHeight;
    if (E.smooth && main && spacer) spacer.style.height = main.offsetHeight + "px";
    E.max = Math.max(1, document.documentElement.scrollHeight - E.vh);
    E.resizers.forEach((f) => f(E));
  }

  function frame(now) {
    const dt = clamp(now - last, 1, 64); last = now;
    E.target = scrollY;
    const k = E.motion ? 1 - Math.pow(1 - T.num("lerp", .085), dt / 16.667) : 1;
    const prev = E.y;
    E.y += (E.target - E.y) * k;
    if (Math.abs(E.target - E.y) < .05) E.y = E.target;
    const raw = E.motion ? (E.y - prev) * (16.667 / dt) : 0;
    E.vs += (raw - E.vs) * .22;
    if (Math.abs(E.vs) < .01) E.vs = 0;
    E.vn = clamp(E.vs / T.num("velocity-cap", 140), -1, 1);
    E.pos = E.smooth ? E.y : E.target;
    if (E.smooth && main) main.style.transform = `translate3d(0,${-E.y.toFixed(2)}px,0)`;
    for (let i = 0; i < E.subs.length; i++) E.subs[i](E, dt);
    if (!idleFired && !E.touching && now - lastScroll > T.num("snap-idle", 240) && Math.abs(E.target - E.y) < 2) {
      idleFired = true; E.idlers.forEach((f) => f(E));
    }
    requestAnimationFrame(frame);
  }

  function initEngine() {
    main = $(".ph-main");
    if (main && FINE.matches && !RM.matches && !document.body.hasAttribute("data-native")) {
      E.smooth = true;
      document.body.classList.add("ph-smooth");
      spacer = document.createElement("div");
      spacer.className = "ph-spacer";
      document.body.appendChild(spacer);
      new ResizeObserver(measure).observe(main);
    }
    addEventListener("scroll", () => {
      lastScroll = performance.now(); idleFired = false;
      if (!E.touched && scrollY > 2) { E.touched = true; document.body.classList.add("ph-touched"); }
    }, { passive: true });
    addEventListener("touchstart", () => { E.touching = true; }, { passive: true });
    addEventListener("touchend", () => { E.touching = false; lastScroll = performance.now(); }, { passive: true });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(measure, 80); });
    if (document.fonts) document.fonts.ready.then(measure);
    addEventListener("load", measure);
    E.y = E.target = E.pos = scrollY;
    measure();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ Scramble · Roll */
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/()#*+";
  function scramble(el, text, dur) {
    dur = dur ?? T.num("dur-swap", 420);
    if (!E.motion) { el.textContent = text; return; }
    const from = el.textContent, n = Math.max(from.length, text.length), t0 = performance.now();
    cancelAnimationFrame(el._scr);
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      let s = "";
      for (let i = 0; i < n; i++) {
        const edge = i / n;
        if (p >= edge + .18 || p === 1) s += text[i] ?? "";
        else if (p > edge) s += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        else s += from[i] ?? "";
      }
      el.textContent = s;
      if (p < 1) el._scr = requestAnimationFrame(step);
    };
    el._scr = requestAnimationFrame(step);
  }

  function roll(el, value, digits = 2) {
    const str = String(value).padStart(digits, "0");
    if (!el._cols) {
      el.textContent = ""; el._cols = [];
      for (let i = 0; i < digits; i++) {
        const col = document.createElement("span");
        col.innerHTML = Array.from({ length: 10 }, (_, d) => `<b style="display:block;font-weight:400;height:1em">${d}</b>`).join("");
        el.appendChild(col); el._cols.push(col);
      }
      el.setAttribute("aria-label", str);
    }
    el._cols.forEach((c, i) => { c.style.transform = `translateY(${-Number(str[i])}em)`; });
    el.setAttribute("aria-label", str);
  }
  Object.assign(window.PH, { scramble, roll });

  /* ------------------------------------------------------------ Reveal (1회) */
  /* IntersectionObserver 를 쓰지 않는다 — clip-path: inset(100%) 로 가려진 요소는 Chrome IO 가
     보이는 면적 0 으로 판정해 영영 교차를 알리지 않는다(2026-09-14 실측). 엔진 루프의 캐시 좌표로
     판정하면 부드러운 스크롤 층(transform)과 좌표계도 자동으로 일치한다. */
  function initReveal() {
    $$("[data-stagger]").forEach((wrap) => {
      Array.from(wrap.children).forEach((c, i) => c.style.setProperty("--i", i));
    });
    let pending = $$("[data-reveal], [data-io]").filter((el) => !el.hasAttribute("data-intro"))
      .map((el) => ({ el, top: 0, h: 0 }));
    const re = () => pending.forEach((o) => { o.top = E.top(o.el); o.h = o.el.offsetHeight; });
    E.onResize(re); re();
    E.on(({ pos, vh }) => {
      if (!pending.length) return;
      let hit = false;
      for (const o of pending) {
        const sy = o.top - pos;
        /* 위로 지나친 요소(앵커·점프)도 공개한다 — 되돌아왔을 때 빈 칸이 남지 않게 */
        if (sy < vh * .88) { o.el.classList.add("is-in"); o.done = true; hit = true; }
      }
      if (hit) pending = pending.filter((o) => !o.done);
    });
  }

  /* ------------------------------------------------------------ 요소 캐시 공용 */
  function cached(sel, extra) {
    const list = $$(sel).map((el) => ({ el, top: 0, h: 0, ...(extra ? extra(el) : {}) }));
    const re = () => list.forEach((o) => { o.top = E.top(o.el); o.h = o.el.offsetHeight; });
    E.onResize(re); re();
    return list;
  }

  /* ------------------------------------------------------------ Parallax · Speed */
  function initParallax() {
    const imgs = cached("[data-parallax]", (el) => ({ img: el.querySelector("img") || el }));
    const sp = cached("[data-speed]", (el) => ({ k: parseFloat(el.dataset.speed) || 1 }));
    E.on(({ pos, vh }) => {
      const par = T.num("parallax", .12);
      for (const o of imgs) {
        const sy = o.top - pos;
        if (sy > vh + 200 || sy + o.h < -200) continue;
        const q = clamp((vh - sy) / (vh + o.h), 0, 1);
        o.img.style.transform = `translate3d(0,${((q - .5) * 2 * par * o.h).toFixed(2)}px,0) scale(${1 + par * 2})`;
      }
      for (const o of sp) {
        const c = o.top - pos + o.h / 2;
        if (c > vh * 2 || c < -vh) continue;
        o.el.style.translate = `0 ${((c - vh / 2) * (o.k - 1)).toFixed(2)}px`;
      }
    });
  }

  /* ------------------------------------------------------------ Pin (가로 스크롤 섹션) */
  function initPins() {
    const pins = cached("[data-pin]", (el) => ({
      inner: $(".ph-pin-inner", el), track: $("[data-pin-track]", el),
      bar: $("[data-pin-bar]", el), count: $("[data-pin-count]", el),
      cards: $$("[data-pin-track] > *", el), idx: -1, skew: 0, tw: 0,
    }));
    const re = () => pins.forEach((o) => { if (o.track) o.tw = o.track.scrollWidth; });
    E.onResize(re); re();
    E.on(({ pos, vh, vw, vn, smooth: sm }) => {
      for (const o of pins) {
        const span = Math.max(1, o.h - vh);
        const raw = pos - o.top;
        const p = clamp(raw / span, 0, 1);
        if (sm && o.inner) o.inner.style.transform = `translate3d(0,${clamp(raw, 0, span).toFixed(2)}px,0)`;
        if (raw < -vh || raw > o.h) continue;
        if (o.track) o.track.style.transform = `translate3d(${(-p * Math.max(0, o.tw - vw)).toFixed(2)}px,0,0)`;
        o.skew += ((E.motion ? -vn * 7 : 0) - o.skew) * .12;
        const sk = `skewX(${o.skew.toFixed(3)}deg)`;
        for (const c of o.cards) c.style.transform = sk;
        if (o.bar) o.bar.style.setProperty("--ph-p", p.toFixed(4));
        if (o.count) {
          const i = Math.round(p * (o.cards.length - 1)) + 1;
          if (i !== o.idx) { o.idx = i; scramble(o.count, `${String(i).padStart(2, "0")} / ${String(o.cards.length).padStart(2, "0")}`, 300); }
        }
      }
    });
  }

  /* ------------------------------------------------------------ Words (문장 스크럽) */
  function initWords() {
    const list = cached("[data-words]", (el) => {
      const words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
      el.classList.add("ph-words");
      return { ws: $$(".w", el), n: -1 };
    });
    E.on(({ pos, vh }) => {
      for (const o of list) {
        const sy = o.top - pos;
        const p = clamp((vh * .85 - sy) / (o.h + vh * .5), 0, 1);
        const n = Math.round(p * o.ws.length);
        if (n === o.n) continue;
        o.n = n; o.ws.forEach((w, i) => w.classList.toggle("on", i < n));
      }
    });
  }

  /* ------------------------------------------------------------ Night (바탕 반전) */
  function initNight() {
    const list = cached("[data-night]");
    if (!list.length) return;
    let on = false;
    E.on(({ pos, vh }) => {
      const hit = list.some((o) => o.top - pos <= vh * .5 && o.top + o.h - pos >= vh * .5);
      if (hit !== on) { on = hit; document.body.classList.toggle("is-night", on); }
    });
  }

  /* ------------------------------------------------------------ Scrub (--ph-p) */
  function initScrub() {
    const list = cached("[data-scrub]", (el) => ({ from: parseFloat(el.dataset.from ?? .9), to: parseFloat(el.dataset.to ?? .35), p: -1 }));
    const prog = $$(".ph-progress");
    E.on(({ pos, vh, max }) => {
      for (const o of list) {
        const sy = o.top - pos;
        const p = clamp((vh * o.from - sy) / (vh * (o.from - o.to)), 0, 1);
        if (Math.abs(p - o.p) > .001) { o.p = p; o.el.style.setProperty("--ph-p", p.toFixed(4)); }
      }
      const g = clamp(pos / max, 0, 1).toFixed(4);
      prog.forEach((el) => el.style.setProperty("--ph-p", g));
    });
  }

  /* ------------------------------------------------------------ Smear (속도 잔상) */
  function smearShadow(n, dir, step, axis) {
    if (n <= 0) return "none";
    const out = [];
    for (let k = 1; k <= n; k++) {
      const off = (-dir * k * step).toFixed(2) + "px";
      const a = Math.round(62 * (1 - k / (n + 1)));
      out.push(axis === "y" ? `0 ${off} color-mix(in srgb, currentColor ${a}%, transparent)` : `${off} 0 color-mix(in srgb, currentColor ${a}%, transparent)`);
    }
    return out.join(",");
  }
  function initSmear() {
    const list = $$("[data-smear]").map((el) => ({ el, axis: el.dataset.smear || "x", key: "" }));
    E.on(({ vn }) => {
      const max = E.motion ? T.num("smear-max", 12) : 0;
      for (const o of list) {
        const n = Math.round(Math.abs(vn) * max);
        const key = n + (vn < 0 ? "-" : "+");
        if (key === o.key) continue;
        o.key = key;
        const step = parseFloat(getComputedStyle(o.el).fontSize) * .045;
        o.el.style.textShadow = smearShadow(n, Math.sign(vn) || 1, step, o.axis);
      }
    });
  }

  /* ------------------------------------------------------------ Marquee */
  function initMarquee() {
    const list = $$("[data-marquee]").map((el) => {
      const inner = el.firstElementChild;
      inner.innerHTML += inner.innerHTML;
      return { el, inner, x: 0, w: 0, k: parseFloat(el.dataset.marquee) || .4 };
    });
    const re = () => list.forEach((o) => { o.w = o.inner.scrollWidth / 2; });
    E.onResize(re); re();
    E.on(({ pos, vs }, dt) => {
      for (const o of list) {
        o.x += (E.motion ? .35 : 0) * (dt / 16.667) + Math.abs(vs) * o.k * .6;
        const x = ((o.x + pos * o.k) % o.w + o.w) % o.w;
        o.inner.style.transform = `translate3d(${-x.toFixed(2)}px,0,0)`;
      }
    });
  }

  /* ------------------------------------------------------------ Menu */
  function initMenu() {
    const menu = $("#ph-menu");
    if (!menu) return;
    const btns = $$("[data-menu-toggle]");
    const set = (open) => {
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      btns.forEach((b) => b.setAttribute("aria-expanded", String(open)));
      root.style.overflow = open ? "hidden" : "";
      if (open) setTimeout(() => $("a", menu)?.focus({ preventScroll: true }), T.num("dur-clip", 650));
    };
    btns.forEach((b) => b.addEventListener("click", () => set(!menu.classList.contains("is-open"))));
    addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) set(false); });
  }

  /* ------------------------------------------------------------ Toggles (주석 · 모션) */
  function initToggles() {
    const apply = (name, val) => {
      if (name === "ann") document.body.classList.toggle("ann-off", val === "off");
      if (name === "motion") {
        E.motion = val === "on" && !RM.matches;
        document.body.classList.toggle("motion-off", !E.motion);
      }
      $$(`[data-toggle="${name}"] button`).forEach((b) => {
        const on = b.dataset.val === val;
        b.setAttribute("aria-pressed", String(on));
        const c = $(".ph-circ", b);
        if (c) { c.classList.remove("is-in"); if (on) requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add("is-in"))); }
      });
      store.set("ph-" + name, val);
    };
    $$("[data-toggle]").forEach((g) => {
      const name = g.dataset.toggle;
      const init = store.get("ph-" + name) || (name === "motion" && RM.matches ? "off" : "on");
      $$("button", g).forEach((b) => b.addEventListener("click", () => apply(name, b.dataset.val)));
      apply(name, init);
    });
  }

  /* ------------------------------------------------------------ Loader */
  function initLoader(done) {
    const ld = $(".ph-loader");
    const fire = () => { document.body.classList.add("ph-ready"); introIn(); done && done(); dispatchEvent(new Event("ph:ready")); };
    if (!ld) { fire(); return; }
    let seen = false; try { seen = sessionStorage.getItem("ph-seen") === "1"; sessionStorage.setItem("ph-seen", "1"); } catch (e) { /* */ }
    if (!E.motion) { ld.remove(); fire(); return; }
    const lines = $$(".ph-loader-line", ld).map((el, i) => ({ el, x: 0, v: (i % 2 ? -1 : 1) * (1.2 + hash(i) * 2.4) }));
    const pct = $(".ph-loader-pct", ld);
    const urls = (ld.dataset.preload || "").split(",").map((s) => s.trim()).filter(Boolean);
    let loaded = 0, shown = 0, finished = false;
    const total = Math.max(1, urls.length);
    urls.forEach((u) => { const im = new Image(); im.onload = im.onerror = () => { loaded++; }; im.src = u; });
    const minT = seen ? 350 : 1500, t0 = performance.now();
    let lt = t0;
    const tick = (now) => {
      if (finished) return;
      /* 시간 기준 — 프레임이 제한된 창(백그라운드 탭·저전력)에서도 같은 시간에 끝난다 */
      const dt = clamp(now - lt, 1, 250); lt = now;
      const target = urls.length ? loaded / total : clamp((now - t0) / minT, 0, 1);
      shown += (Math.min(target, (now - t0) / minT) - shown) * (1 - Math.pow(.88, dt / 16.667));
      if (pct) pct.textContent = "▸ " + Math.round(shown * 100) + "%";
      const burst = Math.sin(clamp((now - t0) / minT, 0, 1) * Math.PI);
      for (const o of lines) {
        const v = o.v * (1 + burst * 5);
        o.x += v * (dt / 16.667);
        o.el.style.transform = `translate3d(${o.x.toFixed(1)}px,0,0)`;
        o.el.style.textShadow = smearShadow(Math.round(burst * 9), Math.sign(v), 5, "x");
      }
      if ((shown > .985 || now - t0 > 4200) && now - t0 > minT) {
        finished = true;
        ld.classList.add("is-done");
        setTimeout(() => ld.remove(), T.num("dur-reveal", 1100) + 50);
        setTimeout(fire, T.num("dur-reveal", 1100) * .35);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function introIn() {
    $$("[data-intro]").forEach((el, i) => {
      const d = parseFloat(el.dataset.intro) || i * 60;
      setTimeout(() => el.classList.add("is-in"), d);
    });
  }

  /* ============================================================ Playlist (홈 무대) */
  function playlist(stage, data) {
    const rowsEl = $(".ph-rows", stage);
    const playhead = $(".ph-playhead");
    const numEl = $("[data-foot-num]");
    const titleEl = $("[data-foot-title]");
    const linkEl = $("[data-foot-link]");
    const pickBtn = $("[data-picker-toggle]");
    const picker = $(".ph-picker");
    const pickList = picker ? $("ul", picker) : null;
    const spacer = document.createElement("div");
    spacer.className = "ph-spacer";
    document.body.appendChild(spacer);

    /* DOM 생성 */
    const items = [], tracks = [];
    let gi = 0;
    data.forEach((tr, ti) => {
      const t = { ...tr, i: ti, items: [], chip: null, start: 0, end: 0 };
      tracks.push(t);
      tr.items.forEach((it, ii) => {
        const a = document.createElement("a");
        a.className = "ph-item";
        a.href = tr.href || "#";
        a.innerHTML = `<img src="${it.sm}" alt="${it.alt || tr.title}" decoding="async" draggable="false">` +
          `<span class="ph-item-meta ph-body"><span>${String(ii + 1).padStart(2, "0")}</span><span>/</span><span>${String(tr.items.length).padStart(2, "0")}</span></span>`;
        stage.appendChild(a);
        const o = { el: a, img: a.firstChild, lg: it.lg, big: false, ar: it.w / it.h, t, ii, g: gi++, b: 0, e: 0, vis: true, key: "" };
        o.kb = hash(o.g * 3.1);
        o.rs = hash(o.g * 7.7 + 2);
        o.jx = (hash(o.g * 5.3 + 9) - .5) * .09;
        o.depth = .35 + hash(o.g * 1.9 + 4) * .65;
        t.items.push(o); items.push(o);
      });
      const chip = document.createElement("a");
      chip.className = "ph-chip ph-lead ph-track-chip";
      chip.href = tr.href || "#";
      chip.innerHTML = tr.year ? `${tr.title}<sup class="ph-sup">(${tr.year})</sup>` : tr.title;
      stage.appendChild(chip);
      t.chip = chip;
      if (pickList) {
        const li = document.createElement("li");
        li.style.setProperty("--i", ti);
        li.innerHTML = `<button type="button"><span>${String(ti + 1).padStart(2, "0")}</span><span>${tr.title}</span></button>`;
        $("button", li).addEventListener("click", () => { jumpTo(ti); setPicker(false); });
        pickList.appendChild(li);
      }
    });

    /* 레이아웃 */
    let L = 0, ratio = 3.4, Hs = 36, rows = 8, band = 100, phx = 0, rulesN = -1;
    function layout() {
      const { vw, vh } = E;
      ratio = T.num("scroll-ratio", 3.4);
      Hs = T.len("space-strip-h", 36);
      const gIn = T.len("space-strip-gap", 2), gTr = T.len("space-track-gap", 40);
      rows = Math.round(T.num("rows", 8));
      band = vh / rows;
      phx = T.num("playhead-x", .32) * vw;
      if (rows !== rulesN) {
        rulesN = rows;
        rowsEl.innerHTML = Array.from({ length: rows - 1 }, (_, r) => `<i class="ph-rule" style="--r:${r};--i:${r}"></i>`).join("");
        if (document.body.classList.contains("ph-ready")) requestAnimationFrame(() => $$(".ph-rule", rowsEl).forEach((x) => x.classList.add("is-in")));
      }
      const sizes = rows >= 8 ? [1, 1, 2, 2, 2, 3] : [1, 1, 1, 2];
      let x = 0;
      for (const t of tracks) {
        t.start = x;
        for (const o of t.items) {
          o.w0 = Hs * o.ar; o.sx = x; x += o.w0 + gIn;
          let kb = sizes[Math.floor(o.kb * sizes.length)];
          let h = band * kb, w = h * o.ar;
          const wMax = vw * (rows >= 8 ? .22 : .5);
          if (w > wMax) { w = wMax; h = w / o.ar; kb = Math.max(1, Math.round(h / band)); }
          o.bw = w; o.bh = h;
          const maxRow = Math.max(0, rows - Math.ceil(h / band) - (rows >= 8 ? 0 : 1));
          o.ty = Math.floor(o.rs * (maxRow + 1)) * band;
          o.el.style.width = w + "px"; o.el.style.height = h + "px";
          o.key = "";
        }
        t.end = x - gIn;
        x += gTr - gIn;
      }
      L = x - gTr;
      spacer.style.height = Math.round((L + leadIn()) * ratio + E.vh) + "px";
      E.max = Math.max(1, Math.round(L * ratio));
    }
    E.onResize(layout);
    layout();

    /* 활성 트랙 · 푸터 */
    let active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      const t = tracks[i];
      if (numEl) roll(numEl, i + 1);
      if (titleEl) scramble(titleEl, t.title);
      if (linkEl) linkEl.href = t.href || "#";
      if (pickList) $$("button", pickList).forEach((b, bi) => b.setAttribute("aria-current", String(bi === i)));
    }
    function setPicker(open) {
      if (!picker) return;
      picker.classList.toggle("on", open);
      pickBtn && pickBtn.setAttribute("aria-expanded", String(open));
    }
    pickBtn && pickBtn.addEventListener("click", (e) => { e.stopPropagation(); setPicker(!picker.classList.contains("on")); });
    document.addEventListener("click", (e) => { if (picker && !picker.contains(e.target)) setPicker(false); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") setPicker(false); });

    /* 리드인 — 스크롤 0 에서는 첫 사진이 재생헤드 앞 bloomAhead×.55 지점에 있다(첫 휠에 피어나기 시작) */
    function leadIn() { return T.num("bloom-ahead", .24) * E.vw * .55; }
    function stripYFor(t) { const o = t.items[0]; return (o.sx + o.w0 / 2 + leadIn()) * ratio; }
    function jumpTo(ti, instant) { E.jump(stripYFor(tracks[ti]), instant); }

    /* 박자 스냅 — 휠이 멈추면 재생헤드를 가장 가까운 사진 중심에 붙인다 */
    E.onIdle(({ target, motion }) => {
      if (!motion || picker?.classList.contains("on") || root.style.overflow === "hidden") return;
      const o0 = target / ratio - leadIn();
      let best = null, bd = Infinity;
      for (const o of items) { const d = Math.abs(o.sx + o.w0 / 2 - o0); if (d < bd) { bd = d; best = o; } }
      if (best && bd > .5 && bd < Hs * 2) E.jump(Math.max(0, (best.sx + best.w0 / 2 + leadIn()) * ratio));
    });

    /* 해시로 트랙 진입 (index.html#tray) */
    const hi = tracks.findIndex((t) => "#" + t.id === location.hash);
    if (hi > 0) requestAnimationFrame(() => jumpTo(hi, true));

    /* 프레임 */
    let lag = 0;
    const annScroll = $("[data-ann-scroll]");
    /* 무대는 고정이라 네이티브 모드에서도 lerp 된 y 를 쓴다 — 터치·트랙패드에서도 관성이 산다 */
    E.on(({ y: pos, vw, vh, vs, vn, motion }) => {
      const A = T.num("bloom-ahead", .24) * vw;
      const o0 = pos / ratio - A * .55;
      const Hd = T.num("bloom-hold", .46) * vw;
      const spread = T.num("spread", 1.45);
      const follow = motion ? T.num("follow", .14) : 1;
      const depthK = motion ? T.num("depth", .9) : 0;
      const stripY = vh / 2 - Hs / 2;
      const stretch = motion ? Math.abs(vn) * .35 : 0;

      let cur = 0;
      for (let i = 0; i < tracks.length; i++) if (o0 >= tracks[i].start - 20) cur = i;
      setActive(cur);

      const chipAnchor = new Array(tracks.length).fill(null);
      for (const o of items) {
        const d = o.sx + o.w0 / 2 - o0;
        const bt = d >= 0 ? 1 - smooth(0, A, d) : 1 - smooth(Hd * .55, Hd, -d);
        o.b += (bt - o.b) * follow;
        if (Math.abs(bt - o.b) < .0005) o.b = bt;
        const e = easeInOut(clamp(o.b, 0, 1));
        o.e = e;
        const sX = phx + (o.sx - o0);
        const cX = phx + d * spread + o.jx * vw - o.bw * .5;
        const x = lerp(sX, cX, e) - vs * depthK * o.depth * e;
        const y = lerp(stripY, o.ty, e);
        const s0 = Hs / o.bh;
        const sy = lerp(s0, 1, e);
        const sx = sy * (1 + stretch * (1 - e));
        const w = o.bw * sx;
        const vis = x < vw + 40 && x + w > -40;
        if (vis !== o.vis) { o.vis = vis; o.el.style.visibility = vis ? "" : "hidden"; }
        if (!vis) continue;
        const key = `${x.toFixed(1)}|${y.toFixed(1)}|${sx.toFixed(4)}|${sy.toFixed(4)}`;
        if (key !== o.key) {
          o.key = key;
          o.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
          o.el.style.zIndex = e < .01 ? 1 : 10 + Math.round((1 - clamp(Math.abs(d) / A, 0, 1)) * 200 * e);
        }
        o.el.style.pointerEvents = e > .6 ? "" : "none";
        if (!o.big && e > .02) {
          o.big = true;
          const im = new Image(); im.src = o.lg;
          (im.decode ? im.decode() : Promise.resolve()).then(() => { o.img.src = o.lg; }).catch(() => { });
        }
        if (e > .6 && x > 0 && (!chipAnchor[o.t.i] || Math.abs(d) < chipAnchor[o.t.i].ad)) chipAnchor[o.t.i] = { o, x, y, ad: Math.abs(d) };
      }
      tracks.forEach((t, i) => {
        const a = chipAnchor[i];
        t.chip.classList.toggle("on", !!a && i === cur);
        if (a) t.chip.style.transform = `translate3d(${a.x.toFixed(1)}px,${(a.y - t.chip.offsetHeight).toFixed(1)}px,0)`;
      });

      /* 재생헤드 — 첫 스크롤 뒤 등장, 속도 반대로 밀렸다 돌아온다 */
      lag += (clamp(-vs * T.num("playhead-lag", .35), -vw * .04, vw * .04) - lag) * .15;
      if (playhead) {
        playhead.style.setProperty("--x", (phx + lag).toFixed(2) + "px");
        playhead.style.setProperty("--pr-i", (1 - Math.abs(vn) * .12).toFixed(3));
        playhead.classList.toggle("on", E.touched);
      }
      if (annScroll) annScroll.style.opacity = pos > 40 ? 0 : "";
    });

    return { tracks, items, jumpTo };
  }
  window.PH.playlist = playlist;

  /* ------------------------------------------------------------ 부팅 */
  function boot() {
    initEngine();
    initReveal();
    initParallax();
    initPins();
    initWords();
    initNight();
    initScrub();
    initSmear();
    initMarquee();
    initMenu();
    initToggles();
    const pl = $("[data-ph-playlist]");
    if (pl && window.PH_PLAYLIST) window.PH.list = playlist(pl, window.PH_PLAYLIST);
    initLoader(() => { $$(".ph-rows .ph-rule").forEach((r) => r.classList.add("is-in")); });
    RM.addEventListener?.("change", () => { E.motion = !RM.matches; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
