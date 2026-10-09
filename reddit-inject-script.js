// Reddit Enhancements - Combined Script
// 1. RedGifs Embed Fix
// 2. Auto-close Left Sidebar
// 3. Fullscreen Post Viewer (click image to open, slideshow)
// 4. User Link Rewrite
// 5. Grid View Toggle (columns, compact cards)
// 6. Hide Promoted Posts
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
      wrapper.appendChild(iframe);
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
  // 2. AUTO-CLOSE LEFT SIDEBAR
  // ==========================================
  function initSidebarClose() {
    function closeNav() {
      const navContainer = document.querySelector("#left-sidebar-container");
      const gridContainer = document.querySelector(".grid-container");
      if (!navContainer || !gridContainer) return false;
      navContainer.style.transition = "none";
      gridContainer.style.transition = "none";
      navContainer.setAttribute("expanded", "0");
      gridContainer.classList.remove("flex-nav-expanded");
      gridContainer.classList.add("flex-nav-collapsed");
      return true;
    }

    let sidebarObserver, gridObserver;
    function watchSidebar() {
      const navContainer = document.querySelector("#left-sidebar-container");
      const gridContainer = document.querySelector(".grid-container");
      if (!navContainer || !gridContainer) return;
      if (sidebarObserver) sidebarObserver.disconnect();
      sidebarObserver = new MutationObserver(() => {
        if (navContainer.getAttribute("expanded") !== "0") closeNav();
      });
      sidebarObserver.observe(navContainer, {
        attributes: true,
        attributeFilter: ["expanded"],
      });
      if (gridObserver) gridObserver.disconnect();
      gridObserver = new MutationObserver(() => {
        if (gridContainer.classList.contains("flex-nav-expanded")) closeNav();
      });
      gridObserver.observe(gridContainer, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    function pollAndWatch(duration = 3000, interval = 200) {
      const end = Date.now() + duration;
      function tick() {
        if (closeNav()) watchSidebar();
        if (Date.now() < end) setTimeout(tick, interval);
      }
      tick();
    }

    pollAndWatch();
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        pollAndWatch();
      }
    }).observe(document, { subtree: true, childList: true });
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

    const SLIDE_SPEEDS = [3, 5, 10, 20];
    let slideshow = false;
    let slideTimer;
    let slideSeconds = parseInt(store.get("slide-seconds", "5")) || 5;
    let shownAt = 0;
    const preloads = []; // keeps preloading <img>s alive until they finish

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

    // Move to the previous/next post. Past the last known post, ask Reddit for
    // more instead of doing nothing.
    function step(dir) {
      const next = currentIndex + dir;
      if (next >= 0 && next < postOrder.length) return show(next);
      if (dir > 0) {
        loadMorePosts();
        // Slideshow keeps knocking until the next page has registered
        clearTimeout(slideTimer);
        if (slideshow) slideTimer = setTimeout(() => step(1), 2000);
      }
    }

    function scheduleSlide() {
      clearTimeout(slideTimer);
      if (!overlay || !slideshow) return;
      const post = postRegistry.get(postOrder[currentIndex]);
      if (!post || post.type === "video") return; // videos advance on "ended"
      // Redgifs can't report when they finish, so give them a longer turn
      const seconds =
        post.type === "redgif" ? Math.max(slideSeconds, 15) : slideSeconds;
      slideTimer = setTimeout(advanceSlide, seconds * 1000);
    }

    function advanceSlide() {
      if (currentGallerySrcs && galleryIndex < currentGallerySrcs.length - 1)
        moveGallery(1);
      else step(1);
    }

    function toggleSlideshow() {
      slideshow = !slideshow;
      const btn = document.getElementById("fs-slideshow-btn");
      if (btn) btn.textContent = slideshow ? "⏸" : "▶";
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

    function cycleSlideSpeed() {
      const i = SLIDE_SPEEDS.indexOf(slideSeconds);
      slideSeconds = SLIDE_SPEEDS[(i + 1) % SLIDE_SPEEDS.length];
      store.set("slide-seconds", slideSeconds);
      const btn = document.getElementById("fs-slideshow-speed");
      if (btn) btn.textContent = slideSeconds + "s";
      scheduleSlide();
    }

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

      const play = document.createElement("button");
      play.id = "fs-slideshow-btn";
      play.textContent = slideshow ? "⏸" : "▶";
      play.title = "Slideshow (Space)";
      play.style.cssText =
        "position:absolute;top:10px;right:48px;background:none;border:none;color:#fff;font-size:18px;cursor:pointer;opacity:0.6;z-index:30;";
      play.onclick = toggleSlideshow;
      overlay.appendChild(play);

      const speed = document.createElement("button");
      speed.id = "fs-slideshow-speed";
      speed.textContent = slideSeconds + "s";
      speed.title = "Slideshow speed (click to change)";
      speed.style.cssText =
        "position:absolute;top:13px;right:80px;background:none;border:none;color:#fff;font-size:13px;cursor:pointer;opacity:0.6;z-index:30;";
      speed.onclick = cycleSlideSpeed;
      overlay.appendChild(speed);

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
        iframe.src = post.src;
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
      if (!postOrder.length) return alert("No posts found");

      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:#000;z-index:99999;";
      overlay.onclick = (e) => {
        if (e.target === overlay) destroy();
      };
      document.body.appendChild(overlay);
      document.addEventListener("keydown", handleKey);
      document.addEventListener("wheel", handleWheel, { passive: false });
      show(findVisiblePostIndex());
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
    btn.title = "Fullscreen viewer (↑↓ posts, ←→ gallery, Space slideshow)";
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
			display: block;
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
			overflow: hidden;
			text-overflow: ellipsis;
			background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
			opacity: 0;
			transition: opacity 0.15s;
			pointer-events: none;
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

    // Subreddit + author links shown along the bottom of a compact tile
    function addPostMeta(post) {
      if (post.querySelector(":scope > .grid-post-meta")) return;
      const subreddit = post.getAttribute("subreddit-prefixed-name");
      const author = post.getAttribute("author");
      const links = [];
      if (subreddit)
        links.push([subreddit.replace(/^u_/, "u/"), profileOrSubredditHref(subreddit)]);
      // (a profile post's "subreddit" is the author, so don't list them twice)
      if (author && author !== "[deleted]" && subreddit !== `u_${author}`)
        links.push([`u/${author}`, `/user/${author}/submitted/`]);
      if (!links.length) return;
      const meta = document.createElement("div");
      meta.className = "grid-post-meta";
      links.forEach(([label, href], i) => {
        if (i) meta.append("  ·  ");
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.textContent = label;
        // Keep the click from also opening the post underneath
        a.onclick = (e) => e.stopPropagation();
        meta.appendChild(a);
      });
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
          const img = gallery.querySelector('li img:not([role="presentation"])');
          const ratio = img?.getAttribute("height") / img?.getAttribute("width");
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
  // INIT ALL
  // ==========================================
  function init() {
    initRedgifsFix();
    initSidebarClose();
    initFullscreenViewer();
    initUserLinkRewrite();
    initGridToggle();
    initHidePromoted();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
