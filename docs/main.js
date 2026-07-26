// Reveals bij het scrollen, glas op de navigatiebalk, en de videoknop.

const reveals = document.querySelectorAll(".reveal");

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("is-in"));
}

const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 24);
onScroll();
addEventListener("scroll", onScroll, { passive: true });

// De video heeft geluid, dus hij start pas op een klik. Daarna neemt de
// browser het over met de eigen bediening.
const video = document.getElementById("promo");
const playBtn = document.getElementById("playBtn");

playBtn.addEventListener("click", () => {
  video.controls = true;
  playBtn.classList.add("is-hidden");
  video.play();
});

video.addEventListener("pause", () => {
  if (video.currentTime === 0 || video.ended) playBtn.classList.remove("is-hidden");
});
