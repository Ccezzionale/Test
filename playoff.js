document.addEventListener("DOMContentLoaded", () => {
  buildMobilePlayoff();
  initMobileAccordions();
});

function buildMobilePlayoff() {
  const mapping = [
    ["wildcard", ".round-wildcard .match-card"],
    ["quarter", ".round-quarter .match-card"],
    ["semi", ".round-semi .match-card"],
    ["final", ".round-final .match-card"]
  ];

  mapping.forEach(([round, selector]) => {
    const target = document.querySelector(`[data-mobile-round="${round}"]`);
    if (!target) return;

    const cards = [...document.querySelectorAll(selector)].map(card => {
      const clone = card.cloneNode(true);
      clone.removeAttribute("style");
      return clone;
    });

    target.innerHTML = "";
    cards.forEach(card => target.appendChild(card));
  });
}

function initMobileAccordions() {
  document.querySelectorAll(".mobile-round-title").forEach(button => {
    button.addEventListener("click", () => {
      const round = button.closest(".mobile-round");
      if (!round) return;
      round.classList.toggle("open");
    });
  });
}
