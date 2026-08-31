  /* --- svg-fit: SVG 尺寸、适配与画布 --- */
  function svgNaturalSize(svg) {
    const vb = svg?.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { width: vb.width, height: vb.height };
    }
    const rawW = svg?.getAttribute?.("width") || "";
    const rawH = svg?.getAttribute?.("height") || "";
    const w = parseFloat(rawW);
    const h = parseFloat(rawH);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && !/%/.test(rawW) && !/%/.test(rawH)) {
      return { width: w, height: h };
    }
    try {
      const box = svg.getBBox();
      if (box.width > 0 && box.height > 0) {
        return { width: box.width, height: box.height };
      }
    } catch (_) { /* ignore */ }
    const rect = svg.getBoundingClientRect();
    return {
      width: rect.width > 0 ? rect.width : 1,
      height: rect.height > 0 ? rect.height : 1,
    };
  }

  function ensureSvgViewBox(svg, natural) {
    if (!svg.getAttribute("viewBox") && natural.width > 0 && natural.height > 0) {
      svg.setAttribute("viewBox", `0 0 ${natural.width} ${natural.height}`);
    }
  }

  function storeSvgNaturalSize(svg, natural) {
    svg.dataset.molanNaturalW = String(natural.width);
    svg.dataset.molanNaturalH = String(natural.height);
  }

  function readSvgNaturalSize(svg) {
    const w = parseFloat(svg.dataset.molanNaturalW || "");
    const h = parseFloat(svg.dataset.molanNaturalH || "");
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      return { width: w, height: h };
    }
    return svgNaturalSize(svg);
  }

  function setSvgDisplaySize(svg, width, height) {
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.maxWidth = "none";
    svg.style.maxHeight = "none";
  }

  function computeSvgFitDisplay(natural, maxW, maxH, insetFactor = 0.94) {
    const nw = Math.max(1, natural.width);
    const nh = Math.max(1, natural.height);
    const fit = Math.min(maxW / nw, maxH / nh) * insetFactor;
    return {
      width: Math.max(1, nw * fit),
      height: Math.max(1, nh * fit),
    };
  }

  function fitSvgToBox(svg, boxWidth, boxHeight, inset = 40) {
    const natural = svgNaturalSize(svg);
    ensureSvgViewBox(svg, natural);
    storeSvgNaturalSize(svg, natural);
    const maxW = Math.max(80, boxWidth - inset * 2);
    const maxH = Math.max(80, boxHeight - inset * 2);
    const display = computeSvgFitDisplay(readSvgNaturalSize(svg), maxW, maxH);
    setSvgDisplaySize(svg, display.width, display.height);
    return display;
  }

  // 克隆进灯箱后若保留原文 id，url(#id) 会解析到文档里那份小图，看起来就一直发糊。
  function uniquifySvgIds(svg) {
    if (!svg) return svg;
    const suffix = `-molan-${Math.random().toString(36).slice(2, 9)}`;
    const mapped = new Map();
    const remember = (id) => {
      if (!id || mapped.has(id)) return;
      mapped.set(id, `${id}${suffix}`);
    };
    remember(svg.getAttribute("id"));
    svg.querySelectorAll("[id]").forEach((el) => remember(el.getAttribute("id")));
    if (!mapped.size) return svg;
    const keys = [...mapped.keys()].sort((a, b) => b.length - a.length);
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rewrite = (value) => {
      let next = String(value || "");
      if (!next) return next;
      for (const from of keys) {
        const to = mapped.get(from);
        if (next === from) {
          next = to;
          continue;
        }
        const id = escapeRegExp(from);
        next = next.replace(new RegExp(`url\\((['"]?)#${id}\\1\\)`, "g"), `url($1#${to}$1)`);
        next = next.replace(new RegExp(`#${id}(?![\\w.-])`, "g"), `#${to}`);
      }
      return next;
    };
    const apply = (el) => {
      const id = el.getAttribute("id");
      if (id && mapped.has(id)) el.setAttribute("id", mapped.get(id));
      const attrs = el.attributes;
      if (!attrs) return;
      for (let i = 0; i < attrs.length; i += 1) {
        const attr = attrs[i];
        if (attr.name === "id" || !attr.value || !attr.value.includes("#")) continue;
        const next = rewrite(attr.value);
        if (next !== attr.value) el.setAttribute(attr.name, next);
      }
    };
    apply(svg);
    svg.querySelectorAll("*").forEach(apply);
    svg.querySelectorAll("style").forEach((style) => {
      style.textContent = rewrite(style.textContent);
    });
    return svg;
  }

  function vectorizeSvgForeignObjects(svg) {
    if (!svg) return svg;
    const fos = Array.from(svg.querySelectorAll("foreignObject"));
    fos.forEach((fo) => replaceForeignObjectWithText(fo, fo));
    svg.querySelectorAll("foreignObject").forEach((el) => el.remove());
    return svg;
  }

  function whenFontsReady() {
    try {
      if (!document.fonts || !document.fonts.ready) return Promise.resolve();
      return Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (_) {
      return Promise.resolve();
    }
  }

  function afterLayout() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        resolve();
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function svgUserFromScreen(svg, dx, dy) {
    try {
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: dx, y: dy };
      return { x: dx / (ctm.a || 1), y: dy / (ctm.d || 1) };
    } catch (_) {
      return { x: dx, y: dy };
    }
  }

  function expandSvgRect(shape, extraW, extraH) {
    const x = parseFloat(shape.getAttribute("x") || 0);
    const y = parseFloat(shape.getAttribute("y") || 0);
    const w = parseFloat(shape.getAttribute("width") || 0);
    const h = parseFloat(shape.getAttribute("height") || 0);
    if (!(w > 0 && h > 0)) return;
    shape.setAttribute("x", String(x - extraW / 2));
    shape.setAttribute("y", String(y - extraH / 2));
    shape.setAttribute("width", String(w + extraW));
    shape.setAttribute("height", String(h + extraH));
  }

  function expandSvgPolygon(shape, extraW, extraH) {
    const pts = String(shape.getAttribute("points") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (pts.length < 6) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]);
      maxX = Math.max(maxX, pts[i]);
      minY = Math.min(minY, pts[i + 1]);
      maxY = Math.max(maxY, pts[i + 1]);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const sx = (bw + extraW) / bw;
    const sy = (bh + extraH) / bh;
    const next = [];
    for (let i = 0; i < pts.length; i += 2) {
      next.push(cx + (pts[i] - cx) * sx, cy + (pts[i + 1] - cy) * sy);
    }
    shape.setAttribute("points", next.join(" "));
  }

  function expandSvgCircle(shape, extraW, extraH) {
    const r = parseFloat(shape.getAttribute("r") || 0);
    if (!(r > 0)) return;
    shape.setAttribute("r", String(r + Math.max(extraW, extraH) / 2));
  }

  function expandSvgEllipse(shape, extraW, extraH) {
    const rx = parseFloat(shape.getAttribute("rx") || 0);
    const ry = parseFloat(shape.getAttribute("ry") || 0);
    if (!(rx > 0 && ry > 0)) return;
    shape.setAttribute("rx", String(rx + extraW / 2));
    shape.setAttribute("ry", String(ry + extraH / 2));
  }

  function expandForeignObjectBox(fo, extraW, extraH) {
    const x = parseFloat(fo.getAttribute("x") || 0) || 0;
    const y = parseFloat(fo.getAttribute("y") || 0) || 0;
    const w = parseFloat(fo.getAttribute("width") || 0) || 0;
    const h = parseFloat(fo.getAttribute("height") || 0) || 0;
    fo.setAttribute("x", String(x - extraW / 2));
    fo.setAttribute("y", String(y - extraH / 2));
    fo.setAttribute("width", String(Math.max(1, w + extraW)));
    fo.setAttribute("height", String(Math.max(1, h + extraH)));
  }

  function fitMermaidDiagramLabels(svg) {
    if (!svg) return svg;
    const pad = 6;
    svg.querySelectorAll("g.node, g.edgeLabel").forEach((node) => {
      const fo = node.querySelector("foreignObject");
      if (!fo) return;
      const label = fo.querySelector(".nodeLabel, .edgeLabel, .label, span, div, p") || fo;
      const shape = node.querySelector(":scope > rect, :scope > polygon, :scope > circle, :scope > ellipse");
      let box;
      try {
        box = (shape || fo).getBoundingClientRect();
      } catch (_) {
        return;
      }
      let labelBox;
      try {
        labelBox = label.getBoundingClientRect();
      } catch (_) {
        return;
      }
      if (!(box.width > 0) || !(labelBox.width > 0)) return;
      const extraScreenW = Math.max(0, labelBox.width + pad * 2 - box.width);
      const extraScreenH = Math.max(0, labelBox.height + pad * 2 - box.height);
      if (extraScreenW < 0.6 && extraScreenH < 0.6) return;
      const extra = svgUserFromScreen(svg, extraScreenW, extraScreenH);
      const extraW = extra.x;
      const extraH = extra.y;
      if (shape) {
        const tag = shape.tagName.toLowerCase();
        if (tag === "rect") expandSvgRect(shape, extraW, extraH);
        else if (tag === "polygon") expandSvgPolygon(shape, extraW, extraH);
        else if (tag === "circle") expandSvgCircle(shape, extraW, extraH);
        else if (tag === "ellipse") expandSvgEllipse(shape, extraW, extraH);
      }
      expandForeignObjectBox(fo, extraW, extraH);
    });
    return svg;
  }

  function syncMermaidSvgBox(svg) {
    if (!svg) return svg;
    try {
      const box = svg.getBBox();
      if (!(box.width > 0 && box.height > 0)) return svg;
      const pad = 4;
      const x = box.x - pad;
      const y = box.y - pad;
      const w = box.width + pad * 2;
      const h = box.height + pad * 2;
      svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      svg.setAttribute("width", String(Math.ceil(w)));
      svg.setAttribute("height", String(Math.ceil(h)));
    } catch (_) { /* ignore */ }
    return svg;
  }

  function finalizeMermaidSvg(svg) {
    if (!svg) return svg;
    if (!svg.querySelector("foreignObject")) return svg;
    const prevMax = svg.style.maxWidth;
    const prevWidth = svg.style.width;
    svg.style.maxWidth = "none";
    const attrW = svg.getAttribute("width") || "";
    if (attrW && !/%/.test(attrW)) svg.style.width = attrW;
    try {
      void svg.getBoundingClientRect();
      fitMermaidDiagramLabels(svg);
      vectorizeSvgForeignObjects(svg);
      syncMermaidSvgBox(svg);
    } finally {
      svg.style.maxWidth = prevMax;
      svg.style.width = prevWidth;
    }
    return svg;
  }

  function placeSvgCanvas(canvas, box, width, height, panX, panY) {
    if (!canvas || !box) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    canvas.style.inset = "auto";
    canvas.style.left = `${(box.width - w) / 2 + panX}px`;
    canvas.style.top = `${(box.height - h) / 2 + panY}px`;
    canvas.style.right = "auto";
    canvas.style.bottom = "auto";
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.transform = "none";
    canvas.style.willChange = "auto";
    canvas.style.padding = "0";
  }

  function resetSvgCanvas(canvas) {
    if (!canvas) return;
    canvas.style.inset = "";
    canvas.style.left = "";
    canvas.style.top = "";
    canvas.style.right = "";
    canvas.style.bottom = "";
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.transform = "none";
    canvas.style.willChange = "";
    canvas.style.padding = "";
  }
