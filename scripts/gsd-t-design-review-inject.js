/**
 * GSD-T Design Review — Inject Script
 * Runs inside the proxied app page (iframe). Provides:
 * - Hover highlight overlay
 * - Click to lock element selection
 * - Sends computed styles to parent review UI via postMessage
 * - Receives style changes from parent and applies them live
 */
(function () {
  "use strict";
  if (window.__gsdtReviewInjected) return;
  window.__gsdtReviewInjected = true;

  let active = false;
  let locked = false;
  let lockedEl = null;
  let currentEl = null;

  // ── Overlay elements ────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "__gsdt-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "999998",
    border: "2px solid #3b82f6",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    transition: "all 0.1s ease",
    display: "none",
  });
  document.body.appendChild(overlay);

  const label = document.createElement("div");
  label.id = "__gsdt-label";
  Object.assign(label.style, {
    position: "fixed",
    zIndex: "999999",
    pointerEvents: "none",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    fontSize: "11px",
    fontFamily: "monospace",
    padding: "2px 6px",
    borderRadius: "3px",
    whiteSpace: "nowrap",
    display: "none",
  });
  document.body.appendChild(label);

  // ── Margin/padding guides ───────────────────────────────────────
  const marginOverlay = document.createElement("div");
  marginOverlay.id = "__gsdt-margin";
  Object.assign(marginOverlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "999997",
    border: "1px dashed #f97316",
    backgroundColor: "rgba(249, 115, 22, 0.06)",
    display: "none",
  });
  document.body.appendChild(marginOverlay);

  const paddingOverlay = document.createElement("div");
  paddingOverlay.id = "__gsdt-padding";
  Object.assign(paddingOverlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "999997",
    border: "1px dashed #22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    display: "none",
  });
  document.body.appendChild(paddingOverlay);

  // ── Zone highlight flash ────────────────────────────────────────
  const zoneContainer = document.createElement("div");
  zoneContainer.id = "__gsdt-zone-container";
  Object.assign(zoneContainer.style, {
    position: "fixed",
    top: "0", left: "0",
    width: "100%", height: "100%",
    pointerEvents: "none",
    zIndex: "999999",
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(zoneContainer);

  let zoneFlashTimer = null;

  function clearFlash() {
    zoneContainer.innerHTML = "";
    zoneContainer.style.opacity = "1";
  }

  function scheduleFlashFade() {
    clearTimeout(zoneFlashTimer);
    zoneFlashTimer = setTimeout(() => {
      zoneContainer.style.opacity = "0";
      setTimeout(clearFlash, 300);
    }, 1500);
  }

  function addFlashDiv(top, left, width, height, styles) {
    if (height < 1) height = 3;
    if (width < 1) width = 3;
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      top: top + "px", left: left + "px",
      width: width + "px", height: height + "px",
      pointerEvents: "none",
      boxSizing: "border-box",
      ...styles,
    });
    zoneContainer.appendChild(div);
    return div;
  }

  function flashZone(el, property) {
    if (!el) return;
    clearFlash();

    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const pt = parseFloat(s.paddingTop) || 0;
    const pr = parseFloat(s.paddingRight) || 0;
    const pb = parseFloat(s.paddingBottom) || 0;
    const pl = parseFloat(s.paddingLeft) || 0;
    const mt = parseFloat(s.marginTop) || 0;
    const mr = parseFloat(s.marginRight) || 0;
    const mb = parseFloat(s.marginBottom) || 0;
    const ml = parseFloat(s.marginLeft) || 0;

    // Content box coordinates
    const cx = rect.left + pl, cy = rect.top + pt;
    const cw = rect.width - pl - pr, ch = rect.height - pt - pb;

    // ── Margin zones (orange) ──
    if (property === "marginTop") {
      addFlashDiv(rect.top - mt, rect.left, rect.width, mt, { backgroundColor: "rgba(249, 115, 22, 0.5)" });
    } else if (property === "marginBottom") {
      addFlashDiv(rect.bottom, rect.left, rect.width, mb, { backgroundColor: "rgba(249, 115, 22, 0.5)" });
    } else if (property === "marginLeft") {
      addFlashDiv(rect.top, rect.left - ml, ml, rect.height, { backgroundColor: "rgba(249, 115, 22, 0.5)" });
    } else if (property === "marginRight") {
      addFlashDiv(rect.top, rect.right, mr, rect.height, { backgroundColor: "rgba(249, 115, 22, 0.5)" });

    // ── Padding zones (green) ──
    } else if (property === "paddingTop") {
      addFlashDiv(rect.top, rect.left, rect.width, pt, { backgroundColor: "rgba(34, 197, 94, 0.5)" });
    } else if (property === "paddingBottom") {
      addFlashDiv(rect.bottom - pb, rect.left, rect.width, pb, { backgroundColor: "rgba(34, 197, 94, 0.5)" });
    } else if (property === "paddingLeft") {
      addFlashDiv(rect.top, rect.left, pl, rect.height, { backgroundColor: "rgba(34, 197, 94, 0.5)" });
    } else if (property === "paddingRight") {
      addFlashDiv(rect.top, rect.right - pr, pr, rect.height, { backgroundColor: "rgba(34, 197, 94, 0.5)" });

    // ── Height: horizontal edge lines + light fill ──
    } else if (property === "height") {
      // Light fill for content area
      addFlashDiv(cy, cx, cw, ch, { backgroundColor: "rgba(59, 130, 246, 0.15)" });
      // Top edge — bright blue line
      addFlashDiv(cy, cx - 20, cw + 40, 2, { backgroundColor: "#3b82f6" });
      // Bottom edge — bright blue line
      addFlashDiv(cy + ch - 2, cx - 20, cw + 40, 2, { backgroundColor: "#3b82f6" });
      // Dimension label
      const lbl = addFlashDiv(cy + ch / 2 - 9, cx + cw + 6, 50, 18, {
        backgroundColor: "#1e293b", borderRadius: "3px",
        fontSize: "10px", color: "#3b82f6", fontFamily: "monospace",
        fontWeight: "600", textAlign: "center", lineHeight: "18px",
      });
      lbl.textContent = Math.round(ch) + "px";

    // ── Width: vertical edge lines + light fill ──
    } else if (property === "width") {
      addFlashDiv(cy, cx, cw, ch, { backgroundColor: "rgba(59, 130, 246, 0.15)" });
      // Left edge
      addFlashDiv(cy - 20, cx, 2, ch + 40, { backgroundColor: "#3b82f6" });
      // Right edge
      addFlashDiv(cy - 20, cx + cw - 2, 2, ch + 40, { backgroundColor: "#3b82f6" });
      // Dimension label
      const lbl = addFlashDiv(cy - 18, cx + cw / 2 - 20, 50, 16, {
        backgroundColor: "#1e293b", borderRadius: "3px",
        fontSize: "10px", color: "#3b82f6", fontFamily: "monospace",
        fontWeight: "600", textAlign: "center", lineHeight: "16px",
      });
      lbl.textContent = Math.round(cw) + "px";

    // ── lineHeight: amber horizontal lines at each text line ──
    } else if (property === "lineHeight") {
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
      const lines = Math.max(1, Math.round(ch / lh));
      for (let i = 0; i <= lines; i++) {
        const y = cy + i * lh;
        if (y > cy + ch + 1) break;
        addFlashDiv(y, cx - 10, cw + 20, 2, {
          backgroundColor: i === 0 || i === lines ? "#f59e0b" : "rgba(245, 158, 11, 0.5)",
        });
      }
      // Fill between first two lines to show one line-height unit
      if (lines >= 1) {
        addFlashDiv(cy, cx, cw, Math.min(lh, ch), { backgroundColor: "rgba(245, 158, 11, 0.15)" });
        const lbl = addFlashDiv(cy + 2, cx + cw + 6, 50, 16, {
          backgroundColor: "#1e293b", borderRadius: "3px",
          fontSize: "10px", color: "#f59e0b", fontFamily: "monospace",
          fontWeight: "600", textAlign: "center", lineHeight: "16px",
        });
        lbl.textContent = Math.round(lh) + "px";
      }

    // ── fontSize: cyan underline beneath text ──
    } else if (property === "fontSize") {
      const fs = parseFloat(s.fontSize) || 14;
      // Highlight text area with cyan
      addFlashDiv(cy, cx, cw, ch, { backgroundColor: "rgba(6, 182, 212, 0.15)" });
      // Underline at text baseline
      addFlashDiv(cy + ch - 2, cx, cw, 2, { backgroundColor: "#06b6d4" });
      const lbl = addFlashDiv(cy - 16, cx, 40, 14, {
        backgroundColor: "#1e293b", borderRadius: "3px",
        fontSize: "10px", color: "#06b6d4", fontFamily: "monospace",
        fontWeight: "600", textAlign: "center", lineHeight: "14px",
      });
      lbl.textContent = Math.round(fs) + "px";

    // ── fontWeight / fontFamily / letterSpacing: highlight text with cyan outline ──
    } else if (property === "fontWeight" || property === "fontFamily" || property === "letterSpacing") {
      addFlashDiv(cy, cx, cw, ch, {
        border: "2px solid #06b6d4",
        backgroundColor: "rgba(6, 182, 212, 0.1)",
        borderRadius: "2px",
      });

    // ── textAlign: arrow showing alignment direction ──
    } else if (property === "textAlign") {
      const align = s.textAlign;
      let arrowX = cx;
      if (align === "center") arrowX = cx + cw / 2 - 15;
      else if (align === "right" || align === "end") arrowX = cx + cw - 35;
      // Arrow indicator
      addFlashDiv(cy + ch / 2 - 1, cx, cw, 2, { backgroundColor: "rgba(6, 182, 212, 0.4)" });
      const arrow = addFlashDiv(cy + ch / 2 - 9, arrowX, 30, 18, {
        backgroundColor: "#06b6d4", borderRadius: "3px",
        fontSize: "10px", color: "#fff", fontFamily: "monospace",
        fontWeight: "700", textAlign: "center", lineHeight: "18px",
      });
      arrow.textContent = align === "center" ? "◆" : align === "right" || align === "end" ? "→▐" : "▐←";

    // ── color: colored border around text content ──
    } else if (property === "color") {
      addFlashDiv(cy, cx, cw, ch, {
        border: "2px solid " + s.color,
        backgroundColor: "transparent",
        borderRadius: "2px",
      });

    // ── gap: purple bars in the spaces between children ──
    } else if (property === "gap") {
      const gap = parseFloat(s.gap) || 0;
      const isCol = s.flexDirection === "column";
      const children = Array.from(el.children).filter(c => !["SCRIPT", "STYLE"].includes(c.tagName));
      for (let i = 0; i < children.length - 1; i++) {
        const a = children[i].getBoundingClientRect();
        const b = children[i + 1].getBoundingClientRect();
        if (isCol) {
          addFlashDiv(a.bottom, rect.left, rect.width, b.top - a.bottom, {
            backgroundColor: "rgba(168, 85, 247, 0.4)",
          });
        } else {
          addFlashDiv(rect.top, a.right, b.left - a.right, rect.height, {
            backgroundColor: "rgba(168, 85, 247, 0.4)",
          });
        }
      }
      if (gap > 0) {
        const lbl = addFlashDiv(rect.top - 16, rect.left, 40, 14, {
          backgroundColor: "#1e293b", borderRadius: "3px",
          fontSize: "10px", color: "#a855f7", fontFamily: "monospace",
          fontWeight: "600", textAlign: "center", lineHeight: "14px",
        });
        lbl.textContent = Math.round(gap) + "px";
      }

    // ── border / borderRadius: dashed outline ──
    } else if (property === "border" || property === "borderRadius") {
      addFlashDiv(rect.top, rect.left, rect.width, rect.height, {
        border: "2px dashed #eab308",
        backgroundColor: "transparent",
        borderRadius: property === "borderRadius" ? s.borderRadius : "0",
      });

    // ── backgroundColor: flash fill ──
    } else if (property === "backgroundColor") {
      addFlashDiv(rect.top, rect.left, rect.width, rect.height, {
        backgroundColor: "rgba(234, 179, 8, 0.25)",
        border: "2px solid rgba(234, 179, 8, 0.6)",
      });

    // ── boxShadow / opacity: subtle full-element glow ──
    } else if (property === "boxShadow" || property === "opacity") {
      addFlashDiv(rect.top - 4, rect.left - 4, rect.width + 8, rect.height + 8, {
        border: "2px solid rgba(168, 85, 247, 0.5)",
        backgroundColor: "rgba(168, 85, 247, 0.08)",
        borderRadius: "4px",
      });

    // ── display / flexDirection / alignItems / justifyContent: layout arrow ──
    } else if (property === "display" || property === "flexDirection" ||
               property === "alignItems" || property === "justifyContent" ||
               property === "gridTemplateColumns" || property === "gridTemplateRows") {
      addFlashDiv(rect.top, rect.left, rect.width, rect.height, {
        border: "2px solid rgba(168, 85, 247, 0.6)",
        backgroundColor: "rgba(168, 85, 247, 0.08)",
      });
      if (property === "flexDirection") {
        const isCol = s.flexDirection === "column";
        const arrow = addFlashDiv(
          isCol ? cy : cy + ch / 2 - 9,
          isCol ? cx + cw / 2 - 9 : cx,
          isCol ? 18 : cw,
          isCol ? ch : 18,
          {
            fontSize: "14px", color: "#a855f7", fontWeight: "700",
            textAlign: "center", lineHeight: isCol ? ch + "px" : "18px",
          }
        );
        arrow.textContent = isCol ? "↓" : "→";
      }

    // ── position / top / left / overflow: dotted outline ──
    } else if (property === "position" || property === "top" || property === "left" || property === "overflow") {
      addFlashDiv(rect.top, rect.left, rect.width, rect.height, {
        border: "2px dotted rgba(148, 163, 184, 0.6)",
        backgroundColor: "rgba(148, 163, 184, 0.08)",
      });

    // ── SVG attribute zones (prefixed with "svg:") ──
    } else if (property.startsWith("svg:")) {
      const attr = property.slice(4);
      if (attr === "stroke-width" || attr === "r" || attr === "rx" || attr === "ry") {
        // Dimension attribute — blue outline with measurement label
        addFlashDiv(rect.top - 2, rect.left - 2, rect.width + 4, rect.height + 4, {
          border: "2px solid #3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.15)",
          borderRadius: "50%",
        });
        const val = el.getAttribute(attr) || "";
        if (val) {
          const lbl = addFlashDiv(rect.top - 18, rect.left, Math.max(val.length * 8, 40), 16, {
            backgroundColor: "#1e293b", borderRadius: "3px",
            fontSize: "10px", color: "#3b82f6", fontFamily: "monospace",
            fontWeight: "600", textAlign: "center", lineHeight: "16px",
          });
          lbl.textContent = val;
        }
      } else if (attr === "stroke" || attr === "fill") {
        // Color attribute — colored border matching the value
        const color = el.getAttribute(attr) || getComputedStyle(el)[attr] || "#888";
        addFlashDiv(rect.top - 3, rect.left - 3, rect.width + 6, rect.height + 6, {
          border: "3px solid " + color,
          backgroundColor: "transparent",
          borderRadius: "2px",
        });
      } else if (attr === "stroke-dasharray" || attr === "stroke-dashoffset") {
        // Dash pattern — dashed outline
        addFlashDiv(rect.top - 2, rect.left - 2, rect.width + 4, rect.height + 4, {
          border: "2px dashed #f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          borderRadius: "2px",
        });
      } else {
        // Generic SVG attr — cyan outline
        addFlashDiv(rect.top - 2, rect.left - 2, rect.width + 4, rect.height + 4, {
          border: "2px solid #06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.1)",
          borderRadius: "2px",
        });
      }

    // ── Generic fallback — bright outline + pulse for any unhandled property ──
    } else {
      addFlashDiv(rect.top - 2, rect.left - 2, rect.width + 4, rect.height + 4, {
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        border: "2px solid rgba(59, 130, 246, 0.7)",
        borderRadius: "4px",
      });
      // Property value label
      const propVal = s.getPropertyValue(property.replace(/([A-Z])/g, "-$1").toLowerCase()) || s[property] || "";
      if (propVal && propVal.length < 30) {
        const lbl = addFlashDiv(rect.top - 20, rect.left, Math.max(propVal.length * 7, 50), 16, {
          backgroundColor: "#1e293b", borderRadius: "3px",
          fontSize: "10px", color: "#60a5fa", fontFamily: "monospace",
          fontWeight: "600", textAlign: "center", lineHeight: "16px",
          padding: "0 4px", whiteSpace: "nowrap",
        });
        lbl.textContent = propVal;
      }
    }

    scheduleFlashFade();
  }

  // ── Style extraction ────────────────────────────────────────────
  function getElementPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body) {
      let desc = cur.tagName.toLowerCase();
      if (cur.id) desc += `#${cur.id}`;
      else if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\s+/).slice(0, 3).join(".");
        if (cls) desc += `.${cls}`;
      }
      parts.unshift(desc);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function extractStyles(el) {
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      // Box model
      width: Math.round(rect.width) + "px",
      height: Math.round(rect.height) + "px",
      paddingTop: s.paddingTop,
      paddingRight: s.paddingRight,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      marginTop: s.marginTop,
      marginRight: s.marginRight,
      marginBottom: s.marginBottom,
      marginLeft: s.marginLeft,
      // Layout
      display: s.display,
      flexDirection: s.flexDirection,
      alignItems: s.alignItems,
      justifyContent: s.justifyContent,
      gap: s.gap,
      gridTemplateColumns: s.gridTemplateColumns,
      gridTemplateRows: s.gridTemplateRows,
      // Position
      position: s.position,
      top: s.top,
      left: s.left,
      // Visual
      backgroundColor: s.backgroundColor,
      color: s.color,
      borderRadius: s.borderRadius,
      border: s.border,
      boxShadow: s.boxShadow,
      // Typography
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      fontFamily: s.fontFamily,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textAlign: s.textAlign,
      // Overflow
      overflow: s.overflow,
      // Opacity
      opacity: s.opacity,
    };
  }

  // SVG attribute names to extract per element type
  const SVG_ATTRS = {
    svg: ["viewBox", "width", "height"],
    circle: ["cx", "cy", "r", "stroke", "stroke-width", "fill", "opacity", "stroke-dasharray", "stroke-dashoffset", "transform"],
    ellipse: ["cx", "cy", "rx", "ry", "stroke", "stroke-width", "fill", "opacity"],
    rect: ["x", "y", "width", "height", "rx", "ry", "stroke", "stroke-width", "fill", "opacity"],
    line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "opacity"],
    path: ["d", "stroke", "stroke-width", "fill", "opacity", "stroke-linecap", "stroke-linejoin", "transform"],
    text: ["x", "y", "font-size", "font-weight", "fill", "text-anchor", "dominant-baseline"],
    g: ["transform", "opacity", "fill", "stroke"],
    polyline: ["points", "stroke", "stroke-width", "fill"],
    polygon: ["points", "stroke", "stroke-width", "fill"],
  };

  function extractSvgAttrs(el) {
    const tag = el.tagName.toLowerCase();
    const attrNames = SVG_ATTRS[tag];
    if (!attrNames) return null;
    const attrs = {};
    let hasAny = false;
    for (const name of attrNames) {
      const val = el.getAttribute(name);
      if (val !== null && val !== undefined) {
        attrs[name] = val;
        hasAny = true;
      }
    }
    // Also grab computed stroke/fill from CSS if not in attributes
    if (el instanceof SVGElement) {
      const s = getComputedStyle(el);
      if (!attrs["stroke"] && s.stroke && s.stroke !== "none") { attrs["stroke"] = s.stroke; hasAny = true; }
      if (!attrs["fill"] && s.fill && s.fill !== "none") { attrs["fill"] = s.fill; hasAny = true; }
      if (!attrs["stroke-width"] && s.strokeWidth) { attrs["stroke-width"] = s.strokeWidth; hasAny = true; }
      if (!attrs["opacity"] && s.opacity !== "1") { attrs["opacity"] = s.opacity; hasAny = true; }
    }
    return hasAny ? attrs : null;
  }

  function extractBoxModel(el) {
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      content: { width: Math.round(rect.width), height: Math.round(rect.height) },
      padding: {
        top: parseFloat(s.paddingTop) || 0,
        right: parseFloat(s.paddingRight) || 0,
        bottom: parseFloat(s.paddingBottom) || 0,
        left: parseFloat(s.paddingLeft) || 0,
      },
      margin: {
        top: parseFloat(s.marginTop) || 0,
        right: parseFloat(s.marginRight) || 0,
        bottom: parseFloat(s.marginBottom) || 0,
        left: parseFloat(s.marginLeft) || 0,
      },
      border: {
        top: parseFloat(s.borderTopWidth) || 0,
        right: parseFloat(s.borderRightWidth) || 0,
        bottom: parseFloat(s.borderBottomWidth) || 0,
        left: parseFloat(s.borderLeftWidth) || 0,
      },
    };
  }

  // ── Overlay positioning ─────────────────────────────────────────
  function positionOverlay(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);

    // Main element overlay
    Object.assign(overlay.style, {
      display: "block",
      top: rect.top + "px",
      left: rect.left + "px",
      width: rect.width + "px",
      height: rect.height + "px",
    });

    // Label
    const tagName = el.tagName.toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 2).join(".");
    const dim = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
    label.textContent = `${tagName}${cls ? "." + cls : ""} — ${dim}`;
    Object.assign(label.style, {
      display: "block",
      top: Math.max(0, rect.top - 20) + "px",
      left: rect.left + "px",
    });

    // Margin overlay
    const mt = parseFloat(s.marginTop) || 0;
    const mr = parseFloat(s.marginRight) || 0;
    const mb = parseFloat(s.marginBottom) || 0;
    const ml = parseFloat(s.marginLeft) || 0;
    if (mt || mr || mb || ml) {
      Object.assign(marginOverlay.style, {
        display: "block",
        top: (rect.top - mt) + "px",
        left: (rect.left - ml) + "px",
        width: (rect.width + ml + mr) + "px",
        height: (rect.height + mt + mb) + "px",
      });
    } else {
      marginOverlay.style.display = "none";
    }

    // Padding overlay
    const pt = parseFloat(s.paddingTop) || 0;
    const pr = parseFloat(s.paddingRight) || 0;
    const pb = parseFloat(s.paddingBottom) || 0;
    const pl = parseFloat(s.paddingLeft) || 0;
    if (pt || pr || pb || pl) {
      Object.assign(paddingOverlay.style, {
        display: "block",
        top: (rect.top + pt) + "px",
        left: (rect.left + pl) + "px",
        width: (rect.width - pl - pr) + "px",
        height: (rect.height - pt - pb) + "px",
      });
    } else {
      paddingOverlay.style.display = "none";
    }
  }

  function hideOverlay() {
    overlay.style.display = "none";
    label.style.display = "none";
    marginOverlay.style.display = "none";
    paddingOverlay.style.display = "none";
  }

  // ── Reposition on scroll/resize/zoom ─────────────────────────────
  let rafPending = false;
  function refreshOverlay() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const el = locked ? lockedEl : currentEl;
      if (el) positionOverlay(el);
    });
  }

  window.addEventListener("scroll", refreshOverlay, { passive: true, capture: true });
  window.addEventListener("resize", refreshOverlay, { passive: true });
  document.addEventListener("scroll", refreshOverlay, { passive: true, capture: true });

  // ── Event handlers ──────────────────────────────────────────────
  function isOwnElement(el) {
    return el === overlay || el === label || el === marginOverlay || el === paddingOverlay;
  }

  document.addEventListener("mousemove", (e) => {
    if (!active || locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwnElement(el)) return;
    if (el === currentEl) return;
    currentEl = el;
    positionOverlay(el);
    // Send styles to parent
    window.parent.postMessage({
      type: "gsdt-hover",
      path: getElementPath(el),
      styles: extractStyles(el),
      boxModel: extractBoxModel(el),
      svgAttrs: extractSvgAttrs(el),
      tagName: el.tagName.toLowerCase(),
      className: typeof el.className === "string" ? el.className : "",
      textContent: (el.textContent || "").trim().substring(0, 100),
      childCount: el.children.length,
    }, "*");
  }, { passive: true });

  document.addEventListener("click", (e) => {
    if (!active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwnElement(el)) return;

    e.preventDefault();
    e.stopPropagation();

    if (locked && lockedEl === el) {
      // Unlock
      locked = false;
      lockedEl = null;
      overlay.style.borderColor = "#3b82f6";
      overlay.style.backgroundColor = "rgba(59, 130, 246, 0.08)";
      return;
    }

    // Lock to this element
    locked = true;
    lockedEl = el;
    currentEl = el;
    overlay.style.borderColor = "#ef4444";
    overlay.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
    positionOverlay(el);

    window.parent.postMessage({
      type: "gsdt-select",
      path: getElementPath(el),
      styles: extractStyles(el),
      boxModel: extractBoxModel(el),
      svgAttrs: extractSvgAttrs(el),
      tagName: el.tagName.toLowerCase(),
      className: typeof el.className === "string" ? el.className : "",
      textContent: (el.textContent || "").trim().substring(0, 100),
      childCount: el.children.length,
    }, "*");
  }, { capture: true });

  // Keyboard: Escape to unlock, Ctrl+Shift+I to toggle
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && locked) {
      locked = false;
      lockedEl = null;
      overlay.style.borderColor = "#3b82f6";
      overlay.style.backgroundColor = "rgba(59, 130, 246, 0.08)";
    }
  });

  // ── Messages from parent ────────────────────────────────────────
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "gsdt-activate":
        active = true;
        document.body.style.cursor = "crosshair";
        break;

      case "gsdt-deactivate":
        active = false;
        locked = false;
        lockedEl = null;
        currentEl = null;
        document.body.style.cursor = "";
        hideOverlay();
        break;

      case "gsdt-set-style":
        // Apply a style change to the locked element (+ smart propagation)
        if (lockedEl && msg.property && msg.value !== undefined) {
          const cssName = msg.property.replace(/([A-Z])/g, "-$1").toLowerCase();
          const propagate = msg.propagate !== false; // default true
          let propagatedCount = 0;

          // Apply to primary element
          lockedEl.style.setProperty(cssName, msg.value, "important");

          // Typography props cascade to descendants
          const inheritProps = new Set(["font-size", "font-weight", "font-family", "line-height",
            "letter-spacing", "text-align", "color"]);
          if (inheritProps.has(cssName)) {
            for (const child of lockedEl.querySelectorAll("*")) {
              child.style.setProperty(cssName, msg.value, "important");
            }
          }

          // Smart propagation for table and flex elements
          if (propagate) {
            const tag = lockedEl.tagName.toLowerCase();
            const parent = lockedEl.parentElement;

            // Column-scoped props: apply to same column position across all rows
            const columnProps = new Set(["text-align", "width", "min-width", "max-width"]);
            // Row-scoped props: apply to the tr (or all trs), not individual cells
            const rowProps = new Set(["height", "min-height", "max-height"]);

            if (tag === "td" || tag === "th") {
              const section = lockedEl.closest("tbody") || lockedEl.closest("thead") || lockedEl.closest("tfoot");
              const row = lockedEl.closest("tr");

              if (columnProps.has(cssName) && section && row) {
                // Column-scoped: find this cell's column index, apply to same column in all rows
                const colIdx = Array.from(row.children).indexOf(lockedEl);
                const rows = section.querySelectorAll("tr");
                for (const r of rows) {
                  const cell = r.children[colIdx];
                  if (!cell || cell === lockedEl) continue;
                  cell.style.setProperty(cssName, msg.value, "important");
                  if (inheritProps.has(cssName)) {
                    for (const child of cell.querySelectorAll("*")) {
                      child.style.setProperty(cssName, msg.value, "important");
                    }
                  }
                  propagatedCount++;
                }
              } else if (rowProps.has(cssName) && section) {
                // Row-scoped: set on the parent tr, propagate to all trs in section
                if (row) {
                  row.style.setProperty(cssName, msg.value, "important");
                }
                const rows = section.querySelectorAll("tr");
                for (const r of rows) {
                  if (r === row) continue;
                  r.style.setProperty(cssName, msg.value, "important");
                  propagatedCount++;
                }
              } else if (section) {
                // Everything else (padding, font-size, color, etc.): all cells in section
                const cells = section.querySelectorAll(tag);
                for (const cell of cells) {
                  if (cell === lockedEl) continue;
                  cell.style.setProperty(cssName, msg.value, "important");
                  if (inheritProps.has(cssName)) {
                    for (const child of cell.querySelectorAll("*")) {
                      child.style.setProperty(cssName, msg.value, "important");
                    }
                  }
                  propagatedCount++;
                }
              }
            } else if (tag === "tr") {
              // Propagate to all rows in the same section (tbody, thead, or tfoot)
              const section = lockedEl.closest("tbody") || lockedEl.closest("thead") || lockedEl.closest("tfoot");
              if (section) {
                const rows = section.querySelectorAll("tr");
                for (const row of rows) {
                  if (row === lockedEl) continue;
                  row.style.setProperty(cssName, msg.value, "important");
                  propagatedCount++;
                }
              }
            } else if (tag === "div" && parent) {
              const elStyle = getComputedStyle(lockedEl);
              const parentStyle = getComputedStyle(parent);
              const layoutProps = new Set(["gap", "row-gap", "column-gap"]);

              // Props that propagate across sibling containers (all bar columns)
              const containerProps = new Set(["gap", "row-gap", "column-gap", "border-radius", "overflow"]);

              if (containerProps.has(cssName)) {
                const elDisplay = elStyle.display;
                if (elDisplay === "flex" || elDisplay === "inline-flex" || elDisplay === "grid") {
                  // Auto-set overflow:hidden when border-radius is applied to a container
                  if (cssName === "border-radius" && msg.value && msg.value !== "0px" && msg.value !== "0") {
                    lockedEl.style.setProperty("overflow", "hidden", "important");
                  }
                  for (const sib of parent.children) {
                    if (sib === lockedEl || sib.tagName !== "DIV") continue;
                    const sibStyle = getComputedStyle(sib);
                    if (sibStyle.display === elDisplay) {
                      sib.style.setProperty(cssName, msg.value, "important");
                      if (cssName === "border-radius" && msg.value && msg.value !== "0px" && msg.value !== "0") {
                        sib.style.setProperty("overflow", "hidden", "important");
                      }
                      propagatedCount++;
                    }
                  }
                }
              } else if ((parentStyle.display === "flex" || parentStyle.display === "inline-flex") &&
                  parent.classList.contains("overflow-hidden")) {
                // For bar segments: propagate to sibling divs in the same flex container
                for (const sib of parent.children) {
                  if (sib === lockedEl || sib.tagName !== "DIV") continue;
                  sib.style.setProperty(cssName, msg.value, "important");
                  propagatedCount++;
                }
              }
            }
          }

          // Determine propagation scope label
          let propagateScope = "";
          if (propagatedCount > 0) {
            const tag = lockedEl.tagName.toLowerCase();
            const columnProps = new Set(["text-align", "width", "min-width", "max-width"]);
            const rowProps = new Set(["height", "min-height", "max-height"]);
            const containerPropsLabel = new Set(["gap", "row-gap", "column-gap", "border-radius", "overflow"]);
            if ((tag === "td" || tag === "th") && columnProps.has(cssName)) {
              const row = lockedEl.closest("tr");
              const colIdx = row ? Array.from(row.children).indexOf(lockedEl) + 1 : 0;
              propagateScope = "Col " + colIdx;
            } else if ((tag === "td" || tag === "th") && rowProps.has(cssName)) {
              propagateScope = "all rows";
            } else if (tag === "tr") {
              propagateScope = "all rows";
            } else if (containerPropsLabel.has(cssName)) {
              propagateScope = "all columns";
            } else {
              propagateScope = "similar";
            }
          }

          positionOverlay(lockedEl);
          window.parent.postMessage({
            type: "gsdt-style-updated",
            path: getElementPath(lockedEl),
            property: msg.property,
            value: msg.value,
            styles: extractStyles(lockedEl),
            boxModel: extractBoxModel(lockedEl),
            svgAttrs: extractSvgAttrs(lockedEl),
            propagated: propagatedCount,
            propagateScope,
          }, "*");
        }
        break;

      case "gsdt-highlight-zone":
        if (lockedEl && msg.property) {
          flashZone(lockedEl, msg.property);
        }
        break;

      case "gsdt-reset-styles":
        // Reset all inline style overrides on the locked element and its children
        if (lockedEl) {
          lockedEl.style.cssText = "";
          for (const child of lockedEl.querySelectorAll("*")) {
            child.style.cssText = "";
          }
          positionOverlay(lockedEl);
          window.parent.postMessage({
            type: "gsdt-style-updated",
            path: getElementPath(lockedEl),
            styles: extractStyles(lockedEl),
            boxModel: extractBoxModel(lockedEl),
            svgAttrs: extractSvgAttrs(lockedEl),
          }, "*");
        }
        break;

      case "gsdt-scroll-to":
        // Scroll to a specific element by selector
        if (msg.selector) {
          const el = document.querySelector(msg.selector);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            // Auto-select it
            locked = true;
            lockedEl = el;
            currentEl = el;
            overlay.style.borderColor = "#ef4444";
            overlay.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
            positionOverlay(el);
            window.parent.postMessage({
              type: "gsdt-select",
              path: getElementPath(el),
              styles: extractStyles(el),
              boxModel: extractBoxModel(el),
              tagName: el.tagName.toLowerCase(),
              className: typeof el.className === "string" ? el.className : "",
              textContent: (el.textContent || "").trim().substring(0, 100),
              childCount: el.children.length,
            }, "*");
          }
        }
        break;

      case "gsdt-get-tree":
        // Return the DOM subtree of a component for the tree view
        if (msg.selector) {
          const root = document.querySelector(msg.selector);
          if (root) {
            // Store element references by key for select-by-key
            window.__gsdtTreeElements = new Map();
            let keyCounter = 0;

            function buildTree(el, depth) {
              // SVG subtrees get deeper traversal (arcs are nested)
              const isSvgSubtree = el instanceof SVGElement || el.closest("svg");
              if (depth > (isSvgSubtree ? 8 : 4)) return null;
              const tag = el.tagName.toLowerCase();
              const s = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const text = el.children.length === 0 ? (el.textContent || "").trim().substring(0, 40) : "";

              // Smart label with structural context
              let label = tag;
              if (tag === "table") {
                const cols = el.querySelector("tr") ? el.querySelector("tr").children.length : 0;
                const rows = el.querySelectorAll("tbody tr").length || el.querySelectorAll("tr").length;
                label = "table " + rows + "×" + cols;
              } else if (tag === "thead") {
                label = "header";
              } else if (tag === "tbody") {
                label = "body (" + el.querySelectorAll("tr").length + " rows)";
              } else if (tag === "tfoot") {
                label = "footer";
              } else if (tag === "tr") {
                const section = el.closest("tbody") || el.closest("thead") || el.closest("tfoot");
                const rows = section ? Array.from(section.querySelectorAll("tr")) : [];
                const rowIdx = rows.indexOf(el) + 1;
                const sectionName = section ? section.tagName.toLowerCase().replace("thead", "hdr").replace("tbody", "").replace("tfoot", "ftr") : "";
                label = (sectionName ? sectionName + " " : "") + "row " + rowIdx;
              } else if (tag === "th") {
                const row = el.closest("tr");
                const colIdx = row ? Array.from(row.children).indexOf(el) + 1 : 0;
                label = "Col " + colIdx;
                if (text && text.length < 15) label += ' "' + text + '"';
              } else if (tag === "td") {
                const row = el.closest("tr");
                const colIdx = row ? Array.from(row.children).indexOf(el) + 1 : 0;
                label = "Col " + colIdx;
                if (text && text.length < 15) label += ' "' + text + '"';
              } else if (tag === "svg") {
                const vb = el.getAttribute("viewBox");
                label = "svg" + (vb ? ` [${vb}]` : "");
              } else if (tag === "circle") {
                const stroke = el.getAttribute("stroke") || "";
                const fill = el.getAttribute("fill") || "";
                const color = stroke && stroke !== "none" ? stroke : fill && fill !== "none" ? fill : "";
                const r = el.getAttribute("r") || "";
                const sw = el.getAttribute("stroke-width") || "";
                label = "arc" + (color ? " " + color : "") + (sw ? " w:" + sw : "") + (r ? " r:" + r : "");
              } else if (tag === "path") {
                const stroke = el.getAttribute("stroke") || "";
                const fill = el.getAttribute("fill") || "";
                const color = stroke && stroke !== "none" ? stroke : fill && fill !== "none" ? fill : "";
                label = "path" + (color ? " " + color : "");
              } else if (s.display === "flex" || s.display === "inline-flex") {
                label = "flex " + (s.flexDirection === "column" ? "col" : "row");
              } else if (s.display === "grid") {
                label = "grid";
              }
              if (tag !== "th" && tag !== "td" && text && text.length < 20) label += ' "' + text + '"';

              const key = "n" + (keyCounter++);
              window.__gsdtTreeElements.set(key, el);

              const node = {
                tag, label, text,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                display: s.display,
                key,
                props: {},
              };

              // Add contextual props based on element type
              if (tag === "table" || tag === "thead" || tag === "tbody") {
                node.props.rows = el.querySelectorAll("tr").length;
              }
              if (tag === "tr") {
                node.props.cells = el.children.length;
                node.props.height = Math.round(rect.height) + "px";
              }
              if (tag === "th" || tag === "td") {
                node.props.width = Math.round(rect.width) + "px";
                node.props.textAlign = s.textAlign;
                node.props.padding = s.padding;
                node.props.fontSize = s.fontSize;
                node.props.fontWeight = s.fontWeight;
                if (tag === "th") node.props.background = s.backgroundColor;
              }
              if (tag === "circle" || tag === "ellipse") {
                node.props.stroke = el.getAttribute("stroke");
                node.props.strokeWidth = el.getAttribute("stroke-width");
                node.props.r = el.getAttribute("r");
                node.props.fill = el.getAttribute("fill");
                node.props.strokeDasharray = el.getAttribute("stroke-dasharray");
              } else if (tag === "path" || tag === "line" || tag === "rect") {
                node.props.stroke = el.getAttribute("stroke");
                node.props.strokeWidth = el.getAttribute("stroke-width");
                node.props.fill = el.getAttribute("fill");
              }
              if (s.display === "flex" || s.display === "inline-flex") {
                node.props.gap = s.gap;
                node.props.alignItems = s.alignItems;
                node.props.justifyContent = s.justifyContent;
              }
              if (s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)") {
                node.props.background = s.backgroundColor;
              }

              // Recurse into children (skip text-only nodes, limit count)
              const children = Array.from(el.children)
                .filter(c => !["SCRIPT", "STYLE"].includes(c.tagName))
                .slice(0, 20);
              if (children.length > 0) {
                node.children = children.map(c => buildTree(c, depth + 1)).filter(Boolean);
              }

              return node;
            }
            window.parent.postMessage({
              type: "gsdt-tree",
              tree: buildTree(root, 0),
              selector: msg.selector,
            }, "*");
          }
        }
        break;

      case "gsdt-select-by-key":
        // Select an element by its key from the tree element map
        if (msg.key && window.__gsdtTreeElements) {
          const el = window.__gsdtTreeElements.get(msg.key);
          if (!el) break;
          locked = true;
          lockedEl = el;
          currentEl = el;
          overlay.style.borderColor = "#ef4444";
          overlay.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          positionOverlay(el);
          window.parent.postMessage({
            type: "gsdt-select",
            path: getElementPath(el),
            styles: extractStyles(el),
            boxModel: extractBoxModel(el),
            svgAttrs: extractSvgAttrs(el),
            tagName: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className : "",
            textContent: (el.textContent || "").trim().substring(0, 100),
            childCount: el.children.length,
          }, "*");
        }
        break;

      case "gsdt-set-svg-attr":
        // Apply an SVG attribute change to the locked element
        if (lockedEl && msg.attribute && msg.value !== undefined) {
          lockedEl.setAttribute(msg.attribute, msg.value);
          positionOverlay(lockedEl);
          window.parent.postMessage({
            type: "gsdt-style-updated",
            path: getElementPath(lockedEl),
            property: "svg:" + msg.attribute,
            value: msg.value,
            styles: extractStyles(lockedEl),
            boxModel: extractBoxModel(lockedEl),
            svgAttrs: extractSvgAttrs(lockedEl),
          }, "*");
        }
        break;
    }
  });

  // Notify parent we're ready
  window.parent.postMessage({ type: "gsdt-inject-ready" }, "*");
})();
