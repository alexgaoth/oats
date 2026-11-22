// Browser regression. Open /demo.html?panel=true&profile=empty&end=hold&view=calm
// (the plain view: the details are the default) on the demo harness at
// 880x680. Import this module through Vite's /@fs/ with its absolute file
// path, then await checkCleanQuestionList().
// Give the renderer controlled cards. The AMI replay tests the upstream
// detection separately. Use only the demo page and close it after this test.

const settle = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

export async function checkCleanQuestionList() {
  check(Boolean(window.oatsDemo), "Requires the demo browser harness");
  const storeUrl = performance
    .getEntriesByType("resource")
    .find(({ name }) => name.includes("/stores/meetingRecordingStore.ts"))?.name;
  check(Boolean(storeUrl), "The recording store must have loaded");
  const { useMeetingRecordingStore: store } = await import(/* @vite-ignore */ storeUrl);
  // Start through the real UI and store, but with no other turns arriving.
  window.electronAPI.meetingTranscriptionStart = async () => ({ success: true });
  await window.electronAPI.requestToggleConversation();
  const column = () => document.querySelector(".oats-record-column");
  for (let i = 0; i < 90 && !column(); i++) await settle();
  check(column()?.innerText.includes("No questions yet."), "Clean must start with the empty line");

  const announce = () => column().querySelector('[aria-live="polite"][aria-relevant="additions"]');
  const region = announce();
  check(region && !region.textContent, "The empty live region must mount before the first card");
  const additions = [];
  const observer = new MutationObserver((records) => {
    for (const { addedNodes } of records)
      for (const node of addedNodes) additions.push(node.textContent);
  });
  observer.observe(region, { childList: true });
  try {
    const card = (id, track = true) => ({
      id: String(id),
      question: `Which test part is number ${id}?`,
      state: "asked",
      groupKey: String(id),
      occurrence: 1,
      searched: false,
      suggestionId: null,
      createdAt: Date.now() + id,
      track,
    });
    const cards = Array.from({ length: 20 }, (_, index) => card(index));
    store.setState({ questionCards: cards });
    await settle();
    await settle();
    check(additions.length === cards.length, "A batch must announce every card");

    const scroller = column().querySelector('[role="region"][tabindex="0"]');
    check(scroller.scrollHeight > scroller.clientHeight + 100, "The questions must overflow");
    scroller.scrollTop = 42;
    scroller.focus({ preventScroll: true });
    await settle();
    const fresh = card(20);
    const filtered = card(21, false);
    // One verdict moves an early row while two new questions arrive.
    const next = [{ ...cards[0], state: "answered" }, ...cards.slice(1), fresh, filtered];
    store.setState({ questionCards: next });
    await settle();
    await settle();
    check(document.activeElement === scroller, "A question must not move focus");
    check(scroller.scrollTop === 42, "A question must not move a reader who scrolled up");
    check(!scroller.textContent.includes(filtered.question), "Clean must hide an ineligible card");
    check(
      additions.slice(cards.length).join("\n") ===
        `New question: ${fresh.question}\nNew question: ${filtered.question}`,
      "Each arrival must announce once, without repeating the question that changed state"
    );
    const show = [...column().querySelectorAll("button")].find(
      (button) => button.textContent === "Expand details"
    );
    show.click();
    await settle();
    const questions = [...column().querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "Questions"
    );
    questions.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await settle();
    check(
      column().querySelector('[role="tabpanel"]')?.textContent.includes(filtered.question),
      "Words must keep ineligible cards"
    );
    check(
      announce() === region && additions.length === next.length,
      "Words must not repeat announcements"
    );
  } finally {
    observer.disconnect();
  }
}
