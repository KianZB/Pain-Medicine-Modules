// One authored-data engine for all released challenges; no storage or network AI.
export function normalizeDiagnosis(value) {
  return String(value).normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/gu, " ").trim();
}

export function createChallengeSession(challenge, rules = {}) {
  const questions = new Map([...challenge.questions, ...(challenge.imaging || [])].map(item => [item[0], item]));
  const aliases = new Set(challenge.aliases.map(normalizeDiagnosis));
  const guessBudget = rules.diagnostic_guess_budget || 2;
  const differentialLimit = rules.differential_limit || 3;
  let used, guesses, differential, confidence, status, nextId;
  function reset() {
    used = new Set(); guesses = []; differential = []; confidence = null; status = "playing"; nextId = 1;
  }
  function snapshot() {
    return {
      status, used: [...used], confidence,
      guesses: guesses.map(item => ({ ...item })),
      differential: differential.map(item => ({ ...item })),
      guessesRemaining: guessBudget - guesses.length,
      examinationUnlocked: [...used].some(id => questions.get(id)[1] === "History")
    };
  }
  function request(id) {
    const question = questions.get(id);
    if (!question || status !== "playing" || used.has(id)
      || (question[1] === "Examination" && !snapshot().examinationUnlocked)) return null;
    used.add(id);
    return [...question];
  }
  function setConfidence(value) {
    if (status !== "playing" || !Number.isInteger(value) || value < 1 || value > 5) return false;
    confidence = value;
    return true;
  }
  function guess(value) {
    if (status !== "playing") return null;
    const normalized = normalizeDiagnosis(value);
    if (!normalized) return { accepted: false, field: "diagnosis", message: "Enter your final diagnosis before submitting." };
    if (!confidence) return { accepted: false, field: "confidence", message: "Select a confidence rating from 1 to 5 before submitting." };
    const correct = aliases.has(normalized);
    guesses.push({ answer: String(value).trim(), correct, confidence });
    if (correct) status = "won";
    else if (guesses.length >= guessBudget) status = "lost";
    return { accepted: true, correct, ...snapshot() };
  }
  function addDifferential(value) {
    if (status !== "playing") return { ok: false };
    const name = String(value).trim();
    if (!normalizeDiagnosis(name)) return { ok: false, message: "Enter a possible diagnosis first." };
    if (differential.length >= differentialLimit) return { ok: false, message: "Remove an entry before adding another diagnosis." };
    if (differential.some(item => normalizeDiagnosis(item.name) === normalizeDiagnosis(name))) return { ok: false, message: "That diagnosis is already in your differential." };
    const id = `differential-${nextId++}`;
    differential.push({ id, name });
    return { ok: true, id };
  }
  function removeDifferential(id) {
    const index = differential.findIndex(item => item.id === id);
    if (status !== "playing" || index < 0) return false;
    differential.splice(index, 1);
    return true;
  }
  function moveDifferential(id, targetIndex) {
    const index = differential.findIndex(item => item.id === id);
    if (status !== "playing" || index < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= differential.length) return false;
    const [entry] = differential.splice(index, 1);
    differential.splice(targetIndex, 0, entry);
    return true;
  }
  reset();
  return { snapshot, request, setConfidence, guess, addDifferential, removeDifferential, moveDifferential, reset };
}

// Case rules describe information gathered, not diagnostic confirmation or a score.
export function assessEvidence(challenge, state) {
  const rule = challenge.reasoning.evidence_rule;
  if (rule?.type === "clinical_domains") {
    const count = domains => domains.filter(group => group.some(id => state.used.includes(id))).length;
    const symptoms = count(rule.symptom_domains);
    const signs = count(rule.sign_domains);
    const pain = state.used.includes(rule.pain_inquiry);
    return { supported: pain && symptoms >= rule.min_symptoms && signs >= rule.min_signs, symptoms, signs, pain };
  }
  return { supported: (challenge.reasoning.key_groups || []).every(group => group.some(id => state.used.includes(id))) };
}

