
const STORAGE_KEY = "multiFindKeywords";

function parseKeywords(raw) {
  return [...new Set(
    (raw || "")
      .split(/[\n,;，；]+/)
      .map(x => x.trim())
      .filter(Boolean)
  )];
}

async function getKeywords() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return parseKeywords(data[STORAGE_KEY] || "");
}

async function injectSearch(tabId) {
  const keywords = await getKeywords();
  if (!keywords.length) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: "ISOLATED",
        func: () => {
          const MARK="__mf_mark_v13__";
          const ACTIVE="__mf_active_v13__";
          document.querySelectorAll(`mark.${MARK}`).forEach(m => {
            m.replaceWith(document.createTextNode(m.textContent));
          });
          document.querySelectorAll(`.${ACTIVE}`).forEach(el => el.classList.remove(ACTIVE));
          try { document.body?.normalize(); } catch {}
          delete window.__multiFindV13;
        }
      });
    } catch {}
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "ISOLATED",
      func: autoHighlight,
      args: [keywords]
    });
  } catch {
    // Pages such as chrome:// and Chrome Web Store cannot be injected.
  }
}

function autoHighlight(keywords) {
  const MARK="__mf_mark_v13__";
  const ACTIVE="__mf_active_v13__";
  const STYLE="__mf_style_v13__";

  document.querySelectorAll(`mark.${MARK}`).forEach(m => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  document.querySelectorAll(`.${ACTIVE}`).forEach(el => el.classList.remove(ACTIVE));
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
  const sorted = keywords.slice().sort((a,b) => b.length - a.length);
  const rx = new RegExp(sorted.map(esc).join("|"), "gi");
  const lookup = new Map(keywords.map(k => [k.toLocaleLowerCase(), k]));
  const colorIndex = new Map(keywords.map((k,i) => [k,i]));

  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest(`mark.${MARK}`)) return NodeFilter.FILTER_REJECT;
        if (["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        rx.lastIndex = 0;
        return rx.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const marks = [];

  for (const node of nodes) {
    const text = node.nodeValue;
    rx.lastIndex = 0;

    let last = 0;
    let match;
    let changed = false;
    const frag = document.createDocumentFragment();

    while ((match = rx.exec(text)) !== null) {
      changed = true;

      if (match.index > last) {
        frag.append(document.createTextNode(text.slice(last, match.index)));
      }

      const canonical = lookup.get(match[0].toLocaleLowerCase()) || match[0];
      const mark = document.createElement("mark");
      mark.className = MARK;
      mark.dataset.mfKeyword = canonical;
      mark.dataset.mfColor = String((colorIndex.get(canonical) || 0) % 6);
      mark.textContent = match[0];

      frag.append(mark);
      marks.push(mark);
      last = rx.lastIndex;

      if (match[0].length === 0) rx.lastIndex++;
    }

    if (changed) {
      if (last < text.length) {
        frag.append(document.createTextNode(text.slice(last)));
      }
      node.replaceWith(frag);
    }
  }

  window.__multiFindV13 = {
    current: marks.length ? 0 : -1
  };

  if (marks.length) {
    marks[0].classList.add(ACTIVE);
  }

  return {
    total: marks.length
  };
}

// Refresh / new navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    injectSearch(tabId);
  }
});

// New tab
chrome.tabs.onCreated.addListener(tab => {
  if (!tab.id) return;
  setTimeout(() => injectSearch(tab.id), 800);
});

// Keywords changed from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;

  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id) injectSearch(tab.id);
    }
  });
});
