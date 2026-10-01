// The palette fetching pipeline. Every control change funnels through
// update(); the response is applied to the store and the active pane is
// redrawn. The request-supersession token is shared with the reset flow in
// app.js so a slow response can never paint over a newer state.

import { store } from "./store.js";
import { fetchJSON, toast } from "./util.js";
import { renderActive } from "./tabs.js";
import { applyTheme } from "./theme.js";

let updateSeq = 0;

// Take a request token: the caller keeps it and only applies its response
// while it is still the latest one (see isLatest).
function nextSeq() {
  return ++updateSeq;
}

function isLatest(seq) {
  return seq === updateSeq;
}

// Updates fire immediately — the localhost round trip is fast enough that
// slider drags feel live. When several requests overlap (e.g. rapid slider
// movement), only the most recent one is applied; superseded responses are
// dropped so colors never jump back to a stale position.
async function update() {
  const seq = nextSeq();
  try {
    const data = await fetchJSON("/api/palette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // activeSlot plus the slot snapshots ride along so the server
      // persists the A/B record with the palette: the active slot always
      // comes from the posted state, the other from the client's copy.
      body: JSON.stringify({
        ...store.state,
        filters: store.filter ? [store.filter] : [],
        blueLight: store.blueLight,
        activeSlot: store.abActive,
        slots: { A: store.abSlots.A, B: store.abSlots.B },
      }),
    });
    if (!isLatest(seq)) return;
    store.palette = data.palette;
    store.view = data.filtered || data.palette;
    renderActive();
    // No argument: the theme resolves the chrome's levels from store.view
    // through the global light/dark scheme (see theme.js).
    applyTheme();
  } catch (err) {
    toast(`Failed to update palette: ${err.message}`);
  }
}

export { nextSeq, isLatest, update };
