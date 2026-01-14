export function observeResize(target, callback, options = {}) {
  const { delay = 120 } = options;
  const node = typeof target === "string" ? document.querySelector(target) : target;
  if (!node || typeof callback !== "function") return () => {};

  let frame = null;
  let timer = null;
  let lastWidth = null;
  let lastHeight = null;

  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callback();
      }, delay);
    });
  };

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
      }
      schedule();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }

  const onWindowResize = () => schedule();
  window.addEventListener("resize", onWindowResize);

  return () => {
    window.removeEventListener("resize", onWindowResize);
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
  };
}

export function getContainerSize(node, options = {}) {
  const {
    minW = 320,
    minH = 220,
    maxW = Number.POSITIVE_INFINITY,
    maxH = Number.POSITIVE_INFINITY
  } = options;

  if (!node || typeof node.getBoundingClientRect !== "function") {
    return {
      width: Math.max(0, minW),
      height: Math.max(0, minH)
    };
  }

  const rect = node.getBoundingClientRect();
  let width = Number.isFinite(rect.width) ? rect.width : 0;
  let height = Number.isFinite(rect.height) ? rect.height : 0;

  const safeMinW = width > 0 ? Math.min(minW, width) : minW;
  const safeMinH = height > 0 ? Math.min(minH, height) : minH;

  width = Math.max(safeMinW, Math.min(width, maxW));
  height = Math.max(safeMinH, Math.min(height, maxH));

  return { width, height };
}
