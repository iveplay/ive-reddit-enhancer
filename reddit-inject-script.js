// Reddit Enhancements - Combined Script
// 1. RedGifs Embed Fix
// 2. Auto-close Left Sidebar
// 3. Fullscreen Post Viewer (click image to open)
(function () {
  "use strict";

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

    function fixEmbed(embedElement) {
      if (embedElement.hasAttribute("data-fixed")) return;
      const iframeHtml = embedElement.getAttribute("html");
      if (!iframeHtml?.includes("redgifs.com")) return;
      const match = iframeHtml.match(/redgifs\.com\/ifr\/([^"]+)/);
      if (!match) return;
      embedElement.setAttribute("data-fixed", "true");
      const wrapper = document.createElement("div");
      wrapper.className = "redgifs-wrapper";
      wrapper.style.cssText =
        "position:relative;width:100%;height:100%;aspect-ratio:1/1;";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.redgifs.com/ifr/${match[1]}`;
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
        iframe.src = iframe.src;
      };
      wrapper.appendChild(iframe);
      wrapper.appendChild(reloadBtn);
      const container =
        embedElement.closest("shreddit-aspect-ratio") ||
        embedElement.parentElement;
      if (container) {
        container.appendChild(wrapper);
        embedElement.style.display = "none";
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
    let mediaElements = [];
    let galleryIndex = 0;
    let currentGallerySrcs = null;
    let loadingMore = false;

    function getBestSrc(img) {
      const srcset = img.getAttribute("srcset");
      if (srcset) {
        const entries = srcset.split(",").map((s) => {
          const parts = s.trim().split(/\s+/);
          return { url: parts[0], width: parseInt(parts[1]) || 0 };
        });
        entries.sort((a, b) => b.width - a.width);
        if (entries[0]?.url) return entries[0].url;
      }
      if (
        img.src &&
        img.src !== "" &&
        !img.src.includes("data:") &&
        img.src !== window.location.href
      )
        return img.src;
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

    async function forceLoadCarousel(carousel) {
      const nextBtn = carousel.querySelector('[slot="nextButton"] button');
      const prevBtn = carousel.querySelector('[slot="prevButton"] button');
      if (!nextBtn) return;
      for (let i = 0; i < 20; i++) {
        nextBtn.click();
        await new Promise((r) => setTimeout(r, 150));
      }
      await new Promise((r) => setTimeout(r, 300));
      if (prevBtn) {
        for (let i = 0; i < 20; i++) {
          prevBtn.click();
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }

    function getPostMeta(article) {
      const sp = article.querySelector("shreddit-post");
      return {
        permalink: sp?.getAttribute("permalink") || "",
        author: sp?.getAttribute("author") || "",
        subreddit: sp?.getAttribute("subreddit-prefixed-name") || "",
      };
    }

    function extractPosts() {
      const articles = document.querySelectorAll("article[data-post-id]");
      const seen = new Set(mediaElements.map((m) => m.postId));
      let added = 0;

      articles.forEach((article) => {
        const postId = article.dataset.postId;
        if (seen.has(postId)) return;
        const shredditPost = article.querySelector("shreddit-post");
        const postType = shredditPost?.getAttribute("post-type");
        const meta = getPostMeta(article);

        if (postType === "gallery") {
          const carousel = article.querySelector("gallery-carousel");
          if (carousel) {
            const srcs = getGallerySrcs(carousel);
            if (srcs.length) {
              mediaElements.push({
                type: "gallery",
                srcs,
                postId,
                needsLoad: true,
                ...meta,
              });
              added++;
              return;
            }
          }
        }

        const redgifsIframe = article.querySelector(
          'iframe[src*="redgifs.com"]',
        );
        if (redgifsIframe) {
          mediaElements.push({
            type: "redgif",
            src: redgifsIframe.src,
            postId,
            ...meta,
          });
          added++;
          return;
        }

        const player = article.querySelector("shreddit-player");
        if (player) {
          const video = player.querySelector("video");
          if (video?.src) {
            mediaElements.push({
              type: "video",
              src: video.src,
              postId,
              ...meta,
            });
            added++;
            return;
          }
        }

        if (postType === "image") {
          const zoomImg = article.querySelector("zoomable-img img");
          if (zoomImg?.src) {
            const isGif = zoomImg.src.includes(".gif");
            mediaElements.push({
              type: isGif ? "gif" : "image",
              src: zoomImg.src,
              postId,
              ...meta,
            });
            added++;
            return;
          }
          const contentHref = shredditPost?.getAttribute("content-href");
          if (
            contentHref &&
            /\.(jpe?g|png|gif|webp)(\?|$)/i.test(contentHref)
          ) {
            const isGif = contentHref.includes(".gif");
            mediaElements.push({
              type: isGif ? "gif" : "image",
              src: contentHref,
              postId,
              ...meta,
            });
            added++;
            return;
          }
          const imgs = article.querySelectorAll("img");
          for (const img of imgs) {
            if (img.getAttribute("role") === "presentation") continue;
            if (img.closest("[avatar]") || img.closest("faceplate-hovercard"))
              continue;
            if (img.classList.contains("shreddit-subreddit-icon__icon"))
              continue;
            const src = getBestSrc(img);
            if (src) {
              const isGif = src.includes(".gif");
              mediaElements.push({
                type: isGif ? "gif" : "image",
                src,
                postId,
                ...meta,
              });
              added++;
              return;
            }
          }
        }

        if (postType === "link") {
          const contentHref = shredditPost?.getAttribute("content-href");
          if (
            contentHref &&
            /\.(jpe?g|png|gif|webp)(\?|$)/i.test(contentHref)
          ) {
            const isGif = contentHref.includes(".gif");
            mediaElements.push({
              type: isGif ? "gif" : "image",
              src: contentHref,
              postId,
              ...meta,
            });
            added++;
            return;
          }
          const imgs = article.querySelectorAll("img");
          for (const img of imgs) {
            if (img.getAttribute("role") === "presentation") continue;
            if (img.closest("[avatar]") || img.closest("faceplate-hovercard"))
              continue;
            const src = getBestSrc(img);
            if (src) {
              mediaElements.push({ type: "image", src, postId, ...meta });
              added++;
              return;
            }
          }
        }
      });
      return added;
    }

    async function loadMore() {
      if (loadingMore) return;
      loadingMore = true;
      const el = document.scrollingElement || document.documentElement;
      const prevCount = mediaElements.length;
      for (let i = 0; i < 3; i++) {
        el.scrollTop = el.scrollHeight;
        await new Promise((r) => setTimeout(r, 1200));
        extractPosts();
        if (mediaElements.length > prevCount) break;
      }
      updatePostCounter();
      loadingMore = false;
    }

    function updatePostCounter() {
      if (!overlay) return;
      const c = document.getElementById("fs-post-counter");
      if (c) c.textContent = `${currentIndex + 1} / ${mediaElements.length}`;
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

    async function show(index) {
      currentIndex = index;
      galleryIndex = 0;
      currentGallerySrcs = null;
      const post = mediaElements[currentIndex];
      overlay.innerHTML = "";

      const loading = document.createElement("div");
      loading.textContent = "⏳";
      loading.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;";
      overlay.appendChild(loading);

      if (post.type === "gallery" && post.needsLoad) {
        const article = document.querySelector(
          `article[data-post-id="${post.postId}"]`,
        );
        if (article) {
          const carousel = article.querySelector("gallery-carousel");
          if (carousel) {
            await forceLoadCarousel(carousel);
            const newSrcs = getGallerySrcs(carousel);
            if (newSrcs.length > post.srcs.length) post.srcs = newSrcs;
            post.needsLoad = false;
          }
        }
      }

      overlay.innerHTML = "";

      const counter = document.createElement("div");
      counter.id = "fs-post-counter";
      counter.textContent = `${currentIndex + 1} / ${mediaElements.length}`;
      counter.style.cssText =
        "position:absolute;bottom:44px;left:12px;color:#fff;font-size:12px;opacity:0.5;pointer-events:none;z-index:20;";
      overlay.appendChild(counter);

      const close = document.createElement("button");
      close.textContent = "✕";
      close.style.cssText =
        "position:absolute;top:8px;right:12px;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;opacity:0.6;z-index:30;";
      close.onclick = destroy;
      overlay.appendChild(close);

      const bar = document.createElement("div");
      bar.style.cssText =
        "position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:24px;padding:12px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.8));z-index:20;pointer-events:auto;";
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
          "max-width:100vw;max-height:100%;object-fit:contain;";
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
      } else if (post.type === "video") {
        const video = document.createElement("video");
        video.src = post.src;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.style.cssText =
          "position:absolute;inset:0;margin:auto;max-width:100vw;max-height:calc(100vh - 44px);object-fit:contain;";
        overlay.appendChild(video);
      }

      const article = document.querySelector(
        `article[data-post-id="${post.postId}"]`,
      );
      if (article)
        article.scrollIntoView({ behavior: "instant", block: "center" });
      if (currentIndex >= mediaElements.length - 3) loadMore();
    }

    function moveGallery(dir) {
      if (!currentGallerySrcs) return;
      const n = galleryIndex + dir;
      if (n < 0 || n >= currentGallerySrcs.length) return;
      galleryIndex = n;
      updateGallery();
    }

    function updateGallery() {
      if (!currentGallerySrcs) return;
      const img = document.getElementById("fs-gallery-img");
      const counter = document.getElementById("fs-gallery-counter");
      const prev = document.getElementById("fs-gallery-prev");
      const next = document.getElementById("fs-gallery-next");
      if (!img) return;
      img.src = currentGallerySrcs[galleryIndex];
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
        if (currentIndex > 0) show(currentIndex - 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentIndex < mediaElements.length - 1) show(currentIndex + 1);
        return;
      }
      if (e.key === "Escape") destroy();
    }

    const fsObserver = new MutationObserver(() => {
      if (overlay) {
        const before = mediaElements.length;
        extractPosts();
        if (mediaElements.length > before) updatePostCounter();
      }
    });

    function destroy() {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      currentGallerySrcs = null;
      fsObserver.disconnect();
      document.removeEventListener("keydown", handleKey);
    }

    function openAtPost(postId) {
      mediaElements = [];
      extractPosts();
      if (!mediaElements.length) return;
      const idx = mediaElements.findIndex((m) => m.postId === postId);
      if (idx === -1) return;

      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:#000;z-index:99999;";
      overlay.onclick = (e) => {
        if (e.target === overlay) destroy();
      };
      document.body.appendChild(overlay);
      document.addEventListener("keydown", handleKey);
      const feed = document.querySelector("shreddit-feed");
      if (feed) fsObserver.observe(feed, { childList: true, subtree: true });
      show(idx);
    }

    function open() {
      mediaElements = [];
      extractPosts();
      if (!mediaElements.length) return alert("No posts found");

      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:#000;z-index:99999;";
      overlay.onclick = (e) => {
        if (e.target === overlay) destroy();
      };
      document.body.appendChild(overlay);
      document.addEventListener("keydown", handleKey);
      const feed = document.querySelector("shreddit-feed");
      if (feed) fsObserver.observe(feed, { childList: true, subtree: true });
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
        const idx = mediaElements.findIndex((m) => m.postId === closestId);
        if (idx !== -1) return idx;
      }
      return 0;
    }

    // Click-to-open: intercept clicks on media in posts
    document.addEventListener(
      "click",
      function (e) {
        if (overlay) return; // already open

        const article = e.target.closest("article[data-post-id]");
        if (!article) return;

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

        if (!clickedMedia) return;

        e.preventDefault();
        e.stopPropagation();
        openAtPost(article.dataset.postId);
      },
      true,
    );

    // Keep the FAB button too
    const btn = document.createElement("button");
    btn.textContent = "⛶";
    btn.title = "Fullscreen viewer (↑↓ posts, ←→ gallery)";
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
    let isGrid = false;

    const style = document.createElement("style");
    style.id = "grid-view-style";
    style.textContent = `
		shreddit-feed.grid-view {
			display: grid !important;
			grid-template-columns: repeat(3, 1fr) !important;
			gap: 8px !important;
		}
		shreddit-feed.grid-view > hr,
		shreddit-feed.grid-view > faceplate-loader,
		shreddit-feed.grid-view > faceplate-partial {
			display: none !important;
		}
		shreddit-feed.grid-view > article {
			overflow: hidden;
		}
		shreddit-feed.grid-view shreddit-post {
			padding: 4px !important;
		}
	`;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="0" y="0" width="5" height="5"/><rect x="6.5" y="0" width="5" height="5"/><rect x="13" y="0" width="5" height="5"/><rect x="0" y="6.5" width="5" height="5"/><rect x="6.5" y="6.5" width="5" height="5"/><rect x="13" y="6.5" width="5" height="5"/><rect x="0" y="13" width="5" height="5"/><rect x="6.5" y="13" width="5" height="5"/><rect x="13" y="13" width="5" height="5"/></svg>';
    btn.title = "Toggle 3-column grid";
    btn.style.cssText =
      "position:fixed;bottom:20px;right:74px;z-index:9999;width:44px;height:44px;border-radius:50%;border:none;background:#ff4500;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;";

    const gridIcon =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="0" y="0" width="5" height="5"/><rect x="6.5" y="0" width="5" height="5"/><rect x="13" y="0" width="5" height="5"/><rect x="0" y="6.5" width="5" height="5"/><rect x="6.5" y="6.5" width="5" height="5"/><rect x="13" y="6.5" width="5" height="5"/><rect x="0" y="13" width="5" height="5"/><rect x="6.5" y="13" width="5" height="5"/><rect x="13" y="13" width="5" height="5"/></svg>';
    const listIcon =
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="0" y="1" width="18" height="3" rx="1"/><rect x="0" y="7.5" width="18" height="3" rx="1"/><rect x="0" y="14" width="18" height="3" rx="1"/></svg>';

    btn.onclick = () => {
      const feed = document.querySelector("shreddit-feed");
      if (!feed) return;
      isGrid = !isGrid;
      feed.classList.toggle("grid-view", isGrid);
      btn.innerHTML = isGrid ? listIcon : gridIcon;
      btn.title = isGrid ? "Switch to single column" : "Toggle 3-column grid";
    };

    document.body.appendChild(btn);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