// These observations describe the final submission and inquiries reviewed, not a score.
export function reasoningFeedback(challenge, state) {
  if (state.status === "playing" || !state.guesses.length) return null;
  const final = state.guesses[state.guesses.length - 1];
  const category = final.confidence <= 2 ? "Low" : final.confidence === 3 ? "Moderate" : "High";
  const assessment = assessEvidence(challenge, state);
  const { supported } = assessment;
  let text = challenge.reasoning.confidence_feedback[final.correct ? "correct" : "incorrect"][category.toLowerCase()];
  if (final.correct && category === "High" && !supported) text = challenge.reasoning.correct_high_limited;
  if (challenge.reasoning.evidence_rule?.type === "clinical_domains") {
    const domainText = `Your inquiries covered reported symptoms in ${assessment.symptoms} of four domains and observed signs in ${assessment.signs} of four domains.`;
    const advice = supported ? "" : challenge.reasoning.missing_feedback.default;
    return { category, supported, text, evidence: [domainText, advice].filter(Boolean).join(" ") };
  }
  if (challenge.reasoning.missing_feedback.default) {
    return { category, supported, text, evidence: supported ? "" : challenge.reasoning.missing_feedback.default };
  }
  const groups = challenge.reasoning.key_groups;
  const trigger = groups[0].some(id => state.used.includes(id));
  const relief = groups[1].some(id => state.used.includes(id));
  const evidence = supported ? "" : challenge.reasoning.missing_feedback[trigger ? "relief" : relief ? "trigger" : "both"];
  return { category, supported, text, evidence };
}

export function classifyDifferential(challenge, value) {
  const normalized = normalizeDiagnosis(value);
  const match = (challenge.reasoning.differential_feedback || []).find(group =>
    group.synonyms.some(synonym => normalizeDiagnosis(synonym) === normalized));
  return { label: match?.label || "Not assessed", recognized: Boolean(match) };
}

export function debriefFindings(challenge, state) {
  const supporting = (challenge.reasoning.supporting_findings || []).find(item => state.used.includes(item.id));
  return [...challenge.reasoning.findings, ...(supporting ? [supporting] : [])].map(item => {
    const reviewed = state.used.includes(item.id);
    return { id: item.id, title: item.title, reviewed, text: reviewed ? item.reviewed : item.unreviewed };
  });
}

