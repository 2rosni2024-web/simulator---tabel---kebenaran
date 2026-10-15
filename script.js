/* ==========================================================
   Simulator Tabel Kebenaran & Verifikator Argumen
   script.js
   ========================================================== */
(() => {
  'use strict';

  const MAX_VARS = 6;

  /* ---------------------------------------------------------
     1. TOKENIZER: mengubah teks menjadi daftar token
     --------------------------------------------------------- */
  const TOKEN_RULES = [
    { t: 'iff', re: /^(<->|<=>|↔|⇔)/ },
    { t: 'imp', re: /^(->|=>|→|⇒)/ },
    { t: 'and', re: /^(&&|&|∧|\^|and\b|dan\b)/i },
    { t: 'or',  re: /^(\|\||\||∨|or\b|atau\b)/i },
    { t: 'xor', re: /^(⊕|xor\b)/i },
    { t: 'not', re: /^(!|~|¬|not\b|tidak\b)/i },
    { t: '(',   re: /^\(/ },
    { t: ')',   re: /^\)/ },
    { t: 'var', re: /^[A-Za-z][A-Za-z0-9_]*/ },
  ];

  function tokenize(src) {
    const tokens = [];
    let rest = src.trim();
    while (rest.length) {
      if (/^\s/.test(rest)) { rest = rest.slice(1); continue; }
      let matched = false;
      for (const rule of TOKEN_RULES) {
        const m = rest.match(rule.re);
        if (m) {
          tokens.push({ t: rule.t, raw: m[0] });
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) throw new Error(`Karakter tidak dikenali: "${rest[0]}"`);
    }
    return tokens;
  }

  /* ---------------------------------------------------------
     2. PARSER: urutan prioritas (tinggi → rendah)
        ¬  >  ∧  >  ∨ ⊕  >  →  >  ↔
     --------------------------------------------------------- */
  function parse(src) {
    const toks = tokenize(src);
    if (!toks.length) throw new Error('Rumus masih kosong.');
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const is = (t) => peek() && peek().t === t;

    function parseIff() {
      let left = parseImp();
      while (is('iff')) { next(); left = { type: 'bin', op: 'iff', l: left, r: parseImp() }; }
      return left;
    }
    function parseImp() {
      const left = parseOr();
      if (is('imp')) { next(); return { type: 'bin', op: 'imp', l: left, r: parseImp() }; }
      return left;
    }
    function parseOr() {
      let left = parseAnd();
      while (is('or') || is('xor')) {
        const op = next().t;
        left = { type: 'bin', op, l: left, r: parseAnd() };
      }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (is('and')) { next(); left = { type: 'bin', op: 'and', l: left, r: parseNot() }; }
      return left;
    }
    function parseNot() {
      if (is('not')) { next(); return { type: 'not', a: parseNot() }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const tok = next();
      if (!tok) throw new Error('Rumus berakhir terlalu cepat. Periksa operator atau kurung terakhir.');
      if (tok.t === 'var') return { type: 'var', name: tok.raw };
      if (tok.t === '(') {
        const inner = parseIff();
        if (!is(')')) throw new Error('Kurung buka "(" belum ditutup.');
        next();
        return inner;
      }
      throw new Error(`Simbol "${tok.raw}" tidak bisa diletakkan di sini.`);
    }

    const ast = parseIff();
    if (p < toks.length) {
      const tok = toks[p];
      throw new Error(tok.t === ')' ? 'Ada kurung tutup ")" tanpa pasangan.' : `Simbol "${tok.raw}" tidak bisa diletakkan di sini.`);
    }
    return ast;
  }

  /* ---------------------------------------------------------
     3. EVALUASI & PENULISAN ULANG RUMUS
     --------------------------------------------------------- */
  const SYMBOL = { and: '∧', or: '∨', xor: '⊕', imp: '→', iff: '↔' };

  function evaluate(n, env) {
    switch (n.type) {
      case 'var': return env[n.name];
      case 'not': return !evaluate(n.a, env);
      default: {
        const a = evaluate(n.l, env);
        const b = evaluate(n.r, env);
        switch (n.op) {
          case 'and': return a && b;
          case 'or':  return a || b;
          case 'xor': return a !== b;
          case 'imp': return !a || b;
          case 'iff': return a === b;
        }
      }
    }
  }

  function str(n, top = false) {
    if (n.type === 'var') return n.name;
    if (n.type === 'not') return '¬' + str(n.a);
    const s = `${str(n.l)} ${SYMBOL[n.op]} ${str(n.r)}`;
    return top ? s : `(${s})`;
  }

  function collectVars(n, set = new Set()) {
    if (n.type === 'var') set.add(n.name);
    else if (n.type === 'not') collectVars(n.a, set);
    else { collectVars(n.l, set); collectVars(n.r, set); }
    return set;
  }

  // Sub-rumus (bukan variabel) berurutan dari dalam ke luar, tanpa duplikat
  function subformulas(n, out = [], seen = new Set()) {
    if (n.type === 'var') return out;
    if (n.type === 'not') subformulas(n.a, out, seen);
    else { subformulas(n.l, out, seen); subformulas(n.r, out, seen); }
    const key = str(n, true);
    if (!seen.has(key)) { seen.add(key); out.push(n); }
    return out;
  }

  // Semua kombinasi nilai; baris pertama = semua Benar
  function allAssignments(vars) {
    const total = 1 << vars.length;
    const rows = [];
    for (let i = 0; i < total; i++) {
      const env = {};
      vars.forEach((v, j) => { env[v] = !((i >> (vars.length - 1 - j)) & 1); });
      rows.push(env);
    }
    return rows;
  }

  function sortedVars(set) {
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function checkVarLimit(vars) {
    if (vars.length > MAX_VARS) {
      throw new Error(`Terlalu banyak variabel (${vars.length}). Batas simulator ini ${MAX_VARS} variabel.`);
    }
  }

  /* ---------------------------------------------------------
     4. TAMPILAN TABEL
     --------------------------------------------------------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function cell(value, binary, extraClass) {
    const td = el('td', (value ? 'v-true' : 'v-false') + (extraClass ? ' ' + extraClass : ''));
    td.textContent = binary ? (value ? '1' : '0') : (value ? 'B' : 'S');
    return td;
  }

  /**
   * columns: [{ label, kind, fn(env) }]
   * rowClass(env, values[]) → string kelas CSS untuk baris
   */
  function buildTable(vars, columns, binary, rowClass) {
    const wrap = el('div', 'table-scroll');
    const table = el('table', 'tt');
    const thead = el('thead');
    const hr = el('tr');

    vars.forEach((v) => hr.appendChild(el('th', '', v)));
    columns.forEach((c, i) => {
      const th = el('th', c.kind + (i === 0 ? ' sep' : ''), c.label);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el('tbody');
    const results = [];
    allAssignments(vars).forEach((env) => {
      const tr = el('tr');
      vars.forEach((v) => tr.appendChild(cell(env[v], binary)));
      const values = columns.map((c) => c.fn(env));
      values.forEach((val, i) => tr.appendChild(cell(val, binary, i === 0 ? 'sep' : '')));
      if (rowClass) tr.className = rowClass(env, values);
      tbody.appendChild(tr);
      results.push({ env, values });
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { node: wrap, results };
  }

  function showError(container, message) {
    container.replaceChildren(el('div', 'error', message));
  }

  function describeEnv(env) {
    return Object.keys(env).map((k) => `${k} = ${env[k] ? 'B' : 'S'}`).join(', ');
  }

  /* ---------------------------------------------------------
     5. FITUR 1: TABEL KEBENARAN
     --------------------------------------------------------- */
  function runTruthTable() {
    const out = document.getElementById('result-table');
    const binary = document.getElementById('bin-table').checked;
    const showSteps = document.getElementById('steps-table').checked;

    try {
      const ast = parse(document.getElementById('formula').value);
      const vars = sortedVars(collectVars(ast));
      checkVarLimit(vars);

      let cols;
      if (showSteps) {
        cols = subformulas(ast).map((n) => ({ label: str(n, true), kind: 'sub', fn: (env) => evaluate(n, env) }));
        if (cols.length) cols[cols.length - 1].kind = 'final';
      }
      if (!cols || !cols.length) {
        cols = [{ label: str(ast, true), kind: 'final', fn: (env) => evaluate(ast, env) }];
      }

      const finalIdx = cols.length - 1;
      const { node, results } = buildTable(vars, cols, binary);
      const finals = results.map((r) => r.values[finalIdx]);
      const trues = finals.filter(Boolean).length;

      const verdict = el('div', 'verdict');
      const title = el('strong');
      const detail = el('p');
      if (trues === finals.length) {
        verdict.classList.add('good');
        title.textContent = 'Tautologi';
        detail.textContent = 'Rumus ini selalu benar, apa pun nilai variabelnya.';
      } else if (trues === 0) {
        verdict.classList.add('bad');
        title.textContent = 'Kontradiksi';
        detail.textContent = 'Rumus ini selalu salah, apa pun nilai variabelnya.';
      } else {
        verdict.classList.add('neutral');
        title.textContent = 'Kontingensi';
        detail.textContent = `Rumus ini benar pada ${trues} dari ${finals.length} baris dan salah pada ${finals.length - trues} baris.`;
      }
      verdict.append(title, detail);

      const legend = el('p', 'legend', binary ? 'Keterangan: 1 = benar, 0 = salah.' : 'Keterangan: B = benar, S = salah.');
      out.replaceChildren(verdict, node, legend);
    } catch (err) {
      showError(out, err.message);
    }
  }

  /* ---------------------------------------------------------
     6. FITUR 2: VERIFIKATOR ARGUMEN
        Valid  ⇔  tidak ada baris dengan semua premis benar
                  tetapi kesimpulan salah.
     --------------------------------------------------------- */
  function runArgument() {
    const out = document.getElementById('result-arg');
    const binary = document.getElementById('bin-arg').checked;

    try {
      const lines = document.getElementById('premises').value
        .split('\n').map((l) => l.trim()).filter(Boolean);
      const concText = document.getElementById('conclusion').value.trim();
      if (!lines.length) throw new Error('Tuliskan minimal satu premis.');
      if (!concText) throw new Error('Kesimpulan masih kosong.');

      const premises = lines.map((l, i) => {
        try { return parse(l); }
        catch (e) { throw new Error(`Premis ${i + 1}: ${e.message}`); }
      });
      let conclusion;
      try { conclusion = parse(concText); }
      catch (e) { throw new Error(`Kesimpulan: ${e.message}`); }

      const varSet = new Set();
      [...premises, conclusion].forEach((n) => collectVars(n, varSet));
      const vars = sortedVars(varSet);
      checkVarLimit(vars);

      const cols = premises.map((n, i) => ({
        label: `P${i + 1}: ${str(n, true)}`, kind: 'premise', fn: (env) => evaluate(n, env),
      }));
      cols.push({ label: `∴ ${str(conclusion, true)}`, kind: 'conclusion', fn: (env) => evaluate(conclusion, env) });

      const concIdx = cols.length - 1;
      const rowClass = (env, v) => {
        const allTrue = v.slice(0, concIdx).every(Boolean);
        if (allTrue && !v[concIdx]) return 'critical counter';
        return allTrue ? 'critical' : '';
      };

      const { node, results } = buildTable(vars, cols, binary, rowClass);
      const critical = results.filter((r) => r.values.slice(0, concIdx).every(Boolean));
      const counter = critical.filter((r) => !r.values[concIdx]);

      const verdict = el('div', 'verdict');
      const title = el('strong');
      const detail = el('p');

      if (!counter.length) {
        verdict.classList.add('good');
        title.textContent = 'Argumen valid';
        if (!critical.length) {
          detail.textContent = 'Tidak ada baris yang membuat semua premis benar sekaligus. Premisnya saling bertentangan, jadi argumen ini valid secara hampa (vacuous).';
        } else {
          detail.textContent = `Pada ${critical.length} baris di mana semua premis benar, kesimpulannya selalu benar juga.`;
        }
      } else {
        verdict.classList.add('bad');
        title.textContent = 'Argumen tidak valid';
        detail.textContent = `Ada ${counter.length} contoh tandingan, yaitu baris saat semua premis benar tetapi kesimpulan salah: ` +
          counter.map((r) => describeEnv(r.env)).join('  |  ') + '.';
      }
      verdict.append(title, detail);

      const legend = el('p', 'legend',
        'Garis biru di kiri menandai baris kritis (semua premis benar). Baris berbingkai merah adalah contoh tandingan. ' +
        (binary ? '1 = benar, 0 = salah.' : 'B = benar, S = salah.'));
      out.replaceChildren(verdict, node, legend);
    } catch (err) {
      showError(out, err.message);
    }
  }

  /* ---------------------------------------------------------
     7. INTERAKSI HALAMAN
     --------------------------------------------------------- */
  // Tab
  const tabs = {
    table: { tab: document.getElementById('tab-table'), panel: document.getElementById('panel-table') },
    arg:   { tab: document.getElementById('tab-arg'),   panel: document.getElementById('panel-arg') },
  };
  function selectTab(name) {
    Object.entries(tabs).forEach(([key, { tab, panel }]) => {
      const active = key === name;
      tab.setAttribute('aria-selected', String(active));
      panel.hidden = !active;
    });
  }
  tabs.table.tab.addEventListener('click', () => selectTab('table'));
  tabs.arg.tab.addEventListener('click', () => selectTab('arg'));

  // Tombol simbol: sisipkan di posisi kursor
  let lastField = document.getElementById('formula');
  ['formula', 'premises', 'conclusion'].forEach((id) => {
    document.getElementById(id).addEventListener('focus', (e) => { lastField = e.target; });
  });

  document.querySelectorAll('.ops').forEach((bar) => {
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ins]');
      if (!btn) return;
      const panel = bar.closest('.panel');
      const field = panel.contains(lastField) ? lastField : document.getElementById(bar.dataset.target);
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      const text = btn.dataset.ins;
      field.value = field.value.slice(0, start) + text + field.value.slice(end);
      const pos = start + text.length;
      field.focus();
      field.setSelectionRange(pos, pos);
    });
  });

  // Contoh cepat
  document.querySelectorAll('[data-formula]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById('formula').value = b.dataset.formula;
    runTruthTable();
  }));
  document.querySelectorAll('[data-prem]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById('premises').value = b.dataset.prem;
    document.getElementById('conclusion').value = b.dataset.conc;
    runArgument();
  }));

  // Tombol & Enter
  document.getElementById('btn-table').addEventListener('click', runTruthTable);
  document.getElementById('btn-arg').addEventListener('click', runArgument);
  document.getElementById('formula').addEventListener('keydown', (e) => { if (e.key === 'Enter') runTruthTable(); });
  document.getElementById('conclusion').addEventListener('keydown', (e) => { if (e.key === 'Enter') runArgument(); });
  ['steps-table', 'bin-table'].forEach((id) => document.getElementById(id).addEventListener('change', runTruthTable));
  document.getElementById('bin-arg').addEventListener('change', runArgument);

  // Tampilkan hasil awal saat halaman dibuka
  runTruthTable();
  runArgument();
})();
