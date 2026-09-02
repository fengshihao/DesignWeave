  /* --- selection: 预览态拖选上报章节路径 + 引文 --- */
  function headingPathFromMarks(marks) {
    const stack = [];
    for (const mark of marks) {
      if (!mark.text || mark.level < 1 || mark.level > 6) continue;
      while (stack.length && stack[stack.length - 1].level >= mark.level) stack.pop();
      stack.push(mark);
    }
    return stack.map((m) => m.text);
  }

  function headingPathFromPreviewNode(root, node) {
    if (!root || !node) return [];
    const headings = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const marks = [];
    for (const heading of headings) {
      if (heading.contains(node) || heading === node) {
        marks.push({
          level: Number(heading.tagName[1]),
          text: (heading.textContent || "").replace(/\s+/g, " ").trim(),
        });
        break;
      }
      const pos = heading.compareDocumentPosition(node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        marks.push({
          level: Number(heading.tagName[1]),
          text: (heading.textContent || "").replace(/\s+/g, " ").trim(),
        });
      }
    }
    return headingPathFromMarks(marks);
  }

  function selectionInside(root, sel) {
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const node = sel.anchorNode;
    if (!node) return false;
    return root.contains(node);
  }

  function readPreviewFocus(root, sel) {
    if (!selectionInside(root, sel)) {
      return { headingPath: [], quote: "" };
    }
    const quote = String(sel.toString() || "").replace(/\s+/g, " ").trim();
    if (!quote) return { headingPath: [], quote: "" };
    return {
      headingPath: headingPathFromPreviewNode(root, sel.anchorNode),
      quote,
    };
  }

  function sameFocus(a, b) {
    if (!a || !b) return false;
    if (a.quote !== b.quote) return false;
    if (a.headingPath.length !== b.headingPath.length) return false;
    return a.headingPath.every((part, i) => part === b.headingPath[i]);
  }

  function closestPreviewHeading(root, node) {
    if (!root || !node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const heading = el && el.closest ? el.closest("h1, h2, h3, h4, h5, h6") : null;
    if (!heading || !root.contains(heading)) return null;
    return heading;
  }

  function sectionRange(root, heading) {
    const headings = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const startLevel = Number(heading.tagName[1]);
    let endHeading = null;
    let seen = false;
    for (const next of headings) {
      if (next === heading) {
        seen = true;
        continue;
      }
      if (!seen) continue;
      if (Number(next.tagName[1]) <= startLevel) {
        endHeading = next;
        break;
      }
    }
    const range = document.createRange();
    range.setStartBefore(heading);
    if (endHeading) range.setEndBefore(endHeading);
    else range.setEnd(root, root.childNodes.length);
    return range;
  }

  function selectHeadingSection(root, heading, mute) {
    const range = sectionRange(root, heading);
    const sel = window.getSelection();
    if (!sel) return null;
    mute();
    sel.removeAllRanges();
    sel.addRange(range);
    const quote = String(range.toString() || "").replace(/\s+/g, " ").trim();
    if (!quote) return null;
    return {
      headingPath: headingPathFromPreviewNode(root, heading),
      quote,
    };
  }

  function bindPreviewSelection(opts) {
    const listeners = [];
    let last = { headingPath: [], quote: "" };
    const empty = { headingPath: [], quote: "" };
    let press = null;
    let muteCollapsed = false;

    const emit = (next) => {
      if (sameFocus(last, next)) return;
      last = next;
      listeners.forEach((cb) => {
        try { cb(next); } catch (_) { /* ignore */ }
      });
    };

    const report = () => {
      if (!opts.isPreviewing()) {
        emit(empty);
        return;
      }
      const root = opts.getRoot();
      emit(readPreviewFocus(root, window.getSelection()));
    };

    const onMouseDown = (e) => {
      if (e.button !== 0 || !opts.isPreviewing()) {
        press = null;
        return;
      }
      press = {
        x: e.clientX,
        y: e.clientY,
        heading: closestPreviewHeading(opts.getRoot(), e.target),
      };
    };

    const onMouseUp = (e) => {
      const start = press;
      press = null;
      if (
        start &&
        start.heading &&
        Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 6
      ) {
        const root = opts.getRoot();
        if (root && opts.isPreviewing() && root.contains(start.heading)) {
          const focus = selectHeadingSection(root, start.heading, () => {
            muteCollapsed = true;
            queueMicrotask(() => {
              muteCollapsed = false;
            });
          });
          if (focus) {
            emit(focus);
            return;
          }
        }
      }
      report();
    };

    const onSelectionChange = () => {
      if (!opts.isPreviewing()) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !String(sel.toString() || "").trim()) {
        if (muteCollapsed) return;
        emit(empty);
        return;
      }
      report();
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);

    return {
      onSelection(cb) {
        if (typeof cb !== "function") return () => {};
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      clear() {
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) sel.removeAllRanges();
        } catch (_) { /* ignore */ }
        emit(empty);
      },
      report,
      dispose() {
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mouseup", onMouseUp);
        document.removeEventListener("selectionchange", onSelectionChange);
        listeners.length = 0;
      },
    };
  }