export async function mountChallenge(root) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = "true";
  const get = name => root.querySelector(`[data-cc="${name}"]`);
  const element = (tag, text = "") => { const node = document.createElement(tag); node.textContent = text; return node; };
  const icon = category => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "cw-icon"); svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#cw-${category.toLowerCase()}`); svg.append(use); return svg;
  };
  try {
    const response = await fetch(new URL("clinical-challenges-data.json", import.meta.url));
    if (!response.ok) throw new Error("Challenge data unavailable");
    const data = await response.json();
    const id = new URLSearchParams(window.location.search).get("id") || data.cases[0]?.id;
    const challenge = data.cases.find(item => item.id === id);
    if (!challenge) throw new Error("Unreleased challenge");
    const session = createChallengeSession(challenge, data.rules);
    const input = root.querySelector("#cc-diagnosis");
    const differentialInput = root.querySelector("#cw-differential-input");
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const confidenceButtons = [...root.querySelectorAll('[data-confidence]')];
    const questions = [...challenge.questions, ...(challenge.imaging || [])];
    const buttons = new Map();
    const labels = challenge.display_labels || {};
    const label = question => labels[question[0]] || question[2];
    const debriefAvailableText = "Your debrief is available below.";
    const retryDiagnosisText = "Not quite. One diagnostic attempt remains. You can investigate further and revise your differential before trying again.";
    let draggedId = null;
    get("number").textContent = `Clinical Challenge ${String(challenge.number).padStart(2, "0")}`;
    get("title").textContent = challenge.title;
    get("initial").textContent = challenge.initial;
    const challengeCount = Math.max(...data.cases.map(item => item.number));
    for (let number = 1; number <= challengeCount; number++) {
      const target = data.cases.find(item => item.number === number);
      const current = target?.id === challenge.id;
      const label = String(number).padStart(2, "0");
      const item = element(target && !current ? "a" : "span", label);
      const description = target ? `Challenge ${label}, ${target.title}` : `Challenge ${label}, coming soon`;
      item.title = description; item.setAttribute("aria-label", description);
      if (current) item.setAttribute("aria-current", "page");
      else if (target) item.href = `clinical-challenge.html?id=${encodeURIComponent(target.id)}`;
      else item.setAttribute("aria-disabled", "true");
      get("challenge-nav").append(item);
    }
    document.title = `${challenge.title} – Clinical Challenges`;
    for (const category of ["history", "examination", "imaging"]) get(category).classList.add("cw-question-list");

    function selectTab(index, focus = false) {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index)); tab.tabIndex = i === index ? 0 : -1;
        root.querySelector(`#${tab.getAttribute("aria-controls")}`).hidden = i !== index;
      });
      if (focus) tabs[index].focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(index));
      tab.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); selectTab(next, true); }
      });
    });

    function renderDifferential(focusId) {
      const state = session.snapshot();
      const ended = state.status !== "playing";
      get("differential-list").replaceChildren();
      state.differential.forEach((entry, index) => {
        const row = element("li"); row.className = "cw-differential-row";
        row.dataset.entry = entry.id; row.draggable = !ended; row.tabIndex = -1;
        const rank = element("span", String(index + 1)); rank.className = "cw-rank"; rank.setAttribute("aria-hidden", "true");
        const name = element("span", entry.name); name.className = "cw-differential-name";
        const actions = element("div"); actions.className = "cw-differential-actions";
        for (const [symbol, action, disabled] of [["↑", "up", ended || index === 0], ["↓", "down", ended || index === state.differential.length - 1], ["×", "remove", ended]]) {
          const button = element("button", symbol); button.type = "button"; button.disabled = disabled;
          const description = action === "remove" ? `Remove ${entry.name}` : `Move ${entry.name} ${action}`;
          button.setAttribute("aria-label", description); button.title = description;
          button.addEventListener("click", () => {
            if (action === "remove") session.removeDifferential(entry.id);
            else session.moveDifferential(entry.id, index + (action === "up" ? -1 : 1));
            renderDifferential(action === "remove" ? null : entry.id);
            get("announcement").textContent = action === "remove" ? "Diagnosis removed from your differential." : "Working differential reordered.";
          });
          actions.append(button);
        }
        row.append(rank, name, actions);
        row.addEventListener("dragstart", event => {
          if (ended || event.target.closest("button")) { event.preventDefault(); return; }
          draggedId = entry.id; event.dataTransfer.setData("text/plain", entry.id); event.dataTransfer.effectAllowed = "move";
          row.classList.add("is-dragging");
        });
        row.addEventListener("dragover", event => { if (!ended && draggedId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; row.classList.add("is-drop-target"); } });
        row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
        row.addEventListener("dragend", () => { draggedId = null; root.querySelectorAll(".cw-differential-row").forEach(item => item.classList.remove("is-dragging", "is-drop-target")); });
        row.addEventListener("drop", event => {
          event.preventDefault();
          if (!ended && draggedId) { session.moveDifferential(draggedId, index); draggedId = null; renderDifferential(); get("announcement").textContent = "Working differential reordered."; }
        });
        get("differential-list").append(row);
      });
      const full = state.differential.length >= (data.rules.differential_limit || 3);
      differentialInput.disabled = ended || full;
      get("add-differential").disabled = ended || full;
      if (focusId) get("differential-list").querySelector(`[data-entry="${focusId}"]`)?.focus();
    }
    get("differential-form").addEventListener("submit", event => {
      event.preventDefault();
      const added = session.addDifferential(differentialInput.value);
      get("differential-feedback").textContent = added.ok ? "" : added.message || "";
      if (!added.ok) return;
      differentialInput.value = ""; renderDifferential();
      get("announcement").textContent = "Diagnosis added to your working differential.";
    });

    function addRecord(category, title, reply, prepend = true) {
      const entry = element("li"); entry.className = "cw-record-entry";
      const text = element("div");
      const categoryLabel = element("span", category); categoryLabel.className = "cw-record-category";
      text.append(categoryLabel, element("strong", title), element("p", reply));
      entry.append(icon(category), text);
      if (prepend) get("record").prepend(entry); else get("record").append(entry);
      get("record-scroll").scrollTop = 0;
    }
    function update() {
      const state = session.snapshot(); const ended = state.status !== "playing";
      get("state").textContent = ended ? "Complete" : "In progress";
      get("attempts").textContent = ended ? "Diagnostic attempts complete." : `${state.guessesRemaining} diagnostic ${state.guessesRemaining === 1 ? "attempt" : "attempts"} remaining. Submit whenever you are ready.`;
      get("exam-help").textContent = state.examinationUnlocked ? "Examination available." : "Ask at least one history question to unlock the examination.";
      for (const question of questions) {
        const button = buttons.get(question[0]); const asked = state.used.includes(question[0]);
        button.disabled = ended || asked || (question[1] === "Examination" && !state.examinationUnlocked);
        button.classList.toggle("is-asked", asked); button.textContent = `${label(question)}${asked ? " ✓" : ""}`;
        button.setAttribute("aria-label", `${label(question)}${asked ? ", already recorded" : ""}`);
      }
      confidenceButtons.forEach(button => { button.disabled = ended; button.setAttribute("aria-pressed", String(Number(button.dataset.confidence) === state.confidence)); });
      input.disabled = ended; get("submit").disabled = ended;
      renderDifferential();
    }
    for (const question of questions) {
      const button = element("button", label(question)); button.type = "button"; button.className = "cw-question";
      buttons.set(question[0], button);
      button.addEventListener("click", () => {
        const revealed = session.request(question[0]); if (!revealed) return;
        addRecord(question[1], label(question), revealed[3]); update();
        get("announcement").textContent = `${question[1]} recorded. ${revealed[3]}`;
      });
      get(question[1].toLowerCase()).append(button);
    }
    if (!challenge.imaging?.length) get("imaging").append(element("p", "No previous imaging information is available for this patient."));
    confidenceButtons.forEach(button => button.addEventListener("click", () => {
      session.setConfidence(Number(button.dataset.confidence)); input.removeAttribute("aria-invalid"); update();
    }));
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));

    function debriefEntry(parent, title, text, paragraphs = []) {
      const entry = element("div"); entry.className = "cw-debrief-entry";
      entry.append(element("strong", title), element("p", text));
      paragraphs.forEach(paragraph => entry.append(element("p", paragraph)));
      parent.append(entry);
    }
    function showResult() {
      const state = session.snapshot(); if (state.status === "playing") return;
      const result = get("results"); const heading = element("h2", "Debrief");
      heading.tabIndex = -1; result.replaceChildren(heading);
      result.append(element("h3", "Diagnosis"));
      debriefEntry(result, challenge.intended, challenge.debrief, challenge.reasoning.diagnosis_notes);
      const final = state.guesses[state.guesses.length - 1];
      const feedback = reasoningFeedback(challenge, state);
      const summary = element("div"); summary.className = "cw-learner-summary";
      const answer = element("p"); answer.append(element("strong", "Your diagnosis "), document.createTextNode(final.answer));
      const confidence = element("p"); confidence.append(element("strong", "Confidence "), document.createTextNode(`${feedback.category} (${final.confidence}/5)`));
      summary.append(answer, confidence, element("p", [feedback.text, feedback.evidence].filter(Boolean).join(" ")));
      if (state.differential.length) {
        summary.append(element("strong", "Your ranked differential"));
        const ranked = element("ol"); ranked.className = "cw-debrief-differential";
        let hasUnassessed = false;
        state.differential.forEach(entry => {
          const assessment = classifyDifferential(challenge, entry.name);
          hasUnassessed ||= !assessment.recognized;
          const row = element("li");
          const name = element("span", entry.name); name.className = "cw-debrief-differential-name";
          const status = element("span"); status.className = `cw-differential-status${assessment.recognized ? "" : " is-unassessed"}`;
          status.append(icon(assessment.recognized ? "diagnosis" : "information"), document.createTextNode(assessment.label));
          row.append(name, document.createTextNode(" "), status); ranked.append(row);
        });
        summary.append(ranked);
        if (hasUnassessed) {
          const note = element("p", "Not assessed means there is no predefined feedback for this diagnosis. It does not mean incorrect or inappropriate.");
          note.className = "cw-secondary-text"; summary.append(note);
        }
      }
      result.append(summary, element("h3", "Important alternatives"));
      challenge.reasoning.alternatives.forEach(item => debriefEntry(result, item.name, item.distinction));
      if (challenge.reasoning.must_not_miss?.length) {
        result.append(element("h4", "Must not miss"));
        challenge.reasoning.must_not_miss.forEach(item => debriefEntry(result, item.name, item.distinction));
      }
      result.append(element("h3", "Diagnostically useful findings"));
      debriefFindings(challenge, state).forEach(item => {
        const entry = element("div"); entry.className = "cw-debrief-entry";
        const title = element("div"); title.className = "cw-finding-heading";
        const status = element("span", item.reviewed ? "Asked" : "Not asked");
        status.className = `cw-finding-status${item.reviewed ? " is-asked" : ""}`;
        title.append(element("strong", item.title), status);
        entry.append(title, element("p", item.text)); result.append(entry);
      });
      result.append(element("h3", "Next steps"));
      challenge.reasoning.next_steps.forEach(item => debriefEntry(result, item.title, item.text));
      const sources = element("div"); sources.className = "cw-further-reading";
      sources.append(element("h3", "Further reading"));
      (challenge.reasoning.sources || []).forEach(source => {
        const entry = element("p");
        const link = element("a", source.title); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        const publisher = element("span", source.publisher); publisher.className = "cw-reading-publisher";
        entry.append(link, publisher, document.createTextNode(source.description)); sources.append(entry);
      });
      result.append(sources);
      const replay = element("button", "Restart challenge"); replay.type = "button"; replay.className = "cw-primary"; replay.addEventListener("click", restart); result.append(replay);
      result.hidden = false; heading.focus();
    }
    get("form").addEventListener("submit", event => {
      event.preventDefault(); if (get("submit").disabled) return;
      get("submit").disabled = true;
      const result = session.guess(input.value);
      if (!result) { update(); return; }
      if (!result.accepted) {
        update(); get("feedback").textContent = result.message;
        if (result.field === "diagnosis") { input.setAttribute("aria-invalid", "true"); input.focus(); }
        else confidenceButtons[0].focus();
        return;
      }
      input.value = ""; update();
      if (result.status === "playing") {
        get("feedback").textContent = retryDiagnosisText; input.focus();
      } else {
        get("feedback").textContent = debriefAvailableText;
        get("announcement").textContent = "Diagnostic attempts complete. Review the clinical debrief."; showResult();
      }
    });
    function restart() {
      session.reset(); draggedId = null; input.value = ""; differentialInput.value = ""; input.removeAttribute("aria-invalid");
      get("record").replaceChildren(); addRecord("Referral", "Initial referral information", challenge.initial, false);
      get("results").replaceChildren(); get("results").hidden = true;
      get("feedback").textContent = ""; get("differential-feedback").textContent = "";
      selectTab(0); update();
      get("announcement").textContent = "Challenge restarted. Your record, differential, confidence, and diagnostic attempts have been reset."; get("title").focus();
    }
    get("restart").addEventListener("click", restart);
    addRecord("Referral", "Initial referral information", challenge.initial, false);
    selectTab(0); update(); get("loading").hidden = true; get("game").hidden = false;

    // Use Final Diagnosis with its longer retry feedback as the shared cap, without reserving
    // empty space in shorter cards. Recalculate when wrapping or fonts change.
    const finalCard = get("form").closest(".cw-card");
    function sizeCards() {
      const width = finalCard.getBoundingClientRect().width;
      if (!width) return;
      const measurement = finalCard.cloneNode(true);
      measurement.classList.add("cw-measurement");
      measurement.style.width = `${width}px`;
      measurement.inert = true;
      measurement.setAttribute("aria-hidden", "true");
      measurement.querySelector('[data-cc="attempts"]').textContent = "1 diagnostic attempt remaining. Submit whenever you are ready.";
      measurement.querySelector('[data-cc="feedback"]').textContent = retryDiagnosisText;
      measurement.querySelectorAll("[id], [data-cc]").forEach(node => {
        node.removeAttribute("id"); node.removeAttribute("data-cc");
      });
      root.append(measurement);
      const height = Math.ceil(measurement.getBoundingClientRect().height);
      measurement.remove();
      root.style.setProperty("--cw-card-max-height", `${height}px`);
    }
    sizeCards();
    let previousWidth = finalCard.getBoundingClientRect().width;
    const sizeObserver = new ResizeObserver(() => {
      const width = finalCard.getBoundingClientRect().width;
      if (width !== previousWidth) { previousWidth = width; sizeCards(); }
    });
    sizeObserver.observe(finalCard);
    document.fonts?.ready.then(sizeCards);
  } catch (error) {
    get("loading").textContent = "This challenge could not be loaded. Return to All Challenges and try the available challenge again.";
  } finally { root.setAttribute("aria-busy", "false"); }
}
if (typeof document !== "undefined") {
  const root = document.querySelector("[data-clinical-challenge]");
  if (root) mountChallenge(root);
}
