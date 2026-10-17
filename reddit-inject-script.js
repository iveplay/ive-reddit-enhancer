// Reddit Enhancements - Combined Script
// 1. RedGifs Embed Fix
// 2. Right Sidebar Toggle
// 3. Fullscreen Post Viewer (click image to open, slideshow)
// 4. User Link Rewrite
// 5. Grid View Toggle (columns, compact cards)
// 6. Hide Promoted Posts
// 7. Auto-scroll (hands-free feed scrolling with adjustable speed)
// 8. Redgifs player helper (HD + sound) — only when also injected into the
//    Redgifs embed frame itself, see initRedgifsFrame
// 9. Media Type Filter (all / photos only / videos & GIFs only)
(function () {
  "use strict";

  // Settings that survive reloads (grid mode, column count, slideshow speed)
  const store = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem("re-" + key);
        return value === null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("re-" + key, value);
      } catch (e) {}
    },
  };

  // Drawn icons, so they look the same everywhere instead of falling back to
  // the system's emoji for ▶ and ⏸
  const icon = (name, shapes) =>
    `<svg data-icon="${name}" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">${shapes}</svg>`;
  const ICONS = {
    play: icon(
      "play",
      '<path d="M3 1.3v11.4a.6.6 0 0 0 .9.5l9.2-5.7a.6.6 0 0 0 0-1L3.9.8a.6.6 0 0 0-.9.5Z"/>',
    ),
    pause: icon(
      "pause",
      '<rect x="2" y="1" width="3.6" height="12" rx="1"/><rect x="8.4" y="1" width="3.6" height="12" rx="1"/>',
    ),
    volume: icon(
      "volume",
      '<path d="M6.6 1.6a.6.6 0 0 1 1 .5v9.8a.6.6 0 0 1-1 .5L3.5 9.5H1.6A.6.6 0 0 1 1 8.9V5.1a.6.6 0 0 1 .6-.6h1.9l3.1-2.9Z"/><path d="M9.4 4.3a.6.6 0 0 1 .9 0 4 4 0 0 1 0 5.4.6.6 0 1 1-.9-.8 2.8 2.8 0 0 0 0-3.8.6.6 0 0 1 0-.8Z"/><path d="M11.2 2.5a.6.6 0 0 1 .9 0 6.6 6.6 0 0 1 0 9 .6.6 0 1 1-.9-.8 5.4 5.4 0 0 0 0-7.4.6.6 0 0 1 0-.8Z"/>',
    ),
    muted: icon(
      "muted",
      '<path d="M6.6 1.6a.6.6 0 0 1 1 .5v9.8a.6.6 0 0 1-1 .5L3.5 9.5H1.6A.6.6 0 0 1 1 8.9V5.1a.6.6 0 0 1 .6-.6h1.9l3.1-2.9Z"/><path d="M9.3 5a.6.6 0 0 1 .9 0L11.3 6l1-1a.6.6 0 1 1 .9.8l-1 1.1 1 1.1a.6.6 0 1 1-.9.8l-1-1-1.1 1a.6.6 0 1 1-.9-.8l1.1-1.1-1-1.1a.6.6 0 0 1 0-.8Z"/>',
    ),
    chevron: icon(
      "chevron",
      '<path d="M9.7 1.3a1 1 0 0 1 0 1.4L5.4 7l4.3 4.3a1 1 0 1 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z"/>',
    ),
    down: icon(
      "down",
      '<path d="M7 1a1 1 0 0 1 1 1v7.6l2.8-2.8a1 1 0 1 1 1.4 1.4l-4.5 4.5a1 1 0 0 1-1.4 0L1.8 8.2a1 1 0 1 1 1.4-1.4L6 9.6V2a1 1 0 0 1 1-1Z"/>',
    ),
  };

  // One volume for everything the script plays: the viewer's own videos and
  // every Redgifs embed (through the frame helper). 0 means muted.
  let volume = parseFloat(store.get("volume", "1"));
  if (!(volume >= 0 && volume <= 1)) volume = 1;
  const volumeMessage = () => ({
    source: "reddit-enhancer",
    event: "volume",
    volume,
  });

  // Which posts to show: "all", "photos" (images, galleries) or "moving"
  // (videos, GIFs, Redgifs). Set by the filter menu, also obeyed by the viewer.
  const MEDIA_FILTERS = {
    photos: ["image", "gallery"],
    moving: ["gif", "video", "redgif"],
  };
  let mediaFilter = store.get("media-filter", "all");
  if (!MEDIA_FILTERS[mediaFilter]) mediaFilter = "all";
  const passesMediaFilter = (type) =>
    mediaFilter === "all" || MEDIA_FILTERS[mediaFilter].includes(type);

  const isRedgifsHost = (urlOrOrigin) => {
    try {
      return /(^|\.)redgifs\.com$/.test(new URL(urlOrOrigin).hostname);
    } catch (e) {
      return false;
    }
  };

  // ==========================================
  // 1. REDGIFS EMBED FIX
  // ==========================================
  function initRedgifsFix() {
    const style = document.createElement("style");
    style.textContent = `
      .redgifs-reload-btn {
        position: absolute;
        bottom: 10px;
        right: 10px;
        z-index: 9999;
        width: 24px;
        height: 24px;
        background-color: rgba(0, 0, 0, 0.5);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .redgifs-wrapper:hover .redgifs-reload-btn { opacity: 0.7; }
      .redgifs-reload-btn:hover { opacity: 1 !important; }
    `;
    document.head.appendChild(style);

    const lazyLoadObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const wrapper = entry.target;
          const iframe = wrapper.querySelector("iframe");
          if (!iframe) continue;
          if (entry.intersectionRatio >= 0.5) {
            if (!iframe.src) iframe.src = wrapper.dataset.redgifsSrc;
          } else if (iframe.src) {
            iframe.removeAttribute("src");
          }
        }
      },
      { threshold: [0, 0.5] },
    );

    function fixEmbed(embedElement) {
      if (embedElement.hasAttribute("data-fixed")) return;
      const iframeHtml = embedElement.getAttribute("html");
      if (!iframeHtml?.includes("redgifs.com")) return;
      const match = iframeHtml.match(/redgifs\.com\/ifr\/([^"]+)/);
      if (!match) return;
      embedElement.setAttribute("data-fixed", "true");
      const redgifsUrl = `https://www.redgifs.com/ifr/${match[1]}`;
      const wrapper = document.createElement("div");
      wrapper.className = "redgifs-wrapper";
      wrapper.dataset.redgifsSrc = redgifsUrl;
      wrapper.style.cssText =
        "position:relative;width:100%;height:100%;aspect-ratio:1/1;background:#111;";
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;";
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("frameborder", "0");
      const reloadBtn = document.createElement("button");
      reloadBtn.className = "redgifs-reload-btn";
      reloadBtn.textContent = "↻";
      reloadBtn.onclick = (e) => {
        e.stopPropagation();
        iframe.src = iframe.src || redgifsUrl;
      };
      // A click on the frame itself lands inside Redgifs' player, which opens
      // the clip on redgifs.com. This transparent cover catches the click on
      // our side instead, so it opens the fullscreen viewer like other posts.
      // The bottom strip stays uncovered for the player's own controls.
      const clickShield = document.createElement("div");
      clickShield.className = "redgifs-click-shield";
      clickShield.style.cssText =
        "position:absolute;inset:0 0 48px 0;z-index:1;cursor:pointer;";
      wrapper.appendChild(iframe);
      wrapper.appendChild(clickShield);
      wrapper.appendChild(reloadBtn);
      const container =
        embedElement.closest("shreddit-aspect-ratio") ||
        embedElement.parentElement;
      if (container) {
        container.appendChild(wrapper);
        embedElement.removeAttribute("html");
        embedElement.remove();
        lazyLoadObserver.observe(wrapper);
      }
    }

    const checkForEmbeds = () =>
      document.querySelectorAll("shreddit-embed").forEach(fixEmbed);
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === "SHREDDIT-EMBED") fixEmbed(node);
            node.querySelectorAll?.("shreddit-embed").forEach(fixEmbed);
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
    checkForEmbeds();
    setInterval(checkForEmbeds, 2000);
    let scrollTimeout;
    window.addEventListener(
      "scroll",
      () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(checkForEmbeds, 150);
      },
      { passive: true },
    );
  }

  // ==========================================
  // 2. RIGHT SIDEBAR TOGGLE
  // ==========================================
  // Like Reddit's left sidebar. Collapsed, the sidebar floats off-screen with
  // only a thin rail showing at the right edge, the arrow button hanging off
  // its top; hovering glides rail and sidebar in together as one panel over
  // the page (the stylesheet does the sliding). The arrow puts the sidebar back
  // in the page beside the feed; the rail then turns see-through and only the
  // button is left in the top right corner. That pinned state lives on
  // <html>, so it survives Reddit replacing the sidebar element on navigation.
  function initRightSidebarToggle() {
    let open = store.get("right-sidebar", "0") === "1";

    const rail = document.createElement("div");
    rail.id = "right-sidebar-rail";
    rail.style.cssText =
      "position:fixed;top:56px;right:0;bottom:0;z-index:10;width:16px;box-sizing:border-box;border-left:1px solid var(--color-neutral-border-weak, #2a3236);background:var(--color-neutral-background, #0e1113);";

    const btn = document.createElement("button");
    btn.id = "right-sidebar-btn";
    btn.innerHTML = ICONS.chevron;
    btn.style.cssText =
      "position:absolute;top:12px;right:0px;width:32px;height:32px;padding:0;border-radius:50%;border:1px solid var(--color-neutral-border, #3e4142);background:var(--color-neutral-background, #0e1113);color:var(--color-secondary-onBackground, #fff);cursor:pointer;display:flex;justify-content:center;align-items:center;";
    rail.appendChild(btn);

    // Reddit hides the sidebar altogether on narrow windows; the rail goes
    // with it. (Pages with no sidebar at all are handled by the stylesheet.)
    function syncRail() {
      const sidebar = document.getElementById("right-sidebar-container");
      const hidden = sidebar && getComputedStyle(sidebar).display === "none";
      rail.style.display = hidden ? "none" : "block";
    }

    // Slid out over the page while the pointer is on the rail or the sidebar.
    // The arrow button changes nothing either way, so it holds still under
    // the pointer and can be clicked.
    const setPeek = (on) =>
      document.documentElement.classList.toggle("re-right-sidebar-peek", on);
    document.addEventListener("mouseover", (e) => {
      const target = e.target;
      if (!(target instanceof Element) || target.closest("#right-sidebar-btn"))
        return;
      setPeek(
        !open &&
          !!target.closest("#right-sidebar-rail, #right-sidebar-container"),
      );
    });
    document.documentElement.addEventListener("mouseleave", () =>
      setPeek(false),
    );

    function render() {
      document.documentElement.classList.toggle("re-right-sidebar-open", open);
      setPeek(false);
      btn.firstElementChild.style.transform = open ? "rotate(180deg)" : "";
      btn.title = open ? "Collapse sidebar" : "Keep sidebar open";
      syncRail();
    }

    btn.onclick = () => {
      open = !open;
      store.set("right-sidebar", open ? "1" : "0");
      render();
    };

    window.addEventListener("resize", syncRail);
    document.body.appendChild(rail);
    render();
  }

  // ==========================================
  // 3. FULLSCREEN POST VIEWER
  // ==========================================
  function initFullscreenViewer() {
    let overlay, currentIndex;
    let galleryIndex = 0;
    let currentGallerySrcs = null;

    // Persistent post registry — survives Reddit's feed virtualization
    const postRegistry = new Map(); // postId -> postData
    const postOrder = []; // ordered postIds as seen in feed

    // Reddit navigates without reloading, so drop the previous page's posts
    // once the URL changes (never while the viewer is open).
    let lastPageKey = location.pathname + location.search;
    function resetIfNavigated() {
      const key = location.pathname + location.search;
      if (key === lastPageKey || overlay) return;
      lastPageKey = key;
      postRegistry.clear();
      postOrder.length = 0;
    }

    const SLIDE_SPEEDS = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30]; // seconds per post
    let slideshow = false;
    let slideTimer;
    let slideSeconds = parseInt(store.get("slide-seconds", "5")) || 5;
    let shownAt = 0;
    const preloads = []; // keeps preloading <img>s alive until they finish

    // Redgifs play inside an iframe from another site, so the viewer can't see
    // when a clip ends, and Redgifs' own API refuses requests coming from
    // reddit.com. Reddit's data for the post usually includes the clip length,
    // so the slideshow asks Reddit for that instead.
    const REDGIF_FALLBACK_SECONDS = 15; // used when the length can't be found
    const REDGIF_LOAD_SECONDS = 2; // head start for the embed to begin playing
    const clipLengths = new Map(); // postId -> Promise<seconds | null>
    function getClipLength(post) {
      if (!post?.permalink) return Promise.resolve(null);
      if (!clipLengths.has(post.postId)) {
        const url = post.permalink.replace(/\/?$/, "/") + ".json?raw_json=1";
        clipLengths.set(
          post.postId,
          Promise.resolve()
            .then(() => fetch(url, { credentials: "include" }))
            .then((response) => (response.ok ? response.json() : null))
            .then((json) => {
              const data = json?.[0]?.data?.children?.[0]?.data;
              // A crosspost keeps its media details on the original post
              const candidates = [data, ...(data?.crosspost_parent_list || [])];
              for (const item of candidates) {
                const seconds =
                  item?.preview?.reddit_video_preview?.duration ??
                  item?.secure_media?.reddit_video?.duration ??
                  item?.media?.reddit_video?.duration;
                if (seconds > 0) return seconds;
              }
              return null;
            })
            .catch(() => null),
        );
      }
      return clipLengths.get(post.postId);
    }

    // When this script also runs inside the Redgifs frame (see
    // initRedgifsFrame), the frame reports the moment playback really starts
    // and the true clip length, which replaces the estimate above.
    let playStart = { shownAt: 0, at: 0 };
    window.addEventListener("message", (e) => {
      if (!isRedgifsHost(e.origin) || e.data?.source !== "reddit-enhancer")
        return;
      // Whenever a frame helper speaks up, tell it the current volume
      e.source?.postMessage(volumeMessage(), e.origin);
      if (!overlay || e.data.event !== "playing") return;
      const frame = overlay.querySelector("iframe");
      if (!frame || e.source !== frame.contentWindow) return;
      const length = Number(e.data.duration);
      if (!(length > 0 && length < 3600)) return;
      const post = postRegistry.get(postOrder[currentIndex]);
      if (post?.type !== "redgif") return;
      clipLengths.set(post.postId, Promise.resolve(length));
      playStart = { shownAt, at: Date.now() };
      if (slideshow) startSlideTimer(redgifSecondsLeft(length));
    });

    // How long a redgif stays up, counted from now: whole plays of the clip,
    // enough of them to cover the chosen slideshow time.
    function redgifSecondsLeft(length) {
      const plays = Math.max(1, Math.ceil(slideSeconds / length));
      // Count from the real start of playback when the frame has reported it
      const exact = playStart.shownAt === shownAt;
      const elapsed = (Date.now() - (exact ? playStart.at : shownAt)) / 1000;
      const left = plays * length + (exact ? 0 : REDGIF_LOAD_SECONDS) - elapsed;
      // Already past that (slideshow switched on late): finish the current play
      return left >= 1 ? left : Math.max(1, length - (elapsed % length));
    }

    // An <img> never says when its GIF has played through, so the file itself
    // is read: adding up the delay of every frame gives the length of one play.
    const GIF_LOAD_SECONDS = 15; // longest wait for a GIF to load and be measured
    const gifLengths = new Map(); // src -> Promise<seconds | null>
    function getGifLength(src) {
      if (!gifLengths.has(src)) {
        gifLengths.set(
          src,
          fetch(src)
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .then((buffer) => buffer && gifSeconds(buffer))
            .catch(() => null),
        );
      }
      return gifLengths.get(src);
    }

    // Length of one play of a GIF file; null for a still image or another format
    function gifSeconds(buffer) {
      const b = new Uint8Array(buffer);
      if (b.length < 13 || String.fromCharCode(b[0], b[1], b[2]) !== "GIF")
        return null;
      const tableSize = (flags) => (flags & 0x80 ? 3 << ((flags & 7) + 1) : 0);
      let i = 13 + tableSize(b[10]);
      const skipBlocks = () => {
        while (i < b.length && b[i]) i += b[i] + 1;
        i++;
      };
      let frames = 0;
      let centiseconds = 0;
      let delay = 0;
      while (i < b.length) {
        const kind = b[i++];
        if (kind === 0x21) {
          // Extension; the graphic control one carries the next frame's delay
          if (b[i++] === 0xf9) delay = b[i + 2] | (b[i + 3] << 8);
          skipBlocks();
        } else if (kind === 0x2c) {
          // Image: descriptor, optional colour table, code size, pixel data
          i += 9;
          i += tableSize(b[i - 1]) + 1;
          skipBlocks();
          frames++;
          // Browsers play delays under 20ms as 100ms
          centiseconds += delay < 2 ? 10 : delay;
          delay = 0;
        } else break;
      }
      return frames > 1 ? centiseconds / 100 : null;
    }

    // The moment the image on screen finished loading (when its GIF starts)
    let gifShown = { img: null, src: "", at: null };
    function gifShownAt(img) {
      if (gifShown.img !== img || gifShown.src !== img.src) {
        const at = new Promise((resolve) => {
          const done = () => resolve(Date.now());
          if (img.complete && img.naturalWidth) done();
          else img.addEventListener("load", done, { once: true });
        });
        gifShown = { img, src: img.src, at };
      }
      return gifShown.at;
    }

    function getBestSrc(img) {
      const srcset =
        img.getAttribute("srcset") || img.getAttribute("data-lazy-srcset");
      if (srcset) {
        const entries = srcset.split(",").map((s) => {
          const parts = s.trim().split(/\s+/);
          return { url: parts[0], width: parseInt(parts[1]) || 0 };
        });
        entries.sort((a, b) => b.width - a.width);
        if (entries[0]?.url) return entries[0].url;
      }
      const src = img.src || img.getAttribute("data-lazy-src");
      if (
        src &&
        src !== "" &&
        !src.includes("data:") &&
        src !== window.location.href
      )
        return src;
      return null;
    }

    function getGallerySrcs(carousel) {
      const srcs = [];
      carousel.querySelectorAll("li").forEach((li) => {
        const imgs = li.querySelectorAll("img");
        for (const img of imgs) {
          if (img.getAttribute("role") === "presentation") continue;
          const src = getBestSrc(img);
          if (src && !srcs.includes(src)) {
            srcs.push(src);
            break;
          }
        }
      });
      return srcs;
    }

    // Reddit serves video as HLS (.m3u8), which a plain <video> can't decode in
    // Chrome/Firefox. The shreddit-player element also carries direct, muxed MP4
    // URLs in its packaged-media-json attribute — pull the highest-res one.
    function getPackagedMp4(player) {
      const packaged = player.getAttribute("packaged-media-json");
      if (!packaged) return null;
      try {
        const perms = JSON.parse(packaged)?.playbackMp4s?.permutations;
        if (!perms?.length) return null;
        const best = perms
          .map((p) => p.source)
          .filter((s) => s?.url)
          .sort(
            (a, b) => (b.dimensions?.height || 0) - (a.dimensions?.height || 0),
          )[0];
        return best?.url || null;
      } catch (e) {
        return null;
      }
    }

    function getPostMeta(article) {
      const sp = article.querySelector("shreddit-post");
      return {
        permalink: sp?.getAttribute("permalink") || "",
        author: sp?.getAttribute("author") || "",
        subreddit: sp?.getAttribute("subreddit-prefixed-name") || "",
        title: sp?.getAttribute("post-title") || "",
      };
    }

    function extractMediaFromContainer(container, shredditPost, postId, meta) {
      const postType = shredditPost?.getAttribute("post-type");
      const effectiveType = postType === "crosspost" ? null : postType;

      if (effectiveType === "gallery" || !effectiveType) {
        const carousel = container.querySelector("gallery-carousel");
        if (carousel) {
          const srcs = getGallerySrcs(carousel);
          if (srcs.length) {
            return {
              type: "gallery",
              srcs,
              postId,
              ...meta,
            };
          }
        }
      }

      const redgifsWrapper = container.querySelector(".redgifs-wrapper");
      if (redgifsWrapper?.dataset.redgifsSrc) {
        return {
          type: "redgif",
          src: redgifsWrapper.dataset.redgifsSrc,
          postId,
          ...meta,
        };
      }
      const redgifsIframe = container.querySelector(
        'iframe[src*="redgifs.com"]',
      );
      if (redgifsIframe) {
        return { type: "redgif", src: redgifsIframe.src, postId, ...meta };
      }

      const player = container.querySelector("shreddit-player");
      if (player) {
        // Prefer the packaged MP4 (plays in any browser). Fall back to whatever
        // src is on the element only if no MP4 is available (rare).
        const mp4 = getPackagedMp4(player);
        const video = player.querySelector("video");
        const videoSrc =
          mp4 ||
          video?.src ||
          player.getAttribute("src") ||
          player.querySelector("source")?.getAttribute("src");
        if (videoSrc) {
          return { type: "video", src: videoSrc, postId, ...meta };
        }
      }

      if (
        effectiveType === "image" ||
        effectiveType === "link" ||
        !effectiveType
      ) {
        const zoomImg = container.querySelector("zoomable-img img");
        if (zoomImg) {
          const src = getBestSrc(zoomImg);
          if (src) {
            const isGif = src.includes(".gif");
            return {
              type: isGif ? "gif" : "image",
              src,
              postId,
              ...meta,
            };
          }
        }
        const contentHref = shredditPost?.getAttribute("content-href");
        if (contentHref && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(contentHref)) {
          const isGif = contentHref.includes(".gif");
          return {
            type: isGif ? "gif" : "image",
            src: contentHref,
            postId,
            ...meta,
          };
        }
        const imgs = container.querySelectorAll("img");
        for (const img of imgs) {
          if (img.getAttribute("role") === "presentation") continue;
          if (img.closest("[avatar]") || img.closest("faceplate-hovercard"))
            continue;
          if (img.classList.contains("shreddit-subreddit-icon__icon")) continue;
          const src = getBestSrc(img);
          if (src) {
            const isGif = src.includes(".gif");
            return {
              type: isGif ? "gif" : "image",
              src,
              postId,
              ...meta,
            };
          }
        }
      }

      return null;
    }

    function registerArticle(article) {
      const postId = article.dataset.postId;
      if (!postId || postRegistry.has(postId)) return;
      if (article.querySelector("shreddit-ad-post")) return; // promoted
      const shredditPost = article.querySelector("shreddit-post");
      const meta = getPostMeta(article);
      const result = extractMediaFromContainer(
        article,
        shredditPost,
        postId,
        meta,
      );
      if (result) {
        postRegistry.set(postId, result);
        postOrder.push(postId);
        updatePostCounter();
      }
    }

    function scanExistingArticles() {
      resetIfNavigated();
      document
        .querySelectorAll("article[data-post-id]")
        .forEach(registerArticle);
      // Single post detail page
      document.querySelectorAll("shreddit-post[id]").forEach((sp) => {
        if (sp.closest("article[data-post-id]")) return;
        const postId = sp.getAttribute("id");
        if (postRegistry.has(postId)) return;
        const meta = {
          permalink: sp.getAttribute("permalink") || "",
          author: sp.getAttribute("author") || "",
          subreddit: sp.getAttribute("subreddit-prefixed-name") || "",
          title: sp.getAttribute("post-title") || "",
        };
        const container = sp.closest("main") || sp.parentElement;
        const result = extractMediaFromContainer(container, sp, postId, meta);
        if (result) {
          postRegistry.set(postId, result);
          postOrder.push(postId);
        }
      });
    }

    // Watch for new articles entering the DOM (infinite scroll + re-virtualization)
    const feedObserver = new MutationObserver((mutations) => {
      resetIfNavigated();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.("article[data-post-id]")) {
            registerArticle(node);
          }
          node
            .querySelectorAll?.("article[data-post-id]")
            .forEach(registerArticle);
        }
      }
    });

    // Observe the body rather than the feed: navigating between pages swaps
    // the <shreddit-feed> element out, which would leave a feed observer dead.
    function startFeedObserver() {
      feedObserver.observe(document.body, { childList: true, subtree: true });
    }

    function updatePostCounter() {
      if (!overlay) return;
      const c = document.getElementById("fs-post-counter");
      if (c) c.textContent = `${currentIndex + 1} / ${postOrder.length}`;
    }

    function makeLink(href, label) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.textContent = label;
      a.style.cssText =
        "color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;font-family:system-ui,sans-serif;transition:color 0.15s;";
      a.onmouseenter = () => (a.style.color = "#fff");
      a.onmouseleave = () => (a.style.color = "rgba(255,255,255,0.6)");
      a.onclick = (e) => e.stopPropagation();
      return a;
    }

    function preload(index) {
      const post = postRegistry.get(postOrder[index]);
      if (!post) return;
      if (post.type === "gallery") preloadSrc(post.srcs[0]);
      else if (post.type === "image" || post.type === "gif")
        preloadSrc(post.src);
      // Look the clip length up ahead of time so the slide starts on schedule
      else if (post.type === "redgif" && slideshow) getClipLength(post);
    }

    function preloadSrc(src) {
      if (!src) return;
      const img = new Image();
      img.src = src;
      preloads.push(img);
      if (preloads.length > 8) preloads.shift();
    }

    // Scroll the (hidden) feed to its end so Reddit fetches the next page
    function loadMorePosts() {
      const feed = document.querySelector("shreddit-feed");
      const target =
        feed?.querySelector(':scope > [slot="load-after"]') ||
        feed?.lastElementChild;
      target?.scrollIntoView({ behavior: "instant", block: "end" });
    }

    // First index from `index` onwards (in direction `dir`) whose post passes
    // the media filter; out of range if there is none.
    function nextMatching(index, dir) {
      while (
        index >= 0 &&
        index < postOrder.length &&
        !passesMediaFilter(postRegistry.get(postOrder[index])?.type)
      )
        index += dir;
      return index;
    }

    // Move to the previous/next post. Past the last known post, ask Reddit for
    // more instead of doing nothing.
    function step(dir) {
      const next = nextMatching(currentIndex + dir, dir);
      if (next >= 0 && next < postOrder.length) return show(next);
      if (dir > 0) {
        loadMorePosts();
        // Slideshow keeps knocking until the next page has registered
        clearTimeout(slideTimer);
        if (slideshow) slideTimer = setTimeout(() => step(1), 2000);
      }
    }

    // Thin bar along the top edge that fills up until the next slide
    function runSlideProgress(seconds) {
      const bar = document.getElementById("fs-slideshow-progress");
      if (!bar) return;
      bar.style.transition = "none";
      bar.style.width = "0";
      if (!seconds) return;
      void bar.offsetWidth; // restart the fill from zero
      bar.style.transition = `width ${seconds}s linear`;
      bar.style.width = "100%";
    }

    function startSlideTimer(seconds) {
      clearTimeout(slideTimer);
      slideTimer = setTimeout(advanceSlide, seconds * 1000);
      runSlideProgress(seconds);
    }

    function scheduleSlide() {
      clearTimeout(slideTimer);
      runSlideProgress(0);
      if (!overlay || !slideshow) return;
      const post = postRegistry.get(postOrder[currentIndex]);
      if (!post || post.type === "video") return; // videos advance on "ended"
      const shown = shownAt;
      if (post.type === "redgif") {
        // Start with a safe guess, then switch to the real clip length once
        // Reddit has answered (if the viewer is still on this post).
        startSlideTimer(Math.max(slideSeconds, REDGIF_FALLBACK_SECONDS));
        getClipLength(post).then((length) => {
          if (!length || !overlay || !slideshow || shownAt !== shown) return;
          startSlideTimer(redgifSecondsLeft(length));
        });
        return;
      }

      const img = overlay.querySelector("img");
      if (!img || !img.src.includes(".gif"))
        return startSlideTimer(slideSeconds);

      // A GIF stays up for whole plays, enough of them to cover the chosen
      // slideshow time. Wait for it to load and be measured first.
      const src = img.src;
      startSlideTimer(Math.max(slideSeconds, GIF_LOAD_SECONDS));
      Promise.all([getGifLength(src), gifShownAt(img)]).then(
        ([length, startedAt]) => {
          if (!overlay || !slideshow || shownAt !== shown || img.src !== src)
            return;
          const elapsed = (Date.now() - startedAt) / 1000;
          // Not animated, or the file couldn't be read: treat it as a picture
          if (!length) return startSlideTimer(Math.max(1, slideSeconds - elapsed));
          const plays = Math.max(1, Math.ceil(slideSeconds / length));
          const left = plays * length - elapsed;
          // Already past that (slideshow switched on late): finish this play
          startSlideTimer(
            left >= 1 ? left : Math.max(1, length - (elapsed % length)),
          );
        },
      );
    }

    function advanceSlide() {
      if (currentGallerySrcs && galleryIndex < currentGallerySrcs.length - 1)
        moveGallery(1);
      else step(1);
    }

    // Reflect slideshow state in the control pill
    function renderSlideControls() {
      const play = document.getElementById("fs-slideshow-btn");
      const speed = document.getElementById("fs-slideshow-speed");
      if (play) {
        play.innerHTML = slideshow ? ICONS.pause : ICONS.play;
        play.style.background = slideshow
          ? "#ff4500"
          : "rgba(255,255,255,0.15)";
      }
      if (speed) speed.textContent = slideSeconds + "s";
    }

    function toggleSlideshow() {
      slideshow = !slideshow;
      renderSlideControls();
      const video = overlay?.querySelector("video");
      if (video) {
        video.loop = !slideshow;
        if (video.ended) {
          if (slideshow) return step(1);
          video.play().catch(() => {});
        }
      }
      scheduleSlide();
    }

    // dir -1 = faster (fewer seconds per post), +1 = slower
    function changeSlideSpeed(dir) {
      // The saved value may predate the current steps, so find the nearest one
      let i = 0;
      SLIDE_SPEEDS.forEach((seconds, n) => {
        if (
          Math.abs(seconds - slideSeconds) <
          Math.abs(SLIDE_SPEEDS[i] - slideSeconds)
        )
          i = n;
      });
      i = Math.min(SLIDE_SPEEDS.length - 1, Math.max(0, i + dir));
      slideSeconds = SLIDE_SPEEDS[i];
      store.set("slide-seconds", slideSeconds);
      renderSlideControls();
      scheduleSlide();
    }

    let volumeBeforeMute = volume || 1;

    function renderVolumeControls() {
      const btn = document.getElementById("fs-volume-btn");
      const slider = document.getElementById("fs-volume-slider");
      if (btn) {
        btn.innerHTML = volume > 0 ? ICONS.volume : ICONS.muted;
        btn.title = volume > 0 ? "Mute (M)" : "Unmute (M)";
      }
      if (slider) slider.value = Math.round(volume * 100);
    }

    function setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      if (volume > 0) volumeBeforeMute = volume;
      store.set("volume", volume);
      renderVolumeControls();
      overlay?.querySelectorAll("video").forEach((video) => {
        video.volume = volume;
        video.muted = volume === 0;
      });
      // Redgifs embeds, in the viewer and in the feed
      document.querySelectorAll("iframe").forEach((frame) => {
        if (isRedgifsHost(frame.src))
          frame.contentWindow?.postMessage(
            volumeMessage(),
            "https://www.redgifs.com",
          );
      });
    }

    const toggleMute = () => setVolume(volume > 0 ? 0 : volumeBeforeMute);

    function show(index) {
      currentIndex = index;
      shownAt = Date.now();
      galleryIndex = 0;
      currentGallerySrcs = null;
      const postId = postOrder[currentIndex];
      const post = postRegistry.get(postId);
      if (!post) return;
      overlay.innerHTML = "";

      const counter = document.createElement("div");
      counter.id = "fs-post-counter";
      counter.textContent = `${currentIndex + 1} / ${postOrder.length}`;
      counter.style.cssText =
        "position:absolute;bottom:44px;left:12px;color:#fff;font-size:12px;opacity:0.5;pointer-events:none;z-index:20;";
      overlay.appendChild(counter);

      const close = document.createElement("button");
      close.textContent = "✕";
      close.style.cssText =
        "position:absolute;top:8px;right:12px;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;opacity:0.6;z-index:30;";
      close.onclick = destroy;
      overlay.appendChild(close);

      const progress = document.createElement("div");
      progress.id = "fs-slideshow-progress";
      progress.style.cssText =
        "position:absolute;top:0;left:0;height:3px;width:0;background:#ff4500;z-index:31;pointer-events:none;";
      overlay.appendChild(progress);

      // Slideshow pill: [−] 5s [+] [▶]
      const pill = document.createElement("div");
      pill.id = "fs-slideshow";
      const pillStyle =
        "display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(30,30,30,0.75);backdrop-filter:blur(6px);box-shadow:0 1px 6px rgba(0,0,0,0.4);";
      pill.style.cssText = pillStyle;
      const pillBtn = (text, title, onClick) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.title = title;
        b.style.cssText =
          "width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s;";
        b.onmouseenter = () => {
          if (b.id !== "fs-slideshow-btn" || !slideshow)
            b.style.background = "rgba(255,255,255,0.25)";
        };
        b.onmouseleave = () => {
          b.style.background = "transparent";
          renderSlideControls();
        };
        b.onclick = (e) => {
          e.stopPropagation();
          onClick();
        };
        return b;
      };
      const faster = pillBtn("−", "Faster (− key)", () => changeSlideSpeed(-1));
      const speed = document.createElement("span");
      speed.id = "fs-slideshow-speed";
      speed.title = "Seconds per post";
      speed.style.cssText =
        "min-width:30px;text-align:center;color:#fff;font-size:13px;font-variant-numeric:tabular-nums;user-select:none;";
      const slower = pillBtn("+", "Slower (+ key)", () => changeSlideSpeed(1));
      const play = pillBtn("", "Slideshow (Space)", toggleSlideshow);
      play.id = "fs-slideshow-btn";
      play.style.marginLeft = "2px";
      pill.append(faster, speed, slower, play);

      // Volume pill: [speaker] ———o——
      const volumePill = document.createElement("div");
      volumePill.id = "fs-volume";
      volumePill.style.cssText = pillStyle + "padding-right:10px;";
      const muteBtn = pillBtn("", "", toggleMute);
      muteBtn.id = "fs-volume-btn";
      const slider = document.createElement("input");
      slider.id = "fs-volume-slider";
      slider.type = "range";
      slider.min = "0";
      slider.max = "100";
      slider.title = "Volume";
      slider.style.cssText =
        "width:84px;height:4px;margin:0 0 0 4px;cursor:pointer;accent-color:#ff4500;";
      slider.oninput = () => setVolume(slider.value / 100);
      // Arrow keys on the slider change the volume, not the post
      slider.onkeydown = (e) => e.stopPropagation();
      // ...and afterwards the viewer's own keys work again
      slider.onchange = () => slider.blur();
      slider.onclick = (e) => e.stopPropagation();
      volumePill.append(muteBtn, slider);

      const controls = document.createElement("div");
      controls.id = "fs-controls";
      controls.style.cssText =
        "position:absolute;top:8px;right:52px;display:flex;align-items:center;gap:8px;z-index:30;font-family:system-ui,sans-serif;";
      controls.append(volumePill, pill);
      overlay.appendChild(controls);
      renderSlideControls();
      renderVolumeControls();

      const bar = document.createElement("div");
      bar.style.cssText =
        "position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:24px;padding:12px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.8));z-index:20;pointer-events:auto;";
      if (post.title) {
        const title = document.createElement("span");
        title.textContent = post.title;
        title.title = post.title;
        title.style.cssText =
          "max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:13px;font-family:system-ui,sans-serif;";
        bar.appendChild(title);
      }
      if (post.permalink) bar.appendChild(makeLink(post.permalink, "📄 Post"));
      if (post.author)
        bar.appendChild(
          makeLink(`/user/${post.author}/submitted/`, `👤 u/${post.author}`),
        );
      if (post.subreddit)
        bar.appendChild(
          makeLink(`/${post.subreddit}/`, `🏠 ${post.subreddit}`),
        );
      overlay.appendChild(bar);

      if (post.type === "image" || post.type === "gif") {
        const img = document.createElement("img");
        img.src = post.src;
        img.style.cssText =
          "position:absolute;inset:0;margin:auto;max-width:100vw;max-height:calc(100vh - 44px);object-fit:contain;";
        overlay.appendChild(img);
      } else if (post.type === "gallery") {
        currentGallerySrcs = post.srcs;
        galleryIndex = 0;
        const wrap = document.createElement("div");
        wrap.id = "fs-gallery";
        wrap.style.cssText =
          "position:absolute;inset:0 0 44px 0;display:flex;align-items:center;justify-content:center;";
        const img = document.createElement("img");
        img.id = "fs-gallery-img";
        img.style.cssText =
          "max-width:100vw;max-height:90vh;height:100%;object-fit:contain;";
        const gcounter = document.createElement("div");
        gcounter.id = "fs-gallery-counter";
        gcounter.style.cssText =
          "position:absolute;top:10px;left:12px;background:rgba(0,0,0,0.7);color:#fff;padding:4px 12px;border-radius:12px;font-size:13px;pointer-events:none;z-index:10;";
        const makeBtn = (text, side) => {
          const btn = document.createElement("button");
          btn.textContent = text;
          btn.style.cssText = `display:flex;position:absolute;${side}:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;z-index:15;justify-content:center;line-height:36px`;
          return btn;
        };
        const prev = makeBtn("‹", "left");
        prev.id = "fs-gallery-prev";
        const next = makeBtn("›", "right");
        next.id = "fs-gallery-next";
        prev.onclick = (e) => {
          e.stopPropagation();
          moveGallery(-1);
        };
        next.onclick = (e) => {
          e.stopPropagation();
          moveGallery(1);
        };
        wrap.append(prev, img, next, gcounter);
        overlay.appendChild(wrap);
        updateGallery();
      } else if (post.type === "redgif") {
        const iframe = document.createElement("iframe");
        // The #re-sound marker tells the frame helper to unmute this one
        iframe.src = post.src.split("#")[0] + "#re-sound";
        iframe.style.cssText =
          "position:absolute;inset:0;width:100vw;height:calc(100vh - 44px);border:none;";
        iframe.allow = "autoplay; fullscreen";
        overlay.appendChild(iframe);

        // Cross-origin iframes swallow both wheel and clicks. Cover only the top
        // 70% with a shield that captures the wheel for scroll-nav; the bottom
        // 30% stays clear so you can reach the redgif's controls (scrubber/sound
        // sit at the bottom of the embed).
        const shield = document.createElement("div");
        shield.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:70%;z-index:10;";
        shield.addEventListener("wheel", handleWheel, { passive: false });
        overlay.appendChild(shield);

        const hint = document.createElement("div");
        hint.textContent = "↕";
        hint.style.cssText =
          "position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:11;color:#fff;opacity:0.4;font-size:22px;pointer-events:none;";
        overlay.appendChild(hint);
      } else if (post.type === "video") {
        const video = document.createElement("video");
        video.src = post.src;
        video.controls = true;
        video.autoplay = true;
        video.loop = !slideshow;
        video.playsInline = true;
        video.volume = volume;
        video.muted = volume === 0;
        // In a slideshow the video plays through (short clips repeat until
        // they have had a full turn), then hands over to the next post.
        video.addEventListener("ended", () => {
          if (!slideshow) return;
          if (Date.now() - shownAt < slideSeconds * 1000)
            video.play().catch(() => {});
          else step(1);
        });
        video.style.cssText =
          "position:absolute;inset:0;margin:auto;max-width:100vw;max-height:calc(100vh - 44px);object-fit:contain;";
        overlay.appendChild(video);
        // Opening the lightbox is a user gesture, so try sound first; if the
        // browser's autoplay policy blocks it, fall back to muted autoplay.
        video.play?.().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }

      // Scroll background feed to current post (hidden behind overlay)
      const article = document.querySelector(
        `article[data-post-id="${postId}"]`,
      );
      if (article)
        article.scrollIntoView({ behavior: "instant", block: "center" });
      // Reddit may have swapped this post for a placeholder, leaving nothing
      // to scroll to — near the end of the list, pull in the next page anyway.
      else if (currentIndex >= postOrder.length - 3) loadMorePosts();

      preload(currentIndex + 1);
      preload(currentIndex - 1);
      scheduleSlide();
    }

    function moveGallery(dir) {
      if (!currentGallerySrcs) return;
      const n = galleryIndex + dir;
      if (n < 0 || n >= currentGallerySrcs.length) return;
      galleryIndex = n;
      updateGallery();
      scheduleSlide();
    }

    function updateGallery() {
      if (!currentGallerySrcs) return;
      const img = document.getElementById("fs-gallery-img");
      const counter = document.getElementById("fs-gallery-counter");
      const prev = document.getElementById("fs-gallery-prev");
      const next = document.getElementById("fs-gallery-next");
      if (!img) return;
      img.src = currentGallerySrcs[galleryIndex];
      preloadSrc(currentGallerySrcs[galleryIndex + 1]);
      if (counter)
        counter.textContent = `${galleryIndex + 1} / ${currentGallerySrcs.length}`;
      if (prev) prev.style.display = galleryIndex === 0 ? "none" : "flex";
      if (next)
        next.style.display =
          galleryIndex === currentGallerySrcs.length - 1 ? "none" : "flex";
    }

    function handleKey(e) {
      if (!overlay) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentGallerySrcs && galleryIndex > 0) moveGallery(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentGallerySrcs && galleryIndex < currentGallerySrcs.length - 1)
          moveGallery(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        toggleSlideshow();
        return;
      }
      if (e.key === "m" || e.key === "M") return toggleMute();
      if (e.key === "-" || e.key === "_") return changeSlideSpeed(-1);
      if (e.key === "+" || e.key === "=") return changeSlideSpeed(1);
      if (e.key === "Escape") destroy();
    }

    // Mouse-wheel navigation: mirrors ArrowUp/ArrowDown. Cooldown so one scroll
    // gesture = one post jump instead of flying through the whole feed.
    let wheelLock = false;
    function handleWheel(e) {
      if (!overlay) return;
      e.preventDefault();
      if (wheelLock || Math.abs(e.deltaY) < 10) return;
      wheelLock = true;
      setTimeout(() => (wheelLock = false), 250);
      step(e.deltaY > 0 ? 1 : -1);
    }

    function destroy() {
      if (overlay) {
        overlay.remove();
        overlay = null;
        // Scroll to the current post on close, regardless of how close was triggered
        const postId = postOrder[currentIndex];
        const article = document.querySelector(
          `article[data-post-id="${postId}"]`,
        );
        if (article)
          article.scrollIntoView({ behavior: "instant", block: "center" });
      }
      currentGallerySrcs = null;
      slideshow = false;
      clearTimeout(slideTimer);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("wheel", handleWheel);
    }

    function openAtPost(postId) {
      // Ensure the clicked post is registered, along with its neighbours in
      // case the feed was restored wholesale (e.g. coming back from a post)
      scanExistingArticles();

      if (!postRegistry.has(postId)) return;
      const idx = postOrder.indexOf(postId);
      if (idx === -1) return;

      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:#000;z-index:99999;";
      overlay.onclick = (e) => {
        if (e.target === overlay) destroy();
      };
      document.body.appendChild(overlay);
      document.addEventListener("keydown", handleKey);
      document.addEventListener("wheel", handleWheel, { passive: false });
      show(idx);
    }

    function open() {
      scanExistingArticles();
      const visible = findVisiblePostIndex();
      let start = nextMatching(visible, 1);
      if (start >= postOrder.length) start = nextMatching(visible, -1);
      if (start < 0) return alert("No posts found");

      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:#000;z-index:99999;";
      overlay.onclick = (e) => {
        if (e.target === overlay) destroy();
      };
      document.body.appendChild(overlay);
      document.addEventListener("keydown", handleKey);
      document.addEventListener("wheel", handleWheel, { passive: false });
      show(start);
    }

    function findVisiblePostIndex() {
      const viewportMid = window.innerHeight / 2;
      const articles = document.querySelectorAll("article[data-post-id]");
      let closestId = null,
        closestDist = Infinity;
      articles.forEach((article) => {
        const rect = article.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - viewportMid);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = article.dataset.postId;
        }
      });
      if (closestId) {
        const idx = postOrder.indexOf(closestId);
        if (idx !== -1) return idx;
      }
      return 0;
    }

    // Click-to-open: intercept clicks on media in posts
    document.addEventListener(
      "click",
      function (e) {
        if (overlay) return; // already open
        if (e.target.closest("[data-sv-redgifs-btn]")) return;

        // Check if clicked on media content (images, videos, galleries)
        const clickedMedia =
          e.target.closest("zoomable-img") ||
          e.target.closest("gallery-carousel") ||
          e.target.closest("shreddit-player") ||
          e.target.closest(".redgifs-wrapper") ||
          (e.target.tagName === "IMG" &&
            !e.target.closest("[avatar]") &&
            !e.target.closest("faceplate-hovercard") &&
            !e.target.classList.contains("shreddit-subreddit-icon__icon") &&
            e.target.getAttribute("role") !== "presentation");

        // For crossposts: the overlay <a> intercepts clicks before gallery images.
        // Detect clicks inside a crosspost media container that has media content.
        const crosspostMedia =
          !clickedMedia &&
          e.target
            .closest('[slot="post-media-container"]')
            ?.querySelector(
              "gallery-carousel, shreddit-player, .redgifs-wrapper, zoomable-img",
            );

        if (!clickedMedia && !crosspostMedia) return;

        // Find post ID from article wrapper or standalone shreddit-post
        const article = e.target.closest("article[data-post-id]");
        let postId;
        if (article) {
          postId = article.dataset.postId;
        } else {
          const sp = e.target.closest("shreddit-post[id]");
          if (sp) postId = sp.getAttribute("id");
        }
        if (!postId) return;

        e.preventDefault();
        e.stopPropagation();
        openAtPost(postId);
      },
      true,
    );

    // Initial scan + start persistent feed observer
    scanExistingArticles();
    startFeedObserver();

    // Keep the FAB button too
    const btn = document.createElement("button");
    btn.textContent = "⛶";
    btn.title =
      "Fullscreen viewer (↑↓ posts, ←→ gallery, Space slideshow, −/+ speed, M mute)";
    btn.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:9999;width:44px;height:44px;border-radius:50%;border:none;background:#ff4500;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;justify-content:center;line-height:43px;";
    btn.onclick = open;
    document.body.appendChild(btn);
  }

  // ==========================================
  // 4. USER LINK REWRITE TO /submitted/
  // ==========================================
  function initUserLinkRewrite() {
    const rewrite = (link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      // Match /user/username or /user/username/ but not deeper paths
      if (/^(https?:\/\/[^/]*)?\/user\/[^/]+(\/)?$/.test(href)) {
        const newHref = href.replace(/\/?$/, "/submitted/");
        link.setAttribute("href", newHref);
      }
    };

    const rewriteAll = () =>
      document.querySelectorAll('a[href*="/user/"]').forEach(rewrite);

    rewriteAll();
    new MutationObserver(() => rewriteAll()).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
  // ==========================================
  // 5. GRID VIEW TOGGLE
  // ==========================================
  function initGridToggle() {
    const MIN_COLS = 2;
    const MAX_COLS = 6;
    let isGrid = store.get("grid", "0") === "1";
    let isCompact = store.get("grid-compact", "0") === "1";
    let cols = parseInt(store.get("grid-cols", "3")) || 3;
    cols = Math.min(MAX_COLS, Math.max(MIN_COLS, cols));

    const style = document.createElement("style");
    style.id = "grid-view-style";
    style.textContent = `
		shreddit-feed.grid-view {
			display: grid !important;
			grid-template-columns: repeat(var(--re-grid-cols, 3), minmax(0, 1fr)) !important;
			gap: 8px !important;
		}
		shreddit-feed.grid-view > hr,
		shreddit-feed.grid-view > faceplate-loader,
		shreddit-feed.grid-view > faceplate-partial:not([slot="load-after"]),
		shreddit-feed.grid-view > achievement-events,
		shreddit-feed.grid-view > shreddit-screenview-data,
		shreddit-feed.grid-view > reddit-page-data {
			display: none !important;
		}
		shreddit-feed.grid-view > faceplate-batch {
			display: grid !important;
			grid-template-columns: repeat(var(--re-grid-cols, 3), minmax(0, 1fr)) !important;
			gap: 8px !important;
			grid-column: 1 / -1;
		}
		shreddit-feed.grid-view > faceplate-batch > hr {
			display: none !important;
		}
		shreddit-feed.grid-view > [slot="load-after"] {
			grid-column: 1 / -1;
		}
		shreddit-feed.grid-view > .virtualized-placeholder[style*="height: 0"] {
			display: none !important;
		}
		shreddit-feed.grid-view > .virtualized-placeholder:not([style*="height: 0"]) {
			grid-column: 1 / -1 !important;
		}
		shreddit-feed.grid-view.grid-home > .virtualized-placeholder:not([style*="height: 0"]) {
			visibility: hidden !important;
			height: 0 !important;
			overflow: hidden !important;
			grid-column: auto !important;
		}
		shreddit-feed.grid-view > article,
		shreddit-feed.grid-view > faceplate-batch > article {
			overflow: hidden;
		}
		shreddit-feed.grid-view shreddit-post {
			padding: 4px !important;
		}
		/* Galleries are built for a fixed 540px height. Size them from the tile
		   width and the first image's proportions instead (cqw = % of tile width) */
		shreddit-feed.grid-view [slot="post-media-container"] {
			container-type: inline-size;
		}
		shreddit-feed.grid-view gallery-carousel {
			--gallery-initial-height: calc(var(--re-gallery-ratio, 1.25) * 100cqw) !important;
			display: block !important;
			height: var(--gallery-initial-height) !important;
			min-height: 220px;
			max-height: 540px !important;
			overflow: hidden !important;
		}
		shreddit-feed.grid-view gallery-carousel > ul {
			height: 100% !important;
		}
		/* Compact cards: media only, title fades in over the top on hover */
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > [slot="credit-bar"],
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > [slot="post-flair"],
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > [slot="text-body"] {
			display: none !important;
		}
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > [slot="title"] {
			position: absolute !important;
			top: 0;
			left: 0;
			right: 0;
			z-index: 3;
			margin: 0 !important;
			padding: 8px 10px 22px !important;
			color: #fff !important;
			font-size: 13px !important;
			line-height: 1.3 !important;
			background: linear-gradient(rgba(0, 0, 0, 0.85), transparent);
			display: -webkit-box !important;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
			opacity: 0;
			transition: opacity 0.15s;
			pointer-events: none;
		}
		/* Subreddit and author links fade in along the bottom edge */
		.grid-post-meta {
			display: none;
		}
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > .grid-post-meta {
			display: flex;
			gap: 10px;
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 4;
			padding: 22px 10px 8px;
			color: rgba(255, 255, 255, 0.7);
			font-size: 12px;
			line-height: 1.3;
			white-space: nowrap;
			background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
			opacity: 0;
			transition: opacity 0.15s;
			pointer-events: none;
		}
		/* Subreddit/author take the room that's left; "View post" keeps the right corner */
		.grid-post-meta > span {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.grid-post-meta > a {
			flex: none;
			font-weight: 600;
		}
		.grid-post-meta a {
			color: #fff !important;
			text-decoration: none;
			pointer-events: auto;
		}
		.grid-post-meta a:hover {
			text-decoration: underline;
		}
		shreddit-feed.grid-compact shreddit-post:hover > [slot="title"],
		shreddit-feed.grid-compact shreddit-post:hover > .grid-post-meta {
			opacity: 1;
		}
		/* Tiles sit flush: tighter gaps, no card padding or spacing around media */
		shreddit-feed.grid-view.grid-compact,
		shreddit-feed.grid-view.grid-compact > faceplate-batch {
			gap: 3px !important;
		}
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) {
			padding: 0 !important;
			margin: 0 !important;
			border-radius: 0 !important;
		}
		shreddit-feed.grid-compact shreddit-post [slot="post-media-container"] {
			margin: 0 !important;
			padding: 0 !important;
			border-radius: 0 !important;
		}
		shreddit-feed.grid-compact shreddit-content-tags,
		shreddit-feed.grid-compact shreddit-post:has([slot="post-media-container"]) > [slot="ssr-post-content-header"] {
			display: none !important;
		}
		/* Crossposts repeat the source subreddit and title inside the media box,
		   and add an "N upvotes · N comments" line under the media */
		shreddit-feed.grid-compact [slot="post-media-container"] > div:has(> .crosspost-credit-bar),
		shreddit-feed.grid-compact [slot="post-media-container"] > div.text-12:has(faceplate-number),
		shreddit-feed.grid-compact [slot="post-media-container"] > div:has(> .truncate faceplate-number),
		shreddit-feed.grid-compact [slot="post-media-container"] .crosspost-credit-bar,
		shreddit-feed.grid-compact [slot="post-media-container"] .crosspost-title {
			display: none !important;
		}
		shreddit-feed.grid-compact [slot="post-media-container"] > div {
			margin: 0 !important;
		}
	`;
    document.head.appendChild(style);

    const fabStyle = (right) =>
      `position:fixed;bottom:20px;right:${right}px;z-index:9999;width:44px;height:44px;border-radius:50%;border:none;background:#ff4500;color:#fff;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;`;

    const btn = document.createElement("button");
    btn.id = "grid-toggle-btn";
    btn.style.cssText = fabStyle(74);

    const colsBtn = document.createElement("button");
    colsBtn.id = "grid-cols-btn";
    colsBtn.title = "Grid columns (click to change)";
    colsBtn.style.cssText = fabStyle(128);

    const compactBtn = document.createElement("button");
    compactBtn.id = "grid-compact-btn";
    compactBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" stroke-width="2"><rect x="1" y="1" width="16" height="16" rx="2"/><path d="M1 13l4.5-4.5 3.5 3.5 3-3 5 5"/></svg>';
    compactBtn.style.cssText = fabStyle(182);

    const gridIcon =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="0" y="0" width="5" height="5"/><rect x="6.5" y="0" width="5" height="5"/><rect x="13" y="0" width="5" height="5"/><rect x="0" y="6.5" width="5" height="5"/><rect x="6.5" y="6.5" width="5" height="5"/><rect x="13" y="6.5" width="5" height="5"/><rect x="0" y="13" width="5" height="5"/><rect x="6.5" y="13" width="5" height="5"/><rect x="13" y="13" width="5" height="5"/></svg>';
    const listIcon =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="0" y="1" width="18" height="3" rx="1"/><rect x="0" y="7.5" width="18" height="3" rx="1"/><rect x="0" y="14" width="18" height="3" rx="1"/></svg>';

    // Home feed needs different placeholder handling than subreddit/profile feeds
    const isHomePage = () => {
      const p = location.pathname;
      return p === "/" || /^\/(best|hot|new|top|rising)\/?$/.test(p);
    };
    const isCustomFeedPage = () =>
      /^\/user\/[^/]+\/m\/[^/]+/.test(location.pathname);

    // Flat feeds (home, custom feeds) hold posts as direct children and Reddit
    // virtualizes them one placeholder per post, so each placeholder must stay
    // in its own grid cell. Batched feeds swap out whole rows of posts at once.
    const isFlatFeed = (feed) => {
      if (isHomePage() || isCustomFeedPage()) return true;
      if (feed.querySelector(":scope > faceplate-batch")) return false;
      if (feed.querySelector(":scope > article")) return true;
      // Everything virtualized right now — keep whatever we decided before
      return feed.classList.contains("grid-home");
    };

    // The vote/comment row and NSFW/spoiler tags live inside each post's shadow
    // root, out of reach of the page stylesheet, so compact mode drops a
    // <style> into every post.
    const COMPACT_SHADOW_CSS = `
      [data-testid="action-row"],
      .shreddit-post-container,
      #content-tag-container,
      shreddit-content-tags,
      .content-tags {
        display: none !important;
      }
      .condensed-post-title-heading {
        margin: 0 !important;
      }
    `;
    // The gallery's inner wrappers carry their own 540px cap; make them fill
    // whatever height the stylesheet gives the gallery element.
    const GALLERY_SHADOW_CSS = `
      .relative,
      faceplate-carousel {
        height: 100% !important;
        max-height: none !important;
      }
    `;
    const CAROUSEL_SHADOW_CSS = `
      :host {
        display: block;
      }
      .carousel-container,
      #carousel-window,
      #carousel-list {
        height: 100% !important;
        max-height: none !important;
      }
    `;
    const DEFAULT_GALLERY_LIMIT = 1.25; // 4:5, until other tiles can be read

    // Add or remove one of our <style> blocks inside an element's shadow root
    function setShadowStyle(host, key, css, on) {
      const root = host?.shadowRoot;
      if (!root) return;
      const existing = root.querySelector(`style[data-grid-${key}]`);
      if (on && !existing) {
        const shadowStyle = document.createElement("style");
        shadowStyle.setAttribute(`data-grid-${key}`, "");
        shadowStyle.textContent = css;
        root.appendChild(shadowStyle);
      } else if (!on && existing) {
        existing.remove();
      }
    }

    function profileOrSubredditHref(name) {
      // Profile posts report their "subreddit" as u_name
      const user = name.match(/^u[_/](.+)$/);
      return user ? `/user/${user[1]}/submitted/` : `/${name}/`;
    }

    function metaLink(label, href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.textContent = label;
      // Keep the click from also opening the post underneath
      a.onclick = (e) => e.stopPropagation();
      return a;
    }

    // Subreddit + author links and a "View post" link shown along the bottom
    // of a compact tile
    function addPostMeta(post) {
      if (post.querySelector(":scope > .grid-post-meta")) return;
      const subreddit = post.getAttribute("subreddit-prefixed-name");
      const author = post.getAttribute("author");
      const permalink = post.getAttribute("permalink");
      const links = [];
      if (subreddit)
        links.push([
          subreddit.replace(/^u_/, "u/"),
          profileOrSubredditHref(subreddit),
        ]);
      // (a profile post's "subreddit" is the author, so don't list them twice)
      if (author && author !== "[deleted]" && subreddit !== `u_${author}`)
        links.push([`u/${author}`, `/user/${author}/submitted/`]);
      if (!links.length && !permalink) return;
      const meta = document.createElement("div");
      meta.className = "grid-post-meta";
      const names = document.createElement("span");
      links.forEach(([label, href], i) => {
        if (i) names.append("  ·  ");
        names.appendChild(metaLink(label, href));
      });
      meta.appendChild(names);
      if (permalink) meta.appendChild(metaLink("View post", permalink));
      post.appendChild(meta);
    }

    function syncCompactPosts(feed) {
      const on = isGrid && isCompact;
      feed.querySelectorAll("shreddit-post").forEach((post) => {
        setShadowStyle(post, "compact", COMPACT_SHADOW_CSS, on);
        if (on) addPostMeta(post);
        else post.querySelector(":scope > .grid-post-meta")?.remove();
      });
    }

    // Reddit writes each single image/video's shape on its box as an inline
    // aspect-ratio (width / height), already trimmed for tall media. The
    // tallest of those is the limit galleries are held to, so they line up.
    function tallestSingleMediaRatio(feed) {
      let tallest = 0;
      feed.querySelectorAll("[data-aspect-ratio-container]").forEach((box) => {
        const [w, h = 1] = box.style.aspectRatio.split("/").map(parseFloat);
        if (w > 0 && h > 0) tallest = Math.max(tallest, h / w);
      });
      return tallest || DEFAULT_GALLERY_LIMIT;
    }

    function syncGalleries(feed) {
      const galleries = feed.querySelectorAll("gallery-carousel");
      if (!galleries.length) return;
      const limit = isGrid ? tallestSingleMediaRatio(feed) : 0;
      galleries.forEach((gallery) => {
        if (isGrid) {
          const img = gallery.querySelector(
            'li img:not([role="presentation"])',
          );
          const ratio =
            img?.getAttribute("height") / img?.getAttribute("width");
          if (ratio > 0) {
            const value = Math.min(ratio, limit).toFixed(3);
            if (gallery.style.getPropertyValue("--re-gallery-ratio") !== value)
              gallery.style.setProperty("--re-gallery-ratio", value);
          }
        }
        setShadowStyle(gallery, "gallery", GALLERY_SHADOW_CSS, isGrid);
        setShadowStyle(
          gallery.shadowRoot?.querySelector("faceplate-carousel"),
          "gallery",
          CAROUSEL_SHADOW_CSS,
          isGrid,
        );
      });
    }

    // Bring the current feed in line with the saved settings. Runs again
    // whenever the page changes, because infinite scroll and navigation can
    // replace the feed (losing its classes) and keep adding new posts.
    function syncFeed() {
      const feed = document.querySelector("shreddit-feed");
      if (!feed) return;
      feed.classList.toggle("grid-view", isGrid);
      feed.classList.toggle("grid-home", isGrid && isFlatFeed(feed));
      feed.classList.toggle("grid-compact", isGrid && isCompact);
      syncCompactPosts(feed);
      syncGalleries(feed);
    }

    function render() {
      document.documentElement.style.setProperty("--re-grid-cols", cols);
      btn.innerHTML = isGrid ? listIcon : gridIcon;
      btn.title = isGrid ? "Switch to single column" : "Switch to grid";
      colsBtn.textContent = cols;
      colsBtn.style.display = isGrid ? "flex" : "none";
      compactBtn.style.display = isGrid ? "flex" : "none";
      compactBtn.style.background = isCompact ? "#ff4500" : "#555";
      compactBtn.title = isCompact
        ? "Show full post cards"
        : "Compact cards (media only, title on hover)";
      syncFeed();
    }

    btn.onclick = () => {
      if (!document.querySelector("shreddit-feed")) return;
      isGrid = !isGrid;
      store.set("grid", isGrid ? "1" : "0");
      render();
    };

    colsBtn.onclick = () => {
      cols = cols >= MAX_COLS ? MIN_COLS : cols + 1;
      store.set("grid-cols", cols);
      render();
    };

    compactBtn.onclick = () => {
      isCompact = !isCompact;
      store.set("grid-compact", isCompact ? "1" : "0");
      render();
    };

    // At most one sync per frame, however many mutations Reddit fires
    let syncQueued = false;
    new MutationObserver(() => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => {
        syncQueued = false;
        syncFeed();
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.body.append(btn, colsBtn, compactBtn);
    render();
  }

  // ==========================================
  // 6. HIDE PROMOTED POSTS
  // ==========================================
  function initHidePromoted() {
    const style = document.createElement("style");
    style.id = "hide-promoted-style";
    style.textContent = `
		shreddit-ad-post,
		shreddit-dynamic-ad-link,
		shreddit-comments-page-ad,
		shreddit-comment-tree-ad,
		shreddit-sidebar-ad,
		article:has(shreddit-ad-post),
		shreddit-ad-post + hr,
		article:has(shreddit-ad-post) + hr {
			display: none !important;
		}
	`;
    document.head.appendChild(style);
  }

  // ==========================================
  // 7. AUTO-SCROLL
  // ==========================================
  function initAutoScroll() {
    const SPEEDS = [20, 40, 70, 110, 170, 260, 400, 600]; // pixels per second
    let level = parseInt(store.get("autoscroll-level", "3"));
    if (!(level >= 0 && level < SPEEDS.length)) level = 3;
    let running = false;
    let lastTime = 0;
    let carry = 0; // fraction of a pixel left over from the previous frame

    const wrap = document.createElement("div");
    wrap.id = "auto-scroll";
    wrap.style.cssText =
      "position:fixed;bottom:74px;right:20px;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:system-ui,sans-serif;";

    // Speed pill, only shown while scrolling: [+] level [−]
    const pill = document.createElement("div");
    pill.style.cssText =
      "display:none;flex-direction:column;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(30,30,30,0.85);box-shadow:0 2px 8px rgba(0,0,0,0.3);";
    const pillBtn = (text, title, dir) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.title = title;
      b.style.cssText =
        "width:30px;height:30px;border-radius:50%;border:none;background:transparent;color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;";
      b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.25)");
      b.onmouseleave = () => (b.style.background = "transparent");
      b.onclick = () => setLevel(level + dir);
      return b;
    };
    const label = document.createElement("span");
    label.title = "Scroll speed";
    label.style.cssText =
      "color:#fff;font-size:12px;font-variant-numeric:tabular-nums;user-select:none;";
    pill.append(pillBtn("+", "Faster", 1), label, pillBtn("−", "Slower", -1));

    const btn = document.createElement("button");
    btn.id = "auto-scroll-btn";
    btn.style.cssText =
      "width:44px;height:44px;border-radius:50%;border:none;background:#ff4500;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;";

    function render() {
      btn.innerHTML = running ? ICONS.pause : ICONS.down;
      btn.title = running ? "Stop auto-scroll" : "Auto-scroll the page";
      pill.style.display = running ? "flex" : "none";
      label.textContent = `${level + 1}/${SPEEDS.length}`;
    }

    function setLevel(next) {
      level = Math.min(SPEEDS.length - 1, Math.max(0, next));
      store.set("autoscroll-level", level);
      render();
    }

    function tick(now) {
      if (!running) return;
      const elapsed = Math.min(now - lastTime, 100); // don't leap after a stall
      lastTime = now;
      // Hold still while the fullscreen viewer is covering the feed
      if (!document.getElementById("fs-post-counter")) {
        carry += (SPEEDS[level] * elapsed) / 1000;
        const whole = Math.floor(carry);
        if (whole > 0) {
          carry -= whole;
          window.scrollBy({ top: whole, behavior: "instant" });
        }
      }
      requestAnimationFrame(tick);
    }

    btn.onclick = () => {
      running = !running;
      render();
      if (running) {
        lastTime = performance.now();
        carry = 0;
        requestAnimationFrame(tick);
      }
    };

    wrap.append(pill, btn);
    document.body.appendChild(wrap);
    render();
  }

  // ==========================================
  // 8. REDGIFS PLAYER HELPER (runs inside the embed frame)
  // ==========================================
  // The Redgifs player always starts muted and in SD, and takes no option to
  // change that from outside: the only way is to press its own buttons, which
  // a script on reddit.com cannot reach. This part therefore only does
  // anything when the injector is also set up to run this file on
  // https://www.redgifs.com/ifr/* (in frames).
  function initRedgifsFrame() {
    // Sound only where the viewer asked for it; feed embeds stay quiet
    const wantSound = location.hash.includes("re-sound");
    let hdDone = false;
    let soundDone = !wantSound;

    function apply() {
      const video = document.querySelector("video");
      if (!video) return;
      if (!hdDone) {
        // The player starts in SD, so one press of the quality button is HD
        const quality = document.querySelector(".gifQualityButton");
        if (!quality) return;
        hdDone = true;
        quality.click();
        return; // let the HD stream load before touching sound
      }
      if (!soundDone) {
        const sound = document.querySelector(
          '.SoundButton[aria-label="Sound Off"]',
        );
        if (!sound) return; // not there yet, or the clip has no audio
        soundDone = true;
        sound.click();
        // Browsers pause a clip that is unmuted without their blessing; if
        // that happens, go back to muted so it keeps playing.
        setTimeout(() => {
          if (!video.paused) return;
          document
            .querySelector('.SoundButton[aria-label="Sound On"]')
            ?.click();
          video.play().catch(() => {});
        }, 500);
      }
    }

    // The Reddit page owns the volume setting; ask for it and keep the
    // player's video at whatever it says.
    let wantedVolume = null;
    const applyVolume = () => {
      const video = document.querySelector("video");
      if (video && wantedVolume !== null) video.volume = wantedVolume;
    };
    window.addEventListener("message", (e) => {
      let fromReddit = false;
      try {
        fromReddit = /(^|\.)reddit\.com$/.test(new URL(e.origin).hostname);
      } catch (err) {}
      if (!fromReddit || e.data?.source !== "reddit-enhancer") return;
      if (e.data.event !== "volume") return;
      const next = Number(e.data.volume);
      if (!(next >= 0 && next <= 1)) return;
      wantedVolume = next;
      applyVolume();
    });
    if (window.parent !== window)
      window.parent.postMessage(
        { source: "reddit-enhancer", event: "hello" },
        "*",
      );

    const observer = new MutationObserver(() => {
      apply();
      if (hdDone && soundDone) observer.disconnect();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    apply();
    // The sound button never appears for silent clips, so stop looking
    setTimeout(() => observer.disconnect(), 20000);

    // Tell the page each time playback (re)starts, with the true clip length,
    // so its slideshow can wait for exactly one play.
    document.addEventListener(
      "playing",
      (e) => {
        apply();
        applyVolume();
        const duration = e.target?.duration;
        if (window.parent === window || !(duration > 0)) return;
        window.parent.postMessage(
          { source: "reddit-enhancer", event: "playing", duration },
          "*",
        );
      },
      true,
    );
  }

  // ==========================================
  // 9. MEDIA TYPE FILTER
  // ==========================================
  function initMediaFilter() {
    const OPTIONS = [
      {
        value: "all",
        label: "All posts",
        icon: '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><path d="M1.5 2h15a.8.8 0 0 1 .6 1.3L11 10.5V16a.6.6 0 0 1-.9.5l-3-1.8a.6.6 0 0 1-.3-.5v-3.7L.9 3.3A.8.8 0 0 1 1.5 2Z"/></svg>',
      },
      {
        value: "photos",
        label: "Photos only",
        icon: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" stroke-width="2"><rect x="1" y="1" width="16" height="16" rx="2"/><path d="M1 13l4.5-4.5 3.5 3.5 3-3 5 5"/><circle cx="12" cy="5.5" r="1.3" fill="white" stroke="none"/></svg>',
      },
      {
        value: "moving",
        label: "Videos & GIFs only",
        icon: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" stroke-width="2"><rect x="2" y="1" width="14" height="16" rx="2"/><path d="M6 1v16M12 1v16M2 5.5h4M2 9h4M2 12.5h4M12 5.5h4M12 9h4M12 12.5h4"/></svg>',
      },
    ];

    const style = document.createElement("style");
    style.id = "media-filter-style";
    style.textContent = `
			shreddit-feed article.re-filtered-out,
			shreddit-feed article.re-filtered-out + hr {
				display: none !important;
			}
		`;
    document.head.appendChild(style);

    // Same buckets the viewer uses: "gif" / "video" / "redgif" are moving,
    // "image" / "gallery" are photos, anything else (text, links) is neither
    function postType(article) {
      const post = article.querySelector("shreddit-post");
      if (!post) return null;
      const type = post.getAttribute("post-type");
      const href = post.getAttribute("content-href") || "";
      if (
        type === "video" ||
        article.querySelector(
          'shreddit-player, shreddit-embed, .redgifs-wrapper, iframe[src*="redgifs.com"]',
        ) ||
        /\.(gifv?|mp4|webm)(\?|$)|redgifs\.com|gfycat\.com/i.test(href)
      )
        return "video";
      const img = article.querySelector("zoomable-img img");
      const imgSrc = img ? `${img.src} ${img.getAttribute("srcset") || ""}` : "";
      if (/\.gif|format=gif/i.test(imgSrc)) return "gif";
      if (type === "gallery" || article.querySelector("gallery-carousel"))
        return "gallery";
      if (type === "image" || img) return "image";
      return null;
    }

    function syncFeed() {
      document
        .querySelectorAll("shreddit-feed article[data-post-id]")
        .forEach((article) => {
          article.classList.toggle(
            "re-filtered-out",
            !passesMediaFilter(postType(article)),
          );
        });
    }

    const wrap = document.createElement("div");
    wrap.id = "media-filter";
    wrap.style.cssText =
      "position:fixed;bottom:74px;right:74px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,sans-serif;";

    const menu = document.createElement("div");
    menu.style.cssText =
      "display:none;flex-direction:column;gap:2px;padding:4px;border-radius:10px;background:rgba(30,30,30,0.92);box-shadow:0 2px 8px rgba(0,0,0,0.3);";
    const items = OPTIONS.map((option) => {
      const item = document.createElement("button");
      item.innerHTML = `${option.icon}<span>${option.label}</span>`;
      item.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:6px 10px;border:none;border-radius:6px;background:transparent;color:#fff;font-size:13px;white-space:nowrap;cursor:pointer;text-align:left;";
      item.onmouseenter = () =>
        (item.style.background =
          option.value === mediaFilter ? "#ff4500" : "rgba(255,255,255,0.15)");
      item.onmouseleave = () => render();
      item.onclick = () => {
        mediaFilter = option.value;
        store.set("media-filter", mediaFilter);
        menu.style.display = "none";
        render();
      };
      menu.appendChild(item);
      return item;
    });

    const btn = document.createElement("button");
    btn.id = "media-filter-btn";
    btn.style.cssText =
      "width:44px;height:44px;border-radius:50%;border:none;background:#ff4500;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;position:relative;";
    btn.onclick = () => {
      menu.style.display = menu.style.display === "none" ? "flex" : "none";
    };
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) menu.style.display = "none";
    });

    function render() {
      const current = OPTIONS.find((o) => o.value === mediaFilter);
      // Always the funnel; a small badge in the corner names the active type
      // (both nudged in from the corner so they stay inside the circle)
      btn.innerHTML =
        mediaFilter === "all"
          ? OPTIONS[0].icon
          : OPTIONS[0].icon.replace("<svg ", '<svg style="transform:translate(-4px,-4px)" ') +
            `<span style="position:absolute;right:5px;bottom:5px;box-sizing:border-box;width:20px;height:20px;border-radius:50%;background:#222;border:2px solid #ff4500;display:flex;align-items:center;justify-content:center;">${current.icon.replace('width="18" height="18"', 'width="11" height="11"')}</span>`;
      btn.title = `Showing: ${current.label} (click to change)`;
      btn.style.background = mediaFilter === "all" ? "#555" : "#ff4500";
      items.forEach((item, i) => {
        item.style.background =
          OPTIONS[i].value === mediaFilter ? "#ff4500" : "transparent";
      });
      syncFeed();
    }

    // At most one sync per frame, however many mutations Reddit fires
    let syncQueued = false;
    new MutationObserver(() => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => {
        syncQueued = false;
        syncFeed();
      });
    }).observe(document.body, { childList: true, subtree: true });

    wrap.append(menu, btn);
    document.body.appendChild(wrap);
    render();
  }

  // ==========================================
  // INIT ALL
  // ==========================================
  function init() {
    initRedgifsFix();
    initRightSidebarToggle();
    initFullscreenViewer();
    initUserLinkRewrite();
    initGridToggle();
    initHidePromoted();
    initAutoScroll();
    initMediaFilter();
  }

  // Inside a Redgifs embed frame only the player helper applies
  const inRedgifsFrame = isRedgifsHost(location.href);
  if (inRedgifsFrame && !location.pathname.startsWith("/ifr/")) return;
  const start = inRedgifsFrame ? initRedgifsFrame : init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
