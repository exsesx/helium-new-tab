export function createSearchIcon(container) {
  const fallback = container.firstElementChild;
  let timer;
  let source = "";
  let image;
  let visibleImage;

  function showFallback() {
    const previous = visibleImage;
    visibleImage = null;

    if (previous) {
      previous.classList.remove("is-visible");
      setTimeout(() => previous.remove(), 180);
    }

    fallback.classList.remove("is-hidden");
  }

  return function showIcon(nextSource = "") {
    if (nextSource === source && (image || timer)) {
      return;
    }

    clearTimeout(timer);
    timer = undefined;

    if (image && image !== visibleImage) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }

    image = null;
    source = nextSource;
    showFallback();

    if (!source) {
      return;
    }

    timer = setTimeout(() => {
      timer = undefined;
      const nextImage = new Image();
      image = nextImage;
      nextImage.alt = "";
      // The manifest and preview server enforce COEP: credentialless for images.
      nextImage.referrerPolicy = "no-referrer";
      nextImage.onload = () => {
        if (image === nextImage) {
          visibleImage = nextImage;
          nextImage.className = "search-favicon is-visible";
          container.append(nextImage);
          fallback.classList.add("is-hidden");
        }
      };
      nextImage.onerror = () => {
        if (image === nextImage) {
          image = null;
          showFallback();
        }
      };
      nextImage.src = source;
    }, 150);
  };
}
