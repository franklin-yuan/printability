/* Standalone Printability demo — scripted Voice, no auth / extension / xAI. */
(() => {
  const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Other'];
  const COLORS = ['Black', 'White', 'Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Other'];
  const TONES = {
    broken: '#96304f', error: '#bb3427', paused: '#9a6000', offline: '#66578c',
    unknown: '#637080', finished: '#23753b', idle: '#23753b', working: '#3065a5'
  };
  const RGB = {
    Black: '#222', White: '#f4f4f4', Gray: '#8a8f93', Red: '#c0392b',
    Orange: '#e67e22', Yellow: '#f1c40f', Green: '#27ae60', Blue: '#2980b9'
  };
  const COLLECTION = 5;
  const HELPER = 'http://127.0.0.1:8765';
  const TOKEN_KEY = 'printability-demo-helper-token';
  const CYCLE_STATES = ['idle', 'printing', 'paused', 'error', 'offline', 'finished'];
  const hardwareOwner = (crypto.randomUUID && crypto.randomUUID()) || ('demo-' + Math.random().toString(36).slice(2));

  const printers = [
    {
      id: 'crane', name: 'Crane', state: 'idle', minutes: null, model: 'X1C',
      config: { material: 'PLA', color: 'Blue', broken: false, light: 1 },
      slotsKnown: true,
      slots: [
        { slot: 1, material: 'PLA', color: 'Blue', rgb: RGB.Blue },
        { slot: 2, material: 'PLA', color: 'White', rgb: RGB.White }
      ],
      jobs: [
        { id: 'f1', name: 'bracket_v3.3mf', state: 'ready', estimatedMinutes: 42, current: false },
        { id: 'f2', name: 'nameplate.3mf', state: 'ready', estimatedMinutes: 28, current: false }
      ]
    },
    {
      id: 'heron', name: 'Heron', state: 'printing', minutes: 38, model: 'P1S',
      config: { material: 'PLA', color: 'Red', broken: false, light: 2 },
      slotsKnown: true,
      slots: [
        { slot: 1, material: 'PLA', color: 'Red', rgb: RGB.Red },
        { slot: 2, material: 'PETG', color: 'Black', rgb: RGB.Black }
      ],
      jobs: [
        { id: 'f3', name: 'gear_housing.3mf', state: 'printing', estimatedMinutes: 95, current: true }
      ]
    },
    {
      id: 'osprey', name: 'Osprey', state: 'idle', minutes: null, model: 'X1C',
      config: { material: 'PETG', color: 'Black', broken: false, light: 3 },
      slotsKnown: true,
      slots: [
        { slot: 1, material: 'PETG', color: 'Black', rgb: RGB.Black },
        { slot: 2, material: 'PETG', color: 'Gray', rgb: RGB.Gray }
      ],
      jobs: [
        { id: 'f4', name: 'enclosure_lid.3mf', state: 'ready', estimatedMinutes: 110, current: false }
      ]
    },
    {
      id: 'falcon', name: 'Falcon', state: 'paused', minutes: null, model: 'A1',
      config: { material: 'PLA', color: 'Green', broken: false, light: 4 },
      slotsKnown: true,
      slots: [{ slot: 1, material: 'PLA', color: 'Green', rgb: RGB.Green }],
      jobs: [
        { id: 'f5', name: 'clip_set.3mf', state: 'paused', estimatedMinutes: 55, current: true }
      ]
    },
    {
      id: 'raven', name: 'Raven', state: 'finished', minutes: null, model: 'P1S',
      config: { material: 'PLA', color: 'White', broken: false, light: 5 },
      slotsKnown: true,
      slots: [
        { slot: 1, material: 'PLA', color: 'White', rgb: RGB.White },
        { slot: 2, material: 'PLA', color: 'Black', rgb: RGB.Black }
      ],
      jobs: [
        { id: 'f6', name: 'phone_stand.3mf', state: 'finished', estimatedMinutes: 60, current: true }
      ]
    },
    {
      id: 'wren', name: 'Wren', state: 'offline', minutes: null, model: 'A1 mini',
      config: { material: 'PLA', color: 'Orange', broken: false, light: 6 },
      slotsKnown: false,
      slots: [],
      jobs: []
    }
  ];

  let material = '', color = '', view = 'overview', collapsed = false;
  let selectedPrinter = null, assistantFocus = '';
  let voiceLive = false, pendingReview = null, reviewOpen = false;
  let lightsWanted = false, lightsBusy = false, lightsTimer = null;
  let lightsOnline = false, lightsMessage = 'Lights offline — on-screen demo still works';

  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (label, action, cls) => {
    const b = el('button', label, cls);
    b.type = 'button';
    b.onclick = action;
    return b;
  };

  function printerById(id) {
    return printers.find((p) => String(p.id) === String(id) || p.name === id);
  }

  function rgbCss(rgb) {
    if (!rgb) return '#222';
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  /* —— Status lights (on-screen + optional USB via local helper) —— */
  function lightToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setLightToken(value) {
    const t = String(value || '').trim();
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function setLightsStatus(text, state) {
    lightsMessage = text;
    const elStatus = $('lights-status');
    if (!elStatus) return;
    elStatus.textContent = text;
    elStatus.dataset.state = state || '';
  }

  function updateLightsControls() {
    const toggle = $('lights-toggle');
    const row = $('lights-token-row');
    if (toggle) {
      toggle.textContent = lightsWanted ? 'Disconnect lights' : 'Connect lights';
      toggle.classList.toggle('secondary', lightsWanted);
    }
    if (row) row.hidden = !lightsWanted || lightsOnline;
  }

  async function helperFetch(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = lightToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${HELPER}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || 4000)
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error(data?.error || `Helper error (${res.status})`);
    return data;
  }

  async function pushHardware() {
    if (!lightsWanted || lightsBusy) return;
    lightsBusy = true;
    try {
      const lights = FarmLightsLogic.lightCommands(printers, 6, selectedPrinter || '');
      const data = await helperFetch('/hardware', {
        method: 'POST',
        body: JSON.stringify({ owner: hardwareOwner, lights }),
        timeout: 5000
      });
      const hw = data.hardware || {};
      lightsOnline = !!hw.connected;
      const onlineCount = (hw.modules || []).filter((m) => m.online).length;
      setLightsStatus(
        lightsOnline
          ? `Lights online · ${onlineCount}/6 modules · paper stand-ins next to modules 1–6`
          : (hw.error || 'Helper reached — connect the S3 USB port in the helper'),
        lightsOnline ? 'online' : 'busy'
      );
    } catch (e) {
      lightsOnline = false;
      const msg = String(e.message || e);
      if (/Failed to fetch|NetworkError|Load failed|timed out|AbortError/i.test(msg)) {
        setLightsStatus('Lights offline — start the Printability helper on this laptop', '');
      } else {
        setLightsStatus(msg, '');
      }
    } finally {
      lightsBusy = false;
      updateLightsControls();
    }
  }

  function startLightsLoop() {
    stopLightsLoop();
    void pushHardware();
    lightsTimer = setInterval(() => { void pushHardware(); }, 2000);
  }

  function stopLightsLoop() {
    if (lightsTimer) clearInterval(lightsTimer);
    lightsTimer = null;
  }

  function connectLights(want) {
    lightsWanted = !!want;
    updateLightsControls();
    if (lightsWanted) {
      setLightsStatus('Connecting to local helper…', 'busy');
      startLightsLoop();
    } else {
      stopLightsLoop();
      lightsOnline = false;
      setLightsStatus('Lights offline — on-screen demo still works', '');
    }
  }

  function renderLights() {
    const host = $('status-lights');
    const cmds = FarmLightsLogic.lightCommands(printers, 6, selectedPrinter || '');
    host.replaceChildren();
    cmds.forEach((c) => {
      const printer = printers.find((p) => Number(p.config.light) === c.id);
      const chip = el('div', undefined, 'light-chip');
      chip.title = printer ? `Light ${c.id} · ${printer.name}` : `Light ${c.id} (unassigned)`;
      const d = el('div', undefined, 'light');
      d.setAttribute('aria-label', chip.title);
      d.style.background = rgbCss(c.rgb);
      d.dataset.flash = String(c.flash || 0);
      chip.append(d, document.createTextNode(printer ? `Light ${c.id} · ${printer.name}` : `Light ${c.id}`));
      host.append(chip);
    });
    if (lightsWanted) void pushHardware();
  }

  function setPrinterState(row, state) {
    row.state = state;
    row.config.broken = state === 'error';
    if (state === 'printing') {
      if (row.minutes == null) row.minutes = 25;
      const job = row.jobs[0];
      if (job) { job.state = 'printing'; job.current = true; }
    } else if (state === 'paused') {
      const job = row.jobs[0];
      if (job) { job.state = 'paused'; job.current = true; }
    } else if (state === 'finished') {
      row.minutes = null;
      const job = row.jobs[0];
      if (job) { job.state = 'finished'; job.current = true; }
    } else if (state === 'idle') {
      row.minutes = null;
      row.jobs.forEach((j) => { j.current = false; if (j.state === 'printing' || j.state === 'paused') j.state = 'ready'; });
    } else {
      row.minutes = null;
    }
    renderGrid();
    renderLights();
    renderPanel();
  }

  function cyclePrinterState(row) {
    const i = CYCLE_STATES.indexOf(row.state);
    const next = CYCLE_STATES[(i >= 0 ? i + 1 : 0) % CYCLE_STATES.length];
    setPrinterState(row, next);
  }

  /* —— Fake printer grid —— */
  function printerPlaceholder(label) {
    const wrap = el('div', undefined, 'preview');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 90');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M18 76V12h64v64M12 76h76v8H12zM25 28h50M50 28v15m-6 0h12l-6 8zM29 65h42M28 54v11m44-11v11');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    svg.append(path);
    wrap.append(svg, el('strong', label));
    return wrap;
  }

  function renderGrid() {
    const grid = $('printer-grid');
    grid.replaceChildren();
    printers.forEach((row) => {
      const info = FarmLightsLogic.statusInfo(row);
      const wait = FarmLightsLogic.waitEstimate(row, COLLECTION);
      const card = el('article', undefined, 'printer-card');
      card.dataset.printerId = row.id;
      card.style.borderTop = `4px solid ${TONES[info.kind]}`;
      if (selectedPrinter === String(row.id)) {
        card.classList.add('selected');
        card.prepend(el('div', 'Selected for your print', 'selection-label'));
      }

      const heading = el('div', undefined, 'heading');
      const badge = el('span', info.label, 'status-badge');
      badge.style.color = TONES[info.kind];
      badge.style.backgroundColor = TONES[info.kind] + '15';
      const titleWrap = el('div');
      titleWrap.append(el('h3', row.name));
      titleWrap.append(el('span', `Light ${row.config.light} · ${row.name}`, 'light-tag'));
      heading.append(titleWrap, badge);
      card.append(heading);

      const active = row.jobs.find(FarmLightsLogic.isCurrentJob);
      card.append(printerPlaceholder(
        active ? 'Current model' :
          row.state === 'idle' ? 'Ready for your print' :
            row.state === 'finished' ? 'Ready to collect' : 'No preview'
      ));

      const body = el('div', undefined, 'card-body');
      if (wait.minutes !== null || row.config.broken || ['paused', 'offline', 'error', 'finished'].includes(row.state)) {
        const waitBox = el('div', undefined, 'wait-box');
        waitBox.style.borderColor = TONES[info.kind];
        waitBox.append(
          el('strong', wait.minutes === 0 ? 'Available now' : wait.minutes != null ? `~${wait.minutes} min wait` : info.label),
          el('p', wait.note || info.hint, 'muted')
        );
        body.append(waitBox);
      }

      const slots = el('div', undefined, 'slots');
      if (row.slotsKnown) {
        row.slots.forEach((s) => {
          const chip = el('span', undefined, 'slot');
          const swatch = el('span', undefined, 'swatch');
          swatch.style.backgroundColor = s.rgb;
          chip.append(swatch, document.createTextNode(`${s.material} · ${s.color}`));
          slots.append(chip);
        });
      } else {
        slots.append(el('span', 'Filament unavailable', 'muted'));
      }
      body.append(slots);

      const current = el('div', undefined, 'current');
      current.append(el('div', active?.name || (row.state === 'idle' ? 'No active print' : 'Current job details unavailable'), 'filename'));
      if (active) {
        current.append(el('p',
          row.state === 'printing' && row.minutes != null ? `About ${row.minutes} min left + collection` :
            row.state === 'paused' ? 'Paused · wait unknown' :
              row.state === 'finished' ? 'Waiting for collection · bed may still be full' :
                'Remaining time not shown yet',
          'muted'));
      }
      body.append(current);

      if (row.jobs.length) {
        const files = el('details');
        files.append(el('summary', `Your files (${row.jobs.length})`));
        row.jobs.forEach((j) => {
          const line = el('div', undefined, 'job');
          line.style.cssText = 'padding:8px 0;border-top:1px solid #edf1ee';
          line.append(el('div', j.name, 'filename'), el('p', `${j.state}${j.estimatedMinutes != null ? ' · ' + j.estimatedMinutes + ' min total' : ''}`, 'muted'));
          files.append(line);
        });
        body.append(files);
      }

      card.append(body);

      const sim = el('div', undefined, 'sim-row');
      sim.setAttribute('aria-label', `Simulate ${row.name} state`);
      CYCLE_STATES.forEach((state) => {
        const b = button(state, () => setPrinterState(row, state));
        b.setAttribute('aria-pressed', String(row.state === state || (state === 'error' && row.config.broken)));
        sim.append(b);
      });
      sim.append(button('Cycle', () => cyclePrinterState(row)));
      sim.append(button('Flash', () => highlightPrinter(row)));
      body.append(sim);

      grid.append(card);
    });
  }

  function highlightPrinter(row) {
    selectedPrinter = String(row.id);
    assistantFocus = row.name;
    renderGrid();
    renderLights();
    renderPanel();
    const card = document.querySelector(`[data-printer-id="${row.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* —— Printability panel —— */
  function selectField(label, values, value, change, empty = 'Any') {
    const l = el('label', label);
    const s = el('select');
    s.setAttribute('aria-label', label);
    s.add(new Option(empty, ''));
    values.forEach((v) => s.add(new Option(v, v)));
    s.value = String(value || '');
    s.onchange = () => change(s.value);
    l.append(s);
    return l;
  }

  function voiceButton(label = 'Printability Voice') {
    const b = button('', openVoice, 'voice-launch');
    const mark = el('span', undefined, 'mark');
    mark.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) mark.append(el('i'));
    const copy = el('span', undefined, 'copy');
    copy.append(el('small', 'Voice'), el('strong', label));
    b.append(mark, copy);
    b.setAttribute('aria-label', 'Talk to Printability Voice');
    return b;
  }

  function renderPanel() {
    const panel = $('printability-panel');
    panel.replaceChildren();

    const header = el('header');
    header.append(
      el('h2', 'Printability'),
      button(collapsed ? 'Open' : 'Minimize', () => { collapsed = !collapsed; renderPanel(); })
    );
    panel.append(header);
    if (collapsed) return;

    const tabs = el('nav', undefined, 'tabs');
    tabs.setAttribute('role', 'tablist');
    Object.entries({ overview: 'Find', match: 'Matching', settings: 'Settings' }).forEach(([v, label]) => {
      const b = button(label, () => { view = v; renderPanel(); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(view === v));
      b.title = v === 'overview' ? 'Find a printer' : v === 'match' ? 'Matching printers' : 'Settings';
      tabs.append(b);
    });
    panel.append(tabs);

    if (assistantFocus) panel.append(el('p', 'Showing: ' + assistantFocus, 'focus-note'));

    const body = el('div', undefined, 'body');
    panel.append(body);

    if (view === 'settings') return renderSettings(body);
    if (view === 'match') return renderMatch(body);
    renderStart(body);
  }

  function renderStart(body) {
    body.classList.add('start-view');
    body.append(el('h3', 'Find a printer'));
    body.append(el('p', 'Pick material and color to see the soonest opening.', 'muted'));

    const fields = el('div', undefined, 'fields');
    fields.append(
      selectField('Material', MATERIALS, material, (v) => { material = v; renderPanel(); }),
      selectField('Color', COLORS, color, (v) => { color = v; renderPanel(); })
    );
    body.append(fields);

    const { next, unknown } = FarmLightsLogic.nextPrinter(printers, material, color, COLLECTION);
    const box = el('section', undefined, 'wait-card');
    box.setAttribute('aria-label', 'Next printer wait');
    box.append(el('div', 'Next opening', 'eyebrow'));

    const value = el('div', next ? (next.minutes === 0 ? 'Ready now' : `~${next.minutes} min`) : 'Unknown', 'wait-value');
    box.append(value);

    if (next) {
      const r = next.row;
      box.append(
        el('h3', r.name),
        el('p', next.minutes === 0
          ? 'Confirm the bed is clear before you print.'
          : `Soonest match, including ${COLLECTION} min to collect.`, 'muted')
      );
      if (unknown && next.minutes > 0) {
        box.append(el('p', 'Some matches have no time estimate and might free up sooner.', 'muted'));
      }
      box.append(button('Show printer', () => highlightPrinter(r), 'btn-primary'));
    } else {
      box.append(el('p', 'No matching printer has a reliable wait yet. Check Matching, or ask Voice.', 'muted'));
    }
    body.append(box);
    body.append(voiceButton());

    const available = printers.filter((r) => !r.config.broken && r.state === 'idle').length;
    const out = printers.filter((r) => r.config.broken || ['error', 'offline'].includes(r.state)).length;
    body.append(el('p', `${printers.length} printers · ${available} free · ${out} unavailable`, 'muted'));

    const matchCount = FarmLightsLogic.matchingPrinters(printers, material, color, COLLECTION).length;
    body.append(button(
      matchCount ? `See ${matchCount} matching printer${matchCount === 1 ? '' : 's'}` : 'Browse matching printers',
      () => { view = 'match'; renderPanel(); },
      'btn-secondary'
    ));
    body.append(el('p', 'Floor lights: green free, blue busy, amber paused, red unavailable, purple offline. Ask Voice or Flash to highlight yours. Label papers Light 1 · Crane … Light 6 · Wren.', 'muted'));
  }

  function renderMatch(body) {
    body.append(el('h3', 'Matching printers'));
    body.append(el('p',
      material || color
        ? `Filtered for ${[material, color].filter(Boolean).join(' · ')}.`
        : 'Showing all printers. Set material or color under Find.',
      'muted'));

    const fields = el('div', undefined, 'fields');
    fields.append(
      selectField('Material', MATERIALS, material, (v) => { material = v; renderPanel(); }),
      selectField('Color', COLORS, color, (v) => { color = v; renderPanel(); })
    );
    body.append(fields);
    body.append(voiceButton('Ask Voice for help'));

    const matches = FarmLightsLogic.matchingPrinters(printers, material, color, COLLECTION);
    if (!matches.length) {
      body.append(el('p', 'Nothing matches that material and color right now.'));
      return;
    }
    matches.forEach((item) => {
      const r = item.row;
      const box = el('div', undefined, 'match-item');
      box.style.borderColor = TONES[item.kind] || '#637080';
      box.append(
        el('b', `${r.name} · ${item.label}`),
        el('p', item.minutes === 0 ? 'Available now' : item.minutes != null ? `~${item.minutes} min wait` : item.label, 'muted')
      );
      if (r.config.broken || item.kind === 'broken') box.append(el('p', 'Unavailable — pick another.', 'bad'));
      box.append(button('Show printer', () => highlightPrinter(r), 'btn-primary'));
      body.append(box);
    });
  }

  function renderSettings(body) {
    body.append(el('h3', 'Settings'));
    body.append(el('p', 'Wait timing and floor lights for finding printers.', 'muted'));
    body.append(el('h4', 'Wait estimates'));
    body.append(el('p', `Collection buffer: ${COLLECTION} min (demo fixed).`, 'muted'));
    body.append(el('h4', 'Status lights'));
    body.append(el('p', 'Label papers on the table to match these modules. Lights sit next to each paper.', 'muted'));
    printers.forEach((r) => {
      body.append(el('p', `Light ${r.config.light} · ${r.name}`, 'good'));
    });
    body.append(el('p', lightsMessage, lightsOnline ? 'good' : 'muted'));
    body.append(el('h4', 'Printers'));
    body.append(el('p', 'Loaded AMS filament is preferred. Use Cycle on a card to simulate idle / printing / paused / down.', 'muted'));
    printers.forEach((r) => {
      const d = el('details');
      d.append(el('summary', `${r.name} · Light ${r.config.light}`));
      const slotText = r.slotsKnown
        ? r.slots.map((s) => `Slot ${s.slot}: ${s.material} · ${s.color}`).join('; ')
        : 'Filament unavailable';
      d.append(el('p', slotText, 'muted'));
      d.append(el('p', `State: ${r.state}`, 'muted'));
      body.append(d);
    });
  }

  /* —— Voice —— */
  function openVoice() {
    $('voice-shell').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeVoice() {
    $('voice-shell').hidden = true;
    document.body.style.overflow = '';
  }

  function setVoiceStatus(text, live) {
    $('voice-status').textContent = text;
    $('voice-shell').dataset.voiceState = live ? 'live' : '';
  }

  function line(who, text) {
    const p = el('p', undefined, who === 'You' ? 'you' : '');
    p.append(el('span', who, 'who'), document.createTextNode(text));
    $('transcript').append(p);
    $('transcript').scrollTop = $('transcript').scrollHeight;
  }

  function clearActions() {
    const host = $('voice-actions');
    host.hidden = true;
    host.replaceChildren();
  }

  function showYesAction(label, onClick) {
    const host = $('voice-actions');
    host.hidden = false;
    host.replaceChildren();
    const b = button(label, onClick, 'yes-btn');
    host.append(b);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function startVoice() {
    if (voiceLive) return;
    voiceLive = true;
    $('voice-start').disabled = true;
    $('voice-stop').disabled = false;
    $('prompt-send').disabled = false;
    setVoiceStatus('Connecting to Printability Voice…', false);
    await sleep(450);
    if (!voiceLive) return;
    setVoiceStatus('Listening · scripted demo', true);
    line('Printability Voice', 'Hi — I can help you find a free printer with the right filament. What do you need?');
  }

  function stopVoice(note = 'Voice is off') {
    voiceLive = false;
    pendingReview = null;
    clearActions();
    $('voice-start').disabled = false;
    $('voice-stop').disabled = true;
    $('prompt-send').disabled = true;
    setVoiceStatus(note, false);
  }

  function classifyPrompt(text) {
    const t = text.toLowerCase();
    if (/blue\s*pla|pla.*blue|need blue/.test(t)) return 'blue-pla';
    if (/what.?s free|free right now|anyone free|available/.test(t)) return 'whats-free';
    if (/bracket|print .+3mf|want to print/.test(t)) return 'print-file';
    if (/petg|black petg/.test(t)) return 'petg';
    if (/yes|do that|prepare|review|open (the )?card/.test(t) && pendingReview) return 'yes-review';
    return 'generic';
  }

  function buildReview(printer, file, requestedMaterial, requestedColor) {
    return {
      printer: printer.name,
      file: file.name,
      review: {
        printer: printer.name,
        model: printer.model,
        status: printer.state,
        file: file.name,
        estimatedMinutes: file.estimatedMinutes ?? null,
        requestedMaterial,
        requestedColor,
        slots: printer.slotsKnown ? printer.slots : [],
        filamentKnown: !!printer.slotsKnown,
        requirements: {
          material: requestedMaterial,
          nozzle: '0.4',
          plate: 'Textured PEI',
          profile: printer.model
        },
        readAt: new Date().toISOString(),
        unavailable: [
          'Start from the printer dashboard when you are ready.',
          'Confirm profile, plate, and AMS mapping before printing.'
        ],
        executionEnabled: false
      }
    };
  }

  async function handlePrompt(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    if (!voiceLive) await startVoice();
    if (!voiceLive) return;

    line('You', text);
    clearActions();
    setVoiceStatus('Working…', true);
    await sleep(550);

    const kind = classifyPrompt(text);

    if (kind === 'yes-review' && pendingReview) {
      setVoiceStatus('Listening · scripted demo', true);
      line('Printability Voice', 'Opening the review card. Printing stays disabled here — you start from the dashboard when you are ready.');
      openReview(pendingReview);
      clearActions();
      return;
    }

    if (kind === 'blue-pla') {
      material = 'PLA';
      color = 'Blue';
      view = 'overview';
      const crane = printerById('crane');
      highlightPrinter(crane);
      pendingReview = buildReview(crane, crane.jobs[0], 'PLA', 'Blue');
      setVoiceStatus('Listening · scripted demo', true);
      line('Printability Voice',
        'Crane is free with blue PLA loaded. I can prepare a review for bracket_v3.3mf on Crane — want me to open that review card?');
      showYesAction('Yes, prepare the review', () => {
        line('You', 'Yes, prepare the review');
        openReview(pendingReview);
        clearActions();
        line('Printability Voice', 'Review is open. Check the bed and filament at the printer; Print stays disabled in this app.');
      });
      return;
    }

    if (kind === 'whats-free') {
      const idle = printers.filter((p) => p.state === 'idle' && !p.config.broken);
      const first = idle[0];
      if (first) highlightPrinter(first);
      setVoiceStatus('Listening · scripted demo', true);
      line('Printability Voice',
        idle.length
          ? `${idle.map((p) => p.name).join(' and ')} ${idle.length === 1 ? 'is' : 'are'} free right now. Tell me a material and color — for example “I need blue PLA” — and I’ll pick one.`
          : 'Nothing idle with a clear wait estimate. Check Matching, or ask for a specific material.');
      return;
    }

    if (kind === 'print-file') {
      const crane = printerById('crane');
      material = 'PLA';
      color = 'Blue';
      highlightPrinter(crane);
      pendingReview = buildReview(crane, crane.jobs[0], 'PLA', 'Blue');
      setVoiceStatus('Listening · scripted demo', true);
      line('Printability Voice',
        'Crane has bracket_v3.3mf and is free with blue PLA. I can prepare a print review for that file — say yes and I’ll open the card.');
      showYesAction('Yes, open the review', () => {
        line('You', 'Yes, open the review');
        openReview(pendingReview);
        clearActions();
        line('Printability Voice', 'Review card is ready. Printing stays disabled; start from the dashboard if you choose.');
      });
      return;
    }

    if (kind === 'petg') {
      const osprey = printerById('osprey');
      material = 'PETG';
      color = 'Black';
      highlightPrinter(osprey);
      pendingReview = buildReview(osprey, osprey.jobs[0], 'PETG', 'Black');
      setVoiceStatus('Listening · scripted demo', true);
      line('Printability Voice',
        'Osprey is free with black PETG. I can prepare a review for enclosure_lid.3mf — want me to open it?');
      showYesAction('Yes, prepare the review', () => {
        line('You', 'Yes, prepare the review');
        openReview(pendingReview);
        clearActions();
      });
      return;
    }

    setVoiceStatus('Listening · scripted demo', true);
    line('Printability Voice',
      'Try “I need blue PLA” for the happy path — I’ll highlight Crane, then you can open the review card with Yes.');
  }

  /* —— Review card —— */
  function openReview(proposal) {
    if (!proposal) return;
    reviewOpen = true;
    renderReview(proposal);
    $('clear').checked = false;
    const dialog = $('proposal');
    if (!dialog.open) dialog.showModal();
  }

  function closeReview() {
    reviewOpen = false;
    $('proposal').close();
  }

  function renderReview(p) {
    const r = p.review || {};
    const req = r.requirements || {};
    const printer = r.printer || p.printer || 'Unknown printer';
    const file = r.file || p.file || 'Unknown file';
    const materialWanted = req.material || r.requestedMaterial || '';
    const colorWanted = r.requestedColor && r.requestedColor !== 'Any' ? r.requestedColor : '';

    const hero = $('selection');
    hero.replaceChildren();
    hero.append(el('span', printer, 'printer-name'), el('span', file, 'file-name'));
    const meta = [];
    if (materialWanted) meta.push(materialWanted + (colorWanted ? ' · ' + colorWanted : ''));
    if (r.estimatedMinutes != null) meta.push('About ' + r.estimatedMinutes + ' min');
    if (meta.length) hero.append(el('span', meta.join(' · '), 'file-meta'));

    const alertEl = $('review-alerts');
    if (r.status && r.status !== 'idle') {
      alertEl.hidden = false;
      alertEl.textContent = `This printer is not free right now (${r.status}). Wait until it is idle, or pick another printer.`;
    } else {
      alertEl.hidden = true;
      alertEl.textContent = '';
    }

    const checks = $('review-checks');
    checks.replaceChildren();
    [
      'At the machine, confirm this is ' + printer + '.',
      'Check that the bed is clear and the correct plate is installed.',
      materialWanted
        ? 'Confirm the filament is ' + materialWanted + (colorWanted ? ' · ' + colorWanted : '') + '.'
        : 'Confirm the material and color on the AMS match what this file needs.',
      'When you are ready to print, start it from the printer dashboard — not from this review.'
    ].forEach((text) => {
      const li = el('li');
      li.textContent = text;
      checks.append(li);
    });

    $('review-status').textContent = 'Open the model if you want a closer look, then check the bed and filament below.';

    const preflight = $('preflight');
    preflight.replaceChildren();
    preflight.append(el('p', 'Quick checks at the machine. Nothing here starts a print.', 'small'));
    const overview = el('p');
    const slot = (r.slots || []).find((s) =>
      String(s.material).replace(/\s+(Basic|Matte)$/i, '').toLowerCase() === String(materialWanted).toLowerCase()
      && (!colorWanted || s.color === colorWanted)
    );
    overview.textContent = (materialWanted || 'Material still unknown') + ' · ' +
      (slot ? 'Looks like AMS slot ' + slot.slot + (slot.color ? ' (' + slot.color + ')' : '') : 'No matching AMS slot found yet') + '.';
    preflight.append(overview);
    const result = el('p');
    result.className = 'check-match';
    result.textContent = r.status === 'idle'
      ? 'Looks consistent — printing stays disabled here'
      : 'Printer is not free — pick another or wait.';
    preflight.append(result);

    const box = $('review-details');
    box.replaceChildren();
    const fields = [
      ['Printer model', r.model],
      ['Printer status', r.status],
      ['Estimated duration', r.estimatedMinutes == null ? '' : r.estimatedMinutes + ' min'],
      ['Requested material', materialWanted],
      ['Requested color', r.requestedColor],
      ['Loaded AMS filament', (r.slots || []).map((s) => `Slot ${s.slot}: ${s.material} · ${s.color}`).join('; ')],
      ['Sliced requirements', [req.material, req.nozzle && (req.nozzle + ' mm'), req.plate, req.profile].filter(Boolean).join(' · ')],
      ['Notes', (r.unavailable || []).join(' ')],
      ['Read at', r.readAt]
    ];
    fields.forEach(([k, v]) => {
      if (!v) return;
      box.append(el('dt', k), el('dd', v));
    });
  }

  /* —— Wire up —— */
  document.querySelectorAll('[data-close-voice]').forEach((n) => {
    n.addEventListener('click', closeVoice);
  });
  $('voice-start').onclick = () => startVoice();
  $('voice-stop').onclick = () => stopVoice('Voice stopped');
  $('suggestions').onclick = (e) => {
    const chip = e.target.closest('[data-prompt]');
    if (!chip) return;
    void handlePrompt(chip.dataset.prompt);
  };
  $('prompt-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('prompt-input');
    const text = input.value;
    input.value = '';
    void handlePrompt(text);
  };
  $('cancel').onclick = closeReview;
  $('review-open').onclick = () => {
    $('review-status').textContent = 'In the live product this opens model details on the dashboard. Demo only — nothing to open.';
  };
  $('review-refresh').onclick = () => {
    if (pendingReview) renderReview(pendingReview);
    $('review-status').textContent = 'Updated. Recheck the bed and material if anything changed.';
  };
  $('proposal').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeReview();
  });

  $('lights-toggle').onclick = () => connectLights(!lightsWanted);
  $('lights-save-token').onclick = () => {
    setLightToken($('lights-token').value);
    $('lights-token').value = '';
    connectLights(true);
  };
  if (lightToken()) $('lights-token').placeholder = 'Connection code saved for this tab';
  updateLightsControls();
  setLightsStatus(lightsMessage, '');

  renderGrid();
  renderLights();
  renderPanel();
})();
