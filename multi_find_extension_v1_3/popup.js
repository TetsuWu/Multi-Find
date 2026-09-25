
const STORAGE_KEY = "multiFindKeywords";
const $ = id => document.getElementById(id);

function parseKeywords(raw) {
  return [...new Set(
    (raw || "")
      .split(/[\n,;，；]+/)
      .map(x => x.trim())
      .filter(Boolean)
  )];
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) throw new Error("找不到目前分頁");
  return tab;
}

async function saveKeywords(raw) {
  await chrome.storage.local.set({ [STORAGE_KEY]: raw });
}

async function runCurrentPageSearch() {
  const raw = $("keywords").value;
  const keywords = parseKeywords(raw);

  if (!keywords.length) {
    $("status").textContent = "尚未設定關鍵字";
    $("pos").textContent = "0 / 0";
    $("summary").innerHTML = "";
    return;
  }

  const tab = await activeTab();

  const results = await chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    world: "ISOLATED",
    func: (keywords) => {
      const MARK="__mf_mark_v13__";
      const ACTIVE="__mf_active_v13__";
      const STYLE="__mf_style_v13__";

      document.querySelectorAll(`mark.${MARK}`).forEach(m => {
        m.replaceWith(document.createTextNode(m.textContent));
      });
      try { document.body?.normalize(); } catch {}

      let style = document.getElementById(STYLE);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE;
        style.textContent = `
          mark.${MARK}{
            background:#fff176!important;
            color:inherit!important;
            padding:0!important;
            border-radius:2px!important;
          }
          mark.${MARK}[data-mf-color="1"]{background:#ffcc80!important}
          mark.${MARK}[data-mf-color="2"]{background:#a5d6a7!important}
          mark.${MARK}[data-mf-color="3"]{background:#90caf9!important}
          mark.${MARK}[data-mf-color="4"]{background:#ce93d8!important}
          mark.${MARK}[data-mf-color="5"]{background:#ef9a9a!important}
          mark.${ACTIVE}{
            outline:3px solid #f44336!important;
            outline-offset:1px!important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }

      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sorted = keywords.slice().sort((a,b)=>b.length-a.length);
      const rx = new RegExp(sorted.map(esc).join("|"), "gi");
      const lookup = new Map(keywords.map(k => [k.toLocaleLowerCase(),k]));
      const colorIndex = new Map(keywords.map((k,i)=>[k,i]));
      const counts = Object.fromEntries(keywords.map(k=>[k,0]));

      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.closest(`mark.${MARK}`)) return NodeFilter.FILTER_REJECT;
            if (["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
            rx.lastIndex = 0;
            return rx.test(node.nodeValue)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      for (const node of nodes) {
        const text = node.nodeValue;
        rx.lastIndex = 0;

        let last = 0;
        let m;
        let changed = false;
        const frag = document.createDocumentFragment();

        while ((m = rx.exec(text)) !== null) {
          changed = true;

          if (m.index > last) {
            frag.append(document.createTextNode(text.slice(last,m.index)));
          }

          const canonical = lookup.get(m[0].toLocaleLowerCase()) || m[0];
          const mark = document.createElement("mark");
          mark.className = MARK;
          mark.dataset.mfKeyword = canonical;
          mark.dataset.mfColor = String((colorIndex.get(canonical) || 0) % 6);
          mark.textContent = m[0];
          frag.append(mark);

          counts[canonical] = (counts[canonical] || 0) + 1;
          last = rx.lastIndex;

          if (m[0].length === 0) rx.lastIndex++;
        }

        if (changed) {
          if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
          node.replaceWith(frag);
        }
      }

      const marks = [...document.querySelectorAll(`mark.${MARK}`)];
      document.querySelectorAll(`.${ACTIVE}`).forEach(x => x.classList.remove(ACTIVE));

      if (marks.length) {
        marks[0].classList.add(ACTIVE);
      }

      window.__multiFindV13 = {
        current: marks.length ? 0 : -1
      };

      return {
        counts,
        total: marks.length
      };
    },
    args: [keywords]
  });

  const counts = Object.fromEntries(keywords.map(k=>[k,0]));
  let total = 0;
  let frames = 0;

  for (const r of results || []) {
    if (!r?.result) continue;
    frames++;
    total += r.result.total || 0;
    for (const [k,v] of Object.entries(r.result.counts || {})) {
      counts[k] = (counts[k] || 0) + v;
    }
  }

  window.__mfFrames = (results || [])
    .filter(r => r?.result?.total > 0)
    .map(r => ({
      frameId: r.frameId,
      total: r.result.total
    }));

  window.__mfGlobalIndex = total ? 0 : -1;

  $("status").textContent =
    `自動搜尋已啟用\n總命中：${total}\n已搜尋 frame：${frames}`;

  $("pos").textContent = total ? `1 / ${total}` : "0 / 0";
  $("summary").innerHTML = "";

  for (const k of keywords) {
    const div = document.createElement("div");
    div.className = "item";

    const a = document.createElement("span");
    a.textContent = k;

    const b = document.createElement("span");
    b.textContent = `${counts[k] || 0} 筆`;

    div.append(a,b);
    $("summary").append(div);
  }
}

async function move(direction) {
  const frames = window.__mfFrames || [];
  const total = frames.reduce((s,x)=>s+x.total,0);
  if (!total) return;

  let global = window.__mfGlobalIndex ?? 0;
  global = (global + direction + total) % total;
  window.__mfGlobalIndex = global;

  let acc = 0;
  let targetFrame = null;
  let localIndex = 0;

  for (const f of frames) {
    if (global < acc + f.total) {
      targetFrame = f.frameId;
      localIndex = global - acc;
      break;
    }
    acc += f.total;
  }

  const tab = await activeTab();

  await chrome.scripting.executeScript({
    target: {tabId: tab.id, frameIds:[targetFrame]},
    world: "ISOLATED",
    func: idx => {
      const MARK="__mf_mark_v13__";
      const ACTIVE="__mf_active_v13__";
      const marks=[...document.querySelectorAll(`mark.${MARK}`)];

      if (!marks.length || !marks[idx]) return;

      document.querySelectorAll(`.${ACTIVE}`).forEach(x=>x.classList.remove(ACTIVE));
      marks[idx].classList.add(ACTIVE);
      marks[idx].scrollIntoView({
        behavior:"smooth",
        block:"center",
        inline:"nearest"
      });

      window.__multiFindV13 = {current:idx};
    },
    args:[localIndex]
  });

  $("pos").textContent = `${global+1} / ${total}`;
}

let debounceTimer = null;

$("keywords").addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const raw = $("keywords").value;
    await saveKeywords(raw);
    await runCurrentPageSearch();
  }, 250);
});

$("clear").addEventListener("click", async () => {
  $("keywords").value = "";
  await saveKeywords("");
  $("status").textContent = "已清除關鍵字與標示";
  $("pos").textContent = "0 / 0";
  $("summary").innerHTML = "";
});

$("prev").addEventListener("click", () => move(-1));
$("next").addEventListener("click", () => move(1));

(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = data[STORAGE_KEY] || "";
  $("keywords").value = raw;

  if (raw.trim()) {
    try {
      await runCurrentPageSearch();
    } catch (e) {
      $("status").textContent = "目前頁面無法搜尋：" + e.message;
    }
  }
})();
